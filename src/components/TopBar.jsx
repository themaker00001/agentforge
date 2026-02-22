import { useState, useEffect, useRef } from 'react'
import { Play, Zap, Settings, ChevronDown, Server, ServerOff, MessageSquare } from 'lucide-react'
import { getModels, checkBackend } from '../services/api'
import './TopBar.css'

const FALLBACK_MODELS = [
    { value: 'ollama:llama3:8b', label: '🦙 llama3:8b' },
    { value: 'openai:gpt-4o', label: '⚡ GPT-4o' },
    { value: 'gemini:gemini-3.0-flash', label: '🔷 Gemini 3.0 Flash' },
]

export default function TopBar({ onGenerate, onRun, onPreview, selectedModel, onModelChange, isGenerating, isRunning, hasFlow }) {
    const [prompt, setPrompt] = useState('')
    const [models, setModels] = useState(FALLBACK_MODELS)
    const [backendUp, setBackendUp] = useState(false)

    // Re-fetch models whenever backend status may have changed
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
            ]
            if (allModels.length) {
                setModels(allModels)
                // Auto-select first Ollama model if current selection isn't in list
                const found = allModels.find(m => m.value === selectedModel)
                if (!found) onModelChange(allModels[0].value)
            }
        }
        loadModels()
    }, []) // eslint-disable-line

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
                <span className="logo-text">Agent<span className="logo-accent">Forge</span></span>
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

            {/* Actions */}
            <div className="topbar-actions">
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
                    disabled={isRunning}
                >
                    <Play size={12} fill="currentColor" />
                    {isRunning ? 'Running…' : 'Run'}
                </button>

                <button
                    className={`btn btn-preview`}
                    onClick={onPreview}
                    disabled={!hasFlow}
                    title="Chat with this agent"
                >
                    <MessageSquare size={13} />
                    Preview
                </button>

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
