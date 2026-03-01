import { Handle, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import './NodeStyles.css'

const NODE_CONFIG = {
    input:        { icon: '💬', label: 'Input',        color: '#22c55e' },
    agent:        { icon: '🤖', label: 'Agent',        color: '#6366f1' },
    tool:         { icon: '🔧', label: 'Tool',         color: '#3b82f6' },
    knowledge:    { icon: '📚', label: 'Knowledge',    color: '#f59e0b' },
    output:       { icon: '📤', label: 'Output',       color: '#ec4899' },
    shell_exec:   { icon: '💻', label: 'Shell',        color: '#a855f7' },
    file_system:  { icon: '📁', label: 'File System',  color: '#f97316' },
    powerbi:      { icon: '📊', label: 'Power BI',     color: '#f59e0b' },
    condition:    { icon: '🔀', label: 'Condition',    color: '#14b8a6' },
    set_variable: { icon: '📌', label: 'Set Variable', color: '#8b5cf6' },
    merge:        { icon: '🔗', label: 'Merge',        color: '#0ea5e9' },
    loop:         { icon: '🔁', label: 'Loop',         color: '#f43f5e' },
    webhook:      { icon: '🪝', label: 'Webhook',      color: '#10b981' },
    debate:       { icon: '⚖️', label: 'Debate',       color: '#d946ef' },
    evaluator:    { icon: '🎯', label: 'Evaluator',    color: '#f59e0b' },
    parallel:     { icon: '⚡', label: 'Parallel',     color: '#06b6d4' },
    note:         { icon: '📝', label: 'Note',         color: '#78716c' },
}

function StatusDot({ status }) {
    return <div className={`fn-status-dot fn-status-${status}`} />
}

function getNodeBadge(data) {
    switch (data.nodeType) {
        case 'agent':
        case 'output':
        case 'debate':
        case 'evaluator':
            return data.model ? data.model.split(':').slice(1).join(':') || data.model : 'LLM'
        case 'tool': {
            const toolMap = {
                web_search: 'DuckDuckGo', http_request: 'HTTP', code_runner: 'Python',
                file_reader: 'File', summarize: 'Summarize', json_parse: 'JSON',
                csv_reader: 'CSV', text_splitter: 'Split', calculator: 'Math',
                datetime_helper: 'DateTime',
            }
            const name = data.toolName || ''
            return toolMap[name] || name || 'Tool API'
        }
        case 'input':        return 'Text Input'
        case 'knowledge':    return 'Vector DB'
        case 'shell_exec':   return data.language ? `Shell (${data.language})` : 'Shell'
        case 'file_system':  return `File (${data.fsOperation || 'read'})`
        case 'powerbi':      return data.pbiAction === 'refresh' ? 'Refresh' : 'DAX Query'
        case 'condition':    return data.conditionExpr ? data.conditionExpr.slice(0, 18) : 'If/Else'
        case 'set_variable': return data.variableName ? `$${data.variableName}` : 'Set Var'
        case 'merge':        return data.mergeMode || 'concat'
        case 'loop':         return data.loopVar ? `each $${data.loopVar}` : 'Loop'
        case 'webhook':      return 'HTTP Trigger'
        case 'parallel':     return 'Fan-out'
        case 'note':         return ''
        default: return ''
    }
}

// ── Sticky Note node — completely different visual ─────────────────────────
function StickyNote({ data, selected }) {
    const bg = data.noteColor || '#fef3c7'
    return (
        <div
            className={`flow-node-note${selected ? ' selected' : ''}`}
            style={{ '--note-bg': bg }}
        >
            <button
                className="fn-delete fn-delete-note"
                title="Delete note"
                onClick={(e) => { e.stopPropagation(); data.onDelete?.() }}
            >
                <Trash2 size={11} />
            </button>
            <div className="note-text">{data.noteContent || '✏️ Click to add a note…'}</div>
        </div>
    )
}

// ── Main Flow Node ─────────────────────────────────────────────────────────
export function FlowNode({ data, selected }) {
    if (data.nodeType === 'note') {
        return <StickyNote data={data} selected={selected} />
    }

    const cfg = NODE_CONFIG[data.nodeType] || NODE_CONFIG.agent
    const isRunning   = data.status === 'running'
    const badge       = getNodeBadge(data)
    const isCondition = data.nodeType === 'condition'
    const isEvaluator = data.nodeType === 'evaluator'
    const isParallel  = data.nodeType === 'parallel'
    const hasDualOut  = isCondition || isEvaluator

    // Dual-output handle labels
    const dualLabels = isEvaluator
        ? { top: { id: 'pass', color: '#22c55e', char: '✓' }, bottom: { id: 'fail', color: '#ef4444', char: '✗' } }
        : { top: { id: 'true', color: '#22c55e', char: 'T'  }, bottom: { id: 'false', color: '#ef4444', char: 'F' } }

    return (
        <div
            className={`flow-node fn-${data.nodeType}${selected ? ' selected' : ''}${isRunning ? ' running' : ''}`}
            style={{ '--node-color': cfg.color }}
        >
            {/* Input handle */}
            {data.nodeType !== 'input' && data.nodeType !== 'webhook' && !isParallel && (
                <Handle type="target" position={Position.Left} className="fn-handle fn-handle-in" />
            )}
            {/* Parallel can have multiple incoming for fan-in at merge, one fan-out */}
            {isParallel && (
                <Handle type="target" position={Position.Left} className="fn-handle fn-handle-in" />
            )}

            <div className="fn-header">
                <div className="fn-icon">{cfg.icon}</div>
                <div className="fn-info">
                    <div className="fn-title">{data.label}</div>
                    <div className="fn-type">{cfg.label} node</div>
                </div>
                <StatusDot status={data.status || 'idle'} />
                <button
                    className="fn-delete"
                    title="Delete node"
                    onClick={(e) => { e.stopPropagation(); data.onDelete?.() }}
                >
                    <Trash2 size={11} />
                </button>
            </div>

            <div className="fn-footer">
                <span className="fn-tag">{cfg.label}</span>
                {badge && <span className="fn-model">{badge}</span>}
                {isEvaluator && data.evaluatorThreshold && (
                    <span className="fn-model">≥{data.evaluatorThreshold}</span>
                )}
                {data.nodeType === 'debate' && data.debatePersonas && (
                    <span className="fn-model">{data.debatePersonas.length} voices</span>
                )}
            </div>

            {/* Output handles */}
            {hasDualOut ? (
                <>
                    <Handle type="source" position={Position.Right} id={dualLabels.top.id}
                        className="fn-handle fn-handle-out fn-handle-true"
                        style={{ top: '30%', background: dualLabels.top.color, borderColor: dualLabels.top.color }} />
                    <span className="fn-handle-label fn-handle-label-true">{dualLabels.top.char}</span>
                    <Handle type="source" position={Position.Right} id={dualLabels.bottom.id}
                        className="fn-handle fn-handle-out fn-handle-false"
                        style={{ top: '70%', background: dualLabels.bottom.color, borderColor: dualLabels.bottom.color }} />
                    <span className="fn-handle-label fn-handle-label-false">{dualLabels.bottom.char}</span>
                </>
            ) : data.nodeType !== 'output' && (
                <Handle type="source" position={Position.Right} className="fn-handle fn-handle-out" />
            )}
        </div>
    )
}

export const nodeTypes = {
    agentNode: FlowNode,
}
