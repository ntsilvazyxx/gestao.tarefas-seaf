import test from 'node:test'
import assert from 'node:assert/strict'

import { getFallbackUser, getTaskDeadlineState, isTaskVisibleForUser, isTestAdmin } from './access.js'

test('only the exact admin identity has test administrator access outside production', () => {
  assert.equal(isTestAdmin('admin', 'development'), true)
  assert.equal(isTestAdmin(' ADMIN ', 'test'), true)
  assert.equal(isTestAdmin('administrator', 'development'), false)
  assert.equal(isTestAdmin('admin', 'production'), false)
})

test('usuários do mesmo departamento veem tarefas do departamento', () => {
  const user = { member_id: 2, department: 'Operações' }
  const task = { assignee_id: null, department: 'Operações' }

  assert.equal(isTaskVisibleForUser(task, user), true)
})

test('usuário não atribuído a tarefa e de outro departamento não vê a tarefa', () => {
  const user = { member_id: 7, department: 'Financeiro' }
  const task = { assignee_id: 2, department: 'Operações' }

  assert.equal(isTaskVisibleForUser(task, user), false)
})

test('usuário atribuído à tarefa consegue acessar mesmo fora do departamento', () => {
  const user = { member_id: 5, department: 'Financeiro' }
  const task = { assignee_id: 5, department: 'Operações' }

  assert.equal(isTaskVisibleForUser(task, user), true)
})

test('administrador de teste consegue acessar tarefas de qualquer departamento', () => {
  const task = { assignee_id: 3, department: 'Jurídico' }
  assert.equal(isTaskVisibleForUser(task, { is_admin: true, member_id: null, department: 'Geral' }), true)
})

test('login genérico usa fallback mesmo sem cadastro no banco', () => {
  const user = getFallbackUser('joao@empresa.com', null)

  assert.equal(user.email, 'joao@empresa.com')
  assert.equal(user.name, 'joao')
  assert.equal(user.department, 'Geral')
  assert.equal(user.member_id, null)
})

test('prazo próximo é sinalizado antes de vencer', () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dueDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  const state = getTaskDeadlineState({ due_date: dueDate, status: 'in_progress' })

  assert.equal(state.overdue, false)
  assert.equal(state.dueSoon, true)
  assert.equal(state.label, 'Vence amanhã')
})

test('tarefas vencidas são sinalizadas como atraso', () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dueDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  const state = getTaskDeadlineState({ due_date: dueDate, status: 'in_progress' })

  assert.equal(state.overdue, true)
  assert.equal(state.dueSoon, false)
  assert.equal(state.label, 'Atrasado há 1 dia(s)')
})

test('tarefas concluídas não exibem alertas de atraso', () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dueDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  const state = getTaskDeadlineState({ due_date: dueDate, status: 'completed' })

  assert.equal(state.overdue, false)
  assert.equal(state.dueSoon, false)
})
