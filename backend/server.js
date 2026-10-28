import 'dotenv/config'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import cors from 'cors'
import express from 'express'
import pool from './db.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

if (Buffer.byteLength(sessionSecret) < 32) {
  throw new Error('SESSION_SECRET deve ter pelo menos 32 caracteres.')
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)

    if (process.env.NODE_ENV !== 'production') {
      try {
        const url = new URL(origin)
        const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        const vitePort = Number(url.port) >= 5173 && Number(url.port) <= 5199
        if (localHost && vitePort) return callback(null, true)
      } catch {
        return callback(null, false)
      }
    }

    return callback(null, false)
  },
}))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    next(error)
  }
})

function signToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function authenticate(request, response, next) {
  const token = request.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ error: 'Entre para continuar.' })

  const [encodedPayload, providedSignature, ...extra] = token.split('.')
  if (!encodedPayload || !providedSignature || extra.length) {
    return response.status(401).json({ error: 'Sessão inválida. Entre novamente.' })
  }
  const expectedSignature = createHmac('sha256', sessionSecret).update(encodedPayload).digest()
  let actualSignature
  try {
    actualSignature = Buffer.from(providedSignature, 'base64url')
  } catch {
    return response.status(401).json({ error: 'Sessão inválida. Entre novamente.' })
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return response.status(401).json({ error: 'Sessão inválida. Entre novamente.' })
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (typeof payload.email !== 'string' || typeof payload.name !== 'string' || payload.exp <= Date.now()) {
      return response.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' })
    }
    request.user = { email: payload.email, name: payload.name }
    next()
  } catch {
    return response.status(401).json({ error: 'Sessão inválida. Entre novamente.' })
  }
}

app.post('/api/auth/login', (request, response) => {
  const { email, password } = request.body || {}
  if (typeof email !== 'string' || typeof password !== 'string'
    || !email.trim() || !password.trim() || email.length > 180 || password.length > 256) {
    return response.status(400).json({ error: 'Informe um usuário e uma senha válidos.' })
  }

  const identity = email.trim()
  const user = {
    email: identity,
    name: identity.includes('@') ? identity.slice(0, identity.indexOf('@')) : identity,
  }
  const token = signToken({ ...user, exp: Date.now() + 8 * 60 * 60 * 1000 })
  response.json({ token, user })
})

app.use('/api', authenticate)

app.get('/api/members', async (_request, response, next) => {
  try {
    const [members] = await pool.execute(
      'SELECT id, name FROM team_members WHERE active = TRUE ORDER BY name',
    )
    response.json(members)
  } catch (error) {
    next(error)
  }
})

app.get('/api/tasks', async (_request, response, next) => {
  try {
    const [tasks] = await pool.execute(`
      SELECT t.id, t.title, t.description, t.category, t.priority, t.status,
        t.due_date, t.current_since, t.created_at, t.updated_at,
        t.assignee_id, m.name AS assignee_name
      FROM tasks t
      LEFT JOIN team_members m ON m.id = t.assignee_id
      ORDER BY FIELD(t.status, 'in_progress', 'pending', 'completed'),
        COALESCE(t.due_date, '9999-12-31'), t.created_at DESC
    `)
    response.json(tasks)
  } catch (error) {
    next(error)
  }
})

