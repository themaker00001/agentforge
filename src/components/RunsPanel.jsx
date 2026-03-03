import { useState, useEffect, useCallback } from 'react'
import { X, RefreshCw, Trash2, Play, Clock, DollarSign } from 'lucide-react'
import { listRuns, getRun, deleteRun } from '../services/api'
import './RunsPanel.css'

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(usd) {
    if (!usd || usd === 0) return '$0'
    if (usd < 0.0001) return `$${usd.toFixed(6)}`
    if (usd < 0.01)   return `$${usd.toFixed(4)}`
    return `$${usd.toFixed(3)}`
}

function formatDate(iso) {
    try {
        const d = new Date(iso)
        return d.toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    } catch {
        return iso
    }
}

export default function RunsPanel({ onClose, onReplayEvent, onResetNodes }) {
    const [runs, setRuns]               = useState([])
    const [loading, setLoading]         = useState(false)
    const [selectedRun, setSelectedRun] = useState(null)
    const [replaying, setReplaying]     = useState(false)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const data = await listRuns(50)
            setRuns(data)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { refresh() }, [refresh])

    const handleDelete = async (runId, e) => {
        e.stopPropagation()
        await deleteRun(runId)
        setRuns(prev => prev.filter(r => r.run_id !== runId))
        if (selectedRun?.run_id === runId) setSelectedRun(null)
    }

    const handleSelect = async (run) => {
        if (selectedRun?.run_id === run.run_id) {
            setSelectedRun(null)
            return
        }
        try {
            const full = await getRun(run.run_id)
            setSelectedRun(full)
        } catch {
            setSelectedRun(run)
        }
    }

    const handleReplay = async () => {
        if (!selectedRun?.events_json) return
        let events
        try {
            events = JSON.parse(selectedRun.events_json)
        } catch {
            return
        }
        setReplaying(true)
        onResetNodes()
        onClose()
        for (const event of events) {
            await new Promise(r => setTimeout(r, 50))
            onReplayEvent(event)
        }
        setReplaying(false)
    }

    return (
        <div className="runs-overlay" onClick={onClose}>
            <div className="runs-panel" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="runs-header">
                    <div className="runs-title">
                        <Clock size={15} />
                        Run History
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                            className="icon-btn"
                            onClick={refresh}
                            disabled={loading}
                            title="Refresh"
                        >
                            <RefreshCw size={13} className={loading ? 'spin' : ''} />
                        </button>
                        <button className="icon-btn" onClick={onClose}>
                            <X size={13} />
                        </button>
                    </div>
                </div>

                <div className="runs-body">
                    {/* Run list */}
                    <div className="runs-list">
                        {runs.length === 0 && !loading && (
                            <div className="runs-empty">No runs yet. Execute a flow to see history.</div>
                        )}
                        {runs.map(run => (
                            <div
                                key={run.run_id}
                                className={`run-card${selectedRun?.run_id === run.run_id ? ' selected' : ''}`}
                                onClick={() => handleSelect(run)}
                            >
                                <div className="run-card-header">
                                    <span className="run-date">{formatDate(run.created_at)}</span>
                                    <button
                                        className="icon-btn run-delete-btn"
                                        onClick={e => handleDelete(run.run_id, e)}
                                        title="Delete run"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                                <div className="run-input-preview">
                                    {run.user_input || <em style={{ color: 'var(--text-muted)' }}>no input</em>}
                                </div>
                                <div className="run-meta">
                                    <span className="run-meta-item run-meta-model">
                                        {run.model?.split(':').slice(1).join(':') || run.model}
                                    </span>
                                    <span className="run-meta-item">
                                        <Clock size={9} /> {formatDuration(run.duration_ms)}
                                    </span>
                                    <span className="run-meta-item run-meta-cost">
                                        <DollarSign size={9} /> {formatCost(run.total_cost_usd)}
                                    </span>
                                    <span className="run-meta-item">
                                        {run.node_count} nodes
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Detail / Replay panel */}
                    {selectedRun && (
                        <div className="run-detail">
                            <div className="run-detail-title">Selected Run</div>
                            <div className="run-detail-row">
                                <span>Run ID</span>
                                <span className="run-detail-val mono">{selectedRun.run_id.slice(0, 16)}…</span>
                            </div>
                            <div className="run-detail-row">
                                <span>Time</span>
                                <span className="run-detail-val">{formatDate(selectedRun.created_at)}</span>
                            </div>
                            <div className="run-detail-row">
                                <span>Duration</span>
                                <span className="run-detail-val">{formatDuration(selectedRun.duration_ms)}</span>
                            </div>
                            <div className="run-detail-row">
                                <span>Total Cost</span>
                                <span className="run-detail-val" style={{ color: '#22c55e' }}>
                                    {formatCost(selectedRun.total_cost_usd)}
                                </span>
                            </div>
                            <div className="run-detail-row">
                                <span>Nodes</span>
                                <span className="run-detail-val">{selectedRun.node_count}</span>
                            </div>
                            <div className="run-detail-row">
                                <span>Model</span>
                                <span className="run-detail-val mono">{selectedRun.model}</span>
                            </div>
                            {selectedRun.user_input && (
                                <div className="run-detail-row" style={{ flexDirection: 'column', gap: 4 }}>
                                    <span>Input</span>
                                    <div className="run-input-box">{selectedRun.user_input}</div>
                                </div>
                            )}

                            <button
                                className="btn btn-primary runs-replay-btn"
                                onClick={handleReplay}
                                disabled={replaying || !selectedRun.events_json}
                                title="Replay this run on the canvas"
                            >
                                <Play size={12} fill="currentColor" />
                                {replaying ? 'Replaying…' : 'Replay on Canvas'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
