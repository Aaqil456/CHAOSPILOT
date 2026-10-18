import { Bot, ShieldCheck } from 'lucide-react'
import { AuditView } from './views/AuditView'
import './App.css'
import './audit.css'

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="ChaosPilot home">
          <span className="brand-mark"><Bot size={16} /></span>
          <span className="brand-name">CHAOS<span>PILOT</span></span>
        </a>
        <div className="topbar-right">
          <span className="tech-badge">NVIDIA Nemotron<span className="tech-badge-extra"> · Nebius</span></span>
          <span className="demo-badge"><ShieldCheck size={12} /> SERVER-SIDE TOOLS</span>
        </div>
      </header>
      <main className="main-shell" id="workspace">
        <AuditView />
      </main>
    </div>
  )
}

export default App
