import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, Square, MessageSquare, Terminal, ChevronDown, Server, ServerOff, Zap, X, Save, Upload, Download, FolderOpen } from 'lucide-react'
import { getModels, checkBackend } from '../services/api'
import './TopBar.css'

const FALLBACK_MODELS = [
    { value: 'ollama:llama3:8b', label: 'llama3:8b', provider: 'Ollama' },
    { value: 'openai:gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
    { value: 'gemini:gemini-3.0-flash', label: 'Gemini 3.0 Flash', provider: 'Google' },
]

function PromptModal({ open, onClose, onSubmit }) {
    const [value, setValue] = useState('')
    useEffect(() => { if (open) setValue('') }, [open])
    if (!open || typeof document === 'undefined') return null
    return createPortal(
        <div className="prompt-modal-backdrop" onClick={onClose}>
            <div className="prompt-modal" onClick={e => e.stopPropagation()}>
                <div className="prompt-modal-header">
                    <span className="prompt-modal-title">// GENERATE FLOW</span>
                    <button className="icon-btn" onClick={onClose}><X size={13} /></button>
                </div>
                <textarea
                    className="prompt-modal-textarea"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="Describe the agent workflow you want to build…"
                    autoFocus
                    onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            if (value.trim()) { onSubmit(value); onClose() }
                        }
                        if (e.key === 'Escape') onClose()
                    }}
                />
                <div className="prompt-modal-footer">
                    <span>⌘↵ to generate</span>
                    <button
                        className="btn btn-primary"
                        disabled={!value.trim()}
                        onClick={() => { if (value.trim()) { onSubmit(value); onClose() } }}
                    >
                        <Zap size={12} strokeWidth={2.5} /> Generate
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

function RunModal({ open, onClose, onSubmit }) {
    const [value, setValue] = useState('')
    if (!open || typeof document === 'undefined') return null
    return createPortal(
        <div className="prompt-modal-backdrop" onClick={onClose}>
            <div className="prompt-modal" onClick={e => e.stopPropagation()}>
                <div className="prompt-modal-header">
                    <span className="prompt-modal-title">// RUN INPUT</span>
                    <button className="icon-btn" onClick={onClose}><X size={13} /></button>
                </div>
                <textarea
                    className="prompt-modal-textarea"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="Type your question or input for the flow…"
                    autoFocus
                    onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            onSubmit(value); onClose()
                        }
                        if (e.key === 'Escape') onClose()
                    }}
                />
                <div className="prompt-modal-footer">
                    <span>⌘↵ to run</span>
                    <button className="btn btn-primary" onClick={() => { onSubmit(value); onClose() }}>
                        <Play size={12} fill="currentColor" /> Run Flow
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

