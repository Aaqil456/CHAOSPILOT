import { useEffect, useState } from 'react'
import { Bot, Code2, Globe2, ShieldCheck } from 'lucide-react'
import { AuditView } from './views/AuditView'
import { BuilderView } from './views/BuilderView'
import './App.css'
import './audit.css'

type View = 'audit' | 'builder'

function viewFromHash(): View {
  return window.location.hash === '#builder' ? 'builder' : 'audit'
}

function App() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const title = view === 'audit' ? 'Website audit' : 'Website builder'

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="#audit">
          <span className="brand-mark"><Bot size={16} /></span>
          <span className="brand-name">CHAOS<span>PILOT</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar"><Globe2 size={15} /></span>
          <span className="workspace-copy"><strong>AI workflow agent</strong><small>NVIDIA model · Nebius</small></span>
        </div>
        <div className="sidebar-label">WORKFLOWS</div>
        <nav className="side-nav">
          <a className={`nav-item ${view === 'audit' ? 'selected' : ''}`} href="#audit" aria-current={view === 'audit' ? 'page' : undefined}>
            <Globe2 size={15} /> Website audit{view === 'audit' && <span className="nav-indicator" />}
          </a>
          <a className={`nav-item ${view === 'builder' ? 'selected' : ''}`} href="#builder" aria-current={view === 'builder' ? 'page' : undefined}>
            <Code2 size={15} /> Website builder{view === 'builder' && <span className="nav-indicator" />}
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-card">
            <span className="safe-icon"><ShieldCheck size={14} /></span>
            <div><strong>Allowlisted tools</strong><p>Keys stay on the server</p></div>
            <span className="safe-dot" />
          </div>
        </div>
      </aside>

      <main className="main-shell" id="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workflows</span><span className="breadcrumb-divider">/</span><strong>{title}</strong></div>
          <div className="topbar-right"><span className="demo-badge"><span /> {view === 'audit' ? 'SERVER-SIDE TOOLS' : 'LOCAL PROJECT'}</span></div>
        </header>
        {view === 'audit' ? <AuditView /> : <BuilderView />}
      </main>
    </div>
  )
}

export default App
