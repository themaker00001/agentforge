import { X } from 'lucide-react'
import './ConfigPanel.css'

/* Stop ALL keyboard events from bubbling to React Flow (which intercepts
   keys like Delete, Backspace, arrow keys via document-level listeners). */
const stopKeys = (e) => {
    e.stopPropagation()
    e.nativeEvent?.stopImmediatePropagation()
}

export default function ConfigPanel({ node, onClose, onUpdate }) {
    if (!node) return null

    const { data } = node
    const icons = { input: '💬', agent: '🤖', tool: '🔧', knowledge: '📚', output: '📤' }

    const update = (key, value) => onUpdate(node.id, { ...data, [key]: value })

    return (
        <aside className="config-panel">
            <div className="cp-header">
                <div className="cp-title">
                    <span className="cp-icon">{icons[data.nodeType] || '⚙️'}</span>
                    <span>{data.label}</span>
                </div>
                <button className="icon-btn" onClick={onClose}><X size={13} /></button>
            </div>

            <div className="cp-body">
                {/* Model */}
                <div className="cp-group">
                    <label className="form-label" htmlFor={`${node.id}-model`}>Model</label>
                    <select
                        id={`${node.id}-model`}
                        className="form-select"
                        value={data.model || 'ollama:llama3:8b'}
                        onChange={e => update('model', e.target.value)}
                        onKeyDown={stopKeys}
                    >
                        <option value="ollama:llama3:8b">🦙 llama3:8b</option>
                        <option value="ollama:llama3.2">🦙 llama3.2</option>
                        <option value="ollama:mistral">🦙 mistral</option>
                        <option value="openai:gpt-4o">⚡ GPT-4o</option>
                        <option value="openai:gpt-4o-mini">⚡ GPT-4o mini</option>
                        <option value="gemini:gemini-2.0-flash">🔷 Gemini 2.0 Flash</option>
                    </select>
                </div>

                {/* System Prompt */}
                <div className="cp-group">
                    <label className="form-label" htmlFor={`${node.id}-prompt`}>System Prompt</label>
                    <textarea
                        id={`${node.id}-prompt`}
                        className="form-textarea"
                        rows={5}
                        placeholder="You are a helpful assistant…"
                        value={data.systemPrompt || ''}
                        onChange={e => update('systemPrompt', e.target.value)}
                        onKeyDown={stopKeys}
                    />
                </div>

                {/* Creativity slider */}
                <div className="cp-group">
                    <label className="form-label">Creativity (Temperature)</label>
                    <div className="slider-wrap">
                        <div className="slider-row">
                            <span className="slider-bound">Precise</span>
                            <span className="slider-val">{data.temperature ?? 0.7}</span>
                            <span className="slider-bound">Creative</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={data.temperature ?? 0.7}
                            onChange={e => update('temperature', Number.parseFloat(e.target.value))}
                            onKeyDown={stopKeys}
                        />
                    </div>
                </div>

                <div className="divider" />

                {/* Toggles */}
                <div className="cp-group">
                    <label className="form-label">Capabilities</label>
                    <ToggleRow
                        name="Memory" desc="Remember past messages"
                        value={data.memory ?? true} onChange={v => update('memory', v)}
                    />
                    <ToggleRow
                        name="Tools Access" desc="Allow tool invocations"
                        value={data.toolsEnabled ?? true} onChange={v => update('toolsEnabled', v)}
                    />
                    <ToggleRow
                        name="Streaming" desc="Stream output tokens"
                        value={data.streaming ?? false} onChange={v => update('streaming', v)}
                    />
                </div>

                {/* Max tokens */}
                <div className="cp-group">
                    <label className="form-label" htmlFor={`${node.id}-tokens`}>
                        Max Tokens
                        <span className="form-label-hint"> (higher = longer responses)</span>
                    </label>
                    <input
                        id={`${node.id}-tokens`}
                        type="number" className="form-input"
                        min={256} max={32000} step={256}
                        value={data.maxTokens ?? 4096}
                        onChange={e => {
                            const val = Number.parseInt(e.target.value)
                            if (!Number.isNaN(val)) update('maxTokens', val)
                        }}
                        onKeyDown={stopKeys}
                    />
                </div>

                <button className="btn btn-secondary cp-apply" onClick={onClose}>
                    Done
                </button>
            </div>
        </aside>
    )
}

function ToggleRow({ name, desc, value, onChange }) {
    return (
        <div className="toggle-row">
            <div className="toggle-info">
                <div className="toggle-name">{name}</div>
                <div className="toggle-desc">{desc}</div>
            </div>
            <button
                type="button"
                className={`toggle${value ? ' on' : ''}`}
                onClick={() => onChange(!value)}
                aria-pressed={value}
                aria-label={name}
            />
        </div>
    )
}
