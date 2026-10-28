import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Moon,
  Plus,
  Search,
  Send,
  Settings,
  Sun,
  UsersRound,
  X,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const initialClock = Date.now()
const columns = [
  { status: 'pending', title: 'Na fila', caption: 'Aguardando encaminhamento', icon: Clock3 },
  { status: 'in_progress', title: 'Em andamento', caption: 'Com a equipe', icon: UsersRound },
  { status: 'completed', title: 'Concluídas', caption: 'Finalizadas', icon: Check },
]
const priorities = { high: 'Alta', medium: 'Média', low: 'Baixa' }

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
      <div className="login-top"><a className="brand" href="#" onClick={(event) => event.preventDefault()}><span className="brand-mark"><ListTodo size={21} strokeWidth={2.5} /></span><span>fluxo<span className="brand-dot">.</span></span></a><ThemeButton theme={theme} toggleTheme={toggleTheme} /></div>
      <section className="login-card">
        <div className="login-symbol"><UsersRound size={23} /></div>
        <p className="eyebrow">BEM-VINDO DE VOLTA</p>
        <h1>Acesse seu workspace</h1>
        <p className="login-subtitle">Entre para acompanhar as tarefas da sua equipe.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form className="modal-form login-form" onSubmit={onLogin}>
          <label>Usuário ou e-mail<input type="text" name="email" placeholder="Digite qualquer usuário" autoComplete="username" required maxLength="180" /></label>
          <label>Senha<input type="password" name="password" placeholder="Digite qualquer senha" autoComplete="current-password" required maxLength="256" /></label>
          <button className="button button-primary login-submit" disabled={busy}>{busy ? <LoaderCircle className="spinner" size={17} /> : null} Entrar</button>
        </form>
        <p className="login-help">Acesso temporário: informe qualquer usuário e senha.</p>
      </section>
      <p className="login-footer">Fluxo · Gestão de tarefas da equipe</p>
    </main>
  )
}

