import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sun,
  UsersRound,
  UserPlus,
  Pencil,
  UserCheck,
  UserX,
  X,
} from 'lucide-react'
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === 'true'
const initialClock = Date.now()
const columns = [
  { status: 'pending', title: 'Na fila', caption: 'Aguardando encaminhamento', icon: Clock3 },
  { status: 'in_progress', title: 'Em andamento', caption: 'Com a equipe', icon: UsersRound },
]
const priorities = { high: 'Alta', medium: 'Média', low: 'Baixa' }
const statusLabels = { pending: 'Na fila', in_progress: 'Em andamento', completed: 'Concluída' }

function getTaskCode(taskId) {
  return `TAR-${String(taskId).padStart(6, '0')}`
}

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function formatElapsed(date, now) {
  if (!date) return 'Na fila'
  const elapsed = Math.max(0, now - new Date(date).getTime())
  const days = Math.floor(elapsed / 86400000)
  const hours = Math.floor((elapsed % 86400000) / 3600000)
  const minutes = Math.floor((elapsed % 3600000) / 60000)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}min`
  return `${minutes}min`
}

function formatDuration(minutes) {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${remainingMinutes}min`
  return `${remainingMinutes}min`
}

function formatDate(date) {
  if (!date) return 'Sem prazo'
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date(date)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(parsedDate)
}

function getDeadlineState(task) {
  if (task?.deadline_state) return task.deadline_state
  if (!task || !task.due_date || task.due_date === '0000-00-00' || task.status === 'completed') {
    return { overdue: false, dueSoon: false, label: 'Sem prazo' }
  }

  const [year, month, day] = String(task.due_date).slice(0, 10).split('-').map(Number)
  const dueDate = new Date(year, month - 1, day)
  if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month - 1 || dueDate.getDate() !== day) {
    return { overdue: false, dueSoon: false, label: 'Sem prazo' }
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
    label: overdue ? `Atrasado há ${Math.abs(diffDays)} dia(s)` : diffDays === 0 ? 'Vence hoje' : diffDays === 1 ? 'Vence amanhã' : `Faltam ${diffDays} dia(s)`,
  }
}

