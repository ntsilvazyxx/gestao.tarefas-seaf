const STORAGE_KEY = 'fluxo.localData.v1'

const initialMembers = [
  { id: 1, name: 'Maria Silva', department: 'Operações', email: 'maria.silva@seaf.mt.gov.br' },
  { id: 2, name: 'Rafael Costa', department: 'Financeiro', email: 'rafael.costa@seaf.mt.gov.br' },
  { id: 3, name: 'Ana Souza', department: 'Atendimento', email: 'ana.souza@seaf.mt.gov.br' },
  { id: 4, name: 'Lucas Martins', department: 'Operações', email: 'lucas.martins@seaf.mt.gov.br' },
]

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('O armazenamento local do navegador está cheio. Remova alguns dados locais e tente novamente.')
    }
    throw error
  }
}

function readData() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) {
    const data = { members: initialMembers, tasks: [], history: [], comments: [], nextTaskId: 1 }
    saveData(data)
    return data
  }

  try {
    return JSON.parse(saved)
  } catch {
    throw new Error('Os dados locais estão inválidos. Limpe os dados do site no navegador para iniciar novamente.')
  }
}

function deadlineFlags(task) {
  if (!task.due_date || task.status === 'completed') return { overdue: false, dueSoon: false }
  const [year, month, day] = task.due_date.split('-').map(Number)
  const due = Date.UTC(year, month - 1, day)
  const today = new Date()
  const currentDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((due - currentDay) / 86400000)
  return { overdue: days < 0, dueSoon: days >= 0 && days <= 2 }
}

function listTasks(data) {
  return data.tasks
    .map((task) => ({
      ...task,
      assignee_name: data.members.find((member) => member.id === task.assignee_id)?.name || null,
      opened_at: data.openedTasks?.[task.id] || null,
      ...deadlineFlags(task),
    }))
    .sort((a, b) => {
      const statusOrder = { in_progress: 0, pending: 1, completed: 2 }
      return statusOrder[a.status] - statusOrder[b.status]
        || (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')
        || b.created_at.localeCompare(a.created_at)
    })
}

function elapsedMinutes(startedAt) {
  if (!startedAt) return null
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000))
}

export function loadLocalData() {
  const data = readData()
  return [listTasks(data), data.members.filter((member) => member.active !== false)]
}

export function loadLocalMembers() {
  return readData().members.map((member) => ({ ...member, active: member.active !== false }))
}

function validateLocalMember(profile, members, excludedId = null) {
  const name = String(profile.name || '').trim()
  const department = String(profile.department || '').trim()
  const email = String(profile.email || '').trim().toLowerCase()
  if (!name || name.length > 120) throw new Error('Informe um nome de até 120 caracteres.')
  if (!department || department.length > 80) throw new Error('Informe um departamento de até 80 caracteres.')
  if (email.length > 180 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Informe um e-mail válido de até 180 caracteres ou deixe o campo vazio.')
  }
  if (email && members.some((member) => member.id !== excludedId && member.email?.toLowerCase() === email)) {
    throw new Error('Já existe um perfil com esse e-mail.')
  }
  return { name, department, email: email || null }
}

export function createLocalMember(profile) {
  const data = readData()
  const member = {
    id: Math.max(0, ...data.members.map((item) => Number(item.id) || 0)) + 1,
    ...validateLocalMember(profile, data.members),
    active: true,
  }
  data.members.push(member)
  saveData(data)
  return member
}

export function updateLocalMember(memberId, profile) {
  const data = readData()
  const member = data.members.find((item) => Number(item.id) === Number(memberId))
  if (!member) throw new Error('Perfil não encontrado.')
  const departmentChanged = member.department !== String(profile.department || '').trim()
  Object.assign(member, validateLocalMember(profile, data.members, member.id))
  if (departmentChanged) {
    data.tasks.forEach((task) => {
      if (Number(task.assignee_id) === Number(member.id) && task.status === 'in_progress') {
        task.department = member.department
        task.updated_at = new Date().toISOString()
      }
    })
  }
  saveData(data)
  return { ...member, active: member.active !== false }
}

export function setLocalMemberActive(memberId, active) {
  const data = readData()
  const member = data.members.find((item) => Number(item.id) === Number(memberId))
  if (!member) throw new Error('Perfil não encontrado.')
  member.active = Boolean(active)
  saveData(data)
  return { ...member }
}

export function createLocalTask(payload) {
  const data = readData()
  const memberId = payload.assignee_id ? Number(payload.assignee_id) : null
  const member = memberId ? data.members.find((item) => item.id === memberId) : null
  if (memberId && !member) throw new Error('O responsável selecionado não existe.')

  const now = new Date().toISOString()
  const task = {
    id: data.nextTaskId,
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    category: String(payload.category || '').trim(),
    priority: payload.priority || 'medium',
    status: member ? 'in_progress' : 'pending',
    due_date: payload.due_date || null,
    department: member?.department || '',
    assignee_id: member?.id || null,
    current_since: member ? now : null,
    created_at: now,
    updated_at: now,
  }

  data.nextTaskId += 1
  data.tasks.push(task)
  data.history.push({
    id: data.history.length + 1,
    task_id: task.id,
    action: 'created',
    from_member_name: null,
    to_member_name: member?.name || null,
    note: null,
    created_at: now,
    duration_minutes: null,
  })
  saveData(data)
  return task
}