function TaskCard({ task, now, openHistory, showMovement, completeTask }) {
  const [dragging, setDragging] = useState(false)
  return (
    <article
      className={`kanban-card${dragging ? ' dragging' : ''}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(task.id)); setDragging(true) }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="card-topline">
        <span className={`priority priority-${task.priority}`}>{priorities[task.priority] || 'Média'}</span>
        <button className="row-action" aria-label={`Ver histórico de ${task.title}`} onClick={() => openHistory(task)}><FileText size={15} /></button>
      </div>
      <button className="kanban-task-title" onClick={() => openHistory(task)}>{task.title}</button>
      {task.description && <p className="kanban-description">{task.description}</p>}
      {task.category && <span className="category-chip">{task.category}</span>}
      <div className="kanban-card-meta">
        {task.assignee_name
          ? <span className="person-cell"><span className={`avatar ${Number(task.assignee_id) % 2 ? 'avatar-indigo' : 'avatar-teal'}`}>{getInitials(task.assignee_name)}</span><span>{task.assignee_name}</span></span>
          : <span className="unassigned"><span />Na fila</span>}
      </div>
      <div className="card-bottomline">
        <span className={`elapsed${task.status === 'pending' ? ' waiting' : ''}`}><Clock3 size={13} /> {task.status === 'completed' ? 'Finalizada' : formatElapsed(task.current_since, now)}</span>
        <span className="due-date"><CalendarDays size={13} />{formatDate(task.due_date)}</span>
      </div>
      <div className="card-actions">
        {task.status === 'pending' && <button className="card-action-button" onClick={() => showMovement(task, 'forward')}><Send size={13} /> Encaminhar</button>}
        {task.status === 'in_progress' && <>
          <button className="card-action-button" onClick={() => showMovement(task, 'return')}><ArrowDownLeft size={14} /> Devolver</button>
          <button className="card-action-button card-complete" onClick={() => completeTask(task)}><Check size={14} /> Concluir</button>
        </>}
        {task.status === 'completed' && <button className="card-action-button" onClick={() => openHistory(task)}><FileText size={13} /> Consultar histórico</button>}
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
  const [activePage, setActivePage] = useState('board')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [history, setHistory] = useState([])
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
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

  async function submitLogin(event) {
    event.preventDefault()
    setLoginBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
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
  }

  async function openHistory(task) {
    setSelectedTask(task)
    setModal('history')
    setHistory([])
    try {
      const response = await apiFetch(`/tasks/${task.id}/history`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o histórico.')
      setHistory(result)
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
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const isReturn = modal === 'return'
    try {
      const response = await apiFetch(`/tasks/${selectedTask.id}/${isReturn ? 'return' : 'forward'}`, {
        method: 'POST',
        body: JSON.stringify({ member_id: isReturn ? null : Number(form.get('member_id')), note: form.get('note') }),
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
      const response = await apiFetch(`/tasks/${task.id}/complete`, { method: 'POST', body: JSON.stringify({}) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a tarefa.')
      setNotice('Tarefa concluída.')
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

  const pageTitle = activePage === 'consultation' ? 'Consulta de tarefas' : 'Quadro de tarefas'

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}><span className="brand-mark"><ListTodo size={21} strokeWidth={2.5} /></span><span>fluxo<span className="brand-dot">.</span></span></a>
        <div className="workspace-switcher"><span className="workspace-icon">N</span><span className="workspace-copy"><strong>Núcleo de operações</strong><small>Workspace</small></span><ChevronDown size={15} /></div>
        <span className="nav-label">MENU PRINCIPAL</span>
        <nav className="main-nav" aria-label="Menu principal">
          <button className={activePage === 'board' ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage('board')}><LayoutDashboard size={18} /> Quadro Kanban</button>
          <button className={activePage === 'consultation' ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage('consultation')}><FileText size={18} /> Consulta de tarefas</button>
          <button className="nav-item" onClick={() => { setActivePage('board'); setSearch('') }}><Clock3 size={18} /> Em andamento<span className="nav-count">{counts.inProgress}</span></button>
          <button className="nav-item" onClick={() => { setActivePage('board'); setSearch('') }}><UsersRound size={18} /> Na fila<span className="nav-count">{counts.pending}</span></button>
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
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{pageTitle}</strong></div>
          <div className="topbar-actions"><span className="today-label"><CalendarDays size={15} />{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(now))}</span><ThemeButton theme={theme} toggleTheme={toggleTheme} /><button className="icon-button notification-button" aria-label="Notificações"><Bell size={18} /><i /></button><span className="avatar avatar-indigo top-avatar">{getInitials(user?.name || 'Admin')}</span></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><p className="eyebrow">ACOMPANHAMENTO DE EQUIPE</p><h1>{pageTitle}</h1><p className="page-subtitle">{activePage === 'board' ? 'Organize o fluxo de trabalho da equipe em um só lugar.' : 'Consulte responsáveis, prazos e o tempo de cada tarefa.'}</p></div>
            <button className="button button-primary" onClick={() => { setError(''); setModal('create') }}><Plus size={17} /> Nova tarefa</button>
          </section>

          {error && <div className="alert alert-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Fechar"><X size={16} /></button></div>}

          {activePage === 'board' ? <>
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
            <div className="panel-heading"><div><h2>Consulta de tarefas</h2><p>Histórico detalhado de responsáveis e tempo por etapa.</p></div><span className="consultation-count">{filteredTasks.length} tarefas</span></div>
            <div className="list-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa ou responsável..." /></label></div>
            <div className="task-table-wrap"><table className="task-table consultation-table"><thead><tr><th>TAREFA</th><th>ETAPA</th><th>RESPONSÁVEL ATUAL</th><th>DESDE</th><th>TEMPO NESTA ETAPA</th><th>PRAZO</th><th aria-label="Histórico" /></tr></thead><tbody>
              {loading ? <tr><td className="table-state" colSpan="7"><LoaderCircle className="spinner" size={20} /> Carregando tarefas...</td></tr> : !filteredTasks.length ? <tr><td className="table-state" colSpan="7">Nenhuma tarefa encontrada.</td></tr> : filteredTasks.map((task) => <tr key={task.id}>
                <td><button className="task-title-button" onClick={() => openHistory(task)}>{task.title}</button><span className="task-description">{task.category || task.description || 'Sem categoria'}</span></td>
                <td><span className={`status-pill status-${task.status}`}>{task.status === 'pending' ? 'Na fila' : task.status === 'completed' ? 'Concluída' : 'Em andamento'}</span></td>
                <td>{task.assignee_name ? <div className="person-cell"><span className={`avatar ${Number(task.assignee_id) % 2 ? 'avatar-indigo' : 'avatar-teal'}`}>{getInitials(task.assignee_name)}</span><span>{task.assignee_name}</span></div> : <span className="unassigned"><span />Sem responsável</span>}</td>
                <td>{task.current_since ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.current_since)) : '—'}</td>
                <td><span className={task.status === 'pending' ? 'elapsed waiting' : 'elapsed'}><Clock3 size={14} />{task.status === 'completed' ? 'Concluída' : formatElapsed(task.current_since, now)}</span></td>
                <td><span className="due-date"><CalendarDays size={14} />{formatDate(task.due_date)}</span></td>
                <td><button className="row-action" title="Consultar histórico completo" aria-label={`Consultar histórico de ${task.title}`} onClick={() => openHistory(task)}><ArrowRight size={16} /></button></td>
              </tr>)}
            </tbody></table></div>
            <footer className="table-footer"><span>Exibindo <strong>{filteredTasks.length}</strong> de <strong>{tasks.length}</strong> tarefas</span><button className="text-button" onClick={() => setSearch('')}>Limpar busca</button></footer>
          </section>}
          <p className="page-footnote"><span className="live-dot" /> Dados sincronizados com o sistema <span className="footnote-divider">·</span> O tempo é atualizado automaticamente</p>
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        <button className={activePage === 'board' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => setActivePage('board')}><LayoutDashboard size={19} /><span>Kanban</span></button>
        <button className={activePage === 'consultation' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => setActivePage('consultation')}><FileText size={19} /><span>Consulta</span></button>
        <button className="mobile-nav-item" onClick={() => { setError(''); setModal('create') }}><Plus size={20} /><span>Nova tarefa</span></button>
        <button className="mobile-nav-item" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}<span>Tema</span></button>
        <button className="mobile-nav-item" onClick={logout}><LogOut size={19} /><span>Sair</span></button>
      </nav>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
        <section className={`modal-card${modal === 'history' ? ' history-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><div><span className="modal-kicker">{modal === 'create' ? 'NOVA TAREFA' : modal === 'history' ? 'ACOMPANHAMENTO' : 'MOVIMENTAÇÃO'}</span><h2 id="modal-title">{modal === 'create' ? 'Criar tarefa' : modal === 'history' ? 'Histórico da tarefa' : modal === 'return' ? 'Devolver tarefa' : 'Encaminhar tarefa'}</h2></div><button className="icon-button" onClick={() => setModal(null)} aria-label="Fechar"><X size={18} /></button></div>
          {modal === 'create' && <form onSubmit={submitTask} className="modal-form">
            <label>Título da tarefa<input name="title" placeholder="Ex.: Revisar contrato do cliente" required maxLength="180" /></label><label>Descrição<textarea name="description" placeholder="Adicione detalhes importantes para a equipe" rows="3" /></label>
            <div className="form-row"><label>Categoria<input name="category" placeholder="Ex.: Financeiro" maxLength="80" /></label><label>Prioridade<select name="priority" defaultValue="medium"><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label></div>
            <div className="form-row"><label>Prazo<input name="due_date" type="date" /></label><label>Responsável inicial<select name="assignee_id" defaultValue=""><option value="">Deixar na fila</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spinner" size={16} /> : <Plus size={16} />} Criar tarefa</button></div>
          </form>}
          {(modal === 'forward' || modal === 'return') && <form onSubmit={submitMovement} className="modal-form">
            <div className="movement-task"><span className="movement-task-icon"><ListTodo size={18} /></span><span><strong>{selectedTask?.title}</strong><small>{selectedTask?.assignee_name ? `Atualmente com ${selectedTask.assignee_name}` : 'Atualmente na fila de tarefas'}</small></span></div>
            {modal === 'forward' ? <><label>Encaminhar para<select name="member_id" required defaultValue=""><option value="" disabled>Selecione uma pessoa</option>{members.filter((member) => Number(member.id) !== Number(selectedTask?.assignee_id)).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><p className="form-hint"><Clock3 size={14} /> O tempo com a nova pessoa começa a contar após o encaminhamento.</p></> : <p className="return-copy">A tarefa será removida da pessoa responsável e voltará para a fila. O histórico de permanência será preservado.</p>}
            <label>Observação <span className="optional-label">(opcional)</span><textarea name="note" placeholder={modal === 'return' ? 'Informe o motivo da devolução' : 'Adicione uma orientação para a pessoa'} rows="3" /></label>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spinner" size={16} /> : modal === 'return' ? <ArrowDownLeft size={16} /> : <Send size={15} />}{modal === 'return' ? 'Devolver para fila' : 'Encaminhar tarefa'}</button></div>
          </form>}
          {modal === 'history' && <div className="history-content">
            <div className="history-task-summary"><span className="modal-kicker">TAREFA</span><h3>{selectedTask?.title}</h3><p>{selectedTask?.description || selectedTask?.category || 'Sem descrição adicional.'}</p><div className="history-summary-meta"><span className={`priority priority-${selectedTask?.priority}`}>{priorities[selectedTask?.priority] || 'Média'} prioridade</span><span><Clock3 size={14} /> {selectedTask?.status === 'completed' ? 'Tarefa concluída' : formatElapsed(selectedTask?.current_since, now)}{selectedTask?.status !== 'completed' && ' nesta etapa'}</span></div></div>
            <h3 className="timeline-heading">Movimentações <span>{history.length}</span></h3>
            {history.length === 0 ? <p className="empty-history">Nenhuma movimentação registrada.</p> : <ol className="timeline">{history.map((item) => <li key={item.id} className="timeline-item"><span className={`timeline-marker ${item.action}`} /><div className="timeline-entry"><strong>{item.action === 'created' ? 'Tarefa criada' : item.action === 'forwarded' ? 'Tarefa encaminhada' : item.action === 'returned' ? 'Tarefa devolvida' : 'Tarefa concluída'}</strong><p>{item.action === 'created' ? `Criada${item.to_member_name ? ` e atribuída a ${item.to_member_name}` : ' na fila'}` : item.action === 'forwarded' ? `${item.from_member_name || 'Fila'} → ${item.to_member_name}` : item.action === 'returned' ? `${item.from_member_name || 'Responsável'} → Fila de tarefas` : `Concluída por ${item.from_member_name || 'responsável'}`}</p>{item.note && <blockquote>{item.note}</blockquote>}<small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}{item.duration_minutes != null && ` · permaneceu ${formatDuration(item.duration_minutes)}`}</small></div></li>)}</ol>}
            <div className="modal-actions"><button className="button button-secondary" onClick={() => setModal(null)}>Fechar</button>{selectedTask?.status !== 'completed' && (selectedTask?.assignee_id ? <button className="button button-primary" onClick={() => showMovement(selectedTask, 'return')}><ArrowDownLeft size={16} /> Devolver tarefa</button> : <button className="button button-primary" onClick={() => showMovement(selectedTask, 'forward')}><Send size={15} /> Encaminhar tarefa</button>)}</div>
          </div>}
        </section>
      </div>}
    </div>
  )
}

export default App
