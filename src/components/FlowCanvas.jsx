import { useCallback, useRef } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './FlowCanvas.css'
import { nodeTypes } from './nodes/FlowNode'
import { Maximize2, LayoutGrid, MousePointer } from 'lucide-react'

const DEFAULT_EDGE_OPTIONS = {
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2, opacity: 0.7 },
}

export default function FlowCanvas({ nodesIn, edgesIn, onNodesChange, onEdgesChange, onNodeClick, onNodesReady, onAddNode, onDeleteNode, setEdges }) {
    const reactFlowWrapper = useRef(null)
    const [, , , rfInstance] = [null, null, null, useRef(null)]

    const onConnect = useCallback(
        (params) => setEdges(eds => addEdge({ ...params, ...DEFAULT_EDGE_OPTIONS }, eds)),
        [setEdges]
    )

    const onDragOver = useCallback((e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback((e) => {
        e.preventDefault()
        const type = e.dataTransfer.getData('application/agentforge-type')
        const label = e.dataTransfer.getData('application/agentforge-label')
        const icon = e.dataTransfer.getData('application/agentforge-icon')
        if (!type) return

        const bounds = reactFlowWrapper.current.getBoundingClientRect()
        const position = {
            x: e.clientX - bounds.left - 80,
            y: e.clientY - bounds.top - 40,
        }

        const newNode = {
            id: `node_${Date.now()}`,
            type: 'agentNode',
            position,
            data: { nodeType: type, label, icon, status: 'idle' },
        }
        onAddNode(newNode)
    }, [onAddNode])

    const nodesWithDelete = nodesIn.map(n => ({
        ...n,
        data: { ...n.data, onDelete: () => onDeleteNode?.(n.id) },
    }))

    const isEmpty = nodesIn.length === 0

    return (
        <div className="flow-canvas-wrap" ref={reactFlowWrapper}>
            <ReactFlow
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
                fitViewOptions={{ padding: 0.3 }}
                minZoom={0.3}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1}
                    color="#252836"
                />
                <Controls
                    className="rf-controls"
                    showInteractive={false}
                />
                <MiniMap
                    className="rf-minimap"
                    nodeColor={n => {
                        const colors = { input: '#22c55e', agent: '#6366f1', tool: '#3b82f6', knowledge: '#f59e0b', output: '#ec4899' }
                        return colors[n.data?.nodeType] || '#6366f1'
                    }}
                    maskColor="#0d0f1480"
                />

                {/* Canvas toolbar */}
                <Panel position="top-center">
                    <div className="canvas-toolbar">
                        <div className="tb-btn">
                            <MousePointer size={11} /> Select
                        </div>
                        <div className="tb-sep" />
                        <div className="tb-btn">
                            <LayoutGrid size={11} /> Auto Layout
                        </div>
                        <div className="tb-sep" />
                        <div className="tb-btn">
                            <Maximize2 size={11} /> Fit View
                        </div>
                    </div>
                </Panel>
            </ReactFlow>

            {/* Empty state overlay */}
            {isEmpty && (
                <div className="canvas-empty">
                    <div className="empty-icon">⚡</div>
                    <div className="empty-title">Start building your agent</div>
                    <div className="empty-sub">
                        Type a prompt and click <strong>Generate Flow</strong>, or drag nodes from the sidebar.
                    </div>
                </div>
            )}
        </div>
    )
}
