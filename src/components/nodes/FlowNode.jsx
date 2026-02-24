import { Handle, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import './NodeStyles.css'

const NODE_CONFIG = {
    input: { icon: '💬', label: 'Input', color: '#22c55e' },
    agent: { icon: '🤖', label: 'Agent', color: '#6366f1' },
    tool: { icon: '🔧', label: 'Tool', color: '#3b82f6' },
    knowledge: { icon: '📚', label: 'Knowledge', color: '#f59e0b' },
    output: { icon: '📤', label: 'Output', color: '#ec4899' },
    shell_exec: { icon: '💻', label: 'Shell', color: '#a855f7' },
    file_system: { icon: '📁', label: 'File System', color: '#f97316' },
    powerbi: { icon: '📊', label: 'Power BI', color: '#f59e0b' },
}

function StatusDot({ status }) {
    return <div className={`fn-status-dot fn-status-${status}`} />
}

/** Returns a short badge describing what each node actually uses */
function getNodeBadge(data) {
    switch (data.nodeType) {
        case 'agent':
        case 'output':
            // Show just the model name (e.g. "llama3:8b" from "ollama:llama3:8b")
            return data.model ? data.model.split(':').slice(1).join(':') || data.model : 'LLM'
        case 'tool': {
            const toolMap = {
                web_search: 'DuckDuckGo',
                http_request: 'HTTP Request',
                code_runner: 'Code Runner',
                file_reader: 'File Reader',
                summarize: 'Summarizer',
            }
            const name = data.toolName || ''
            return toolMap[name] || (name ? name : 'Tool API')
        }
        case 'input': return 'Text Input'
        case 'knowledge': return 'Vector DB'
        case 'shell_exec': return data.language ? `Shell (${data.language})` : 'Shell'
        case 'file_system': return `File (${data.fsOperation || 'read'})`
        case 'powerbi': return data.pbiAction === 'refresh' ? 'Refresh Dataset' : 'DAX Query'
        default: return ''
    }
}

export function FlowNode({ data, selected }) {
    const cfg = NODE_CONFIG[data.nodeType] || NODE_CONFIG.agent
    const isRunning = data.status === 'running'
    const badge = getNodeBadge(data)

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
                {badge && <span className="fn-model">{badge}</span>}
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
