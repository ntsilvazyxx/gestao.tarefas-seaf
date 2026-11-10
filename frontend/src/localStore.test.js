import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addLocalComment,
  authenticateLocalAccount,
  completeLocalTask,
  createLocalTask,
  createLocalMember,
  getLocalTaskDetails,
  loadLocalData,
  loadLocalMembers,
  markLocalTaskOpened,
  moveLocalTask,
  reopenLocalTask,
  registerLocalAccount,
  resetLocalAccountPassword,
  setLocalMemberActive,
  setLocalTaskStatus,
  updateLocalMember,
} from './localStore.js'

function useMemoryStorage() {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('registers local accounts and authenticates them without storing plain-text passwords', async () => {
  useMemoryStorage()
  const account = await registerLocalAccount({
    name: 'Pessoa de Teste',
    email: 'Pessoa@Exemplo.com',
    password: 'senha-segura-123',
  })

  assert.deepEqual(account, { name: 'Pessoa de Teste', email: 'pessoa@exemplo.com' })
  assert.deepEqual(await authenticateLocalAccount('PESSOA@EXEMPLO.COM', 'senha-segura-123'), account)
  await assert.rejects(
    registerLocalAccount({
      name: 'Outra Pessoa',
      email: 'pessoa@exemplo.com',
      password: 'senha-segura-123',
    }),
    /Já existe um cadastro/,
  )
  await assert.rejects(
    authenticateLocalAccount('pessoa@exemplo.com', 'senha-incorreta'),
    /E-mail ou senha incorretos/,
  )

  const storedAccounts = JSON.parse(localStorage.getItem('fluxo.localAccounts.v1'))
  assert.equal(storedAccounts[0].password, undefined)
  assert.equal(storedAccounts[0].passwordHash.length, 32)
})

test('resets or initializes a local profile password using a secure hash', async () => {
  useMemoryStorage()
  await registerLocalAccount({
    name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password: 'senha-antiga-123',
  })

  await resetLocalAccountPassword({
    name: 'Pessoa Atualizada',
    email: 'pessoa@exemplo.com',
    password: 'senha-nova-456',
  })
  await assert.rejects(
    authenticateLocalAccount('pessoa@exemplo.com', 'senha-antiga-123'),
    /E-mail ou senha incorretos/,
  )
  assert.deepEqual(
    await authenticateLocalAccount('pessoa@exemplo.com', 'senha-nova-456'),
    { name: 'Pessoa Atualizada', email: 'pessoa@exemplo.com' },
  )

  await resetLocalAccountPassword({
    name: 'Novo Perfil',
    email: 'novo@exemplo.com',
    password: 'senha-inicial-789',
  })
  assert.deepEqual(
    await authenticateLocalAccount('novo@exemplo.com', 'senha-inicial-789'),
    { name: 'Novo Perfil', email: 'novo@exemplo.com' },
  )
})

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
  assert.equal(getLocalTaskDetails(task.id).task.status, 'waiting')
  setLocalTaskStatus(task.id, 'in_progress')
  const comment = addLocalComment(task.id, 'Documentos recebidos.', { name: 'Teste local' })
  completeLocalTask(task.id)

  const details = getLocalTaskDetails(task.id)
  assert.deepEqual(details.history.map((item) => item.action), ['created', 'forwarded', 'status_changed', 'completed'])
  assert.equal(details.history[1].to_member_name, 'Maria Silva')
  assert.equal(comment.member_name, 'Teste local')
  assert.equal(details.comments[0].message, 'Documentos recebidos.')
  assert.equal(details.task.status, 'completed')
})

test('requires a reason before returning a task to the queue', () => {
  useMemoryStorage()
  const task = createLocalTask({ title: 'Revisar contrato', assignee_id: 1 })
  setLocalTaskStatus(task.id, 'waiting')
  setLocalTaskStatus(task.id, 'in_progress')

  assert.throws(() => moveLocalTask(task.id, 'returned', null, '   '), /motivo da devolução/)
  assert.equal(getLocalTaskDetails(task.id).task.status, 'in_progress')
  assert.equal(getLocalTaskDetails(task.id).history.length, 3)

  moveLocalTask(task.id, 'returned', null, 'Faltam documentos.')
  const details = getLocalTaskDetails(task.id)
  assert.equal(details.task.status, 'pending')
  assert.equal(details.task.assignee_id, null)
  assert.equal(details.history.at(-1).note, 'Faltam documentos.')

  assert.throws(() => setLocalTaskStatus(task.id, 'in_progress'), /Encaminhe a tarefa antes de iniciar/)
  moveLocalTask(task.id, 'forwarded', 2)
  assert.equal(getLocalTaskDetails(task.id).task.status, 'waiting')
  setLocalTaskStatus(task.id, 'in_progress')
  assert.equal(getLocalTaskDetails(task.id).task.status, 'in_progress')
})

