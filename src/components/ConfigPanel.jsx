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
    const icons = {
        input: '💬', agent: '🤖', tool: '🔧', knowledge: '📚', output: '📤',
        shell_exec: '💻', file_system: '📁',
    }

    const update = (key, value) => onUpdate(node.id, { ...data, [key]: value })

    const isShell = data.nodeType === 'shell_exec'
    const isFS = data.nodeType === 'file_system'
    const isLocal = isShell || isFS

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

                {/* ── Shell executor config ── */}
                {isShell && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-lang`}>Language</label>
                            <select
                                id={`${node.id}-lang`}
                                className="form-select"
                                value={data.language || 'bash'}
                                onChange={e => update('language', e.target.value)}
                                onKeyDown={stopKeys}
                            >
                                <option value="bash">Bash</option>
                                <option value="python">Python</option>
                            </select>
                        </div>

                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-cmd`}>Command / Script</label>
                            <textarea
                                id={`${node.id}-cmd`}
                                className="form-textarea"
                                rows={6}
                                placeholder={data.language === 'python' ? 'print("hello from python")' : 'echo "hello from shell"'}
                                value={data.command || ''}
                                onChange={e => update('command', e.target.value)}
                                onKeyDown={stopKeys}
                                style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            />
                        </div>

                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-wd`}>
                                Working Directory
                                <span className="form-label-hint"> (relative to ~/agentforge_workspace)</span>
                            </label>
                            <input
                                id={`${node.id}-wd`}
                                type="text" className="form-input"
                                placeholder="e.g. my_project"
                                value={data.workingDir || ''}
                                onChange={e => update('workingDir', e.target.value)}
                                onKeyDown={stopKeys}
                            />
                        </div>

                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-timeout`}>Timeout (seconds)</label>
                            <input
                                id={`${node.id}-timeout`}
                                type="number" className="form-input"
                                min={1} max={300} step={1}
                                value={data.timeout ?? 30}
                                onChange={e => {
                                    const val = Number.parseInt(e.target.value)
                                    if (!Number.isNaN(val)) update('timeout', val)
                                }}
                                onKeyDown={stopKeys}
                            />
                        </div>
                    </>
                )}

                {/* ── File system config ── */}
                {isFS && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-fsop`}>Operation</label>
                            <select
                                id={`${node.id}-fsop`}
                                className="form-select"
                                value={data.fsOperation || 'read'}
                                onChange={e => update('fsOperation', e.target.value)}
                                onKeyDown={stopKeys}
                            >
                                <option value="read">Read file</option>
                                <option value="write">Write file</option>
                                <option value="list">List directory</option>
                                <option value="search">Search (glob)</option>
                            </select>
                        </div>

                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-fspath`}>
                                Path
                                <span className="form-label-hint"> (relative to ~/agentforge_workspace)</span>
                            </label>
                            <input
                                id={`${node.id}-fspath`}
                                type="text" className="form-input"
                                placeholder="e.g. notes/todo.txt"
                                value={data.fsPath || ''}
                                onChange={e => update('fsPath', e.target.value)}
                                onKeyDown={stopKeys}
                            />
                        </div>

                        {data.fsOperation === 'write' && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-fscontent`}>Content to write</label>
                                <textarea
                                    id={`${node.id}-fscontent`}
                                    className="form-textarea"
                                    rows={5}
                                    placeholder="Leave blank to use upstream node output"
                                    value={data.fsContent || ''}
                                    onChange={e => update('fsContent', e.target.value)}
                                    onKeyDown={stopKeys}
                                />
                            </div>
                        )}

                        {(data.fsOperation === 'search' || data.fsOperation === 'list') && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-fspat`}>Glob Pattern</label>
                                <input
                                    id={`${node.id}-fspat`}
                                    type="text" className="form-input"
                                    placeholder="e.g. *.txt or **/*.py"
                                    value={data.fsPattern || ''}
                                    onChange={e => update('fsPattern', e.target.value)}
                                    onKeyDown={stopKeys}
                                />
                            </div>
                        )}
                    </>
                )}

                {/* ── Standard LLM config (hidden for local nodes) ── */}
                {!isLocal && (
                    <>
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
                                <option value="lmstudio:local-model">🖥️ LM Studio (local)</option>
                            </select>
                        </div>

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
                    </>
                )}

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
