import { Handle, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import './NodeStyles.css'

// Colors reference CSS vars so Tweaks panel updates nodes live
const NODE_CONFIG = {
    input:        { label: 'Input',        color: 'var(--nc-io)' },
    output:       { label: 'Output',       color: 'var(--nc-io)' },
    webhook:      { label: 'Webhook',      color: 'var(--nc-io)' },
    media_input:  { label: 'Media Input',  color: 'var(--nc-io)' },
    agent:        { label: 'Agent',        color: 'var(--nc-agent)' },
    debate:       { label: 'Debate',       color: 'var(--nc-agent)' },
    graph_memory: { label: 'Graph Memory', color: 'var(--nc-agent)' },
    tool:         { label: 'Tool',         color: 'var(--nc-tool)' },
    knowledge:    { label: 'Knowledge',    color: 'var(--nc-knowledge)' },
    condition:    { label: 'Condition',    color: 'var(--nc-flow)' },
    set_variable: { label: 'Set Variable', color: 'var(--nc-flow)' },
    merge:        { label: 'Merge',        color: 'var(--nc-flow)' },
    loop:         { label: 'Loop',         color: 'var(--nc-flow)' },
    parallel:     { label: 'Parallel',     color: 'var(--nc-flow)' },
    evaluator:    { label: 'Evaluator',    color: 'var(--nc-special)' },
    shell_exec:   { label: 'Shell',        color: 'var(--nc-special)' },
    file_system:  { label: 'File System',  color: 'var(--nc-special)' },
    powerbi:      { label: 'Power BI',     color: 'var(--nc-special)' },
    note:         { label: 'Note',         color: 'var(--nc-flow)' },
}

function getCostColor(costUsd) {
    if (!costUsd || costUsd === 0) return '#6b7280'      // grey — free
    if (costUsd < 0.0001) return '#22c55e'      // green — cheap
    if (costUsd < 0.001) return '#f59e0b'      // amber — moderate
    return '#ef4444'                                      // red — expensive
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
        case 'input': return 'Text Input'
        case 'knowledge': return 'Vector DB'
        case 'shell_exec': return data.language ? `Shell (${data.language})` : 'Shell'
        case 'file_system': return `File (${data.fsOperation || 'read'})`
        case 'powerbi': return data.pbiAction === 'refresh' ? 'Refresh' : 'DAX Query'
        case 'condition': return data.conditionExpr ? data.conditionExpr.slice(0, 18) : 'If/Else'
        case 'set_variable': return data.variableName ? `$${data.variableName}` : 'Set Var'
        case 'merge': return data.mergeMode || 'concat'
        case 'loop': return data.loopVar ? `each $${data.loopVar}` : 'Loop'
        case 'webhook': return 'HTTP Trigger'
        case 'parallel': return 'Fan-out'
        case 'note': return ''
        case 'media_input': return data.mediaType?.toUpperCase() || 'Media'
        case 'graph_memory': return data.graphMemoryOp === 'extract' ? 'Extract' : (data.graphMemoryOp === 'query' ? 'Query' : 'Extract+Query')
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
            <div className="note-text">{data.noteContent || 'Click to add a note…'}</div>
        </div>
    )
}

// ── Main Flow Node ─────────────────────────────────────────────────────────
export function FlowNode({ data, selected }) {
    if (data.nodeType === 'note') {
        return <StickyNote data={data} selected={selected} />
    }

    const cfg = NODE_CONFIG[data.nodeType] || NODE_CONFIG.agent
    const isRunning = data.status === 'running'
    const badge = getNodeBadge(data)
    const isCondition = data.nodeType === 'condition'
    const isEvaluator = data.nodeType === 'evaluator'
    const isParallel = data.nodeType === 'parallel'
    const isMediaInput = data.nodeType === 'media_input'
    const hasDualOut = isCondition || isEvaluator

    const dualLabels = isEvaluator
        ? { top: { id: 'pass', color: '#22c55e', char: 'OK' }, bottom: { id: 'fail', color: '#ef4444', char: 'FAIL' } }
        : { top: { id: 'true', color: '#22c55e', char: 'T' }, bottom: { id: 'false', color: '#ef4444', char: 'F' } }

    return (
        <div
            className={`flow-node fn-${data.nodeType} style-${data.nodeStyle || 'card'}${selected ? ' selected' : ''}${isRunning ? ' running' : ''}`}
            style={{ '--node-color': cfg.color }}
        >
            {/* Handles */}
            {data.nodeType !== 'input' && data.nodeType !== 'webhook' && !isParallel && !isMediaInput && (
                <Handle type="target" position={Position.Left} className="fn-handle fn-handle-in" />
            )}
            {isParallel && (
                <Handle type="target" position={Position.Left} className="fn-handle fn-handle-in" />
            )}

            {/* Row 1 — [NUM] TYPE · IDLE/RUN */}
            <div className="fn-head">
                {data.nodeNum && <span className="fn-num">{data.nodeNum}</span>}
                <span className="fn-kind">{cfg.label}</span>
                <span className={`fn-status-text${isRunning ? ' running' : ''}`}>
                    {isRunning ? '● RUN' : 'IDLE'}
                </span>
                <button className="fn-delete" title="Delete" onClick={e => { e.stopPropagation(); data.onDelete?.() }}>
                    <Trash2 size={10} />
                </button>
            </div>

            {/* Row 2 — big display title */}
            <div className="fn-body">
                <div className="fn-title">{data.label}</div>
                {badge && <div className="fn-sub">{badge}</div>}
            </div>

            {/* Row 3 — tag chips */}
            <div className="fn-meta">
                <span className="fn-tag">{cfg.label}</span>
                {isEvaluator && data.evaluatorThreshold && <span className="fn-chip">≥{data.evaluatorThreshold}</span>}
                {data.nodeType === 'debate' && data.debatePersonas && <span className="fn-chip">{data.debatePersonas.length} voices</span>}
            </div>

            {/* Metrics bar */}
            {data.metrics && (
                <div className="fn-metrics">
                    <span className="fn-metric-cost" style={{ color: getCostColor(data.metrics.cost_usd) }}>
                        ${data.metrics.cost_usd?.toFixed(5) ?? '0.00000'}
                    </span>
                    <span className="fn-metric-latency">{data.metrics.latency_ms}ms</span>
                    <span className="fn-metric-tokens">
                        {data.metrics.tokens_in}→{data.metrics.tokens_out}
                    </span>
                </div>
            )}

            {/* Output handles */}
            {hasDualOut ? (
                <>
                    <Handle type="source" position={Position.Right} id={dualLabels.top.id}
                        className="fn-handle fn-handle-out fn-handle-true"
                        style={{ top: '30%' }} />
                    <span className="fn-handle-label fn-handle-label-true">{dualLabels.top.char}</span>
                    <Handle type="source" position={Position.Right} id={dualLabels.bottom.id}
                        className="fn-handle fn-handle-out fn-handle-false"
                        style={{ top: '70%' }} />
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
