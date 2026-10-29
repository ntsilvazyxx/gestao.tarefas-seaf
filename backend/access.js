export function isTaskVisibleForUser(task, user) {
  if (!task || !user) return false

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

export function getTaskDeadlineState(task) {
  if (!task || !task.due_date || task.status === 'completed') {
    return { overdue: false, dueSoon: false, daysRemaining: null, label: 'Sem prazo' }
  }

  const dueDate = new Date(`${task.due_date}T23:59:59`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
  const overdue = diffDays < 0
  const dueSoon = diffDays >= 0 && diffDays <= 2

  return {
    overdue,
    dueSoon,
    daysRemaining: diffDays,
    label: overdue ? `Atrasado há ${Math.abs(diffDays)} dia(s)` : diffDays === 0 ? 'Vence hoje' : diffDays === 1 ? 'Vence amanhã' : `Faltam ${diffDays} dia(s)`,
  }
}
