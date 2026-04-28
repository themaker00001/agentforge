import { Workflow, BookOpen, Wrench, History, Settings } from 'lucide-react'
import './Rail.css'

const ITEMS = [
  { id: 'flow',     Icon: Workflow,  label: 'Flows' },
  { id: 'kb',       Icon: BookOpen,  label: 'Knowledge' },
  { id: 'tools',    Icon: Wrench,    label: 'Tools' },
  { id: 'history',  Icon: History,   label: 'Runs' },
  { id: 'settings', Icon: Settings,  label: 'Settings' },
]

export default function Rail({ active, setActive, onSettings }) {
  return (
    <nav className="rail">
      <div className="rail-logo" title="AgentForge">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
          <path d="M5 27 L16 5 L27 27" />
          <path d="M10 19 L22 19" />
          <circle cx="16" cy="13" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      {ITEMS.map(({ id, Icon, label }) => (
        <button
          key={id}
          className={`rail-btn ${active === id ? 'active' : ''}`}
          onClick={id === 'settings' ? onSettings : () => setActive(id)}
          title={label}
        >
          <Icon size={16} strokeWidth={1.5} />
        </button>
      ))}
      <div className="rail-spacer" />
      <div className="rail-year">2026 · LOCAL</div>
    </nav>
  )
}
