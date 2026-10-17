import { Bot, Globe2, ShieldCheck } from 'lucide-react'
import { AuditView } from './views/AuditView'
import './App.css'
import './audit.css'

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="#workspace">
          <span className="brand-mark"><Bot size={16} /></span>
          <span className="brand-name">CHAOS<span>PILOT</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar"><Globe2 size={15} /></span>
          <span className="workspace-copy"><strong>AI workflow agent</strong><small>NVIDIA model · Nebius</small></span>
        </div>
        <div className="sidebar-label">WORKFLOWS</div>
        <nav className="side-nav">
          <a className="nav-item selected" href="#workspace" aria-current="page">
            <Globe2 size={15} /> Website audit<span className="nav-indicator" />
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
          <div className="breadcrumbs"><span>Workflows</span><span className="breadcrumb-divider">/</span><strong>Website audit</strong></div>
          <div className="topbar-right"><span className="demo-badge"><span /> SERVER-SIDE TOOLS</span></div>
        </header>
        <AuditView />
      </main>
    </div>
  )
}

export default App
