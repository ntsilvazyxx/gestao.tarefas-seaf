import 'dotenv/config'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import pool from './db.js'
import { getFallbackUser, getTaskDeadlineState, isTaskVisibleForUser, isTestAdmin } from './access.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

async function resolveMemberByLogin(email) {
  const value = String(email || '').trim()
  if (!value) return null

  try {
    const normalized = value.toLowerCase()
    const [rows] = await pool.execute(
      `SELECT id, name, department, email
       FROM team_members
       WHERE active = TRUE
         AND (
           LOWER(name) = ?
           OR LOWER(email) = ?
           OR LOWER(SUBSTRING_INDEX(email, '@', 1)) = ?
         )
       ORDER BY id ASC
       LIMIT 1`,
      [normalized, normalized, normalized],
    )

    return rows[0] || null
  } catch {
    return null
  }
}

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
const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('file')

function parseAttachmentUpload(request, response, next) {
  uploadAttachment(request, response, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return response.status(413).json({ error: 'O anexo deve ter no máximo 5 MB.' })
    }
    if (error instanceof multer.MulterError) {
      return response.status(400).json({ error: 'Não foi possível processar o arquivo enviado.' })
    }
    if (error) return next(error)
    next()
  })
}

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
    if (typeof payload.email !== 'string' || typeof payload.name !== 'string' || (payload.department !== undefined && typeof payload.department !== 'string') || payload.exp <= Date.now()) {
      return response.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' })
    }
    request.user = {
      email: payload.email,
      name: payload.name,
      member_id: Number.isInteger(Number(payload.member_id)) && Number(payload.member_id) > 0 ? Number(payload.member_id) : null,
      department: typeof payload.department === 'string' ? payload.department : '',
      is_admin: payload.is_admin === true,
    }
    next()
  } catch {
    return response.status(401).json({ error: 'Sessão inválida. Entre novamente.' })
  }
}

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body || {}
  if (typeof email !== 'string' || typeof password !== 'string'
    || !email.trim() || !password.trim() || email.length > 180 || password.length > 256) {
    return response.status(400).json({ error: 'Informe um usuário e uma senha válidos.' })
  }

  const identity = email.trim()
  const member = await resolveMemberByLogin(identity)
  const user = { ...getFallbackUser(identity, member), is_admin: isTestAdmin(identity) }
  const token = signToken({ ...user, exp: Date.now() + 8 * 60 * 60 * 1000 })
  response.json({ token, user })
})

app.use('/api', authenticate)

function requireTestAdmin(request, response, next) {
  if (!request.user?.is_admin || process.env.NODE_ENV === 'production') {
    return response.status(403).json({ error: 'Apenas o administrador de teste pode gerenciar perfis.' })
  }
  next()
}

function validateMemberProfile(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const department = typeof body.department === 'string' ? body.department.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!name || name.length > 120) return { error: 'Informe um nome de até 120 caracteres.' }
  if (!department || department.length > 80) return { error: 'Informe um departamento de até 80 caracteres.' }
  if (email.length > 180 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: 'Informe um e-mail válido de até 180 caracteres ou deixe o campo vazio.' }
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return { error: 'O status do perfil é inválido.' }
  }
  return { profile: { name, department, email: email || null, active: body.active ?? true } }
}

