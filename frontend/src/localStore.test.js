import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addLocalComment,
  completeLocalTask,
  createLocalTask,
  createLocalMember,
  getLocalTaskDetails,
  loadLocalData,
  loadLocalMembers,
  markLocalTaskOpened,
  moveLocalTask,
  reopenLocalTask,
  setLocalMemberActive,
  updateLocalMember,
} from './localStore.js'

function useMemoryStorage() {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('creates tasks locally and retains them after reloading the stored data', () => {
  useMemoryStorage()
  const task = createLocalTask({
    title: 'Revisar solicitação',
    description: 'Verificar os documentos enviados.',
    category: 'Atendimento',
    priority: 'high',
    due_date: '2026-11-05',
    assignee_id: null,
  })

  const [tasks, members] = loadLocalData()
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].id, task.id)
  assert.equal(tasks[0].status, 'pending')
  assert.equal(members.length, 4)
  assert.equal(getLocalTaskDetails(task.id).history[0].action, 'created')
})

test('records forwarding, comments, and completion in local storage', () => {
  useMemoryStorage()
  const task = createLocalTask({ title: 'Preparar relatório', assignee_id: null })
  moveLocalTask(task.id, 'forwarded', 1, 'Iniciar análise')
  const comment = addLocalComment(task.id, 'Documentos recebidos.', { name: 'Teste local' })
  completeLocalTask(task.id)

  const details = getLocalTaskDetails(task.id)
  assert.deepEqual(details.history.map((item) => item.action), ['created', 'forwarded', 'completed'])
  assert.equal(details.history[1].to_member_name, 'Maria Silva')
  assert.equal(comment.member_name, 'Teste local')
  assert.equal(details.comments[0].message, 'Documentos recebidos.')
  assert.equal(details.task.status, 'completed')
})

test('requires a reason before returning a task to the queue', () => {
  useMemoryStorage()
  const task = createLocalTask({ title: 'Revisar contrato', assignee_id: 1 })

  assert.throws(() => moveLocalTask(task.id, 'returned', null, '   '), /motivo da devolução/)
  assert.equal(getLocalTaskDetails(task.id).task.status, 'in_progress')
  assert.equal(getLocalTaskDetails(task.id).history.length, 1)

  moveLocalTask(task.id, 'returned', null, 'Faltam documentos.')
  const details = getLocalTaskDetails(task.id)
  assert.equal(details.task.status, 'pending')
  assert.equal(details.history[1].note, 'Faltam documentos.')
})

test('admin test profiles can be created, edited, and deactivated', () => {
  useMemoryStorage()
  const member = createLocalMember({ name: 'Pessoa Teste', email: 'pessoa@exemplo.com', department: 'Jurídico' })
  const task = createLocalTask({ title: 'Revisar contrato', assignee_id: member.id })

  updateLocalMember(member.id, { name: 'Pessoa Atualizada', email: 'pessoa@exemplo.com', department: 'Compras' })
  assert.equal(loadLocalData()[0][0].assignee_name, 'Pessoa Atualizada')
  assert.equal(loadLocalData()[0][0].department, 'Compras')

  setLocalMemberActive(member.id, false)
  const [, activeMembers] = loadLocalData()
  assert.equal(activeMembers.some((item) => item.id === member.id), false)
  assert.equal(loadLocalMembers().find((item) => item.id === member.id).active, false)
  assert.equal(getLocalTaskDetails(task.id).task.assignee_name, 'Pessoa Atualizada')
})

test('only an admin can reopen a completed task for its previous active assignee', () => {
  useMemoryStorage()
  const task = createLocalTask({ title: 'Reabrir análise', assignee_id: 2 })
  completeLocalTask(task.id)

  assert.throws(() => reopenLocalTask(task.id, false), /Apenas o administrador/)
  assert.equal(getLocalTaskDetails(task.id).task.status, 'completed')

  const reopened = reopenLocalTask(task.id, true)
  const details = getLocalTaskDetails(task.id)
  assert.equal(reopened.status, 'in_progress')
  assert.equal(details.task.assignee_id, 2)
  assert.deepEqual(details.history.map((item) => item.action), ['created', 'completed', 'reopened'])
  assert.equal(details.history[2].to_member_name, 'Rafael Costa')
})

test('records the first time task details are opened without identifying the viewer', () => {
  useMemoryStorage()
  const task = createLocalTask({ title: 'Consultar processo', assignee_id: null })
  assert.equal(loadLocalData()[0][0].opened_at, null)

  const openedAt = markLocalTaskOpened(task.id)
  const [tasks] = loadLocalData()
  const details = getLocalTaskDetails(task.id)

  assert.equal(tasks[0].opened_at, openedAt)
  assert.equal(details.task.opened_at, openedAt)
  assert.equal(Object.keys(JSON.parse(localStorage.getItem('fluxo.localData.v1')).openedTasks).length, 1)

  moveLocalTask(task.id, 'forwarded', 1)
  assert.equal(loadLocalData()[0][0].opened_at, null)
})
