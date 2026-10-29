import test from 'node:test'
import assert from 'node:assert/strict'

import { getFallbackUser, isTaskVisibleForUser } from './access.js'

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

test('login genérico usa fallback mesmo sem cadastro no banco', () => {
  const user = getFallbackUser('joao@empresa.com', null)

  assert.equal(user.email, 'joao@empresa.com')
  assert.equal(user.name, 'joao')
  assert.equal(user.department, 'Geral')
  assert.equal(user.member_id, null)
})