test('moves tasks through queue, pending, and in-progress stages with history', () => {
  useMemoryStorage()
  const assignedTask = createLocalTask({ title: 'Revisar despacho', assignee_id: 2 })
  assert.equal(getLocalTaskDetails(assignedTask.id).task.status, 'pending')
  assert.throws(
    () => setLocalTaskStatus(assignedTask.id, 'in_progress'),
    /Mova a tarefa para Pendente/,
  )
  setLocalTaskStatus(assignedTask.id, 'waiting')
  setLocalTaskStatus(assignedTask.id, 'in_progress')
  assert.equal(getLocalTaskDetails(assignedTask.id).task.status, 'in_progress')

  const task = createLocalTask({ title: 'Acompanhar solicitação', assignee_id: null })

  setLocalTaskStatus(task.id, 'waiting')
  assert.equal(getLocalTaskDetails(task.id).task.status, 'waiting')
  assert.throws(() => setLocalTaskStatus(task.id, 'in_progress'), /Encaminhe a tarefa/)

  moveLocalTask(task.id, 'forwarded', 1)
  const details = getLocalTaskDetails(task.id)
  assert.equal(details.task.status, 'in_progress')
  assert.equal(details.task.assignee_id, 1)
  assert.deepEqual(details.history.map((item) => item.action), [
    'created',
    'status_changed',
    'forwarded',
  ])
  assert.equal(details.history[1].note, 'Na fila → Pendente')
  assert.throws(() => setLocalTaskStatus(task.id, 'pending'), /motivo da devolução/)
})

test('admin test profiles can be created, edited, and deactivated', () => {
  useMemoryStorage()
  const member = createLocalMember({ name: 'Pessoa Teste', email: 'pessoa@exemplo.com', department: 'Jurídico', profile_type: 'Gestor' })
  const task = createLocalTask({ title: 'Revisar contrato', assignee_id: member.id })
  setLocalTaskStatus(task.id, 'waiting')

  updateLocalMember(member.id, { name: 'Pessoa Atualizada', email: 'pessoa@exemplo.com', department: 'Compras', profile_type: 'Secretário' })
  assert.equal(loadLocalData()[0][0].assignee_name, 'Pessoa Atualizada')
  assert.equal(loadLocalData()[0][0].department, 'Compras')
  assert.equal(loadLocalMembers().find((item) => item.id === member.id).profile_type, 'Secretário')
  assert.equal(loadLocalData()[0][0].status, 'waiting')

  setLocalMemberActive(member.id, false)
  const [, activeMembers] = loadLocalData()
  assert.equal(activeMembers.some((item) => item.id === member.id), false)
  assert.equal(loadLocalMembers().find((item) => item.id === member.id).active, false)
  assert.equal(getLocalTaskDetails(task.id).task.assignee_name, 'Pessoa Atualizada')
})

test('only an admin can reopen a completed task for its previous active assignee', () => {
  useMemoryStorage()
  const task = createLocalTask({ title: 'Reabrir análise', assignee_id: 2 })
  setLocalTaskStatus(task.id, 'waiting')
  setLocalTaskStatus(task.id, 'in_progress')
  completeLocalTask(task.id)

  assert.throws(() => reopenLocalTask(task.id, false), /Apenas o administrador/)
  assert.equal(getLocalTaskDetails(task.id).task.status, 'completed')

  const reopened = reopenLocalTask(task.id, true)
  const details = getLocalTaskDetails(task.id)
  assert.equal(reopened.status, 'in_progress')
  assert.equal(details.task.assignee_id, 2)
  assert.deepEqual(details.history.map((item) => item.action), ['created', 'status_changed', 'status_changed', 'completed', 'reopened'])
  assert.equal(details.history[4].to_member_name, 'Rafael Costa')
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