app.get('/api/admin/members', requireTestAdmin, async (request, response, next) => {
  try {
    const [members] = await pool.execute(
      'SELECT id, name, department, email, active, created_at FROM team_members ORDER BY active DESC, name',
    )
    response.json(members)
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/members', requireTestAdmin, async (request, response, next) => {
  const validation = validateMemberProfile(request.body || {})
  if (validation.error) return response.status(400).json({ error: validation.error })
  const { name, department, email, active } = validation.profile
  try {
    if (email) {
      const [existing] = await pool.execute('SELECT id FROM team_members WHERE LOWER(email) = ?', [email])
      if (existing.length) return response.status(409).json({ error: 'Já existe um perfil com esse e-mail.' })
    }
    const [result] = await pool.execute(
      'INSERT INTO team_members (name, department, email, active) VALUES (?, ?, ?, ?)',
      [name, department, email, active],
    )
    const [created] = await pool.execute(
      'SELECT id, name, department, email, active, created_at FROM team_members WHERE id = ?',
      [result.insertId],
    )
    response.status(201).json(created[0])
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/members/:id', requireTestAdmin, async (request, response, next) => {
  const memberId = Number(request.params.id)
  if (!Number.isInteger(memberId) || memberId < 1) return response.status(400).json({ error: 'Perfil inválido.' })
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, name, department, email, active FROM team_members WHERE id = ? FOR UPDATE',
      [memberId],
    )
    if (!rows.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Perfil não encontrado.' })
    }

    const validation = validateMemberProfile({
      ...rows[0],
      active: Boolean(rows[0].active),
      ...request.body,
    })
    if (validation.error) {
      await connection.rollback()
      return response.status(400).json({ error: validation.error })
    }
    const { name, department, email, active } = validation.profile
    if (email) {
      const [existing] = await connection.execute(
        'SELECT id FROM team_members WHERE LOWER(email) = ? AND id <> ?',
        [email, memberId],
      )
      if (existing.length) {
        await connection.rollback()
        return response.status(409).json({ error: 'Já existe um perfil com esse e-mail.' })
      }
    }
    await connection.execute(
      'UPDATE team_members SET name = ?, department = ?, email = ?, active = ? WHERE id = ?',
      [name, department, email, active, memberId],
    )
    if (department !== rows[0].department) {
      await connection.execute(
        "UPDATE tasks SET department = ? WHERE assignee_id = ? AND status = 'in_progress'",
        [department, memberId],
      )
    }
    const [updated] = await connection.execute(
      'SELECT id, name, department, email, active, created_at FROM team_members WHERE id = ?',
      [memberId],
    )
    await connection.commit()
    response.json(updated[0])
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

app.get('/api/members', async (request, response, next) => {
  try {
    const department = request.user?.is_admin ? '' : request.user?.department
    const [members] = department
      ? await pool.execute(
        'SELECT id, name, department FROM team_members WHERE active = TRUE AND department = ? ORDER BY name',
        [department],
      )
      : await pool.execute(
        'SELECT id, name, department FROM team_members WHERE active = TRUE ORDER BY name',
      )
    response.json(members)
  } catch (error) {
    next(error)
  }
})

app.get('/api/tasks', async (request, response, next) => {
  try {
    const department = request.user?.is_admin ? '' : request.user?.department || ''
    const memberId = Number(request.user?.member_id || 0)
    const [tasks] = await pool.execute(`
      SELECT t.id, t.title, t.description, t.category, t.priority, t.status,
        t.department, t.due_date, t.current_since, t.created_at, t.updated_at,
        t.assignee_id, m.name AS assignee_name
      FROM tasks t
      LEFT JOIN team_members m ON m.id = t.assignee_id
      WHERE (? = '' OR t.department = ? OR t.assignee_id = ?)
      ORDER BY FIELD(t.status, 'in_progress', 'pending', 'completed'),
        COALESCE(t.due_date, '9999-12-31'), t.created_at DESC
    `, [department, department, memberId])

    const tasksWithAlerts = tasks.map((task) => {
      const deadlineState = getTaskDeadlineState(task)
      return {
        ...task,
        overdue: deadlineState.overdue,
        dueSoon: deadlineState.dueSoon,
        due_label: deadlineState.label,
      }
    })

    response.json(tasksWithAlerts)
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
    let taskDepartment = request.user?.department || ''
    if (memberId !== null) {
      const [members] = await connection.execute(
        'SELECT id, department FROM team_members WHERE id = ? AND active = TRUE',
        [memberId],
      )
      if (!members.length) {
        await connection.rollback()
        return response.status(400).json({ error: 'O responsável selecionado não existe ou está inativo.' })
      }
      taskDepartment = members[0].department || taskDepartment
    }

    const status = memberId === null ? 'pending' : 'in_progress'
    const [result] = await connection.execute(
      `INSERT INTO tasks (title, description, category, priority, status, due_date, department, assignee_id, current_since)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description.trim(), category.trim(), priority, status, due_date, taskDepartment, memberId, memberId === null ? null : new Date()],
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
      'SELECT t.id, t.status, t.assignee_id, t.department, m.department AS current_department FROM tasks t LEFT JOIN team_members m ON m.id = t.assignee_id WHERE t.id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    const task = tasks[0]
    if (!isTaskVisibleForUser(task, request.user)) {
      await connection.rollback()
      return response.status(403).json({ error: 'Você não tem permissão para acessar esta tarefa.' })
    }
    if (task.status === 'completed') {
      await connection.rollback()
      return response.status(400).json({ error: 'Não é possível encaminhar uma tarefa concluída.' })
    }
    if (Number(task.assignee_id) === memberId) {
      await connection.rollback()
      return response.status(400).json({ error: 'A tarefa já está com essa pessoa.' })
    }
    const [members] = await connection.execute(
      'SELECT id, department FROM team_members WHERE id = ? AND active = TRUE',
      [memberId],
    )
    if (!members.length) {
      await connection.rollback()
      return response.status(400).json({ error: 'A pessoa selecionada não existe ou está inativa.' })
    }

    const nextDepartment = members[0].department || task.department || request.user?.department || ''
    await connection.execute(
      'UPDATE tasks SET assignee_id = ?, department = ?, status = ?, current_since = NOW() WHERE id = ?',
      [memberId, nextDepartment, 'in_progress', taskId],
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
  if (!note.trim()) {
    return response.status(400).json({ error: 'Informe o motivo da devolução.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [tasks] = await connection.execute(
      'SELECT t.id, t.status, t.assignee_id, t.department FROM tasks t WHERE t.id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    const task = tasks[0]
    if (!isTaskVisibleForUser(task, request.user)) {
      await connection.rollback()
      return response.status(403).json({ error: 'Você não tem permissão para acessar esta tarefa.' })
    }
    if (task.status === 'completed') {
      await connection.rollback()
      return response.status(400).json({ error: 'Não é possível devolver uma tarefa concluída.' })
    }
    if (task.assignee_id === null) {
      await connection.rollback()
      return response.status(400).json({ error: 'A tarefa já está na fila.' })
    }

    await connection.execute(
      'UPDATE tasks SET assignee_id = NULL, department = ?, status = ?, current_since = NULL WHERE id = ?',
      [task.department || request.user?.department || '', 'pending', taskId],
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
      'SELECT t.id, t.status, t.assignee_id, t.department FROM tasks t WHERE t.id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    const task = tasks[0]
    if (!isTaskVisibleForUser(task, request.user)) {
      await connection.rollback()
      return response.status(403).json({ error: 'Você não tem permissão para acessar esta tarefa.' })
    }
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

app.post('/api/tasks/:id/reopen', requireTestAdmin, async (request, response, next) => {
  const taskId = Number(request.params.id)
  if (!Number.isInteger(taskId) || taskId < 1) {
    return response.status(400).json({ error: 'Tarefa inválida.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [tasks] = await connection.execute(
      'SELECT id, status FROM tasks WHERE id = ? FOR UPDATE',
      [taskId],
    )
    if (!tasks.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    if (tasks[0].status !== 'completed') {
      await connection.rollback()
      return response.status(400).json({ error: 'Somente tarefas concluídas podem ser reabertas.' })
    }

    const [completions] = await connection.execute(
      `SELECT from_member_id
       FROM task_history
       WHERE task_id = ? AND action = 'completed'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [taskId],
    )
    const previousAssigneeId = completions[0]?.from_member_id
    if (!previousAssigneeId) {
      await connection.rollback()
      return response.status(409).json({ error: 'Não foi possível identificar o responsável anterior da tarefa.' })
    }
    const [members] = await connection.execute(
      'SELECT id, department, active FROM team_members WHERE id = ? FOR UPDATE',
      [previousAssigneeId],
    )
    if (!members.length) {
      await connection.rollback()
      return response.status(409).json({ error: 'O responsável anterior não está disponível.' })
    }
    if (!members[0].active) {
      await connection.rollback()
      return response.status(409).json({ error: 'O responsável anterior está inativo. Ative o perfil antes de reabrir a tarefa.' })
    }

    await connection.execute(
      `UPDATE tasks
       SET assignee_id = ?, department = ?, status = 'in_progress', current_since = NOW()
       WHERE id = ?`,
      [members[0].id, members[0].department, taskId],
    )
    await connection.execute(
      `INSERT INTO task_history (task_id, action, from_member_id, to_member_id, note)
       VALUES (?, 'reopened', NULL, ?, 'Reaberta pelo administrador de teste.')`,
      [taskId, members[0].id],
    )
    await connection.commit()
    response.json({ message: 'Tarefa reaberta para o responsável anterior.' })
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
    const [tasks] = await pool.execute(
      'SELECT id, department, assignee_id, due_date, status FROM tasks WHERE id = ?',
      [taskId],
    )
    if (!tasks.length) {
      return response.status(404).json({ error: 'Tarefa não encontrada.' })
    }
    if (!isTaskVisibleForUser(tasks[0], request.user)) {
      return response.status(403).json({ error: 'Você não tem permissão para acessar esta tarefa.' })
    }

    const [entries] = await pool.execute(`
      SELECT h.id, h.action, h.from_member_id, h.to_member_id, h.note, h.created_at,
        source.name AS from_member_name, destination.name AS to_member_name
      FROM task_history h
      LEFT JOIN team_members source ON source.id = h.from_member_id
      LEFT JOIN team_members destination ON destination.id = h.to_member_id
      WHERE h.task_id = ?
      ORDER BY h.created_at DESC, h.id DESC
    `, [taskId])

    const chronological = [...entries].reverse()
    const history = chronological.map((entry, index) => {
      const nextEntry = chronological[index + 1]
      const durationMinutes = entry.to_member_id && nextEntry
        ? Math.max(0, Math.floor((new Date(nextEntry.created_at) - new Date(entry.created_at)) / 60000))
        : null
      return { ...entry, duration_minutes: durationMinutes }
    }).reverse()

    response.json({
      task: {
        ...tasks[0],
        deadline_state: getTaskDeadlineState(tasks[0]),
      },
      history,
      comments: await fetchTaskComments(taskId),
      attachments: await fetchTaskAttachments(taskId),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/tasks/:id/comments', async (request, response, next) => {
  const taskId = Number(request.params.id)
  const message = request.body?.message ?? ''

  if (!Number.isInteger(taskId) || taskId < 1) {
    return response.status(400).json({ error: 'Tarefa inválida.' })
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
    return response.status(400).json({ error: 'O comentário deve ter até 2.000 caracteres.' })
  }

  try {
    const [tasks] = await pool.execute('SELECT id, department, assignee_id FROM tasks WHERE id = ?', [taskId])
    if (!tasks.length) return response.status(404).json({ error: 'Tarefa não encontrada.' })
    if (!isTaskVisibleForUser(tasks[0], request.user)) {
      return response.status(403).json({ error: 'Você não tem permissão para comentar nesta tarefa.' })
    }

    const memberId = request.user.member_id

    const [result] = await pool.execute(
      'INSERT INTO task_comments (task_id, member_id, author_name, author_email, message) VALUES (?, ?, ?, ?, ?)',
      [taskId, memberId, request.user.name, request.user.email, message.trim()],
    )

    const [comment] = await pool.execute(`
      SELECT c.id, c.task_id, c.member_id, c.message, c.created_at,
        COALESCE(NULLIF(c.author_name, 'Usuário'), m.name, c.author_name) AS member_name
      FROM task_comments c
      LEFT JOIN team_members m ON m.id = c.member_id
      WHERE c.id = ?
    `, [result.insertId])

    response.status(201).json(comment[0])
  } catch (error) {
    next(error)
  }
})

app.post('/api/tasks/:id/attachments', parseAttachmentUpload, async (request, response, next) => {
  const taskId = Number(request.params.id)

  if (!Number.isInteger(taskId) || taskId < 1) {
    return response.status(400).json({ error: 'Tarefa inválida.' })
  }
  if (!request.file) {
    return response.status(400).json({ error: 'Selecione um arquivo para anexar.' })
  }

  try {
    const [tasks] = await pool.execute('SELECT id, department, assignee_id FROM tasks WHERE id = ?', [taskId])
    if (!tasks.length) return response.status(404).json({ error: 'Tarefa não encontrada.' })
    if (!isTaskVisibleForUser(tasks[0], request.user)) {
      return response.status(403).json({ error: 'Você não tem permissão para anexar arquivo nesta tarefa.' })
    }

    const memberId = request.user.member_id
    const filename = request.file.originalname.replace(/[\\/\r\n"]/g, '_').trim().slice(0, 255)
    if (!filename) return response.status(400).json({ error: 'O nome do arquivo é inválido.' })
    const [result] = await pool.execute(
      `INSERT INTO task_attachments (task_id, member_id, author_name, author_email, filename, content_type, size_bytes, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, memberId, request.user.name.slice(0, 120), request.user.email.slice(0, 180), filename, (request.file.mimetype || 'application/octet-stream').slice(0, 120), request.file.size, request.file.buffer],
    )

    const [attachment] = await pool.execute(`
      SELECT a.id, a.task_id, a.member_id, a.filename, a.content_type, a.size_bytes, a.created_at,
        COALESCE(NULLIF(a.author_name, 'Usuário'), m.name, a.author_name) AS member_name
      FROM task_attachments a
      LEFT JOIN team_members m ON m.id = a.member_id
      WHERE a.id = ?
    `, [result.insertId])

    response.status(201).json(attachment[0])
  } catch (error) {
    next(error)
  }
})

app.get('/api/tasks/:taskId/attachments/:attachmentId', async (request, response, next) => {
  const taskId = Number(request.params.taskId)
  const attachmentId = Number(request.params.attachmentId)
  if (!Number.isInteger(taskId) || taskId < 1 || !Number.isInteger(attachmentId) || attachmentId < 1) {
    return response.status(400).json({ error: 'Tarefa ou anexo inválido.' })
  }

  try {
    const [rows] = await pool.execute(`
      SELECT a.filename, a.content_type, a.data, t.department, t.assignee_id
      FROM task_attachments a
      JOIN tasks t ON t.id = a.task_id
      WHERE a.id = ? AND a.task_id = ?
    `, [attachmentId, taskId])
    if (!rows.length) return response.status(404).json({ error: 'Anexo não encontrado.' })

    const attachment = rows[0]
    if (!isTaskVisibleForUser(attachment, request.user)) {
      return response.status(403).json({ error: 'Você não tem permissão para baixar este anexo.' })
    }

    response.set({
      'Content-Type': attachment.content_type || 'application/octet-stream',
      'Content-Length': attachment.data.length,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    })
    response.send(attachment.data)
  } catch (error) {
    next(error)
  }
})

async function fetchTaskComments(taskId) {
  const [comments] = await pool.execute(`
    SELECT c.id, c.task_id, c.member_id, c.message, c.created_at,
      COALESCE(NULLIF(c.author_name, 'Usuário'), m.name, c.author_name) AS member_name
    FROM task_comments c
    LEFT JOIN team_members m ON m.id = c.member_id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `, [taskId])
  return comments
}

async function fetchTaskAttachments(taskId) {
  const [attachments] = await pool.execute(`
    SELECT a.id, a.task_id, a.member_id, a.filename, a.content_type, a.size_bytes, a.created_at,
      COALESCE(NULLIF(a.author_name, 'Usuário'), m.name, a.author_name) AS member_name
    FROM task_attachments a
    LEFT JOIN team_members m ON m.id = a.member_id
    WHERE a.task_id = ?
    ORDER BY a.created_at ASC
  `, [taskId])
  return attachments
}

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
