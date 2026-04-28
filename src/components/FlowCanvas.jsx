import { useCallback, useRef } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    BackgroundVariant,
    Panel,
    addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './FlowCanvas.css'
import { nodeTypes } from './nodes/FlowNode'
import { Plus, ZoomIn, ZoomOut, Maximize2, ChevronRight } from 'lucide-react'

const QUICK_TEMPLATES = [
    { icon: '01', name: 'Customer Support Bot', desc: 'AI agent with memory & escalation' },
    { icon: '02', name: 'RAG Chatbot', desc: 'Knowledge base + LLM retrieval' },
    { icon: '03', name: 'Code Assistant', desc: 'Multi-step code gen + execution' },
]

const DEFAULT_EDGE_OPTIONS = {
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#c8ff00', strokeWidth: 1.5, opacity: 0.6 },
}

export default function FlowCanvas({
    nodesIn, edgesIn, onNodesChange, onEdgesChange,
    onNodeClick, onAddNode, onDeleteNode, setEdges,
    onShowTemplates, canvasBg, nodeStyle, showGrain,
}) {
    const rfInstance = useRef(null)

    const onConnect = useCallback(
        params => setEdges(eds => addEdge({ ...params, ...DEFAULT_EDGE_OPTIONS }, eds)),
        [setEdges]
    )

    const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])

    const onDrop = useCallback(e => {
        e.preventDefault()
        const type = e.dataTransfer.getData('application/agentforge-type')
        const label = e.dataTransfer.getData('application/agentforge-label')
        if (!type || !rfInstance.current) return
        // screenToFlowPosition handles zoom + pan correctly
        const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        onAddNode({ id: `node_${Date.now()}`, type: 'agentNode', position, data: { nodeType: type, label, status: 'idle' } })
    }, [onAddNode])

    const nodesWithDelete = nodesIn.map((n, i) => ({
        ...n,
        data: {
            ...n.data,
            nodeNum: String(i + 1).padStart(2, '0'),
            nodeStyle: nodeStyle || 'card',
            onDelete: () => onDeleteNode?.(n.id),
        },
    }))

    const isEmpty = nodesIn.length === 0

    const bgVariant = canvasBg === 'lines'
        ? BackgroundVariant.Lines
        : (canvasBg === 'plain' || canvasBg === 'crosshair')
        ? null
        : BackgroundVariant.Dots

    return (
        <div className={`flow-canvas-wrap${canvasBg === 'crosshair' ? ' bg-crosshair' : ''}`}>
            {showGrain && <div className="canvas-grain" />}
            {/* Canvas ribbon */}
            <div className="canvas-ribbon">
                <span className="cr-comment">// FLOW</span>
                <span className="cr-sep">·</span>
                <span className="cr-name">AGENT-FLOW</span>
                <span className="cr-sep">——</span>
                <span className="cr-stat">{nodesIn.length} NODES</span>
                <span className="cr-dot">·</span>
                <span className="cr-stat">{edgesIn.length} EDGES</span>
            </div>

            <ReactFlow
                onInit={inst => { rfInstance.current = inst }}
                nodes={nodesWithDelete}
                edges={edgesIn}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => onNodeClick(node)}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                fitView={!isEmpty}
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.2}
                maxZoom={2.5}
                proOptions={{ hideAttribution: true }}
            >
                {bgVariant && (
                    <Background variant={bgVariant} gap={24} size={1} color="#2a2a2e" />
                )}
                <Controls className="rf-controls" showInteractive={false} />

                {/* Toolbar — top right */}
                <Panel position="top-right">
                    <div className="canvas-toolbar">
                        <button className="ctb-btn ctb-add" onClick={onShowTemplates}>
                            <Plus size={11} strokeWidth={2} /> ADD NODE
                            <span className="ctb-kbd">⌘K</span>
                        </button>
                        <span className="ctb-sep" />
                        <button className="ctb-btn"><ZoomOut size={12} /></button>
                        <button className="ctb-btn"><ZoomIn size={12} /></button>
                        <span className="ctb-sep" />
                        <button className="ctb-btn"><Maximize2 size={11} /> FIT</button>
                    </div>
                </Panel>
            </ReactFlow>

            {/* Canvas stats */}
            <div className="canvas-stats">
                <span><b>{nodesIn.length}</b> NODES</span>
                <span><b>{edgesIn.length}</b> EDGES</span>
                <span>LATENCY · <b>—</b></span>
                <span>TOK/S · <b>—</b></span>
            </div>

            {/* Empty state */}
            {isEmpty && (
                <div className="canvas-empty">
                    <div className="empty-hero">
                        <h1 className="empty-title">Build AI Agents.</h1>
                        <p className="empty-sub">Click Generate to describe a workflow — or drag nodes from the library.</p>
                        <div className="empty-actions">
                            <button className="btn btn-primary empty-cta-primary" onClick={onShowTemplates}>
                                Try a Template
                            </button>
                        </div>
                    </div>
                    <div className="empty-templates">
                        <div className="empty-templates-label">// Quick start</div>
                        <div className="empty-template-cards">
                            {QUICK_TEMPLATES.map(t => (
                                <button key={t.name} className="empty-template-card" onClick={onShowTemplates}>
                                    <span className="etc-icon">{t.icon}</span>
                                    <div className="etc-info">
                                        <div className="etc-name">{t.name}</div>
                                        <div className="etc-desc">{t.desc}</div>
                                    </div>
                                    <ChevronRight size={11} className="etc-arrow" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