export function moveLocalTask(taskId, action, memberId, note = '') {
  const data = readData()
  const task = data.tasks.find((item) => item.id === Number(taskId))
  if (!task) throw new Error('A tarefa não foi encontrada.')
  if (!['forwarded', 'returned'].includes(action)) throw new Error('Movimentação inválida.')
  const fromMember = data.members.find((member) => member.id === task.assignee_id)
  const toMember = action === 'forwarded'
    ? data.members.find((member) => member.id === Number(memberId))
    : null
  const movementNote = String(note).trim()
  if (action === 'forwarded' && !toMember) throw new Error('Selecione um responsável válido.')
  if (action === 'returned' && !fromMember) throw new Error('A tarefa já está na fila.')
  if (action === 'returned' && !movementNote) throw new Error('Informe o motivo da devolução.')

  const now = new Date().toISOString()
  data.history.push({
    id: data.history.length + 1,
    task_id: task.id,
    action,
    from_member_name: fromMember?.name || null,
    to_member_name: toMember?.name || null,
    note: movementNote || null,
    created_at: now,
    duration_minutes: elapsedMinutes(task.current_since),
  })
  task.assignee_id = toMember?.id || null
  task.department = toMember?.department || ''
  task.status = toMember ? 'in_progress' : 'pending'
  task.current_since = toMember ? now : null
  task.updated_at = now
  if (data.openedTasks) delete data.openedTasks[task.id]
  saveData(data)
}

export function completeLocalTask(taskId) {
  const data = readData()
  const task = data.tasks.find((item) => item.id === Number(taskId))
  if (!task) throw new Error('A tarefa não foi encontrada.')
  if (task.status !== 'in_progress' || !task.assignee_id) {
    throw new Error('Somente tarefas em andamento podem ser concluídas.')
  }

  const now = new Date().toISOString()
  const member = data.members.find((item) => item.id === task.assignee_id)
  data.history.push({
    id: data.history.length + 1,
    task_id: task.id,
    action: 'completed',
    from_member_id: task.assignee_id,
    from_member_name: member?.name || null,
    to_member_name: null,
    note: null,
    created_at: now,
    duration_minutes: elapsedMinutes(task.current_since),
  })
  task.status = 'completed'
  task.current_since = null
  task.updated_at = now
  saveData(data)
}

export function reopenLocalTask(taskId, isAdmin) {
  if (!isAdmin) throw new Error('Apenas o administrador pode reabrir uma tarefa concluída.')
  const data = readData()
  const task = data.tasks.find((item) => Number(item.id) === Number(taskId))
  if (!task) throw new Error('A tarefa não foi encontrada.')
  if (task.status !== 'completed') throw new Error('Somente tarefas concluídas podem ser reabertas.')

  const completion = [...data.history].reverse().find(
    (item) => Number(item.task_id) === Number(task.id) && item.action === 'completed',
  )
  const member = data.members.find((item) => Number(item.id) === Number(
    completion?.from_member_id
      ?? data.members.find((item) => item.name === completion?.from_member_name)?.id,
  ))
  if (!member) throw new Error('Não foi possível identificar o responsável anterior da tarefa.')
  if (member.active === false) throw new Error('O responsável anterior está inativo. Ative o perfil antes de reabrir a tarefa.')

  const now = new Date().toISOString()
  task.status = 'in_progress'
  task.assignee_id = member.id
  task.department = member.department
  task.current_since = now
  task.updated_at = now
  data.history.push({
    id: data.history.length + 1,
    task_id: task.id,
    action: 'reopened',
    from_member_id: null,
    to_member_id: member.id,
    from_member_name: null,
    to_member_name: member.name,
    note: 'Reaberta pelo administrador de teste.',
    created_at: now,
    duration_minutes: null,
  })
  if (data.openedTasks) delete data.openedTasks[task.id]
  saveData(data)
  return task
}

export function getLocalTaskDetails(taskId) {
  const data = readData()
  const task = listTasks(data).find((item) => item.id === Number(taskId))
  if (!task) throw new Error('A tarefa não foi encontrada.')
  return {
    task,
    history: data.history.filter((item) => item.task_id === task.id),
    comments: data.comments.filter((item) => item.task_id === task.id),
    attachments: [],
  }
}

export function markLocalTaskOpened(taskId) {
  const data = readData()
  const task = data.tasks.find((item) => item.id === Number(taskId))
  if (!task) throw new Error('A tarefa não foi encontrada.')
  data.openedTasks ??= {}
  data.openedTasks[task.id] ||= new Date().toISOString()
  saveData(data)
  return data.openedTasks[task.id]
}

export function addLocalComment(taskId, message, user) {
  const data = readData()
  if (!data.tasks.some((item) => item.id === Number(taskId))) throw new Error('A tarefa não foi encontrada.')
  const comment = {
    id: data.comments.length + 1,
    task_id: Number(taskId),
    member_name: user?.name || 'Usuário',
    message,
    created_at: new Date().toISOString(),
  }
  data.comments.push(comment)
  saveData(data)
  return comment
}
