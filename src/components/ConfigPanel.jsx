import { useState } from 'react'
import { X, UploadCloud, Copy, Check } from 'lucide-react'
import { uploadToolFile, uploadMedia } from '../services/api'
import './ConfigPanel.css'

const BASE = 'http://localhost:8000'

/* ── MediaUploadWidget ────────────────────────────────────────────────────── */
function MediaUploadWidget({ mediaType, onUploaded }) {
    const [uploading, setUploading] = useState(false)
    const [fileName, setFileName] = useState('')
    const [error, setError] = useState('')

    const ACCEPT = {
        image: 'image/png,image/jpeg,image/gif,image/webp',
        audio: 'audio/mpeg,audio/wav,audio/mp4,audio/ogg',
        pdf:   'application/pdf',
    }

    const handleFile = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        setError('')
        setUploading(true)
        try {
            const meta = await uploadMedia(file)
            setFileName(file.name)
            onUploaded(meta.file_id, file.name)
        } catch (err) {
            setError(err.message || 'Upload failed')
        } finally {
            setUploading(false)
            e.target.value = ''
        }
    }

    return (
        <div className="cp-group">
            <label className="form-label">Upload {mediaType?.toUpperCase() || 'File'}</label>
            <label
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    borderRadius: 6, border: '1px dashed var(--border)', cursor: 'pointer',
                    background: 'var(--bg-raised)', fontSize: 11, color: 'var(--text-secondary)',
                    transition: 'border-color 0.15s',
                }}
            >
                <UploadCloud size={14} />
                {uploading ? 'Uploading…' : fileName || 'Click to choose file'}
                <input
                    type="file"
                    accept={ACCEPT[mediaType] || '*'}
                    style={{ display: 'none' }}
                    onChange={handleFile}
                    disabled={uploading}
                />
            </label>
            {error && <div style={{ color: 'var(--red)', fontSize: 10, marginTop: 3 }}>{error}</div>}
        </div>
    )
}

/* ── MediaInputConfig ─────────────────────────────────────────────────────── */
function MediaInputConfig({ data, update, nodeId }) {
    return (
        <>
            <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Upload an image, audio file, or PDF to pass into downstream agent nodes.
                Images work with GPT-4o and Gemini 1.5+ (vision-capable models).
            </div>

            <div className="cp-group">
                <label className="form-label">Media Type</label>
                <select
                    className="form-select"
                    value={data.mediaType || 'image'}
                    onChange={e => update('mediaType', e.target.value)}
                >
                    <option value="image">🖼️ Image (PNG/JPEG/WebP/GIF)</option>
                    <option value="audio">🎵 Audio (MP3/WAV/M4A/OGG)</option>
                    <option value="pdf">📄 PDF Document</option>
                </select>
            </div>

            <MediaUploadWidget
                mediaType={data.mediaType || 'image'}
                onUploaded={(fileId, filename) => {
                    update('mediaFileId', fileId)
                }}
            />

            {data.mediaFileId && (
                <div style={{ fontSize: 10, color: 'var(--green)', marginTop: -4, marginBottom: 4 }}>
                    ✓ File uploaded (id: {data.mediaFileId.slice(0, 8)}…)
                </div>
            )}

            <div className="cp-group">
                <label className="form-label">URL Fallback (optional)</label>
                <input
                    className="form-input"
                    placeholder="https://example.com/image.png"
                    value={data.mediaUrl || ''}
                    onChange={e => update('mediaUrl', e.target.value)}
                />
                <div className="form-hint">Used only if no file is uploaded above</div>
            </div>
        </>
    )
}

/* Stop ALL keyboard events from bubbling to React Flow */
const stopKeys = (e) => {
    e.stopPropagation()
    e.nativeEvent?.stopImmediatePropagation()
}

