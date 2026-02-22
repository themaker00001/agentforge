import { forwardRef, useImperativeHandle, useState } from 'react'
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react'
import './DebugConsole.css'

const BADGE_MAP = {
    info: { cls: 'log-info', text: 'INFO' },
    ok: { cls: 'log-ok', text: 'OK' },
    warn: { cls: 'log-warn', text: 'WARN' },
    err: { cls: 'log-err', text: 'ERR' },
    run: { cls: 'log-run', text: 'RUN' },
    exec: { cls: 'log-exec', text: 'EXEC' },
}

const TABS = ['Logs', 'Steps', 'Errors']

/**
 * DebugConsole exposes addLog(type, message) via ref.
 * Works imperatively so callers don't need to thread state.
 */
const DebugConsole = forwardRef(function DebugConsole({ collapsed, onToggle }, ref) {
    const [logs, setLogs] = useState([])
    const [activeTab, setTab] = useState('Logs')

    useImperativeHandle(ref, () => ({
        addLog(type, message) {
            const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
            setLogs(prev => [...prev, { id: Date.now() + Math.random(), type, message, ts }])
        },
        clear() { setLogs([]) },
    }))

    const filtered = logs.filter(l => {
        if (activeTab === 'Errors') return l.type === 'err'
        if (activeTab === 'Steps') return ['exec', 'run'].includes(l.type)
        return true
    })

    return (
        <div className={`debug-console${collapsed ? ' collapsed' : ''}`}>
            <div className="dc-header" onClick={onToggle}>
                <div className="dc-title">
                    <div className="dc-dot" />
                    <Terminal size={13} />
                    Debug Console
                </div>
                {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <div className="dc-tabs" onClick={e => e.stopPropagation()}>
                    {TABS.map(t => (
                        <div key={t} className={`dc-tab${activeTab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                            {t}
                        </div>
                    ))}
                </div>
            </div>

            {!collapsed && (
                <div className="dc-body">
                    {filtered.length === 0 && (
                        <div className="dc-empty">No logs yet — run a flow to see output.</div>
                    )}
                    {filtered.map(log => {
                        const badge = BADGE_MAP[log.type] || BADGE_MAP.info
                        return (
                            <div key={log.id} className={`dc-line ${badge.cls}`}>
                                <span className="dc-time">{log.ts}</span>
                                <span className="dc-badge">{badge.text}</span>
                                <span className="dc-msg">{log.message}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
})

export default DebugConsole