function ThemeButton({ theme, toggleTheme }) {
  const isDark = theme === 'dark'
  return (
    <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Ativar tema ${isDark ? 'claro' : 'escuro'}`} title={`Tema ${isDark ? 'claro' : 'escuro'}`}>
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

function LoginScreen({ onLogin, busy, error, theme, toggleTheme }) {
  return (
    <main className="login-screen" data-theme={theme}>
      <div className="login-top"><span className="login-top-spacer" aria-hidden="true" /><ThemeButton theme={theme} toggleTheme={toggleTheme} /></div>
      <section className="login-card">
        <span className="login-brand-mark"><ListTodo size={30} strokeWidth={2.5} /></span>
        <h1 className="login-title">Sistema de Gestão de Tarefas - Fluxo</h1>
        <p className="login-subtitle">Entre para acompanhar e organizar as tarefas da equipe.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form className="modal-form login-form" onSubmit={onLogin}>
          <label>Usuário ou e-mail<input type="text" name="email" placeholder="Digite qualquer usuário" autoComplete="username" required maxLength="180" /></label>
          <label>Senha<input type="password" name="password" placeholder="Digite qualquer senha" autoComplete="current-password" required maxLength="256" /></label>
          <div className="login-options"><a href="/recuperar-senha">Esqueceu a senha?</a></div>
          <button className="button button-primary login-submit" disabled={busy}>{busy ? <LoaderCircle className="spinner" size={17} /> : null} Entrar</button>
        </form>
        <p className="login-help">{LOCAL_MODE ? 'Modo de teste local: os dados ficam salvos neste navegador.' : 'Acesso temporário: informe qualquer usuário e senha.'}</p>
      </section>
    </main>
  )
}

function TaskCard({ task, now, openHistory, showMovement, completeTask }) {
  const [dragging, setDragging] = useState(false)
  const trackingDate = task.current_since || task.created_at
  return (
    <article
      className={`kanban-card${dragging ? ' dragging' : ''}${task.overdue ? ' task-overdue' : ''}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(task.id)); setDragging(true) }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="card-topline">
        <div className="card-identifiers">
          <span className="task-code">{getTaskCode(task.id)}</span>
          <span className={`priority priority-${task.priority}`}>{priorities[task.priority] || 'Média'}</span>
        </div>
        <span className={`status-pill status-${task.status}`}>{statusLabels[task.status] || task.status}</span>
      </div>
      <button className="kanban-task-title" onClick={() => openHistory(task)}>{task.title}</button>
      <p className="kanban-description">{task.description || task.category || task.department || 'Sem descrição adicional.'}</p>
      <div className="card-compact-meta">
        <span className="elapsed"><Clock3 size={13} />{task.status === 'completed' ? 'Concluída' : formatElapsed(trackingDate, now)}</span>
        <span className={`due-date${task.overdue ? ' overdue' : task.dueSoon ? ' due-soon' : ''}`}><CalendarDays size={13} />{task.due_date ? formatDate(task.due_date) : 'Sem prazo'}</span>
      </div>
      <div className="kanban-card-assignee">
        {task.assignee_name
          ? <span className="person-cell"><span className={`avatar ${Number(task.assignee_id) % 2 ? 'avatar-indigo' : 'avatar-teal'}`}>{getInitials(task.assignee_name)}</span><span>{task.assignee_name}<small>{task.department || 'Equipe'}</small></span></span>
          : <span className="unassigned"><span />Aguardando encaminhamento</span>}
      </div>
      {LOCAL_MODE && <div className={`task-open-state${task.opened_at ? ' opened' : ''}`}>{task.opened_at ? `Detalhes acessados · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.opened_at))}` : 'Detalhes ainda não acessados'}</div>}
      <div className="card-actions">
        <button className="card-action-button card-history" onClick={() => openHistory(task)} aria-label={`Ver histórico de ${task.title}`} title="Ver histórico"><FileText size={14} /><span>Histórico</span></button>
        {task.status === 'pending' && <button className="card-action-button card-forward" onClick={() => showMovement(task, 'forward')}><Send size={13} /><span>Encaminhar</span></button>}
        {task.status === 'in_progress' && <>
          <button className="card-action-button" onClick={() => showMovement(task, 'return')}><ArrowDownLeft size={14} /><span>Devolver</span></button>
          <button className="card-action-button card-complete" onClick={() => completeTask(task)}><Check size={14} /><span>Concluir</span></button>
        </>}
      </div>
    </article>
  )
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('fluxo.token') || '')
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('fluxo.user') || 'null') } catch { return null }
  })
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [profileMembers, setProfileMembers] = useState([])
  const [activePage, setActivePage] = useState('board')
  const [search, setSearch] = useState('')
  const [consultationSearch, setConsultationSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)
  const [history, setHistory] = useState([])
  const [comments, setComments] = useState([])
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(Boolean(token))
  const [now, setNow] = useState(initialClock)
  const [saving, setSaving] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('fluxo.theme') || 'light')

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem('fluxo.theme', next)
      return next
    })
  }

  const apiFetch = useCallback(async (path, options = {}) => {
    let response
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      })
    } catch (requestError) {
      if (requestError instanceof TypeError) {
        throw new Error(`Não foi possível conectar à API em ${API_URL}. Inicie o backend e tente novamente.`)
      }
      throw requestError
    }
    if (response.status === 401 && token) {
      sessionStorage.removeItem('fluxo.token')
      sessionStorage.removeItem('fluxo.user')
      setToken('')
      setUser(null)
      throw new Error('Sua sessão expirou. Entre novamente.')
    }
    return response
  }, [token])

  const fetchData = useCallback(async () => {
    if (LOCAL_MODE) return loadLocalData()
    const [taskResponse, memberResponse] = await Promise.all([apiFetch('/tasks'), apiFetch('/members')])
    const taskData = await taskResponse.json()
    const memberData = await memberResponse.json()
    if (!taskResponse.ok || !memberResponse.ok) {
      throw new Error(taskData.error || memberData.error || 'Não foi possível carregar os dados.')
    }
    return [taskData, memberData]
  }, [apiFetch])

  async function loadData() {
    setError('')
    try {
      const [taskData, memberData] = await fetchData()
      setTasks(taskData)
      setMembers(memberData)
    } catch (requestError) {
      setError(`${requestError.message} Verifique se a API e o banco MySQL estão disponíveis.`)
    } finally {
      setLoading(false)
    }
  }

  async function loadProfileMembers() {
    if (!user?.is_admin) return
    try {
      if (LOCAL_MODE) {
        setProfileMembers(loadLocalMembers())
        return
      }
      const response = await apiFetch('/admin/members')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os perfis.')
      setProfileMembers(result)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function openProfiles() {
    setActivePage('profiles')
    loadProfileMembers()
  }

  function openMemberForm(member = null) {
    setSelectedMember(member)
    setError('')
    setModal('member')
  }

  async function submitMemberProfile(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const profile = {
      name: form.get('name'),
      email: form.get('email'),
      department: form.get('department'),
    }
    try {
      if (LOCAL_MODE) {
        if (selectedMember) updateLocalMember(selectedMember.id, profile)
        else createLocalMember(profile)
        setProfileMembers(loadLocalMembers())
      } else {
        const response = await apiFetch(selectedMember ? `/admin/members/${selectedMember.id}` : '/admin/members', {
          method: selectedMember ? 'PATCH' : 'POST',
          body: JSON.stringify(profile),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o perfil.')
        await loadProfileMembers()
      }
      setModal(null)
      setNotice(selectedMember ? 'Perfil atualizado.' : 'Perfil criado.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleMemberActive(member) {
    const active = !member.active
    if (member.active && !window.confirm(`Desativar o perfil de ${member.name}?`)) return
    setError('')
    try {
      if (LOCAL_MODE) {
        setLocalMemberActive(member.id, active)
        setProfileMembers(loadLocalMembers())
      } else {
        const response = await apiFetch(`/admin/members/${member.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o perfil.')
        await loadProfileMembers()
      }
      setNotice(active ? 'Perfil ativado.' : 'Perfil desativado.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    if (!token) return undefined
    let active = true
    async function initialize() {
      try {
        const [taskData, memberData] = await fetchData()
        if (active) {
          setTasks(taskData)
          setMembers(memberData)
        }
      } catch (requestError) {
        if (active) setError(`${requestError.message} Verifique se a API e o banco MySQL estão disponíveis.`)
      } finally {
        if (active) setLoading(false)
      }
    }
    initialize()
    return () => { active = false }
  }, [token, fetchData])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return tasks.filter((task) => !query || [task.title, task.description, task.assignee_name, task.category]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(query)))
  }, [tasks, search])

  const counts = useMemo(() => ({
    total: tasks.filter((task) => task.status !== 'completed').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }), [tasks])
  const consultationTasks = useMemo(() => {
    const query = consultationSearch.trim().toLocaleLowerCase('pt-BR')
    return tasks.filter((task) => {
      const matchesSearch = !query || [
        getTaskCode(task.id),
        task.title,
        task.description,
        task.category,
        task.assignee_name,
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query))
      return matchesSearch
        && (!statusFilter || task.status === statusFilter)
    })
  }, [tasks, consultationSearch, statusFilter])

  function clearConsultationFilters() {
    setConsultationSearch('')
    setStatusFilter('')
  }

  async function submitLogin(event) {
    event.preventDefault()
    setLoginBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      if (LOCAL_MODE) {
        const identity = String(form.get('email')).trim()
        const result = {
          token: 'local-test-session',
          user: {
            name: identity.includes('@') ? identity.split('@')[0] : identity,
            email: identity,
            is_admin: identity.toLocaleLowerCase('pt-BR') === 'admin',
          },
        }
        sessionStorage.setItem('fluxo.token', result.token)
        sessionStorage.setItem('fluxo.user', JSON.stringify(result.user))
        setLoading(true)
        setUser(result.user)
        setToken(result.token)
        return
      }
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.')
      sessionStorage.setItem('fluxo.token', result.token)
      sessionStorage.setItem('fluxo.user', JSON.stringify(result.user))
      setLoading(true)
      setUser(result.user)
      setToken(result.token)
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setLoginBusy(false)
    }
  }

  function logout() {
    sessionStorage.removeItem('fluxo.token')
    sessionStorage.removeItem('fluxo.user')
    setToken('')
    setUser(null)
    setTasks([])
    setMembers([])
    setProfileMembers([])
    setActivePage('board')
  }

  async function openHistory(task) {
    setSelectedTask(task)
    setModal('history')
    setHistory([])
    setComments([])
    setAttachments([])
    try {
      if (LOCAL_MODE) {
        markLocalTaskOpened(task.id)
        const result = getLocalTaskDetails(task.id)
        setSelectedTask(result.task)
        setHistory(result.history)
        setComments(result.comments)
        setAttachments(result.attachments)
        setTasks(loadLocalData()[0])
        return
      }
      const response = await apiFetch(`/tasks/${task.id}/history`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o histórico.')
      setSelectedTask(result.task || task)
      setHistory(result.history || [])
      setComments(result.comments || [])
      setAttachments(result.attachments || [])
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function submitComment(event) {
    event.preventDefault()
    setError('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const message = String(form.get('message') || '').trim()
    if (!message || !selectedTask) return

    try {
      if (LOCAL_MODE) {
        const result = addLocalComment(selectedTask.id, message, user)
        setComments((current) => [...current, result])
        formElement.reset()
        return
      }
      const response = await apiFetch(`/tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o comentário.')
      setComments((current) => [...current, result])
      formElement.reset()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function submitAttachment(event) {
    const file = event.target.files?.[0]
    if (!file || !selectedTask) return

    if (file.size > 5 * 1024 * 1024) {
      setError('O anexo deve ter no máximo 5 MB.')
      event.target.value = ''
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    setError('')
    try {
      if (LOCAL_MODE) throw new Error('O envio de anexos está disponível quando a API e o banco estiverem conectados.')
      const response = await apiFetch(`/tasks/${selectedTask.id}/attachments`, {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível anexar o arquivo.')
      setAttachments((current) => [...current, result])
    } catch (requestError) {
      setError(requestError.message)
    }
    event.target.value = ''
  }

  async function downloadAttachment(file) {
    try {
      if (LOCAL_MODE) throw new Error('O download de anexos está disponível quando a API e o banco estiverem conectados.')
      const response = await apiFetch(`/tasks/${selectedTask.id}/attachments/${file.id}`)
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Não foi possível baixar o anexo.')
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = file.filename
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function submitTask(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      category: form.get('category'),
      priority: form.get('priority'),
      due_date: form.get('due_date') || null,
      assignee_id: form.get('assignee_id') || null,
    }
    try {
      if (LOCAL_MODE) {
        createLocalTask(payload)
        setModal(null)
        setNotice('Tarefa salva neste navegador.')
        await loadData()
        return
      }
      const response = await apiFetch('/tasks', { method: 'POST', body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar a tarefa.')
      setModal(null)
      setNotice('Tarefa criada com sucesso.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitMovement(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const isReturn = modal === 'return'
    const note = String(form.get('note') || '')
    if (isReturn && !note.trim()) {
      setError('Informe o motivo da devolução.')
      return
    }
    setSaving(true)
    try {
      if (LOCAL_MODE) {
        moveLocalTask(selectedTask.id, isReturn ? 'returned' : 'forwarded', isReturn ? null : Number(form.get('member_id')), note)
        setModal(null)
        setNotice(isReturn ? 'Tarefa devolvida para a fila.' : 'Tarefa encaminhada com sucesso.')
        await loadData()
        return
      }
      const response = await apiFetch(`/tasks/${selectedTask.id}/${isReturn ? 'return' : 'forward'}`, {
        method: 'POST',
        body: JSON.stringify({ member_id: isReturn ? null : Number(form.get('member_id')), note }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a tarefa.')
      setModal(null)
      setNotice(isReturn ? 'Tarefa devolvida para a fila.' : 'Tarefa encaminhada com sucesso.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function completeTask(task) {
    setError('')
    try {
      if (LOCAL_MODE) {
        completeLocalTask(task.id)
        setNotice('Tarefa concluída.')
        await loadData()
        return
      }
      const response = await apiFetch(`/tasks/${task.id}/complete`, { method: 'POST', body: JSON.stringify({}) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a tarefa.')
      setNotice('Tarefa concluída.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function reopenTask(task) {
    if (!user?.is_admin) {
      setError('Apenas o administrador pode reabrir uma tarefa concluída.')
      return
    }
    if (!window.confirm(`Reabrir "${task.title}" para o responsável anterior?`)) return

    setError('')
    try {
      if (LOCAL_MODE) {
        reopenLocalTask(task.id, user.is_admin)
      } else {
        const response = await apiFetch(`/tasks/${task.id}/reopen`, { method: 'POST', body: JSON.stringify({}) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Não foi possível reabrir a tarefa.')
      }
      setModal(null)
      setNotice('Tarefa reaberta para o responsável anterior.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function showMovement(task, type) {
    setSelectedTask(task)
    setModal(type)
    setError('')
  }

  function handleDrop(event, status) {
    event.preventDefault()
    const task = tasks.find((item) => String(item.id) === event.dataTransfer.getData('text/plain'))
    if (!task || task.status === status || task.status === 'completed') return
    if (status === 'in_progress') showMovement(task, 'forward')
    else if (status === 'pending') showMovement(task, 'return')
    else completeTask(task)
  }

  if (!token) return <LoginScreen onLogin={submitLogin} busy={loginBusy} error={error} theme={theme} toggleTheme={toggleTheme} />

  const pageTitle = activePage === 'consultation'
    ? 'Consulta de tarefas'
    : activePage === 'profiles' ? 'Gerenciar perfis' : 'Quadro de tarefas'

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}><span className="brand-mark"><ListTodo size={21} strokeWidth={2.5} /></span><span>fluxo<span className="brand-dot">.</span></span></a>
        <span className="nav-label">MENU PRINCIPAL</span>
        <nav className="main-nav" aria-label="Menu principal">
          <button className={activePage === 'board' ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage('board')}><LayoutDashboard size={18} /> Quadro Kanban</button>
          <button className={activePage === 'consultation' ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage('consultation')}><FileText size={18} /> Consulta de tarefas</button>
          {user?.is_admin && <button className={activePage === 'profiles' ? 'nav-item active' : 'nav-item'} onClick={openProfiles}><UsersRound size={18} /> Gerenciar perfis</button>}
        </nav>
        <div className="sidebar-bottom">
          <ThemeButton theme={theme} toggleTheme={toggleTheme} />
          <button className="nav-item"><Settings size={18} /> Configurações</button>
          <button className="nav-item"><CircleHelp size={18} /> Central de ajuda</button>
          <div className="profile-card"><span className="avatar avatar-indigo">{getInitials(user?.name || 'Admin')}</span><span className="profile-copy"><strong>{user?.name || 'Administrador'}</strong><small>{user?.email}</small></span><button className="row-action logout-button" onClick={logout} title="Sair" aria-label="Sair"><LogOut size={15} /></button></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">{LOCAL_MODE ? <><strong>Modo de teste local</strong><span>/</span></> : <>Workspace <span>/</span></>} <strong>{pageTitle}</strong></div>
          <div className="topbar-actions"><span className="today-label"><CalendarDays size={15} />{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(now))}</span><ThemeButton theme={theme} toggleTheme={toggleTheme} /><button className="icon-button notification-button" aria-label="Notificações"><Bell size={18} /><i /></button><span className="avatar avatar-indigo top-avatar">{getInitials(user?.name || 'Admin')}</span></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><p className="eyebrow">ACOMPANHAMENTO DE EQUIPE</p><h1>{pageTitle}</h1><p className="page-subtitle">{activePage === 'board' ? 'Organize o fluxo de trabalho da equipe em um só lugar.' : 'Consulte responsáveis, prazos e o tempo de cada tarefa.'}</p></div>
            {activePage === 'board' && <button className="button button-primary" onClick={() => { setError(''); setModal('create') }}><Plus size={17} /> Nova tarefa</button>}
          </section>

          {error && !modal && <div className="alert alert-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Fechar"><X size={16} /></button></div>}

          {activePage === 'profiles' && user?.is_admin ? <section className="tasks-panel profile-management-panel">
            <div className="panel-heading profile-management-heading">
              <div><h2>Perfis da equipe</h2><p>Crie usuários de teste, organize departamentos e controle quem está ativo.</p></div>
              <button className="button button-primary" onClick={() => openMemberForm()}><UserPlus size={16} /> Novo perfil</button>
            </div>
            <div className="task-table-wrap"><table className="task-table profile-table">
              <thead><tr><th>PERFIL</th><th>E-MAIL</th><th>DEPARTAMENTO</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
              <tbody>
                {!profileMembers.length ? <tr><td className="table-state" colSpan="5">Nenhum perfil cadastrado.</td></tr> : profileMembers.map((member) => <tr key={member.id}>
                  <td><div className="profile-member-cell"><span className={`avatar ${Number(member.id) % 2 ? 'avatar-indigo' : 'avatar-teal'}`}>{getInitials(member.name)}</span><strong>{member.name}</strong></div></td>
                  <td>{member.email || '—'}</td>
                  <td>{member.department}</td>
                  <td><span className={`profile-state${member.active ? ' active' : ''}`}><span />{member.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td><div className="profile-actions">
                    <button className="row-action" title="Editar perfil" aria-label={`Editar ${member.name}`} onClick={() => openMemberForm(member)}><Pencil size={15} /></button>
                    <button className={`row-action${member.active ? ' action-deactivate' : ' action-activate'}`} title={member.active ? 'Desativar perfil' : 'Ativar perfil'} aria-label={`${member.active ? 'Desativar' : 'Ativar'} ${member.name}`} onClick={() => toggleMemberActive(member)}>{member.active ? <UserX size={15} /> : <UserCheck size={15} />}</button>
                  </div></td>
                </tr>)}
              </tbody>
            </table></div>
            <footer className="table-footer"><span>Perfis inativos não poderão ser selecionados como responsáveis.</span><span>{profileMembers.length} perfil(is)</span></footer>
          </section> : activePage === 'board' ? <>
            <section className="stats-grid" aria-label="Resumo das tarefas">
              <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-lilac"><ListTodo size={18} /></span><span className="stat-period">Neste momento</span></div><strong className="stat-value">{counts.total}</strong><span className="stat-label">Tarefas ativas</span><div className="stat-foot"><span className="stat-foot-dot dot-purple" /> Em acompanhamento</div></article>
              <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-blue"><UsersRound size={18} /></span><span className="stat-period">Com responsável</span></div><strong className="stat-value">{counts.inProgress}</strong><span className="stat-label">Em andamento</span><div className="stat-foot"><span className="stat-foot-dot dot-blue" /> Tarefas encaminhadas</div></article>
              <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-amber"><Clock3 size={18} /></span><span className="stat-period">Aguardando envio</span></div><strong className="stat-value">{counts.pending}</strong><span className="stat-label">Na fila</span><div className="stat-foot"><span className="stat-foot-dot dot-amber" /> Sem responsável</div></article>
              <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-green"><Check size={18} /></span><span className="stat-period">Total concluídas</span></div><strong className="stat-value">{counts.completed}</strong><span className="stat-label">Concluídas</span><div className="stat-foot"><span className="stat-foot-dot dot-green" /> Finalizadas pela equipe</div></article>
            </section>
            <section className="kanban-section">
              <div className="kanban-toolbar"><div><h2>Quadro da equipe</h2><p>Arraste uma tarefa para outra etapa ou use as ações do cartão.</p></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa..." /></label></div>
              {loading ? <div className="board-loading"><LoaderCircle className="spinner" size={20} /> Carregando tarefas...</div> : <div className="kanban-board">{columns.map((column) => {
                const ColumnIcon = column.icon
                const columnTasks = filteredTasks.filter((task) => task.status === column.status)
                return <section className={`kanban-column column-${column.status}`} key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, column.status)}><header className="kanban-column-heading"><span className="column-icon"><ColumnIcon size={16} /></span><span className="column-title">{column.title}<small>{column.caption}</small></span><span className="column-count">{columnTasks.length}</span></header><div className="kanban-cards">{columnTasks.map((task) => <TaskCard key={task.id} task={task} now={now} openHistory={openHistory} showMovement={showMovement} completeTask={completeTask} />)}{!columnTasks.length && <p className="column-empty">{search ? 'Nenhuma tarefa corresponde à busca.' : 'Nenhuma tarefa nesta etapa.'}</p>}</div></section>
              })}</div>}
            </section>
          </> : <section className="tasks-panel consultation-panel">
            <div className="panel-heading"><div><h2>Consulta de tarefas</h2><p>Busque pelo código ou texto e filtre pela etapa.</p></div><span className="consultation-count">{consultationTasks.length} tarefas</span></div>
            <div className="consultation-filters">
              <label className="consultation-search"><span>Código ou texto</span><span className="search-field"><Search size={16} /><input value={consultationSearch} onChange={(event) => setConsultationSearch(event.target.value)} placeholder="Ex.: TAR-000001 ou relatório" /></span></label>
              <label><span>Etapa</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todas</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <button className="text-button clear-filters" onClick={clearConsultationFilters}>Limpar filtros</button>
            </div>
            <div className="task-table-wrap"><table className="task-table consultation-table"><thead><tr><th>TAREFA / CÓDIGO</th><th>ETAPA</th><th>RESPONSÁVEL ATUAL</th><th>DESDE</th><th>TEMPO NESTA ETAPA</th><th>PRAZO</th><th aria-label="Histórico" /></tr></thead><tbody>
              {loading ? <tr><td className="table-state" colSpan="7"><LoaderCircle className="spinner" size={20} /> Carregando tarefas...</td></tr> : !consultationTasks.length ? <tr><td className="table-state" colSpan="7">Nenhuma tarefa encontrada com esses filtros.</td></tr> : consultationTasks.map((task) => <tr key={task.id}>
                <td><span className="task-code">{getTaskCode(task.id)}</span><button className="task-title-button" onClick={() => openHistory(task)}>{task.title}</button><span className="task-description">{task.category || task.description || 'Sem categoria'}</span>{LOCAL_MODE && <span className={`task-open-state${task.opened_at ? ' opened' : ''}`}>{task.opened_at ? `Detalhes acessados · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.opened_at))}` : 'Detalhes ainda não acessados'}</span>}</td>
                <td><span className={`status-pill status-${task.status}`}>{task.status === 'pending' ? 'Na fila' : task.status === 'completed' ? 'Concluída' : 'Em andamento'}</span></td>
                <td>{task.assignee_name ? <div className="person-cell"><span className={`avatar ${Number(task.assignee_id) % 2 ? 'avatar-indigo' : 'avatar-teal'}`}>{getInitials(task.assignee_name)}</span><span>{task.assignee_name}</span></div> : <span className="unassigned"><span />Sem responsável</span>}</td>
                <td>{task.current_since ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.current_since)) : '—'}</td>
                <td><span className={task.status === 'pending' ? 'elapsed waiting' : 'elapsed'}><Clock3 size={14} />{task.status === 'completed' ? 'Concluída' : formatElapsed(task.current_since, now)}</span></td>
                <td><span className={`due-date${task.overdue ? ' overdue' : task.dueSoon ? ' due-soon' : ''}`}><CalendarDays size={14} />{formatDate(task.due_date)}{task.due_label && task.due_date && ` · ${task.due_label}`}</span></td>
                <td><div className="row-actions">
                  <button className="row-action" title="Consultar histórico completo" aria-label={`Consultar histórico de ${task.title}`} onClick={() => openHistory(task)}><ArrowRight size={16} /></button>
                  {task.status === 'completed' && user?.is_admin && <button className="row-action action-reopen" title="Reabrir para o responsável anterior" aria-label={`Reabrir ${task.title}`} onClick={() => reopenTask(task)}><RotateCcw size={15} /></button>}
                </div></td>
              </tr>)}
            </tbody></table></div>
            <footer className="table-footer"><span>Exibindo <strong>{consultationTasks.length}</strong> de <strong>{tasks.length}</strong> tarefas</span><button className="text-button" onClick={clearConsultationFilters}>Limpar filtros</button></footer>
          </section>}
          <p className="page-footnote"><span className="live-dot" /> {LOCAL_MODE ? 'Dados salvos neste navegador' : 'Dados sincronizados com o sistema'} <span className="footnote-divider">·</span> O tempo é atualizado automaticamente</p>
        </div>
      </main>

      <nav className={`mobile-nav${activePage === 'consultation' ? ' consultation-nav' : ''}${activePage === 'profiles' ? ' profiles-nav' : ''}${user?.is_admin ? ' admin-nav' : ''}`} aria-label="Navegação mobile">
        <button className={activePage === 'board' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => setActivePage('board')}><LayoutDashboard size={19} /><span>Kanban</span></button>
        <button className={activePage === 'consultation' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => setActivePage('consultation')}><FileText size={19} /><span>Consulta</span></button>
        {user?.is_admin && <button className={activePage === 'profiles' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={openProfiles}><UsersRound size={19} /><span>Perfis</span></button>}
        {activePage === 'board' && <button className="mobile-nav-item" onClick={() => { setError(''); setModal('create') }}><Plus size={20} /><span>Nova tarefa</span></button>}
        <button className="mobile-nav-item" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}<span>Tema</span></button>
        <button className="mobile-nav-item" onClick={logout}><LogOut size={19} /><span>Sair</span></button>
      </nav>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
        <section className={`modal-card${modal === 'history' ? ' history-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><div><span className="modal-kicker">{modal === 'create' ? 'NOVA TAREFA' : modal === 'history' ? 'ACOMPANHAMENTO' : modal === 'member' ? 'ADMINISTRAÇÃO DE TESTE' : 'MOVIMENTAÇÃO'}</span><h2 id="modal-title">{modal === 'create' ? 'Criar tarefa' : modal === 'history' ? 'Histórico da tarefa' : modal === 'member' ? selectedMember ? 'Editar perfil' : 'Novo perfil' : modal === 'return' ? 'Devolver tarefa' : 'Encaminhar tarefa'}</h2></div><button className="icon-button" onClick={() => setModal(null)} aria-label="Fechar"><X size={18} /></button></div>
          {error && <div className="alert alert-error modal-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button></div>}
          {modal === 'member' && <form onSubmit={submitMemberProfile} className="modal-form">
            <label>Nome<input name="name" defaultValue={selectedMember?.name || ''} placeholder="Nome do perfil" required maxLength="120" /></label>
            <label>E-mail <span className="optional-label">(opcional)</span><input name="email" type="email" defaultValue={selectedMember?.email || ''} placeholder="nome@exemplo.com" maxLength="180" /></label>
            <label>Departamento<input name="department" defaultValue={selectedMember?.department || ''} placeholder="Ex.: Atendimento" required maxLength="80" /></label>
            <p className="form-hint"><CircleHelp size={14} /> O login deste ambiente é temporário; este perfil não cria uma senha.</p>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spinner" size={16} /> : selectedMember ? <Check size={16} /> : <UserPlus size={16} />}{selectedMember ? 'Salvar alterações' : 'Criar perfil'}</button></div>
          </form>}
          {modal === 'create' && <form onSubmit={submitTask} className="modal-form">
            <label>Título da tarefa<input name="title" placeholder="Ex.: Revisar contrato do cliente" required maxLength="180" /></label><label>Descrição<textarea name="description" placeholder="Adicione detalhes importantes para a equipe" rows="3" /></label>
            <div className="form-row"><label>Categoria<select name="category" defaultValue=""><option value="">Selecione uma categoria</option><option value="Administrativo">Administrativo</option><option value="Análise e parecer">Análise e parecer</option><option value="Atendimento">Atendimento</option><option value="Compras e contratos">Compras e contratos</option><option value="Documentação">Documentação</option><option value="Financeiro">Financeiro</option><option value="Gestão de pessoas">Gestão de pessoas</option><option value="Planejamento">Planejamento</option><option value="Relatórios">Relatórios</option><option value="Tecnologia da Informação">Tecnologia da Informação</option><option value="Outra">Outra</option></select></label><label>Prioridade<select name="priority" defaultValue="medium"><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label></div>
            <div className="form-row"><label>Prazo<input name="due_date" type="date" /></label><label>Responsável inicial<select name="assignee_id" defaultValue=""><option value="">Deixar na fila</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spinner" size={16} /> : <Plus size={16} />} Criar tarefa</button></div>
          </form>}
          {(modal === 'forward' || modal === 'return') && <form onSubmit={submitMovement} className="modal-form">
            <div className="movement-task"><span className="movement-task-icon"><ListTodo size={18} /></span><span><strong>{selectedTask?.title}</strong><small>{selectedTask?.assignee_name ? `Atualmente com ${selectedTask.assignee_name}` : 'Atualmente na fila de tarefas'}</small></span></div>
            {modal === 'forward' ? <><label>Encaminhar para<select name="member_id" required defaultValue=""><option value="" disabled>Selecione uma pessoa</option>{members.filter((member) => Number(member.id) !== Number(selectedTask?.assignee_id)).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><p className="form-hint"><Clock3 size={14} /> O tempo com a nova pessoa começa a contar após o encaminhamento.</p></> : <p className="return-copy">A tarefa será removida da pessoa responsável e voltará para a fila. O histórico de permanência será preservado.</p>}
            <label>{modal === 'return' ? 'Motivo da devolução' : <>Observação <span className="optional-label">(opcional)</span></>}<textarea name="note" placeholder={modal === 'return' ? 'Explique por que a tarefa está sendo devolvida' : 'Adicione uma orientação para a pessoa'} rows="3" required={modal === 'return'} maxLength="1000" /></label>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spinner" size={16} /> : modal === 'return' ? <ArrowDownLeft size={16} /> : <Send size={15} />}{modal === 'return' ? 'Devolver para fila' : 'Encaminhar tarefa'}</button></div>
          </form>}
          {modal === 'history' && <div className="history-content">
            <div className="history-task-summary"><span className="modal-kicker">TAREFA · {getTaskCode(selectedTask?.id)}</span><h3>{selectedTask?.title}</h3><p>{selectedTask?.description || selectedTask?.category || 'Sem descrição adicional.'}</p>{LOCAL_MODE && <p className="open-receipt">{selectedTask?.opened_at ? `Detalhes acessados em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedTask.opened_at))}. O registro não identifica quem abriu.` : 'Detalhes ainda não acessados.'}</p>}<div className="history-summary-meta"><span className={`priority priority-${selectedTask?.priority}`}>{priorities[selectedTask?.priority] || 'Média'} prioridade</span><span><Clock3 size={14} /> {selectedTask?.status === 'completed' ? 'Tarefa concluída' : formatElapsed(selectedTask?.current_since, now)}{selectedTask?.status !== 'completed' && ' nesta etapa'}</span>{selectedTask?.due_date && <span className={getDeadlineState(selectedTask).overdue ? 'deadline overdue' : getDeadlineState(selectedTask).dueSoon ? 'deadline due-soon' : 'deadline'}>{getDeadlineState(selectedTask).label}</span>}</div></div>
            <h3 className="timeline-heading">Movimentações <span>{history.length}</span></h3>
            {history.length === 0 ? <p className="empty-history">Nenhuma movimentação registrada.</p> : <ol className="timeline">{history.map((item) => <li key={item.id} className="timeline-item"><span className={`timeline-marker ${item.action}`} /><div className="timeline-entry"><strong>{item.action === 'created' ? 'Tarefa criada' : item.action === 'forwarded' ? 'Tarefa encaminhada' : item.action === 'returned' ? 'Tarefa devolvida' : item.action === 'reopened' ? 'Tarefa reaberta' : 'Tarefa concluída'}</strong><p>{item.action === 'created' ? `Criada${item.to_member_name ? ` e atribuída a ${item.to_member_name}` : ' na fila'}` : item.action === 'forwarded' ? `${item.from_member_name || 'Fila'} → ${item.to_member_name}` : item.action === 'returned' ? `${item.from_member_name || 'Responsável'} → Fila de tarefas` : item.action === 'reopened' ? `Administrador → ${item.to_member_name || 'responsável anterior'}` : `Concluída por ${item.from_member_name || 'responsável'}`}</p>{item.note && <blockquote>{item.note}</blockquote>}<small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}{item.duration_minutes != null && ` · permaneceu ${formatDuration(item.duration_minutes)}`}</small></div></li>)}</ol>}

            <div className="detail-section">
              <h3 className="timeline-heading">Comentários <span>{comments.length}</span></h3>
              <form className="comment-form" onSubmit={submitComment}>
                <textarea name="message" rows="2" placeholder="Adicionar comentário sobre a tarefa..." required maxLength="2000" />
                <button type="submit" className="button button-primary">Comentar</button>
              </form>
              {comments.length === 0 ? <p className="empty-history">Nenhum comentário registrado.</p> : <ul className="comment-list">{comments.map((comment) => <li key={comment.id}><strong>{comment.member_name || 'Usuário'}</strong><p>{comment.message}</p><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(comment.created_at))}</small></li>)}</ul>}
            </div>

            <div className="detail-section">
              <h3 className="timeline-heading">Anexos <span>{attachments.length}</span></h3>
              <label className="upload-field">
                <input type="file" onChange={submitAttachment} />
                <span>Selecionar arquivo</span>
              </label>
              {attachments.length === 0 ? <p className="empty-history">Nenhum anexo enviado.</p> : <ul className="attachment-list">{attachments.map((file) => <li key={file.id}><span className="attachment-name">{file.filename}<small>{file.size_bytes ? `${Math.max(1, Math.round(file.size_bytes / 1024))} KB` : 'Arquivo'} · {file.member_name || 'Usuário'}</small></span><button type="button" className="row-action" aria-label={`Baixar ${file.filename}`} title={`Baixar ${file.filename}`} onClick={() => downloadAttachment(file)}><Download size={15} /></button></li>)}</ul>}
            </div>

            <div className="modal-actions"><button className="button button-secondary" onClick={() => setModal(null)}>Fechar</button>{selectedTask?.status === 'completed' && user?.is_admin && <button className="button button-primary" onClick={() => reopenTask(selectedTask)}><RotateCcw size={15} /> Reabrir processo</button>}{selectedTask?.status !== 'completed' && (selectedTask?.assignee_id ? <button className="button button-primary" onClick={() => showMovement(selectedTask, 'return')}><ArrowDownLeft size={16} /> Devolver tarefa</button> : <button className="button button-primary" onClick={() => showMovement(selectedTask, 'forward')}><Send size={15} /> Encaminhar tarefa</button>)}</div>
          </div>}
        </section>
      </div>}
    </div>
  )
}

export default App
