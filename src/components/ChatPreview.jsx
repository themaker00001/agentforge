import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Bot, User, Zap, Loader, RefreshCw } from 'lucide-react'
import { chatWithAgent } from '../services/chat'
import './ChatPreview.css'

/* ── Simple markdown renderer ─────────────────────────────────────────────── */
function renderInline(text, keyPrefix) {
    if (!text) return null
    const parts = []
    // Match bold (**...**), inline-code (`...`), italic (*...*)
    const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g
    let last = 0, i = 0, m
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            const seg = text.slice(last, m.index)
            seg.split('\n').forEach((line, idx) => {
                if (idx > 0) parts.push(<br key={`${keyPrefix}-br${i++}`} />)
                if (line) parts.push(line)
            })
        }
        const raw = m[0]
        if (raw.startsWith('**'))
            parts.push(<strong key={`${keyPrefix}-b${i++}`}>{raw.slice(2, -2)}</strong>)
        else if (raw.startsWith('`'))
            parts.push(<code key={`${keyPrefix}-c${i++}`} className="md-ic">{raw.slice(1, -1)}</code>)
        else
            parts.push(<em key={`${keyPrefix}-e${i++}`}>{raw.slice(1, -1)}</em>)
        last = m.index + raw.length
    }
    if (last < text.length) {
        text.slice(last).split('\n').forEach((line, idx) => {
            if (idx > 0) parts.push(<br key={`${keyPrefix}-br${i++}`} />)
            if (line) parts.push(line)
        })
    }
    return parts
}

function Markdown({ text }) {
    if (!text) return null

    // 1. Extract code blocks first so we don't parse their contents
    const segments = []
    const codeRe = /```(\w*)\n?([\s\S]*?)```/g
    let last = 0, m
    while ((m = codeRe.exec(text)) !== null) {
        if (m.index > last) segments.push({ t: 'text', v: text.slice(last, m.index) })
        segments.push({ t: 'code', lang: m[1], v: m[2].trimEnd() })
        last = m.index + m[0].length
    }
    if (last < text.length) segments.push({ t: 'text', v: text.slice(last) })

    const elements = []
    let key = 0

    segments.forEach((seg) => {
        if (seg.t === 'code') {
            elements.push(
                <pre key={key++} className="md-pre">
                    <code>{seg.v}</code>
                </pre>
            )
            return
        }

        // 2. Split text into paragraph blocks (double newline)
        seg.v.split(/\n{2,}/).forEach((block) => {
            if (!block.trim()) return
            const lines = block.split('\n').filter(l => l !== undefined)

            // Heading
            const headMatch = lines[0].match(/^(#{1,3})\s(.+)/)
            if (headMatch) {
                const lvl = headMatch[1].length
                const Tag = lvl === 1 ? 'h2' : lvl === 2 ? 'h3' : 'h4'
                const cls = lvl === 1 ? 'md-h1' : lvl === 2 ? 'md-h2' : 'md-h3'
                elements.push(<Tag key={key++} className={cls}>{renderInline(headMatch[2], `h${key}`)}</Tag>)
                if (lines.length > 1)
                    elements.push(<p key={key++} className="md-p">{renderInline(lines.slice(1).join('\n'), `p${key}`)}</p>)
                return
            }

            // Bullet list
            if (lines.some(l => /^[-*•]\s/.test(l))) {
                const items = lines.filter(l => /^[-*•]\s/.test(l.trimStart()))
                elements.push(
                    <ul key={key++} className="md-ul">
                        {items.map((l, i) => (
                            <li key={i}>{renderInline(l.replace(/^[-*•]\s/, ''), `ul${key}-${i}`)}</li>
                        ))}
                    </ul>
                )
                return
            }

            // Numbered list
            if (lines.some(l => /^\d+\.\s/.test(l))) {
                const items = lines.filter(l => /^\d+\.\s/.test(l))
                elements.push(
                    <ol key={key++} className="md-ol">
                        {items.map((l, i) => (
                            <li key={i}>{renderInline(l.replace(/^\d+\.\s/, ''), `ol${key}-${i}`)}</li>
                        ))}
                    </ol>
                )
                return
            }

            // Horizontal rule
            if (/^---+$/.test(block.trim())) {
                elements.push(<hr key={key++} />)
                return
            }

            // Regular paragraph
            elements.push(<p key={key++} className="md-p">{renderInline(block, `p${key}`)}</p>)
        })
    })

    return <div className="md">{elements}</div>
}

/* ── Sub-components ───────────────────────────────────────────────────────── */
function TypingIndicator() {
    return (
        <div className="chat-msg chat-msg--agent">
            <div className="chat-avatar chat-avatar--agent"><Bot size={13} /></div>
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
                <div className="chat-avatar chat-avatar--agent"><Bot size={13} /></div>
            )}
            <div className={`chat-bubble chat-bubble--${isUser ? 'user' : 'agent'}${msg.partial ? ' partial' : ''}`}>
                {isUser
                    ? msg.content
                    : <Markdown text={msg.content} />
                }
                {msg.partial && <span className="cursor-blink" />}
            </div>
            {isUser && (
                <div className="chat-avatar chat-avatar--user"><User size={13} /></div>
            )}
        </div>
    )
}

