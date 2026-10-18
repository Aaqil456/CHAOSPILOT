import { useEffect, useState } from 'react'
import { Bot, Scale, Search, ShieldCheck } from 'lucide-react'
import { AuditView } from './views/AuditView'
import { CompareView } from './views/CompareView'
import './App.css'
import './audit.css'

type View = 'audit' | 'compare'

function viewFromHash(): View {
  return window.location.hash === '#compare' ? 'compare' : 'audit'
}

function App() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#audit" aria-label="ChaosPilot home">
          <span className="brand-mark"><Bot size={16} /></span>
          <span className="brand-name">CHAOS<span>PILOT</span></span>
        </a>
        <div className="topbar-right">
          <span className="tech-badge">NVIDIA Nemotron<span className="tech-badge-extra"> · Nebius</span></span>
          <span className="demo-badge"><ShieldCheck size={12} /> SERVER-SIDE TOOLS</span>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Workflows">
        <a href="#audit" className={view === 'audit' ? 'tab-selected' : ''} aria-current={view === 'audit' ? 'page' : undefined}>
          <Search size={14} /> Website audit
        </a>
        <a href="#compare" className={view === 'compare' ? 'tab-selected' : ''} aria-current={view === 'compare' ? 'page' : undefined}>
          <Scale size={14} /> Compare two sites
        </a>
      </nav>

      <main className="main-shell" id="workspace">
        {/* Both views stay mounted so switching tabs never cancels a run in progress. */}
        <div hidden={view !== 'audit'}><AuditView /></div>
        <div hidden={view !== 'compare'}><CompareView /></div>
      </main>
    </div>
  )
}

export default App
