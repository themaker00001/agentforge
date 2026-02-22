import { useState, useRef, useCallback } from 'react'
import { useNodesState, useEdgesState } from '@xyflow/react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import FlowCanvas from './components/FlowCanvas'
import ConfigPanel from './components/ConfigPanel'
import DebugConsole from './components/DebugConsole'
import ChatPreview from './components/ChatPreview'
import { generateFlow, executeFlow } from './services/api'
import './App.css'

/* ── Edge helper ─────────────────────────────────────────────────────────── */
function makeEdge(source, target) {
    return {
        id: `e_${source}_${target}`,
        source, target,
        type: 'smoothstep', animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2, opacity: 0.7 },
    }
}

/* ── Convert FlowGraph from backend → React Flow nodes/edges ─────────────── */
function convertGraph(flow) {
    const ICONS = { input: '💬', agent: '🤖', tool: '🔍', knowledge: '📚', output: '📤' }
    const nodes = flow.nodes.map(n => ({
        id: n.id,
        type: 'agentNode',
        position: { x: n.position.x, y: n.position.y },
        data: {
            nodeType: n.data.nodeType,
            label: n.data.label,
            icon: n.data.icon || ICONS[n.data.nodeType] || '⚙️',
            model: n.data.model,
            status: 'idle',
        },
    }))
    const edges = flow.edges.map(e => makeEdge(e.source, e.target))
    return { nodes, edges }
}

/* ── Node status tracking ─────────────────────────────────────────────────── */
const STATUS_MAP = { run: 'running', exec: 'running', ok: 'ok', err: 'error' }

export default function App() {
    const [nodes, setNodes, onNodesChange] = useNodesState([])
    const [edges, setEdges, onEdgesChange] = useEdgesState([])

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [consoleCollapsed, setConsoleCollapsed] = useState(true)
    const [selectedNode, setSelectedNode] = useState(null)
    const [selectedModel, setSelectedModel] = useState('ollama:llama3:8b')
    const [isGenerating, setIsGenerating] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)

    const consoleRef = useRef(null)
    const abortRef = useRef(null)
    const latestNodes = useRef([])

    const syncNodes = useCallback((nds) => { latestNodes.current = nds; return nds }, [])

    const log = useCallback((type, msg) => {
        consoleRef.current?.addLog(type, msg)
    }, [])

    /* ── Build FlowGraph payload for chat/execute endpoints ─────────────────── */
    const buildFlowPayload = useCallback(() => ({
        nodes: latestNodes.current.map(n => ({
            id: n.id, type: n.type, position: n.position,
            data: {
                nodeType: n.data.nodeType,
                label: n.data.label,
                model: n.data.model || selectedModel,
                systemPrompt: n.data.systemPrompt || '',
                temperature: n.data.temperature ?? 0.7,
                maxTokens: n.data.maxTokens ?? 2048,
                memory: n.data.memory ?? true,
                toolsEnabled: n.data.toolsEnabled ?? true,
                streaming: n.data.streaming ?? false,
            },
        })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }), [selectedModel, edges])

    /* ── Generate Flow ───────────────────────────────────────────────────────── */
    const handleGenerate = useCallback(async (prompt) => {
        const text = (prompt || '').trim()
        if (!text || isGenerating) return

        setIsGenerating(true)
        setConsoleCollapsed(false)
        consoleRef.current?.clear()
        log('run', `Generating flow: "${text}"`)

        try {
            const flow = await generateFlow(text, selectedModel)
            if (!flow) { log('err', 'Backend unreachable — is the server running on :8000?'); return }

            const { nodes: newNodes, edges: newEdges } = convertGraph(flow)
            setNodes(() => { syncNodes(newNodes); return newNodes })
            setEdges(newEdges)
            log('ok', `Flow created — ${newNodes.length} nodes, ${newEdges.length} edges`)
            log('info', 'Select any node to configure it, then click Run')
        } catch (err) {
            log('err', `Generate failed: ${err.message}`)
        } finally {
            setIsGenerating(false)
        }
    }, [isGenerating, selectedModel, setNodes, setEdges, log, syncNodes])

    /* ── Run (SSE stream) ────────────────────────────────────────────────────── */
    const handleRun = useCallback(async () => {
        if (latestNodes.current.length === 0) { log('warn', 'No flow to run — generate one first'); return }
        if (isRunning) { abortRef.current?.abort(); return }

        setIsRunning(true)
        setConsoleCollapsed(false)
        log('run', 'Execution started via backend…')
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'idle' } })))

        abortRef.current = new AbortController()

        try {
            await executeFlow(
                buildFlowPayload(),
                '',
                selectedModel,
                'default',
                (event) => {
                    log(event.type, event.message)
                    if (event.nodeId) {
                        const newStatus = STATUS_MAP[event.type]
                        if (newStatus) {
                            setNodes(nds => nds.map(n =>
                                n.id === event.nodeId ? { ...n, data: { ...n.data, status: newStatus } } : n
                            ))
                        }
                    }
                },
                abortRef.current.signal,
            )
        } catch (err) {
            if (err.name !== 'AbortError') log('err', `Execution error: ${err.message}`)
        } finally {
            setIsRunning(false)
        }
    }, [isRunning, selectedModel, setNodes, log, buildFlowPayload])

    /* ── Node click / update ─────────────────────────────────────────────────── */
    const handleNodeClick = useCallback((node) => setSelectedNode(node), [])

    const handleDeleteNode = useCallback((nodeId) => {
        setNodes(nds => nds.filter(n => n.id !== nodeId))
        setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
        setSelectedNode(prev => prev?.id === nodeId ? null : prev)
    }, [setNodes, setEdges])

    const handleNodeUpdate = useCallback((nodeId, newData) => {
        setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: newData } : n))
        setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: newData } : prev)
    }, [setNodes])

    return (
        <div className="app-root">
            <TopBar
                onGenerate={handleGenerate}
                onRun={handleRun}
                onPreview={() => setChatOpen(true)}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                isGenerating={isGenerating}
                isRunning={isRunning}
                hasFlow={nodes.length > 0}
            />

            <div className="app-body">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(c => !c)}
                />

                <FlowCanvas
                    nodesIn={nodes}
                    edgesIn={edges}
                    onNodesChange={(changes) => {
                        onNodesChange(changes)
                        setNodes(nds => { syncNodes(nds); return nds })
                    }}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={handleNodeClick}
                    onAddNode={(newNode) => {
                        setNodes(nds => { const updated = [...nds, newNode]; syncNodes(updated); return updated })
                    }}
                    onDeleteNode={handleDeleteNode}
                    setEdges={setEdges}
                />

                {selectedNode && (
                    <ConfigPanel
                        node={selectedNode}
                        onClose={() => setSelectedNode(null)}
                        onUpdate={handleNodeUpdate}
                    />
                )}
            </div>

            <DebugConsole
                ref={consoleRef}
                collapsed={consoleCollapsed}
                onToggle={() => setConsoleCollapsed(c => !c)}
            />

            {chatOpen && (
                <ChatPreview
                    flow={buildFlowPayload()}
                    model={selectedModel}
                    sessionId="default"
                    onClose={() => setChatOpen(false)}
                />
            )}
        </div>
    )
}