const PARTIAL_ID = '__streaming_partial__'

/* ── Main component ───────────────────────────────────────────────────────── */
export default function ChatPreview({ flow, model, sessionId = 'default', onClose }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [agentName, setAgentName] = useState('Agent')
    const [currentLog, setCurrentLog] = useState('')

    const bottomRef = useRef(null)
    const abortRef = useRef(null)
    const inputRef = useRef(null)

    useEffect(() => {
        if (!flow?.nodes) return
        const agentNode = flow.nodes.find(n => n.data?.nodeType === 'agent')
        const name = agentNode?.data?.label || 'AI Agent'
        setAgentName(name)
        setMessages([{
            id: 'welcome',
            role: 'agent',
            content: `Hi! I'm your **${name}**. This flow has ${flow.nodes.length} nodes ready.\n\nWhat would you like to explore?`,
        }])
        inputRef.current?.focus()
    }, [flow])

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
        setCurrentLog('')

        abortRef.current = new AbortController()
        let partialStarted = false

        try {
            let responseText = ''

            await chatWithAgent(
                text,
                flow,
                model,
                sessionId,
                (logEvent) => {
                    // Show the latest log step (non-chunk events)
                    if (logEvent.type !== 'chunk') {
                        setCurrentLog(logEvent.message?.replace(/^\s*[▶✓✗↷]\s*/, '') || '')
                    }

                    if (logEvent.type === 'chunk') {
                        const chunk = logEvent.message || ''
                        if (!partialStarted) {
                            partialStarted = true
                            setMessages(prev => [...prev, {
                                id: PARTIAL_ID,
                                role: 'agent',
                                content: chunk,
                                partial: true,
                            }])
                        } else {
                            setMessages(prev => prev.map(m =>
                                m.id === PARTIAL_ID
                                    ? { ...m, content: m.content + chunk }
                                    : m
                            ))
                        }
                    }

                    if (logEvent.data?.user_code) {
                        setMessages(prev => [...prev, {
                            id: Date.now() + Math.random(),
                            role: 'agent',
                            content: `🔐 **Authentication Required**\n\nPlease visit ${logEvent.data.verification_uri} and enter: **\`${logEvent.data.user_code}\`**`,
                        }])
                    }
                },
                (response) => { responseText = response },
                abortRef.current.signal,
            )

            if (partialStarted) {
                setMessages(prev => prev.map(m =>
                    m.id === PARTIAL_ID
                        ? { ...m, content: responseText || m.content, partial: false, id: Date.now() + 1 }
                        : m
                ))
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'agent',
                    content: responseText || '(No response from agent)',
                }])
            }
        } catch (err) {
            setMessages(prev => prev.filter(m => m.id !== PARTIAL_ID))
            if (err.name !== 'AbortError') {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'agent',
                    content: `⚠️ Error: ${err.message}`,
                }])
            }
        } finally {
            setIsStreaming(false)
            setCurrentLog('')
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
            content: 'Chat cleared — ask me anything!',
        }])
        setIsStreaming(false)
        setCurrentLog('')
    }

    const hasFlow = flow?.nodes?.length > 0

    return (
        <div className="chat-panel">
            {/* Header */}
            <div className="chat-header">
                <div className="chat-header-info">
                    <div className="chat-agent-icon"><Bot size={15} /></div>
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
                        <RefreshCw size={13} />
                    </button>
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* No flow warning */}
            {!hasFlow && (
                <div className="chat-no-flow">
                    <Zap size={28} className="chat-no-flow-icon" />
                    <p>No flow loaded</p>
                    <p className="chat-no-flow-sub">Generate a flow first, then come back to chat.</p>
                </div>
            )}

            {/* Messages */}
            {hasFlow && (
                <div className="chat-messages">
                    {messages.map(msg => <Message key={msg.id} msg={msg} />)}
                    {isStreaming && !messages.some(m => m.partial) && <TypingIndicator />}
                    <div ref={bottomRef} />
                </div>
            )}

            {/* Live status strip — always visible while streaming */}
            {isStreaming && (
                <div className="chat-log-strip">
                    <Loader size={10} className="log-spin" />
                    <span>{currentLog || 'Processing…'}</span>
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
                    placeholder={hasFlow ? 'Message… (Enter to send, Shift+Enter for newline)' : 'Generate a flow to start'}
                    disabled={!hasFlow || isStreaming}
                    rows={1}
                />
                <button
                    className={`chat-send-btn ${isStreaming ? 'chat-send-btn--streaming' : ''}`}
                    onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
                    disabled={!hasFlow || (!input.trim() && !isStreaming)}
                    title={isStreaming ? 'Stop generation' : 'Send'}
                >
                    {isStreaming ? <X size={15} /> : <Send size={14} />}
                </button>
            </div>
        </div>
    )
}