app.post('/api/tasks', async (request, response, next) => {
  const { title, description = '', category = '', priority = 'medium', due_date = null, assignee_id = null } = request.body
  const allowedPriorities = ['low', 'medium', 'high']

  if (typeof title !== 'string' || !title.trim() || title.trim().length > 180) {
    return response.status(400).json({ error: 'Informe um título de até 180 caracteres.' })
  }
  if (typeof description !== 'string' || description.length > 2000) {
    return response.status(400).json({ error: 'A descrição deve ter no máximo 2.000 caracteres.' })
  }
  if (typeof category !== 'string' || category.length > 80) {
    return response.status(400).json({ error: 'A categoria deve ter no máximo 80 caracteres.' })
  }
  if (!allowedPriorities.includes(priority)) {
    return response.status(400).json({ error: 'A prioridade informada é inválida.' })
  }
  if (due_date !== null && (typeof due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due_date))) {
    return response.status(400).json({ error: 'Informe um prazo válido.' })
  }
  if (assignee_id !== null && (!Number.isInteger(Number(assignee_id)) || Number(assignee_id) < 1)) {
    return response.status(400).json({ error: 'O responsável informado é inválido.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const memberId = assignee_id === null ? null : Number(assignee_id)
    if (memberId !== null) {
      const [members] = await connection.execute(
        'SELECT id FROM team_members WHERE id = ? AND active = TRUE',
        [memberId],
      )
      if (!members.length) {
        await connection.rollback()
        return response.status(400).json({ error: 'O responsável selecionado não existe ou está inativo.' })
      }
    }

    const status = memberId === null ? 'pending' : 'in_progress'
    const [result] = await connection.execute(
      `INSERT INTO tasks (title, description, category, priority, status, due_date, assignee_id, current_since)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description.trim(), category.trim(), priority, status, due_date, memberId, memberId === null ? null : new Date()],
    )
    await connection.execute(
      `INSERT INTO task_history (task_id, action, from_member_id, to_member_id)
       VALUES (?, 'created', NULL, ?)`,
      [result.insertId, memberId],
    )
    await connection.commit()
    response.status(201).json({ id: result.insertId, message: 'Tarefa criada com sucesso.' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

app.post('/api/tasks/:id/forward', async (request, response, next) => {
  const taskId = Number(request.params.id)
  const memberId = Number(request.body.member_id)
  const note = request.body.note ?? ''
  if (!Number.isInteger(taskId) || taskId < 1 || !Number.isInteger(memberId) || memberId < 1) {
    return response.status(400).json({ error: 'Tarefa e pessoa responsável são obrigatórias.' })
  }
  if (typeof note !== 'string' || note.length > 1000) {
    return response.status(400).json({ error: 'A observação deve ter no máximo 1.000 caracteres.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [tasks] = await connection.execute(
      'SELECT id, status, assignee_id FROM tasks WHERE id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    const task = tasks[0]
    if (task.status === 'completed') {
      await connection.rollback()
      return response.status(400).json({ error: 'Não é possível encaminhar uma tarefa concluída.' })
    }
    if (Number(task.assignee_id) === memberId) {
      await connection.rollback()
      return response.status(400).json({ error: 'A tarefa já está com essa pessoa.' })
    }
    const [members] = await connection.execute(
      'SELECT id FROM team_members WHERE id = ? AND active = TRUE',
      [memberId],
    )
    if (!members.length) {
      await connection.rollback()
      return response.status(400).json({ error: 'A pessoa selecionada não existe ou está inativa.' })
    }

    await connection.execute(
      'UPDATE tasks SET assignee_id = ?, status = ?, current_since = NOW() WHERE id = ?',
      [memberId, 'in_progress', taskId],
    )
    await connection.execute(
      `INSERT INTO task_history (task_id, action, from_member_id, to_member_id, note)
       VALUES (?, 'forwarded', ?, ?, ?)`,
      [taskId, task.assignee_id, memberId, note.trim() || null],
    )
    await connection.commit()
    response.json({ message: 'Tarefa encaminhada com sucesso.' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

app.post('/api/tasks/:id/return', async (request, response, next) => {
  const taskId = Number(request.params.id)
  const note = request.body.note ?? ''
  if (!Number.isInteger(taskId) || taskId < 1) {
    return response.status(400).json({ error: 'Tarefa inválida.' })
  }
  if (typeof note !== 'string' || note.length > 1000) {
    return response.status(400).json({ error: 'A observação deve ter no máximo 1.000 caracteres.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [tasks] = await connection.execute(
      'SELECT id, status, assignee_id FROM tasks WHERE id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    const task = tasks[0]
    if (task.status === 'completed') {
      await connection.rollback()
      return response.status(400).json({ error: 'Não é possível devolver uma tarefa concluída.' })
    }
    if (task.assignee_id === null) {
      await connection.rollback()
      return response.status(400).json({ error: 'A tarefa já está na fila.' })
    }

    await connection.execute(
      'UPDATE tasks SET assignee_id = NULL, status = ?, current_since = NULL WHERE id = ?',
      ['pending', taskId],
    )
    await connection.execute(
      `INSERT INTO task_history (task_id, action, from_member_id, to_member_id, note)
       VALUES (?, 'returned', ?, NULL, ?)`,
      [taskId, task.assignee_id, note.trim() || null],
    )
    await connection.commit()
    response.json({ message: 'Tarefa devolvida para a fila.' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

app.post('/api/tasks/:id/complete', async (request, response, next) => {
  const taskId = Number(request.params.id)
  const note = request.body.note ?? ''
  if (!Number.isInteger(taskId) || taskId < 1) {
    return response.status(400).json({ error: 'Tarefa inválida.' })
  }
  if (typeof note !== 'string' || note.length > 1000) {
    return response.status(400).json({ error: 'A observação deve ter no máximo 1.000 caracteres.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [tasks] = await connection.execute(
      'SELECT id, status, assignee_id FROM tasks WHERE id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    const task = tasks[0]
    if (task.status === 'completed') {
      await connection.rollback()
      return response.status(400).json({ error: 'A tarefa já está concluída.' })
    }
    if (task.status !== 'in_progress' || task.assignee_id === null) {
      await connection.rollback()
      return response.status(400).json({ error: 'Encaminhe a tarefa antes de concluí-la.' })
    }

    await connection.execute(
      'UPDATE tasks SET status = ?, current_since = NULL WHERE id = ?',
      ['completed', taskId],
    )
    await connection.execute(
      `INSERT INTO task_history (task_id, action, from_member_id, to_member_id, note)
       VALUES (?, 'completed', ?, NULL, ?)`,
      [taskId, task.assignee_id, note.trim() || null],
    )
    await connection.commit()
    response.json({ message: 'Tarefa concluída.' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

app.get('/api/tasks/:id/history', async (request, response, next) => {
  const taskId = Number(request.params.id)
  if (!Number.isInteger(taskId) || taskId < 1) {
    return response.status(400).json({ error: 'Tarefa inválida.' })
  }

  try {
    const [entries] = await pool.execute(`
      SELECT h.id, h.action, h.from_member_id, h.to_member_id, h.note, h.created_at,
        source.name AS from_member_name, destination.name AS to_member_name
      FROM task_history h
      LEFT JOIN team_members source ON source.id = h.from_member_id
      LEFT JOIN team_members destination ON destination.id = h.to_member_id
      WHERE h.task_id = ?
      ORDER BY h.created_at DESC, h.id DESC
    `, [taskId])
    if (!entries.length) {
      const [tasks] = await pool.execute('SELECT id FROM tasks WHERE id = ?', [taskId])
      if (!tasks.length) return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }

    const chronological = [...entries].reverse()
    const history = chronological.map((entry, index) => {
      const nextEntry = chronological[index + 1]
      const durationMinutes = entry.to_member_id && nextEntry
        ? Math.max(0, Math.floor((new Date(nextEntry.created_at) - new Date(entry.created_at)) / 60000))
        : null
      return { ...entry, duration_minutes: durationMinutes }
    })
    response.json(history.reverse())
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  console.error('Erro na API:', error)
  response.status(500).json({ error: 'Ocorreu um erro interno. Consulte os logs da API.' })
})

app.listen(port, async () => {
  console.log(`API disponível em http://localhost:${port}`)
  try {
    await pool.query('SELECT 1')
    console.log('Conexão com MySQL estabelecida.')
  } catch (error) {
    console.error('Não foi possível conectar ao MySQL:', error.message)
  }
})