function SaveLoadPanel({ onSave, onLoad, onExport, onImport, onClose, listSavedFlows }) {
    const [saveName, setSaveName] = useState('')
    const [savedFlows, setSavedFlows] = useState([])
    const fileRef = useRef(null)
    useEffect(() => { setSavedFlows(listSavedFlows()) }, [listSavedFlows])

    const handleSave = () => {
        const name = saveName.trim() || `Flow ${new Date().toLocaleDateString()}`
        onSave(name); setSaveName(''); setSavedFlows(listSavedFlows())
    }
    const handleImport = e => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ev => { try { onImport(JSON.parse(ev.target.result)); onClose() } catch { alert('Invalid JSON.') } }
        reader.readAsText(file)
        e.target.value = ''
    }
    return (
        <div className="tb-dropdown-panel" style={{ width: 240 }}>
            <div className="tb-dropdown-header">
                <span>Save / Load</span>
                <button className="icon-btn" onClick={onClose}><X size={12} /></button>
            </div>
            <div className="tb-dropdown-body">
                <div style={{ display: 'flex', gap: 4 }}>
                    <input className="tb-input" style={{ flex: 1 }} placeholder="Flow name…" value={saveName}
                        onChange={e => setSaveName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
                    <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 10 }} onClick={handleSave}>
                        <Save size={10} />
                    </button>
                </div>
                {savedFlows.length > 0 && (
                    <div>
                        <div className="tb-dropdown-label">Saved</div>
                        {savedFlows.map(f => (
                            <div key={f.name} style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                                <button className="tb-list-btn" onClick={() => { onLoad(f.name); onClose() }}>
                                    <FolderOpen size={10} /> {f.name}
                                </button>
                                <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => onExport(f.name)}>
                                    <Download size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <button className="btn btn-secondary" style={{ width: '100%', fontSize: 10 }}
                        onClick={() => fileRef.current?.click()}>
                        <Upload size={10} /> Import JSON
                    </button>
                    <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                </div>
            </div>
        </div>
    )
}

export default function TopBar({
    onGenerate, onRun, onPreview,
    selectedModel, onModelChange, isGenerating, isRunning, hasFlow,
    userInput, onUserInputChange,
    onSave, onLoad, onExport, onImport, listSavedFlows,
    onShowTemplates, onShowRuns, onShowDashboard,
    onConsoleToggle, onTweaksToggle,
}) {
    const [models, setModels] = useState(FALLBACK_MODELS)
    const [backendUp, setBackendUp] = useState(false)
    const [showProvider, setShowProvider] = useState(false)
    const [showSave, setShowSave] = useState(false)
    const [showGenerate, setShowGenerate] = useState(false)
    const [showRun, setShowRun] = useState(false)
    const [projectName, setProjectName] = useState('untitled-agent.flow')
    const [editingName, setEditingName] = useState(false)
    const providerRef = useRef(null)

    const currentModel = models.find(m => m.value === selectedModel) || models[0]
    const providerLabel = currentModel?.provider || 'Ollama'

    useEffect(() => {
        async function load() {
            const alive = await checkBackend()
            setBackendUp(alive)
            if (!alive) return
            const result = await getModels()
            const all = [
                ...(result.ollama || []).map(n => ({ value: `ollama:${n}`, label: n, provider: 'Ollama' })),
                ...(result.openai || []).map(n => ({ value: `openai:${n}`, label: n, provider: 'OpenAI' })),
                ...(result.gemini || []).map(n => ({ value: `gemini:${n}`, label: n, provider: 'Google' })),
                ...(result.lmstudio || []).map(n => ({ value: `lmstudio:${n}`, label: n, provider: 'LM Studio' })),
            ]
            if (all.length) { setModels(all); if (!all.find(m => m.value === selectedModel)) onModelChange(all[0].value) }
        }
        load()
    }, []) // eslint-disable-line

    useEffect(() => {
        const h = e => { if (providerRef.current && !providerRef.current.contains(e.target)) setShowProvider(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    const statusKey = isRunning ? 'running' : isGenerating ? 'generating' : 'idle'

    return (
        <>
        <header className="topbar">
            {/* Flow name */}
            <div className="tb-flow-cell">
                <span className={`tb-status-pip tb-pip--${statusKey}`} />
                {editingName ? (
                    <input className="tb-name-input" value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        onBlur={() => setEditingName(false)}
                        onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
                        autoFocus />
                ) : (
                    <button className="tb-name-btn" onClick={() => setEditingName(true)}>
                        {projectName}
                    </button>
                )}
                <span className="tb-meta">· edited just now</span>
            </div>

            <div className="tb-divider" />

            {/* Flow version */}
            <div className="tb-cell">
                <span className="tb-label">FLOW</span>
                <span className="tb-value">v0.1.0</span>
            </div>

            <div className="tb-divider" />

            {/* Provider + model */}
            <div className="tb-cell tb-provider" ref={providerRef} onClick={() => setShowProvider(o => !o)}>
                <span className="tb-label">PROVIDER</span>
                <span className="tb-value">{providerLabel}</span>
                <span className="tb-dot">·</span>
                <span className="tb-value">{currentModel?.label || '—'}</span>
                <ChevronDown size={11} style={{ color: 'var(--fg3)', marginLeft: 2 }} />
                {showProvider && (
                    <div className="tb-dropdown-panel tb-provider-menu">
                        {['Ollama', 'OpenAI', 'Google', 'LM Studio'].map(prov => {
                            const provModels = models.filter(m => m.provider === prov)
                            if (!provModels.length) return null
                            return (
                                <div key={prov}>
                                    <div className="tb-dropdown-section">{prov}</div>
                                    {provModels.map(m => (
                                        <button key={m.value}
                                            className={`tb-model-btn ${m.value === selectedModel ? 'active' : ''}`}
                                            onClick={e => { e.stopPropagation(); onModelChange(m.value); setShowProvider(false) }}>
                                            <span className="tb-model-check">{m.value === selectedModel ? '●' : '○'}</span>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="tb-spacer" />

            {/* Backend status */}
            <div className={`tb-backend ${backendUp ? 'up' : 'down'}`} title={backendUp ? 'Backend online' : 'Backend offline'}>
                {backendUp ? <Server size={11} /> : <ServerOff size={11} />}
            </div>

            {/* Secondary actions */}
            <button className="tb-btn" onClick={onShowDashboard}>Dashboard</button>
            <button className="tb-btn" onClick={onShowRuns}>History</button>
            <button className="tb-btn" onClick={onShowTemplates}>Templates</button>

            {/* Save/Load */}
            <div style={{ position: 'relative' }}>
                <button className="icon-btn" onClick={() => setShowSave(v => !v)} title="Save / Load">
                    <Save size={13} />
                </button>
                {showSave && (
                    <SaveLoadPanel onSave={onSave} onLoad={onLoad} onExport={onExport}
                        onImport={onImport} onClose={() => setShowSave(false)} listSavedFlows={listSavedFlows} />
                )}
            </div>

            <div className="tb-divider" />

            {/* Console + Chat */}
            <button className="tb-btn" onClick={onConsoleToggle}>
                <Terminal size={12} /> Console
            </button>
            <button className="tb-btn" onClick={onPreview}>
                <MessageSquare size={12} /> Chat
            </button>

            {/* Generate */}
            <button
                className={`tb-btn tb-generate${isGenerating ? ' loading' : ''}`}
                onClick={() => setShowGenerate(true)}
                disabled={isGenerating}
                title="Generate flow from prompt (⌘K)"
            >
                <Zap size={12} strokeWidth={2.5} />
                {isGenerating ? 'Generating…' : 'Generate'}
            </button>

            {/* Run */}
            <button
                className={`tb-run-btn${isRunning ? ' running' : ''}${!hasFlow ? ' disabled' : ''}`}
                onClick={() => isRunning ? null : setShowRun(true)}
                disabled={!hasFlow && !isRunning}
                title="Run flow (⌘↵)"
            >
                {isRunning ? <><Square size={11} fill="currentColor" /> Stop</> : <><Play size={11} fill="currentColor" /> Run Flow</>}
                <span className="tb-kbd">⌘↵</span>
            </button>
        </header>

        <PromptModal open={showGenerate} onClose={() => setShowGenerate(false)}
            onSubmit={prompt => onGenerate(prompt)} />
        <RunModal open={showRun} onClose={() => setShowRun(false)}
            onSubmit={input => { onUserInputChange(input); onRun() }} />
        </>
    )
}
