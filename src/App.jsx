import { useState, useRef, useCallback } from 'react'
import { useNodesState, useEdgesState } from '@xyflow/react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import FlowCanvas from './components/FlowCanvas'
import ConfigPanel from './components/ConfigPanel'
import DebugConsole from './components/DebugConsole'
import ChatPreview from './components/ChatPreview'
import { generateFlow, executeFlow, submitBackgroundTask, listRuns, getRun } from './services/api'
import { saveFlow, loadFlow, listSavedFlows, exportFlow, importFlowFromJSON } from './services/storage'
import TemplatesPanel from './components/TemplatesPanel'
import DeployPanel from './components/DeployPanel'
import RunsPanel from './components/RunsPanel'
import './App.css'

function createSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/* ── Edge helper ─────────────────────────────────────────────────────────── */
function makeEdge(source, target, sourceHandle) {
    return {
        id: `e_${source}_${target}${sourceHandle ? `_${sourceHandle}` : ''}`,
        source, target,
        ...(sourceHandle ? { sourceHandle } : {}),
        type: 'smoothstep', animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2, opacity: 0.7 },
    }
}

/* ── Convert FlowGraph from backend → React Flow nodes/edges ─────────────── */
function convertGraph(flow) {
    const ICONS = {
        input: '💬', agent: '🤖', tool: '🔍', knowledge: '📚', output: '📤',
        shell_exec: '💻', file_system: '📁', condition: '🔀', set_variable: '📌',
        merge: '🔗', loop: '🔁', webhook: '🪝',
    }
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
    const edges = flow.edges.map(e => makeEdge(e.source, e.target, e.sourceHandle))
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
    const [userInput, setUserInput] = useState('')
    const [showTemplates, setShowTemplates] = useState(false)
    const [showDeploy, setShowDeploy] = useState(false)
    const [showRuns, setShowRuns] = useState(false)
    const [sessionId, setSessionId] = useState(() => createSessionId())

    const consoleRef = useRef(null)
    const abortRef = useRef(null)
    const latestNodes = useRef([])

    const syncNodes = useCallback((nds) => { latestNodes.current = nds; return nds }, [])

    const log = useCallback((type, msg, data) => {
        consoleRef.current?.addLog(type, msg, data)
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
                maxTokens: n.data.maxTokens ?? 4096,
                memory: n.data.memory ?? true,
                toolsEnabled: n.data.toolsEnabled ?? true,
                streaming: n.data.streaming ?? false,
                // Shell executor fields
                command: n.data.command || null,
                workingDir: n.data.workingDir || null,
                timeout: n.data.timeout ?? 30,
                language: n.data.language || 'bash',
                // File system fields
                fsOperation: n.data.fsOperation || null,
                fsPath: n.data.fsPath || null,
                fsContent: n.data.fsContent || null,
                fsPattern: n.data.fsPattern || null,
                // Condition node
                conditionExpr: n.data.conditionExpr || null,
                // Set variable node
                variableName: n.data.variableName || null,
                variableValue: n.data.variableValue || null,
                // Merge node
                mergeMode: n.data.mergeMode || 'concat',
                mergeSeparator: n.data.mergeSeparator ?? '\n\n',
                // Loop node
                loopVar: n.data.loopVar || null,
                // Tool node
                toolName: n.data.toolName || null,
                params: n.data.params || null,
                // Debate node
                debatePersonas: n.data.debatePersonas || null,
                debateRounds: n.data.debateRounds ?? 1,
                debateJudgePrompt: n.data.debateJudgePrompt || null,
                // Evaluator node
                evaluatorRubric: n.data.evaluatorRubric || null,
                evaluatorThreshold: n.data.evaluatorThreshold ?? 7.0,
                // Note node
                noteContent: n.data.noteContent || null,
                noteColor: n.data.noteColor || '#fef3c7',
                // Media input node
                mediaType:   n.data.mediaType   || null,
                mediaFileId: n.data.mediaFileId || null,
                mediaUrl:    n.data.mediaUrl    || null,
            },
        })),
        edges: edges.map(e => ({
            id: e.id, source: e.source, target: e.target,
            sourceHandle: e.sourceHandle || null,
        })),
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
                userInput.trim(),
                selectedModel,
                sessionId,
                (event) => {
                    log(event.type, event.message, event.data)
                    if (event.nodeId) {
                        const newStatus = STATUS_MAP[event.type]
                        const metrics   = event.data?.metrics
                        if (newStatus || metrics) {
                            setNodes(nds => nds.map(n => {
                                if (n.id !== event.nodeId) return n
                                const extra = {}
                                if (newStatus) extra.status  = newStatus
                                if (metrics)   extra.metrics = metrics
                                return { ...n, data: { ...n.data, ...extra } }
                            }))
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
    }, [isRunning, selectedModel, setNodes, log, buildFlowPayload, userInput, sessionId])

    /* ── Run in Background ───────────────────────────────────────────────────── */
    const handleRunBackground = useCallback(async () => {
        if (latestNodes.current.length === 0) {
            log('warn', 'No flow to run — generate one first')
            return
        }
        try {
            const { task_id } = await submitBackgroundTask(buildFlowPayload(), userInput.trim())
            log('ok', `Background task queued — ID: ${task_id}`)
        } catch (err) {
            log('err', `Background task failed: ${err.message}`)
        }
    }, [buildFlowPayload, log, userInput])

    /* ── Save / Load / Export / Import ──────────────────────────────────────── */
    const handleSave = useCallback((name) => {
        if (!name || latestNodes.current.length === 0) return
        saveFlow(name, { nodes: latestNodes.current, edges })
        log('ok', `Flow saved as "${name}"`)
    }, [edges, log])

    const handleLoad = useCallback((name) => {
        const data = loadFlow(name)
        if (!data) { log('err', `No saved flow named "${name}"`); return }
        setNodes(() => { syncNodes(data.nodes); return data.nodes })
        setEdges(data.edges)
        log('ok', `Loaded flow "${name}" — ${data.nodes.length} nodes`)
    }, [setNodes, setEdges, syncNodes, log])

    const handleExport = useCallback((name) => {
        exportFlow(name || 'my-flow', { nodes: latestNodes.current, edges })
        log('ok', `Exported flow as "${name || 'my-flow'}.json"`)
    }, [edges, log])

    /* ── Load a template ────────────────────────────────────────────────────── */
    const handleLoadTemplate = useCallback((template) => {
        setNodes(() => { syncNodes(template.nodes); return template.nodes })
        setEdges(template.edges)
        log('ok', `Template loaded: "${template.name}" — ${template.nodes.length} nodes`)
    }, [setNodes, setEdges, syncNodes, log])

    const handleImport = useCallback((jsonData) => {
        const result = importFlowFromJSON(jsonData)
        if (!result) { log('err', 'Invalid flow file — missing nodes/edges arrays'); return }
        setNodes(() => { syncNodes(result.nodes); return result.nodes })
        setEdges(result.edges)
        log('ok', `Imported "${result.name}" — ${result.nodes.length} nodes`)
    }, [setNodes, setEdges, syncNodes, log])

    /* ── Replay / Reset ──────────────────────────────────────────────────────── */
    const handleReplayEvent = useCallback((event) => {
        log(event.type, event.message, event.data)
        if (event.nodeId) {
            const newStatus = STATUS_MAP[event.type]
            const metrics   = event.data?.metrics
            if (newStatus || metrics) {
                setNodes(nds => nds.map(n => {
                    if (n.id !== event.nodeId) return n
                    const extra = {}
                    if (newStatus) extra.status  = newStatus
                    if (metrics)   extra.metrics = metrics
                    return { ...n, data: { ...n.data, ...extra } }
                }))
            }
        }
    }, [log, setNodes])

    const handleResetNodes = useCallback(() => {
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, status: 'idle', metrics: undefined },
        })))
    }, [setNodes])

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
            <div className="mesh-bg" />
            <TopBar
                onGenerate={handleGenerate}
                onRun={handleRun}
                onRunBackground={handleRunBackground}
                onPreview={() => setChatOpen(true)}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                isGenerating={isGenerating}
                isRunning={isRunning}
                hasFlow={nodes.length > 0}
                userInput={userInput}
                onUserInputChange={setUserInput}
                onSave={handleSave}
                onLoad={handleLoad}
                onExport={handleExport}
                onImport={handleImport}
                listSavedFlows={listSavedFlows}
                onShowTemplates={() => setShowTemplates(true)}
                onDeploy={() => setShowDeploy(true)}
                onShowRuns={() => setShowRuns(true)}
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
                    onShowTemplates={() => setShowTemplates(true)}
                />

                {selectedNode && (
                    <ConfigPanel
                        node={selectedNode}
                        flow={buildFlowPayload()}
                        model={selectedModel}
                        sessionId={sessionId}
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

            {showTemplates && (
                <TemplatesPanel
                    onLoad={handleLoadTemplate}
                    onClose={() => setShowTemplates(false)}
                />
            )}

            {showDeploy && (
                <DeployPanel
                    flow={buildFlowPayload()}
                    model={selectedModel}
                    onClose={() => setShowDeploy(false)}
                />
            )}

            {showRuns && (
                <RunsPanel
                    onClose={() => setShowRuns(false)}
                    onReplayEvent={handleReplayEvent}
                    onResetNodes={handleResetNodes}
                />
            )}

            {chatOpen && (
                <ChatPreview
                    flow={buildFlowPayload()}
                    model={selectedModel}
                    sessionId={sessionId}
                    onNewSession={() => setSessionId(createSessionId())}
                    onClose={() => setChatOpen(false)}
                />
            )}
        </div>
    )
}
