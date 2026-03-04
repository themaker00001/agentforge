import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Zap, Settings, ChevronDown, Server, ServerOff, MessageSquare, Clock, Trash2, X, Save, Upload, Download, FolderOpen, LayoutTemplate, Rocket, Pencil, History, TrendingUp } from 'lucide-react'
import { getModels, checkBackend, listTasks, deleteTask } from '../services/api'
import './TopBar.css'

const FALLBACK_MODELS = [
    { value: 'ollama:llama3:8b', label: '🦙 llama3:8b' },
    { value: 'openai:gpt-4o', label: '⚡ GPT-4o' },
    { value: 'gemini:gemini-3.0-flash', label: '🔷 Gemini 3.0 Flash' },
]

const STATUS_COLORS = {
    pending: '#f59e0b',
    running: '#3b82f6',
    done: '#22c55e',
    error: '#ef4444',
}

function TaskPanel({ tasks, onClose, onRefresh, onDelete }) {
    return (
        <div className="task-panel">
            <div className="task-panel-header">
                <span>Background Tasks</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button className="icon-btn" onClick={onRefresh} title="Refresh">↻</button>
                    <button className="icon-btn" onClick={onClose}><X size={13} /></button>
                </div>
            </div>
            <div className="task-panel-body">
                {tasks.length === 0 && (
                    <div className="task-empty">No background tasks yet.</div>
                )}
                {tasks.map(task => (
                    <div key={task.task_id} className="task-item">
                        <div className="task-item-header">
                            <span
                                className="task-status-badge"
                                style={{ background: STATUS_COLORS[task.status] || '#888' }}
                            >
                                {task.status}
                            </span>
                            <span className="task-id" title={task.task_id}>
                                {task.task_id.slice(0, 8)}…
                            </span>
                            <button
                                className="icon-btn"
                                onClick={() => onDelete(task.task_id)}
                                title="Remove task"
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                        {task.result && (
                            <pre className="task-result">{task.result.slice(0, 300)}{task.result.length > 300 ? '\n…' : ''}</pre>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function SaveLoadPanel({ onSave, onLoad, onExport, onImport, onClose, listSavedFlows }) {
    const [saveName, setSaveName] = useState('')
    const [savedFlows, setSavedFlows] = useState([])
    const fileInputRef = useRef(null)

    useEffect(() => {
        setSavedFlows(listSavedFlows())
    }, [listSavedFlows])

    const handleSave = () => {
        const name = saveName.trim() || `Flow ${new Date().toLocaleDateString()}`
        onSave(name)
        setSaveName('')
        setSavedFlows(listSavedFlows())
    }

    const handleImportFile = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target.result)
                onImport(json)
                onClose()
            } catch {
                alert('Invalid JSON file.')
            }
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    return (
        <div className="task-panel" style={{ width: 260 }}>
            <div className="task-panel-header">
                <span>Save / Load</span>
                <button className="icon-btn" onClick={onClose}><X size={13} /></button>
            </div>
            <div className="task-panel-body" style={{ gap: 10 }}>
                {/* Save */}
                <div style={{ display: 'flex', gap: 4 }}>
                    <input
                        className="prompt-input"
                        style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
                        placeholder="Flow name…"
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                    <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={handleSave}>
                        <Save size={11} /> Save
                    </button>
                </div>

                {/* Saved list */}
                {savedFlows.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Saved flows</div>
                        {savedFlows.map(f => (
                            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1, fontSize: 11, padding: '3px 8px', textAlign: 'left' }}
                                    onClick={() => { onLoad(f.name); onClose() }}
                                >
                                    <FolderOpen size={10} /> {f.name}
                                </button>
                                <button
                                    className="icon-btn"
                                    style={{ padding: 3 }}
                                    title="Export"
                                    onClick={() => onExport(f.name)}
                                >
                                    <Download size={11} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Import */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <button
                        className="btn btn-secondary"
                        style={{ width: '100%', fontSize: 11 }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload size={11} /> Import JSON
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={handleImportFile}
                    />
                </div>
            </div>
        </div>
    )
}

const STATUS_LABEL = { idle: 'Idle', running: 'Running', generating: 'Building' }

export default function TopBar({
    onGenerate, onRun, onRunBackground, onPreview,
    selectedModel, onModelChange, isGenerating, isRunning, hasFlow,
    userInput, onUserInputChange,
    onSave, onLoad, onExport, onImport, listSavedFlows,
    onShowTemplates, onDeploy, onShowRuns, onShowDashboard,
}) {
    const [prompt, setPrompt] = useState('')
    const [models, setModels] = useState(FALLBACK_MODELS)
    const [backendUp, setBackendUp] = useState(false)
    const [showTasks, setShowTasks] = useState(false)
    const [showSaveLoad, setShowSaveLoad] = useState(false)
    const [tasks, setTasks] = useState([])
    const [bgSubmitting, setBgSubmitting] = useState(false)
    const [projectName, setProjectName] = useState('Untitled Agent')
    const [editingName, setEditingName] = useState(false)

    const statusKey = isRunning ? 'running' : isGenerating ? 'generating' : 'idle'

    useEffect(() => {
        async function loadModels() {
            const alive = await checkBackend()
            setBackendUp(alive)
            if (!alive) return

            const result = await getModels()
            const allModels = [
                ...result.ollama.map(n => ({ value: `ollama:${n}`, label: `🦙 ${n}` })),
                ...result.openai.map(n => ({ value: `openai:${n}`, label: `⚡ ${n}` })),
                ...result.gemini.map(n => ({ value: `gemini:${n}`, label: `🔷 ${n}` })),
                ...(result.lmstudio || []).map(n => ({ value: `lmstudio:${n}`, label: `🖥️ ${n}` })),
            ]
            if (allModels.length) {
                setModels(allModels)
                const found = allModels.find(m => m.value === selectedModel)
                if (!found) onModelChange(allModels[0].value)
            }
        }
        loadModels()
    }, []) // eslint-disable-line

    const refreshTasks = useCallback(async () => {
        const data = await listTasks()
        setTasks(data)
    }, [])

    useEffect(() => {
        if (!showTasks) return
        refreshTasks()
        const id = setInterval(refreshTasks, 3000)
        return () => clearInterval(id)
    }, [showTasks, refreshTasks])

    const handleRunBackground = async () => {
        if (!hasFlow) return
        setBgSubmitting(true)
        try {
            await onRunBackground?.()
            setShowTasks(true)
            await refreshTasks()
        } catch (err) {
            console.error('[AgentForge] Background task submit failed:', err)
        } finally {
            setBgSubmitting(false)
        }
    }

    const handleDeleteTask = async (taskId) => {
        await deleteTask(taskId)
        await refreshTasks()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && prompt.trim()) onGenerate(prompt)
    }

    return (
        <header className="topbar">
            {/* Logo */}
            <div className="topbar-logo">
                <div className="logo-icon">
                    <Zap size={17} color="#fff" strokeWidth={2.5} />
                </div>
                <div className="logo-details">
                    <span className="logo-text">Agent<span className="logo-accent">Forge</span></span>
                    {editingName ? (
                        <input
                            className="project-name-input"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            onBlur={() => setEditingName(false)}
                            onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
                            autoFocus
                        />
                    ) : (
                        <button
                            className="project-name-btn"
                            onClick={() => setEditingName(true)}
                            title="Rename project"
                        >
                            {projectName} <Pencil size={9} className="project-pencil" />
                        </button>
                    )}
                </div>
            </div>

            {/* Prompt input */}
            <div className="topbar-prompt">
                <div className="prompt-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </div>
                <input
                    className="prompt-input"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the agent workflow you want to build…"
                />
                <span className="prompt-hint">⌘K</span>
            </div>

            {/* Run input */}
            <div className="topbar-prompt" style={{ flex: '0 0 220px' }}>
                <div className="prompt-icon">
                    <Play size={12} />
                </div>
                <input
                    className="prompt-input"
                    value={userInput}
                    onChange={e => onUserInputChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && hasFlow && onRun()}
                    placeholder="Type your question, then click Run…"
                />
            </div>

            {/* Actions */}
            <div className="topbar-actions">
                <button
                    className="btn btn-templates"
                    onClick={onShowTemplates}
                    title="Browse pre-built workflow templates"
                >
                    <LayoutTemplate size={13} />
                    Templates
                </button>

                <button
                    className="btn btn-history"
                    onClick={onShowDashboard}
                    title="View usage dashboard"
                >
                    <TrendingUp size={13} />
                    Dashboard
                </button>

                <button
                    className="btn btn-history"
                    onClick={onShowRuns}
                    title="View run history and replay past runs"
                >
                    <History size={13} />
                    History
                </button>

                <button
                    className="btn btn-deploy"
                    onClick={onDeploy}
                    disabled={!hasFlow}
                    title="Deploy as live API endpoint"
                >
                    <Rocket size={13} />
                    Deploy
                </button>

                <button
                    className={`btn btn-primary ${isGenerating ? 'btn-loading' : ''}`}
                    onClick={() => prompt.trim() && onGenerate(prompt)}
                    disabled={isGenerating}
                >
                    <Zap size={13} strokeWidth={2.5} />
                    {isGenerating ? 'Generating…' : 'Generate Flow'}
                </button>

                <button
                    className={`btn btn-run ${isRunning ? 'btn-loading' : ''}`}
                    onClick={onRun}
                    disabled={!hasFlow}
                >
                    <Play size={12} fill="currentColor" />
                    {isRunning ? 'Running…' : 'Run'}
                </button>

                <button
                    className={`btn btn-bg ${bgSubmitting ? 'btn-loading' : ''}`}
                    onClick={handleRunBackground}
                    disabled={bgSubmitting || !hasFlow}
                    title="Run this flow in the background"
                >
                    <Clock size={12} />
                    {bgSubmitting ? 'Queuing…' : 'Background'}
                </button>

                {/* Save / Load panel */}
                <div style={{ position: 'relative' }}>
                    <button
                        className={`icon-btn${showSaveLoad ? ' active' : ''}`}
                        onClick={() => setShowSaveLoad(v => !v)}
                        title="Save / Load flows"
                    >
                        <Save size={15} />
                    </button>
                    {showSaveLoad && (
                        <SaveLoadPanel
                            onSave={onSave}
                            onLoad={onLoad}
                            onExport={onExport}
                            onImport={onImport}
                            onClose={() => setShowSaveLoad(false)}
                            listSavedFlows={listSavedFlows}
                        />
                    )}
                </div>

                {/* Background tasks toggle */}
                <div style={{ position: 'relative' }}>
                    <button
                        className={`icon-btn${showTasks ? ' active' : ''}`}
                        onClick={() => setShowTasks(v => !v)}
                        title="Background tasks"
                        style={{ position: 'relative' }}
                    >
                        <Clock size={15} />
                        {tasks.some(t => t.status === 'running') && (
                            <span className="task-running-dot" />
                        )}
                    </button>
                    {showTasks && (
                        <TaskPanel
                            tasks={tasks}
                            onClose={() => setShowTasks(false)}
                            onRefresh={refreshTasks}
                            onDelete={handleDeleteTask}
                        />
                    )}
                </div>

                <button
                    className="btn btn-preview"
                    onClick={onPreview}
                    disabled={!hasFlow}
                    title="Chat with this agent"
                >
                    <MessageSquare size={13} />
                    Preview
                </button>

                <div className={`topbar-status topbar-status--${statusKey}`}>
                    <span className="status-pip" />
                    {STATUS_LABEL[statusKey]}
                </div>

                {/* Model selector */}
                <div className="model-select-wrap">
                    <div className={`ollama-status ${backendUp ? 'up' : 'down'}`} title={backendUp ? 'Backend connected' : 'Backend offline'}>
                        {backendUp ? <Server size={11} /> : <ServerOff size={11} />}
                    </div>
                    <select
                        className="model-select"
                        value={selectedModel}
                        onChange={e => onModelChange(e.target.value)}
                    >
                        {models.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="model-chevron" />
                </div>

                <button className="icon-btn" title="Settings">
                    <Settings size={15} />
                </button>

                <div className="avatar" title="Profile">C</div>
            </div>
        </header>
    )
}
