export function isTaskVisibleForUser(task, user) {
  if (!task || !user) return false
  if (user.is_admin === true) return true

  const taskDepartment = typeof task.department === 'string' ? task.department.trim() : ''
  const userDepartment = typeof user.department === 'string' ? user.department.trim() : ''
  const taskAssigneeId = task.assignee_id == null ? null : Number(task.assignee_id)
  const userMemberId = user.member_id == null ? null : Number(user.member_id)

  if (userDepartment && taskDepartment && userDepartment === taskDepartment) {
    return true
  }

  if (Number.isInteger(userMemberId) && Number.isInteger(taskAssigneeId) && userMemberId === taskAssigneeId) {
    return true
  }

  return false
}

export function getFallbackUser(identity, member = null) {
  const normalizedIdentity = String(identity || '').trim()
  const safeName = normalizedIdentity.includes('@')
    ? normalizedIdentity.slice(0, normalizedIdentity.indexOf('@'))
    : normalizedIdentity

  return {
    email: member?.email || normalizedIdentity,
    name: member?.name || safeName || 'Usuário',
    department: member?.department || 'Geral',
    member_id: member ? Number(member.id) : null,
  }
}

export function isTestAdmin(identity, environment = process.env.NODE_ENV) {
  return environment !== 'production' && String(identity || '').trim().toLowerCase() === 'admin'
}

export function getTaskDeadlineState(task) {
  if (!task || !task.due_date || task.due_date === '0000-00-00' || task.status === 'completed') {
    return { overdue: false, dueSoon: false, daysRemaining: null, label: 'Sem prazo' }
  }

  const dueParts = String(task.due_date).slice(0, 10).split('-').map(Number)
  if (dueParts.length !== 3 || dueParts.some((part) => !Number.isInteger(part))) {
    return { overdue: false, dueSoon: false, daysRemaining: null, label: 'Sem prazo' }
  }
  const [year, month, day] = dueParts
  const dueDate = new Date(year, month - 1, day)
  if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month - 1 || dueDate.getDate() !== day) {
    return { overdue: false, dueSoon: false, daysRemaining: null, label: 'Sem prazo' }
  }

  const today = new Date()
  const dueDay = Date.UTC(year, month - 1, day)
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((dueDay - todayDay) / 86400000)
  const overdue = diffDays < 0
  const dueSoon = diffDays >= 0 && diffDays <= 2

  return {
    overdue,
    dueSoon,
    daysRemaining: diffDays,
    label: overdue ? `Atrasado há ${Math.abs(diffDays)} dia(s)` : diffDays === 0 ? 'Vence hoje' : diffDays === 1 ? 'Vence amanhã' : `Faltam ${diffDays} dia(s)`,
  }
}
