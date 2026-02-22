import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Bot, User, Zap, Loader, RefreshCw, MessageSquare } from 'lucide-react'
import { chatWithAgent } from '../services/chat'
import './ChatPreview.css'

function TypingIndicator() {
    return (
        <div className="chat-msg chat-msg--agent">
            <div className="chat-avatar chat-avatar--agent"><Bot size={14} /></div>
            <div className="chat-bubble chat-bubble--agent typing-indicator">
                <span /><span /><span />
            </div>
        </div>
    )
}

function Message({ msg }) {
    const isUser = msg.role === 'user'
    return (
        <div className={`chat-msg chat-msg--${isUser ? 'user' : 'agent'}`}>
            {!isUser && (
                <div className="chat-avatar chat-avatar--agent"><Bot size={14} /></div>
            )}
            <div className={`chat-bubble chat-bubble--${isUser ? 'user' : 'agent'}`}>
                {msg.content}
            </div>
            {isUser && (
                <div className="chat-avatar chat-avatar--user"><User size={14} /></div>
            )}
        </div>
    )
}

export default function ChatPreview({ flow, model, sessionId = 'default', onClose }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [agentName, setAgentName] = useState('Agent')
    const [logs, setLogs] = useState([])

    const bottomRef = useRef(null)
    const abortRef = useRef(null)
    const inputRef = useRef(null)

    // Derive agent name from first agent node in flow
    useEffect(() => {
        if (!flow?.nodes) return
        const agentNode = flow.nodes.find(n => n.data?.nodeType === 'agent')
        if (agentNode?.data?.label) setAgentName(agentNode.data.label)
        // Greeting message
        setMessages([{
            id: 'welcome',
            role: 'agent',
            content: `Hi! I'm your **${agentNode?.data?.label || 'AI Agent'}**. ${flow.nodes.length
                } nodes are ready. What can I help you with?`,
        }])
        inputRef.current?.focus()
    }, [flow])

    // Auto-scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isStreaming])

    const sendMessage = useCallback(async () => {
        const text = input.trim()
        if (!text || isStreaming || !flow) return

        const userMsg = { id: Date.now(), role: 'user', content: text }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setIsStreaming(true)
        setLogs([])

        abortRef.current = new AbortController()

        try {
            let responseText = ''

            await chatWithAgent(
                text,
                flow,
                model,
                sessionId,
                (logEvent) => {
                    setLogs(prev => [...prev, logEvent])
                },
                (response) => {
                    responseText = response
                },
                abortRef.current.signal,
            )

            const agentMsg = {
                id: Date.now() + 1,
                role: 'agent',
                content: responseText || '(No response from agent)',
            }
            setMessages(prev => [...prev, agentMsg])
        } catch (err) {
            if (err.name !== 'AbortError') {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'agent',
                    content: `⚠️ Error: ${err.message}`,
                }])
            }
        } finally {
            setIsStreaming(false)
        }
    }, [input, isStreaming, flow, model, sessionId])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    }

    const clearChat = () => {
        abortRef.current?.abort()
        setMessages([{
            id: 'welcome',
            role: 'agent',
            content: `Chat cleared. Ask me anything!`,
        }])
        setLogs([])
        setIsStreaming(false)
    }

    const hasFlow = flow?.nodes?.length > 0

    return (
        <div className="chat-overlay">
            <div className="chat-panel">
                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header-info">
                        <div className="chat-agent-icon">
                            <Bot size={16} />
                        </div>
                        <div>
                            <div className="chat-agent-name">{agentName}</div>
                            <div className="chat-agent-meta">
                                <span className={`chat-status-dot ${hasFlow ? 'active' : 'inactive'}`} />
                                {hasFlow
                                    ? `${flow.nodes.length} nodes · ${model.split(':').pop()}`
                                    : 'No flow loaded'}
                            </div>
                        </div>
                    </div>
                    <div className="chat-header-actions">
                        <button className="icon-btn" onClick={clearChat} title="Clear chat">
                            <RefreshCw size={14} />
                        </button>
                        <button className="icon-btn" onClick={onClose} title="Close preview">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* No flow warning */}
                {!hasFlow && (
                    <div className="chat-no-flow">
                        <Zap size={32} className="chat-no-flow-icon" />
                        <p>No flow loaded</p>
                        <p className="chat-no-flow-sub">Generate a flow first, then come back to chat.</p>
                    </div>
                )}

                {/* Messages */}
                {hasFlow && (
                    <div className="chat-messages">
                        {messages.map(msg => <Message key={msg.id} msg={msg} />)}
                        {isStreaming && <TypingIndicator />}
                        <div ref={bottomRef} />
                    </div>
                )}

                {/* Live log strip */}
                {isStreaming && logs.length > 0 && (
                    <div className="chat-log-strip">
                        <Loader size={10} className="log-spin" />
                        <span>{logs[logs.length - 1]?.message?.replace(/^\s*[▶✓✗]\s*/, '')}</span>
                    </div>
                )}

                {/* Input */}
                <div className="chat-input-area">
                    <textarea
                        ref={inputRef}
                        className="chat-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={hasFlow ? 'Type a message… (Enter to send)' : 'Generate a flow to start chatting'}
                        disabled={!hasFlow || isStreaming}
                        rows={1}
                    />
                    <button
                        className={`chat-send-btn ${isStreaming ? 'chat-send-btn--streaming' : ''}`}
                        onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
                        disabled={!hasFlow || (!input.trim() && !isStreaming)}
                        title={isStreaming ? 'Stop' : 'Send'}
                    >
                        {isStreaming
                            ? <X size={16} />
                            : <Send size={15} />
                        }
                    </button>
                </div>
            </div>
        </div>
    )
}
