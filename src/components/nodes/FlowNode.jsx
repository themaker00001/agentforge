import { Handle, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import './NodeStyles.css'

const NODE_CONFIG = {
    input: { icon: '💬', label: 'Input', color: '#22c55e' },
    agent: { icon: '🤖', label: 'Agent', color: '#6366f1' },
    tool: { icon: '🔧', label: 'Tool', color: '#3b82f6' },
    knowledge: { icon: '📚', label: 'Knowledge', color: '#f59e0b' },
    output: { icon: '📤', label: 'Output', color: '#ec4899' },
}

function StatusDot({ status }) {
    return <div className={`fn-status-dot fn-status-${status}`} />
}

export function FlowNode({ data, selected }) {
    const cfg = NODE_CONFIG[data.nodeType] || NODE_CONFIG.agent
    const isRunning = data.status === 'running'

    return (
        <div
            className={`flow-node fn-${data.nodeType}${selected ? ' selected' : ''}${isRunning ? ' running' : ''}`}
            style={{ '--node-color': cfg.color }}
        >
            {/* Input handle — all except pure inputs */}
            {data.nodeType !== 'input' && (
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
                {data.model && <span className="fn-model">{data.model}</span>}
            </div>

            {/* Output handle — all except pure outputs */}
            {data.nodeType !== 'output' && (
                <Handle type="source" position={Position.Right} className="fn-handle fn-handle-out" />
            )}
        </div>
    )
}

export const nodeTypes = {
    agentNode: FlowNode,
}
