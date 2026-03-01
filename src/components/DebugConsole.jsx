import { forwardRef, useImperativeHandle, useState, useEffect, useRef, useCallback } from 'react'
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react'
import './DebugConsole.css'

const BADGE_MAP = {
    info: { cls: 'log-info', text: 'INFO' },
    ok:   { cls: 'log-ok',   text: 'OK'   },
    warn: { cls: 'log-warn', text: 'WARN' },
    err:  { cls: 'log-err',  text: 'ERR'  },
    run:  { cls: 'log-run',  text: 'RUN'  },
    exec: { cls: 'log-exec', text: 'EXEC' },
}

const TABS = ['Logs', 'Steps', 'Errors']

const DEFAULT_HEIGHT = 178

function LogLine({ log }) {
    const [expanded, setExpanded] = useState(false)
    const badge = BADGE_MAP[log.type] || BADGE_MAP.info
    const fullOutput = log.data?.output
    const hasFullOutput = fullOutput && fullOutput.length > log.message.length - 4

    return (
        <div
            className={`dc-line ${badge.cls}${hasFullOutput ? ' dc-line--expandable' : ''}`}
            onClick={hasFullOutput ? () => setExpanded(v => !v) : undefined}
            title={hasFullOutput ? (expanded ? 'Click to collapse' : 'Click to expand full output') : undefined}
        >
            <span className="dc-time">{log.ts}</span>
            <span className="dc-badge">{badge.text}</span>
            <div className="dc-msg-wrap">
                <span className="dc-msg">{log.message}</span>
                {hasFullOutput && (
                    <span className="dc-expand-hint">{expanded ? '▲' : '▼'}</span>
                )}
                {expanded && hasFullOutput && (
                    <pre className="dc-full-output">{fullOutput}</pre>
                )}
            </div>
        </div>
    )
}

/**
 * DebugConsole with drag-to-resize support.
 * Drag the handle bar at the top edge to resize.
 * Exposes addLog(type, message, data) and clear() via ref.
 */
const DebugConsole = forwardRef(function DebugConsole({ collapsed, onToggle }, ref) {
    const [logs, setLogs] = useState([])
    const [activeTab, setTab] = useState('Logs')
    const [height, setHeight] = useState(DEFAULT_HEIGHT)

    // Drag state — use refs so event listeners never go stale
    const dragging    = useRef(false)
    const dragStartY  = useRef(0)
    const dragStartH  = useRef(0)
    const didMove     = useRef(false) // distinguish drag from click

    useImperativeHandle(ref, () => ({
        addLog(type, message, data) {
            if (type === 'chunk') return
            const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
            setLogs(prev => [...prev, { id: Date.now() + Math.random(), type, message, ts, data }])
        },
        clear() { setLogs([]) },
    }))

    // ── Drag handle ──────────────────────────────────────────────────────────
    const onDragStart = useCallback((e) => {
        if (collapsed) return
        dragging.current   = true
        didMove.current    = false
        dragStartY.current = e.clientY
        dragStartH.current = height
        e.preventDefault()
        e.stopPropagation()
    }, [collapsed, height])

    useEffect(() => {
        const onMove = (e) => {
            if (!dragging.current) return
            didMove.current = true
            const delta  = dragStartY.current - e.clientY
            const newH   = Math.min(600, Math.max(60, dragStartH.current + delta))
            setHeight(newH)
        }
        const onUp = () => { dragging.current = false }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
    }, [])

    // ── Header toggle — guard against accidental fire on text-selection release
    const handleHeaderClick = useCallback((e) => {
        // If the user just finished selecting text, don't toggle
        if (window.getSelection()?.toString().length > 0) return
        onToggle()
    }, [onToggle])

    // ── Filter logs by tab ───────────────────────────────────────────────────
    const filtered = logs.filter(l => {
        if (activeTab === 'Errors') return l.type === 'err'
        if (activeTab === 'Steps') return ['exec', 'run'].includes(l.type)
        return true
    })

    const consoleStyle = collapsed ? undefined : { height }

    return (
        <div className={`debug-console${collapsed ? ' collapsed' : ''}`} style={consoleStyle}>
            {/* Drag handle — only shown when expanded */}
            {!collapsed && (
                <div
                    className="dc-drag-handle"
                    onMouseDown={onDragStart}
                    title="Drag to resize"
                />
            )}

            <div className="dc-header" onClick={handleHeaderClick}>
                <div className="dc-title">
                    <div className="dc-dot" />
                    <Terminal size={13} />
                    Debug Console
                    {logs.length > 0 && <span className="dc-count">{logs.length}</span>}
                </div>
                {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <div className="dc-tabs" onClick={e => e.stopPropagation()}>
                    {TABS.map(t => (
                        <div
                            key={t}
                            className={`dc-tab${activeTab === t ? ' active' : ''}`}
                            onClick={() => setTab(t)}
                        >
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
                    {filtered.map(log => <LogLine key={log.id} log={log} />)}
                </div>
            )}
        </div>
    )
})

export default DebugConsole