export default function ConfigPanel({ node, flow, model, sessionId = 'default', onClose, onUpdate }) {
    // All hooks MUST be called before any conditional return
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [webhookUrl, setWebhookUrl] = useState('')
    const [isRegistering, setIsRegistering] = useState(false)
    const [copied, setCopied] = useState(false)

    if (!node) return null

    const { data } = node
    const icons = {
        input: '💬', agent: '🤖', tool: '🔧', knowledge: '📚', output: '📤',
        shell_exec: '💻', file_system: '📁', powerbi: '📊',
        condition: '🔀', set_variable: '📌', merge: '🔗', loop: '🔁', webhook: '🪝',
        media_input: '🖼️',
    }

    const update = (key, value) => onUpdate(node.id, { ...data, [key]: value })

    const isShell       = data.nodeType === 'shell_exec'
    const isFS          = data.nodeType === 'file_system'
    const isPowerBI     = data.nodeType === 'powerbi'
    const isTool        = data.nodeType === 'tool'
    const isInput       = data.nodeType === 'input'
    const isKnowledge   = data.nodeType === 'knowledge'
    const isCondition   = data.nodeType === 'condition'
    const isSetVariable = data.nodeType === 'set_variable'
    const isMerge       = data.nodeType === 'merge'
    const isLoop        = data.nodeType === 'loop'
    const isWebhook     = data.nodeType === 'webhook'
    const isDebate      = data.nodeType === 'debate'
    const isEvaluator   = data.nodeType === 'evaluator'
    const isParallel    = data.nodeType === 'parallel'
    const isNote        = data.nodeType === 'note'
    const isMediaInput  = data.nodeType === 'media_input'

    // isLocal = nodes that don't show the standard LLM config block
    const isLocal = isShell || isFS || isPowerBI || isTool || isInput || isKnowledge
                 || isCondition || isSetVariable || isMerge || isLoop || isWebhook
                 || isParallel || isNote || isMediaInput

    const p = data.params || {}
    const toolName = data.toolName || ''

    const handleRegisterWebhook = async () => {
        setIsRegistering(true)
        try {
            if (!flow?.nodes?.length) {
                setWebhookUrl('Error: create a flow before registering a webhook')
                return
            }
            const res = await fetch(`${BASE}/webhook/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    flow,
                    model: model || 'ollama:llama3:8b',
                    sessionId,
                }),
            })
            const data = await res.json()
            setWebhookUrl(data.trigger_url)
        } catch (e) {
            setWebhookUrl('Error: could not register webhook')
        } finally {
            setIsRegistering(false)
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(webhookUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

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

                {/* ── Media Input config ── */}
                {isMediaInput && (
                    <MediaInputConfig data={data} update={update} nodeId={node.id} />
                )}

                {/* ── Sticky Note config ── */}
                {isNote && (
                    <>
                        <div className="cp-group">
                            <label className="form-label">Note Color</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {['#fef3c7','#dbeafe','#dcfce7','#fce7f3','#ede9fe','#fee2e2','#f3f4f6'].map(c => (
                                    <button
                                        key={c}
                                        onClick={() => update('noteColor', c)}
                                        style={{
                                            width: 24, height: 24, borderRadius: 6, border: data.noteColor === c ? '2px solid var(--accent)' : '2px solid transparent',
                                            background: c, cursor: 'pointer', transition: 'border 0.15s',
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-notecontent`}>Note Text</label>
                            <textarea
                                id={`${node.id}-notecontent`}
                                className="form-textarea"
                                rows={6}
                                placeholder="Write your note here…"
                                value={data.noteContent || ''}
                                onChange={e => update('noteContent', e.target.value)}
                                onKeyDown={stopKeys}
                                style={{ fontFamily: 'Georgia, serif', fontSize: '13px' }}
                            />
                        </div>
                    </>
                )}

                {/* ── Debate node config ── */}
                {isDebate && (
                    <>
                        <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Multiple AI personas debate the topic in parallel, then a judge synthesizes the best answer. Uniquely AI-native — no equivalent in traditional workflow tools.
                        </div>
                        <div className="cp-group">
                            <label className="form-label">Personas</label>
                            {(data.debatePersonas || [
                                { name: 'Proponent', systemPrompt: 'You argue strongly IN FAVOR with evidence.' },
                                { name: 'Critic',    systemPrompt: 'You challenge with counterarguments.' },
                                { name: 'Pragmatist',systemPrompt: 'You take a balanced, practical view.' },
                            ]).map((p, i) => (
                                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
                                    <input
                                        type="text" className="form-input"
                                        style={{ marginBottom: 4, fontWeight: 600 }}
                                        placeholder="Persona name"
                                        value={p.name}
                                        onChange={e => {
                                            const ps = [...(data.debatePersonas || [
                                                { name: 'Proponent', systemPrompt: 'You argue strongly IN FAVOR with evidence.' },
                                                { name: 'Critic',    systemPrompt: 'You challenge with counterarguments.' },
                                                { name: 'Pragmatist',systemPrompt: 'You take a balanced, practical view.' },
                                            ])]
                                            ps[i] = { ...ps[i], name: e.target.value }
                                            update('debatePersonas', ps)
                                        }}
                                        onKeyDown={stopKeys}
                                    />
                                    <textarea
                                        className="form-textarea" rows={2}
                                        placeholder="System prompt for this persona"
                                        value={p.systemPrompt}
                                        onChange={e => {
                                            const ps = [...(data.debatePersonas || [
                                                { name: 'Proponent', systemPrompt: 'You argue strongly IN FAVOR with evidence.' },
                                                { name: 'Critic',    systemPrompt: 'You challenge with counterarguments.' },
                                                { name: 'Pragmatist',systemPrompt: 'You take a balanced, practical view.' },
                                            ])]
                                            ps[i] = { ...ps[i], systemPrompt: e.target.value }
                                            update('debatePersonas', ps)
                                        }}
                                        onKeyDown={stopKeys}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-judgeprompt`}>Judge Prompt</label>
                            <textarea
                                id={`${node.id}-judgeprompt`}
                                className="form-textarea" rows={3}
                                placeholder="You are a neutral judge. Synthesize a final answer from the debate…"
                                value={data.debateJudgePrompt || ''}
                                onChange={e => update('debateJudgePrompt', e.target.value)}
                                onKeyDown={stopKeys}
                            />
                        </div>
                    </>
                )}

                {/* ── Evaluator/Grader node config ── */}
                {isEvaluator && (
                    <>
                        <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            AI-powered quality gate. Scores the upstream output 1–10 against your rubric and routes to the <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ pass</span> or <span style={{ color: '#ef4444', fontWeight: 600 }}>✗ fail</span> branch.
                        </div>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-rubric`}>Evaluation Rubric</label>
                            <textarea
                                id={`${node.id}-rubric`}
                                className="form-textarea" rows={4}
                                placeholder="Rate this response on: accuracy, completeness, clarity, and relevance to the user's question."
                                value={data.evaluatorRubric || ''}
                                onChange={e => update('evaluatorRubric', e.target.value)}
                                onKeyDown={stopKeys}
                            />
                        </div>
                        <div className="cp-group">
                            <label className="form-label">
                                Pass Threshold: <strong>{data.evaluatorThreshold ?? 7.0}</strong>/10
                            </label>
                            <input
                                type="range" min="1" max="10" step="0.5"
                                value={data.evaluatorThreshold ?? 7.0}
                                onChange={e => update('evaluatorThreshold', Number.parseFloat(e.target.value))}
                                onKeyDown={stopKeys}
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                <span>Lenient (1)</span>
                                <span>Strict (10)</span>
                            </div>
                        </div>
                    </>
                )}

                {/* ── Parallel Branch node info ── */}
                {isParallel && (
                    <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--text-pri)' }}>⚡ Parallel Fan-out</strong><br />
                        Connect multiple Agent or Tool nodes to this node's output. They will all run <em>simultaneously</em> using asyncio.gather, then the results are collected as a JSON array.<br /><br />
                        Connect a <strong>Merge</strong> node downstream to combine the parallel results.
                    </div>
                )}

                {/* ── Condition node config ── */}
                {isCondition && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-condexpr`}>
                                Condition Expression
                                <span className="form-label-hint"> (Python-like)</span>
                            </label>
                            <textarea
                                id={`${node.id}-condexpr`}
                                className="form-textarea"
                                rows={3}
                                placeholder={'len(context) > 0\n"error" not in context\nvariables.get("score", 0) > 5'}
                                value={data.conditionExpr || ''}
                                onChange={e => update('conditionExpr', e.target.value)}
                                onKeyDown={stopKeys}
                                style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                Available: <code>context</code>, <code>variables</code>, <code>len</code>, <code>str</code>, <code>int</code>, <code>float</code>
                            </div>
                        </div>
                        <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Connect the <span style={{ color: '#22c55e', fontWeight: 600 }}>T (true)</span> handle to the branch that runs when the condition is met,
                            and the <span style={{ color: '#ef4444', fontWeight: 600 }}>F (false)</span> handle to the alternative.
                        </div>
                    </>
                )}

                {/* ── Set Variable node config ── */}
                {isSetVariable && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-varname`}>Variable Name</label>
                            <input
                                id={`${node.id}-varname`}
                                type="text" className="form-input"
                                placeholder="e.g. result"
                                value={data.variableName || ''}
                                onChange={e => update('variableName', e.target.value)}
                                onKeyDown={stopKeys}
                                style={{ fontFamily: 'monospace' }}
                            />
                        </div>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-varval`}>
                                Value
                                <span className="form-label-hint"> (blank = upstream output)</span>
                            </label>
                            <input
                                id={`${node.id}-varval`}
                                type="text" className="form-input"
                                placeholder="Leave blank to capture upstream output"
                                value={data.variableValue || ''}
                                onChange={e => update('variableValue', e.target.value)}
                                onKeyDown={stopKeys}
                            />
                        </div>
                        <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Use <code style={{ fontFamily: 'monospace' }}>{'{{'}{data.variableName || 'varname'}{'}}'}</code> in any downstream system prompt or tool param.
                        </div>
                    </>
                )}

                {/* ── Merge node config ── */}
                {isMerge && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-mergemode`}>Merge Mode</label>
                            <select
                                id={`${node.id}-mergemode`}
                                className="form-select"
                                value={data.mergeMode || 'concat'}
                                onChange={e => update('mergeMode', e.target.value)}
                                onKeyDown={stopKeys}
                            >
                                <option value="concat">Concatenate (join with separator)</option>
                                <option value="array">JSON array of all inputs</option>
                                <option value="first_non_empty">First non-empty input</option>
                            </select>
                        </div>
                        {(data.mergeMode === 'concat' || !data.mergeMode) && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-mergesep`}>Separator</label>
                                <input
                                    id={`${node.id}-mergesep`}
                                    type="text" className="form-input"
                                    placeholder="\n\n"
                                    value={data.mergeSeparator ?? '\n\n'}
                                    onChange={e => update('mergeSeparator', e.target.value)}
                                    onKeyDown={stopKeys}
                                    style={{ fontFamily: 'monospace' }}
                                />
                            </div>
                        )}
                    </>
                )}

                {/* ── Loop node config ── */}
                {isLoop && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-loopvar`}>
                                Loop Variable
                                <span className="form-label-hint"> (each item name)</span>
                            </label>
                            <input
                                id={`${node.id}-loopvar`}
                                type="text" className="form-input"
                                placeholder="e.g. item"
                                value={data.loopVar || ''}
                                onChange={e => update('loopVar', e.target.value)}
                                onKeyDown={stopKeys}
                                style={{ fontFamily: 'monospace' }}
                            />
                        </div>
                        <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            The upstream output should be a JSON array or newline-separated list.
                            Each item is injected as <code>{'{{'}{data.loopVar || 'item'}{'}}'}</code> in child agent nodes.
                        </div>
                    </>
                )}

                {/* ── Webhook node config ── */}
                {isWebhook && (
                    <>
                        <div className="cp-group" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            This node triggers the flow via an HTTP POST request. Register the whole flow to get a trigger URL.
                        </div>
                        <div className="cp-group">
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={handleRegisterWebhook}
                                disabled={isRegistering}
                            >
                                {isRegistering ? 'Registering…' : '🪝 Register Webhook'}
                            </button>
                        </div>
                        {webhookUrl && (
                            <div className="cp-group">
                                <label className="form-label">Trigger URL</label>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={webhookUrl}
                                        readOnly
                                        style={{ fontFamily: 'monospace', fontSize: 10 }}
                                    />
                                    <button className="icon-btn" onClick={handleCopy} title="Copy URL">
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    curl -X POST {webhookUrl} -d "your question"
                                </div>
                            </div>
                        )}
                    </>
                )}

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

                {/* ── Power BI config ── */}
                {isPowerBI && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-pbiaction`}>Action</label>
                            <select
                                id={`${node.id}-pbiaction`}
                                className="form-select"
                                value={data.pbiAction || 'dax_query'}
                                onChange={e => update('pbiAction', e.target.value)}
                                onKeyDown={stopKeys}
                            >
                                <option value="dax_query">DAX Query</option>
                                <option value="refresh">Refresh Dataset</option>
                            </select>
                        </div>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-pbiws`}>Workspace ID</label>
                            <input id={`${node.id}-pbiws`} type="text" className="form-input"
                                placeholder="..." value={data.pbiWorkspaceId || ''}
                                onChange={e => update('pbiWorkspaceId', e.target.value)} onKeyDown={stopKeys} />
                        </div>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-pbids`}>Dataset ID</label>
                            <input id={`${node.id}-pbids`} type="text" className="form-input"
                                placeholder="..." value={data.pbiDatasetId || ''}
                                onChange={e => update('pbiDatasetId', e.target.value)} onKeyDown={stopKeys} />
                        </div>
                        {(!data.pbiAction || data.pbiAction === 'dax_query') && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-pbiquery`}>DAX Query</label>
                                <textarea id={`${node.id}-pbiquery`} className="form-textarea" rows={5}
                                    placeholder="EVALUATE ..." value={data.pbiQuery || ''}
                                    onChange={e => update('pbiQuery', e.target.value)} onKeyDown={stopKeys} />
                            </div>
                        )}
                    </>
                )}

                {/* ── Tool node config ── */}
                {isTool && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-toolname`}>Tool Selection</label>
                            <select
                                id={`${node.id}-toolname`}
                                className="form-select"
                                value={toolName || 'web_search'}
                                onChange={e => update('toolName', e.target.value)}
                                onKeyDown={stopKeys}
                            >
                                <optgroup label="Search &amp; Network">
                                    <option value="web_search">🔍 DuckDuckGo Web Search</option>
                                    <option value="http_request">🌐 HTTP API Request</option>
                                </optgroup>
                                <optgroup label="Code &amp; Files">
                                    <option value="code_runner">⚙️ Python Code Runner</option>
                                    <option value="file_reader">📁 File Reader</option>
                                </optgroup>
                                <optgroup label="Data Processing">
                                    <option value="json_parse">{'{ }'} JSON Parse</option>
                                    <option value="csv_reader">📊 CSV Reader</option>
                                    <option value="text_splitter">✂️ Text Splitter</option>
                                    <option value="calculator">🧮 Calculator</option>
                                    <option value="datetime_helper">🕐 Date &amp; Time Helper</option>
                                </optgroup>
                                <optgroup label="Text">
                                    <option value="summarize">📝 Text Summarize</option>
                                </optgroup>
                            </select>
                        </div>

                        {toolName === 'web_search' && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-query`}>Search Query</label>
                                <input
                                    id={`${node.id}-query`}
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. common billing failure causes SaaS"
                                    value={p.query || ''}
                                    onChange={e => update('params', { ...p, query: e.target.value })}
                                    onKeyDown={stopKeys}
                                />
                            </div>
                        )}

                        {toolName === 'http_request' && (
                            <>
                                <div className="cp-group">
                                    <label className="form-label" htmlFor={`${node.id}-http-url`}>URL</label>
                                    <input
                                        id={`${node.id}-http-url`}
                                        type="text"
                                        className="form-input"
                                        placeholder="https://httpbin.org/anything"
                                        value={p.url || ''}
                                        onChange={e => update('params', { ...p, url: e.target.value })}
                                        onKeyDown={stopKeys}
                                    />
                                </div>
                                <div className="cp-group">
                                    <label className="form-label" htmlFor={`${node.id}-http-method`}>Method</label>
                                    <select
                                        id={`${node.id}-http-method`}
                                        className="form-select"
                                        value={p.method || 'GET'}
                                        onChange={e => update('params', { ...p, method: e.target.value })}
                                        onKeyDown={stopKeys}
                                    >
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="PUT">PUT</option>
                                        <option value="PATCH">PATCH</option>
                                        <option value="DELETE">DELETE</option>
                                    </select>
                                </div>
                                <div className="cp-group">
                                    <label className="form-label" htmlFor={`${node.id}-http-body`}>
                                        JSON Body
                                        <span className="form-label-hint"> (optional)</span>
                                    </label>
                                    <textarea
                                        id={`${node.id}-http-body`}
                                        className="form-textarea"
                                        rows={6}
                                        placeholder={`{\n  "issue_type": "{{issue_type}}",\n  "urgency": "{{urgency}}"\n}`}
                                        value={
                                            typeof p.body === 'string'
                                                ? p.body
                                                : (p.body ? JSON.stringify(p.body, null, 2) : '')
                                        }
                                        onChange={e => update('params', { ...p, body: e.target.value })}
                                        onKeyDown={stopKeys}
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                </div>
                            </>
                        )}

                        {toolName === 'code_runner' && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-code`}>Python Code</label>
                                <textarea
                                    id={`${node.id}-code`}
                                    className="form-textarea"
                                    rows={6}
                                    placeholder={`print("hello")`}
                                    value={p.code || ''}
                                    onChange={e => update('params', { ...p, code: e.target.value })}
                                    onKeyDown={stopKeys}
                                    style={{ fontFamily: 'monospace' }}
                                />
                            </div>
                        )}

                        {(toolName === 'file_reader' || (!toolName && data.label.toLowerCase().includes('file'))) && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-filename`}>
                                    Filename
                                    <span className="form-label-hint"> (Target file to read)</span>
                                </label>
                                <div
                                    className={`file-drop-zone ${isDragging ? 'dragging' : ''}`}
                                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                                    onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
                                    onDrop={async e => {
                                        e.preventDefault()
                                        setIsDragging(false)
                                        const file = e.dataTransfer.files[0]
                                        if (!file) return
                                        setIsUploading(true)
                                        const res = await uploadToolFile(file)
                                        setIsUploading(false)
                                        if (res && res.filename) {
                                            update('params', { ...p, filename: res.filename })
                                        }
                                    }}
                                    style={{
                                        border: isDragging ? '2px dashed var(--accent)' : '1px solid var(--border)',
                                        borderRadius: '6px', padding: '12px', textAlign: 'center', marginBottom: '8px',
                                        backgroundColor: isDragging ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                        transition: 'all 0.2s ease', cursor: isUploading ? 'wait' : 'default',
                                    }}
                                >
                                    <UploadCloud size={20} style={{ marginBottom: '4px', color: 'var(--text-muted)' }} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {isUploading ? 'Uploading...' : 'Drag & drop a file here to upload to sandbox'}
                                    </div>
                                </div>
                                <input
                                    id={`${node.id}-filename`}
                                    type="text" className="form-input"
                                    placeholder="e.g. data.txt (or drag file above)"
                                    value={p.filename || ''}
                                    onChange={e => update('params', { ...p, filename: e.target.value })}
                                    onKeyDown={stopKeys}
                                />
                            </div>
                        )}

                        {toolName === 'calculator' && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-expr`}>Expression</label>
                                <input
                                    id={`${node.id}-expr`}
                                    type="text" className="form-input"
                                    placeholder="e.g. 2 + 2 * 10"
                                    value={p.expression || ''}
                                    onChange={e => update('params', { ...p, expression: e.target.value })}
                                    onKeyDown={stopKeys}
                                    style={{ fontFamily: 'monospace' }}
                                />
                            </div>
                        )}

                        {toolName === 'json_parse' && (
                            <div className="cp-group">
                                <label className="form-label" htmlFor={`${node.id}-query`}>
                                    Path Query
                                    <span className="form-label-hint"> (optional, e.g. data.items.0)</span>
                                </label>
                                <input
                                    id={`${node.id}-query`}
                                    type="text" className="form-input"
                                    placeholder="data.items.0.name"
                                    value={p.query || ''}
                                    onChange={e => update('params', { ...p, query: e.target.value })}
                                    onKeyDown={stopKeys}
                                    style={{ fontFamily: 'monospace' }}
                                />
                            </div>
                        )}

                        {toolName === 'text_splitter' && (
                            <>
                                <div className="cp-group">
                                    <label className="form-label">Split Mode</label>
                                    <select
                                        className="form-select"
                                        value={p.mode || 'chars'}
                                        onChange={e => update('params', { ...p, mode: e.target.value })}
                                        onKeyDown={stopKeys}
                                    >
                                        <option value="chars">Character chunks</option>
                                        <option value="lines">Lines</option>
                                        <option value="sentences">Sentences</option>
                                    </select>
                                </div>
                                {(p.mode === 'chars' || !p.mode) && (
                                    <div className="cp-group">
                                        <label className="form-label">Chunk Size</label>
                                        <input type="number" className="form-input"
                                            min={100} max={8000} step={100}
                                            value={p.chunk_size || 500}
                                            onChange={e => update('params', { ...p, chunk_size: Number(e.target.value) })}
                                            onKeyDown={stopKeys}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {toolName === 'datetime_helper' && (
                            <div className="cp-group">
                                <label className="form-label">Action</label>
                                <select
                                    className="form-select"
                                    value={p.action || 'now'}
                                    onChange={e => update('params', { ...p, action: e.target.value })}
                                    onKeyDown={stopKeys}
                                >
                                    <option value="now">Current date/time</option>
                                    <option value="format">Format a date string</option>
                                    <option value="diff">Difference between two dates</option>
                                </select>
                            </div>
                        )}
                    </>
                )}

                {/* ── Standard LLM config (hidden for local/logic nodes) ── */}
                {!isLocal && (
                    <>
                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-model`}>Model</label>
                            <input
                                id={`${node.id}-model`}
                                className="form-input"
                                list={`${node.id}-model-list`}
                                value={data.model || 'ollama:llama3:8b'}
                                onChange={e => update('model', e.target.value)}
                                onKeyDown={stopKeys}
                                placeholder="provider:model_name"
                            />
                            <datalist id={`${node.id}-model-list`}>
                                <option value="ollama:llama3:8b">🦙 llama3:8b</option>
                                <option value="ollama:llama3.2">🦙 llama3.2</option>
                                <option value="ollama:mistral">🦙 mistral</option>
                                <option value="openai:gpt-4o">⚡ GPT-4o</option>
                                <option value="openai:gpt-4o-mini">⚡ GPT-4o mini</option>
                                <option value="gemini:gemini-2.0-flash">🔷 Gemini 2.0 Flash</option>
                                <option value="lmstudio:local-model">🖥️ LM Studio (local)</option>
                            </datalist>
                        </div>

                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-apikey`}>
                                API Key Override
                                <span className="form-label-hint"> (Optional)</span>
                            </label>
                            <input
                                id={`${node.id}-apikey`}
                                type="password"
                                className="form-input"
                                placeholder="Leave blank to use .env key"
                                value={data.apiKey || ''}
                                onChange={e => update('apiKey', e.target.value)}
                                onKeyDown={stopKeys}
                            />
                        </div>

                        <div className="cp-group">
                            <label className="form-label" htmlFor={`${node.id}-prompt`}>
                                System Prompt
                                <span className="form-label-hint"> (use {'{{var}}'} for variables)</span>
                            </label>
                            <textarea
                                id={`${node.id}-prompt`}
                                className="form-textarea"
                                rows={5}
                                placeholder="You are a helpful assistant… Use {{name}} for dynamic values."
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
                                name="Streaming" desc="Stream output tokens incrementally"
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
