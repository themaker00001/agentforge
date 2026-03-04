import { useState, useEffect, useCallback } from 'react'
import { X, RefreshCw, TrendingUp, DollarSign, Clock, Calendar, Cpu } from 'lucide-react'
import { getStats } from '../services/api'
import './DashboardPanel.css'

function StatCard({ icon, label, value, sub, accent }) {
    return (
        <div className="dash-card" style={{ '--accent-c': accent }}>
            <div className="dash-card-icon">{icon}</div>
            <div className="dash-card-body">
                <div className="dash-card-value">{value}</div>
                <div className="dash-card-label">{label}</div>
                {sub && <div className="dash-card-sub">{sub}</div>}
            </div>
        </div>
    )
}

function BarChart({ timeline }) {
    if (!timeline?.length) return null
    const maxRuns = Math.max(...timeline.map(d => d.runs), 1)

    return (
        <div className="dash-chart">
            {timeline.map(({ date, runs, cost }) => (
                <div key={date} className="dash-bar-col" title={`${date}: ${runs} runs · $${cost.toFixed(5)}`}>
                    <div
                        className="dash-bar"
                        style={{ height: `${Math.max(4, (runs / maxRuns) * 80)}px` }}
                    />
                    <div className="dash-bar-label">{date.slice(5)}</div>
                </div>
            ))}
        </div>
    )
}

export default function DashboardPanel({ onClose }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        const data = await getStats()
        setStats(data)
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const fmt = {
        cost: (v) => v >= 0.01 ? `$${v.toFixed(4)}` : v > 0 ? `$${v.toFixed(6)}` : '$0.00',
        ms: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`,
    }

    return (
        <div className="dash-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="dash-panel">
                <div className="dash-header">
                    <div className="dash-title">
                        <TrendingUp size={15} />
                        Usage Dashboard
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            className="icon-btn"
                            onClick={load}
                            title="Refresh"
                            disabled={loading}
                        >
                            <RefreshCw size={13} className={loading ? 'spin' : ''} />
                        </button>
                        <button className="icon-btn" onClick={onClose}>
                            <X size={13} />
                        </button>
                    </div>
                </div>

                {loading && !stats ? (
                    <div className="dash-loading">Loading stats</div>
                ) : !stats ? (
                    <div className="dash-loading">Backend offline  start the server.</div>
                ) : (
                    <div className="dash-body">
                        {/* Stat cards */}
                        <div className="dash-cards">
                            <StatCard
                                icon={<TrendingUp size={16} />}
                                label="Total Runs"
                                value={stats.total_runs.toLocaleString()}
                                accent="#6366f1"
                            />
                            <StatCard
                                icon={<DollarSign size={16} />}
                                label="Total Cost"
                                value={fmt.cost(stats.total_cost_usd)}
                                sub="across all agents"
                                accent="#10b981"
                            />
                            <StatCard
                                icon={<Clock size={16} />}
                                label="Avg Duration"
                                value={fmt.ms(stats.avg_duration_ms)}
                                sub="per run"
                                accent="#f59e0b"
                            />
                            <StatCard
                                icon={<Calendar size={16} />}
                                label="Active Schedules"
                                value={stats.active_schedules}
                                sub="cron jobs running"
                                accent="#3b82f6"
                            />
                        </div>

                        {/* Timeline chart */}
                        <div className="dash-section">
                            <div className="dash-section-title">Runs  last 7 days</div>
                            <BarChart timeline={stats.timeline} />
                        </div>

                        {/* Model breakdown */}
                        {stats.models.length > 0 && (
                            <div className="dash-section">
                                <div className="dash-section-title">
                                    <Cpu size={12} /> Cost by model
                                </div>
                                <div className="dash-models">
                                    {stats.models.map(({ model, runs, cost_usd }) => {
                                        const totalCost = stats.total_cost_usd || 1
                                        const pct = Math.round((cost_usd / totalCost) * 100) || 0
                                        const shortModel = model.split(':').slice(1).join(':') || model
                                        return (
                                            <div key={model} className="dash-model-row">
                                                <div className="dash-model-name" title={model}>
                                                    {shortModel}
                                                </div>
                                                <div className="dash-model-bar-wrap">
                                                    <div
                                                        className="dash-model-bar"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <div className="dash-model-meta">
                                                    <span>{runs} runs</span>
                                                    <span className="dash-model-cost">{fmt.cost(cost_usd)}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {stats.total_runs === 0 && (
                            <div className="dash-empty">
                                No runs yet  generate a flow and click Run to get started.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
