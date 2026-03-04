import { useState, useEffect, useCallback } from 'react'
import { X, CalendarClock, Plus, Trash2, Power, RefreshCw, CheckCircle, Clock } from 'lucide-react'
import { listSchedules, createSchedule, toggleSchedule, deleteSchedule } from '../services/api'
import './SchedulerPanel.css'

const PRESETS = [
    { label: 'Every minute',  cron: '* * * * *' },
    { label: 'Every 5 min',   cron: '*/5 * * * *' },
    { label: 'Every hour',    cron: '0 * * * *' },
    { label: 'Daily 9am',     cron: '0 9 * * *' },
    { label: 'Daily midnight',cron: '0 0 * * *' },
    { label: 'Weekly Mon 9am',cron: '0 9 * * 1' },
]

function fmtDate(iso) {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    } catch {
        return iso
    }
}

export default function SchedulerPanel({ flow, model, onClose }) {
    const [schedules, setSchedules] = useState([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [form, setForm] = useState({ name: '', cron_expr: '0 * * * *', user_input: '' })
    const [error, setError] = useState('')

    const refresh = useCallback(async () => {
        setLoading(true)
        setSchedules(await listSchedules())
        setLoading(false)
    }, [])

    useEffect(() => { refresh() }, [refresh])

    const handleCreate = async () => {
        if (!form.cron_expr.trim()) { setError('Cron expression required'); return }
        setError('')
        try {
            await createSchedule({
                name: form.name.trim() || 'Untitled Schedule',
                cron_expr: form.cron_expr.trim(),
                user_input: form.user_input,
                model,
                flow_json: JSON.stringify(flow),
            })
            setForm({ name: '', cron_expr: '0 * * * *', user_input: '' })
            setCreating(false)
            await refresh()
        } catch (e) {
            setError(e.message)
        }
    }

    const handleToggle = async (id) => {
        await toggleSchedule(id)
        await refresh()
    }

    const handleDelete = async (id) => {
        await deleteSchedule(id)
        await refresh()
    }

    return (
        <div className="sched-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="sched-panel">
                <div className="sched-header">
                    <div className="sched-title">
                        <CalendarClock size={15} />
                        Cron Scheduler
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="icon-btn" onClick={refresh} title="Refresh" disabled={loading}>
                            <RefreshCw size={13} className={loading ? 'spin' : ''} />
                        </button>
                        <button className="icon-btn" onClick={onClose}><X size={13} /></button>
                    </div>
                </div>

                <div className="sched-body">
                    {/* Create form */}
                    {creating ? (
                        <div className="sched-create-form">
                            <div className="sched-form-title">New Scheduled Run</div>

                            <div className="sched-field">
                                <label className="form-label">Name</label>
                                <input
                                    className="form-input"
                                    placeholder="e.g. Daily report"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                />
                            </div>

                            <div className="sched-field">
                                <label className="form-label">Cron Expression</label>
                                <input
                                    className="form-input"
                                    placeholder="* * * * *"
                                    value={form.cron_expr}
                                    onChange={e => setForm(f => ({ ...f, cron_expr: e.target.value }))}
                                    style={{ fontFamily: 'SF Mono, Fira Code, monospace' }}
                                />
                                <div className="sched-presets">
                                    {PRESETS.map(p => (
                                        <button
                                            key={p.cron}
                                            className={`sched-preset ${form.cron_expr === p.cron ? 'active' : ''}`}
                                            onClick={() => setForm(f => ({ ...f, cron_expr: p.cron }))}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="sched-field">
                                <label className="form-label">User Input (optional)</label>
                                <input
                                    className="form-input"
                                    placeholder="Input passed to the flow on each run"
                                    value={form.user_input}
                                    onChange={e => setForm(f => ({ ...f, user_input: e.target.value }))}
                                />
                            </div>

                            <div className="sched-field">
                                <div className="sched-flow-badge">
                                    <CheckCircle size={11} />
                                    Current flow attached ({flow?.nodes?.length ?? 0} nodes)
                                </div>
                            </div>

                            {error && <div className="sched-error">{error}</div>}

                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreate}>
                                    <CalendarClock size={12} /> Schedule Flow
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setCreating(false); setError('') }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            className="sched-add-btn"
                            onClick={() => setCreating(true)}
                            disabled={!flow?.nodes?.length}
                            title={!flow?.nodes?.length ? 'Generate a flow first' : 'Schedule current flow'}
                        >
                            <Plus size={13} /> Schedule current flow
                        </button>
                    )}

                    {/* Schedule list */}
                    <div className="sched-list">
                        {!loading && schedules.length === 0 && (
                            <div className="sched-empty">No schedules yet. Create one to run your flow automatically.</div>
                        )}
                        {schedules.map(s => (
                            <div key={s.id} className={`sched-item ${s.enabled ? 'enabled' : 'disabled'}`}>
                                <div className="sched-item-header">
                                    <div className="sched-item-name">{s.name}</div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button
                                            className={`icon-btn ${s.enabled ? 'active' : ''}`}
                                            onClick={() => handleToggle(s.id)}
                                            title={s.enabled ? 'Disable' : 'Enable'}
                                        >
                                            <Power size={11} />
                                        </button>
                                        <button
                                            className="icon-btn"
                                            onClick={() => handleDelete(s.id)}
                                            title="Delete"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                </div>
                                <div className="sched-item-cron">{s.cron_expr}</div>
                                <div className="sched-item-meta">
                                    <span className="sched-meta-pill">
                                        <Clock size={9} />
                                        Next: {fmtDate(s.next_run)}
                                    </span>
                                    {s.last_run && (
                                        <span className="sched-meta-pill">
                                            Last: {fmtDate(s.last_run)}
                                        </span>
                                    )}
                                    <span className={`sched-status-badge ${s.enabled ? 'on' : 'off'}`}>
                                        {s.enabled ? 'Active' : 'Paused'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
