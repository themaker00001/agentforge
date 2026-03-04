import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Search, X } from 'lucide-react'
import './Sidebar.css'

const EMOJI_BY_ICON = {
    // Agents
    agent: '🤖',
    chain: '⛓️',
    react: '🧠',
    // AI-native
    debate: '🗣️',
    evaluator: '🧪',
    // Flow control
    condition: '🔀',
    set_variable: '📌',
    parallel: '⚡',
    merge: '🔗',
    loop: '🔁',
    note: '🗒️',
    // Tools
    web_search: '🔎',
    tool: '🛠️',
    http_request: '🌐',
    file_reader: '📄',
    calculator: '🧮',
    json_parse: '🧾',
    csv_reader: '📊',
    text_splitter: '✂️',
    date_time: '🕒',
    // Local
    shell_exec: '💻',
    file_system: '📁',
    powerbi: '📈',
    // Knowledge
    knowledge: '📚',
    doc_loader: '📥',
    // Inputs / Outputs
    input: '💬',
    file_input: '📎',
    webhook: '🪝',
    media_input: '🖼️',
    output: '📤',
}

const LIBRARY = [
    {
        section: 'Agents',
        items: [
            { type: 'agent', label: 'AI Agent', iconType: 'agent', badge: 'NEW' },
            { type: 'agent', label: 'Chain Agent', iconType: 'chain' },
            { type: 'agent', label: 'ReAct Agent', iconType: 'react' },
        ],
    },
    {
        section: 'AI-Native',
        items: [
            { type: 'debate', label: 'Debate', iconType: 'debate', badge: 'NEW' },
            { type: 'evaluator', label: 'Evaluator', iconType: 'evaluator', badge: 'NEW' },
        ],
    },
    {
        section: 'Flow Control',
        items: [
            { type: 'condition', label: 'Condition', iconType: 'condition', badge: 'NEW' },
            { type: 'set_variable', label: 'Set Variable', iconType: 'set_variable', badge: 'NEW' },
            { type: 'parallel', label: 'Parallel', iconType: 'parallel', badge: 'NEW' },
            { type: 'merge', label: 'Merge', iconType: 'merge', badge: 'NEW' },
            { type: 'loop', label: 'Loop', iconType: 'loop', badge: 'NEW' },
            { type: 'note', label: 'Sticky Note', iconType: 'note', badge: 'NEW' },
        ],
    },
    {
        section: 'Tools',
        items: [
            { type: 'tool', label: 'Web Search', iconType: 'web_search' },
            { type: 'tool', label: 'Code Runner', iconType: 'tool' },
            { type: 'tool', label: 'HTTP Request', iconType: 'http_request' },
            { type: 'tool', label: 'File Reader', iconType: 'file_reader' },
            { type: 'tool', label: 'Calculator', iconType: 'calculator', badge: 'NEW' },
            { type: 'tool', label: 'JSON Parse', iconType: 'json_parse', badge: 'NEW' },
            { type: 'tool', label: 'CSV Reader', iconType: 'csv_reader', badge: 'NEW' },
            { type: 'tool', label: 'Text Splitter', iconType: 'text_splitter', badge: 'NEW' },
            { type: 'tool', label: 'Date & Time', iconType: 'date_time', badge: 'NEW' },
        ],
    },
    {
        section: 'Local',
        items: [
            { type: 'shell_exec', label: 'Shell Executor', iconType: 'shell_exec', badge: 'NEW' },
            { type: 'file_system', label: 'File System', iconType: 'file_system', badge: 'NEW' },
            { type: 'powerbi', label: '(Experimental) Power BI', iconType: 'powerbi', badge: 'NEW' },
        ],
    },
    {
        section: 'Knowledge',
        items: [
            { type: 'knowledge', label: 'Vector Store', iconType: 'knowledge' },
            { type: 'knowledge', label: 'Doc Loader', iconType: 'doc_loader' },
        ],
    },
    {
        section: 'Inputs / Triggers',
        items: [
            { type: 'input', label: 'Text Input', iconType: 'input' },
            { type: 'input', label: 'File Input', iconType: 'file_input' },
            { type: 'webhook', label: 'Webhook', iconType: 'webhook', badge: 'NEW' },
            { type: 'media_input', label: 'Media Input', iconType: 'media_input', badge: 'NEW' },
        ],
    },
    {
        section: 'Outputs',
        items: [
            { type: 'output', label: 'Text Output', iconType: 'output' },
        ],
    },
]

function NodeItem({ item, collapsed }) {
    const emoji = item.emoji || EMOJI_BY_ICON[item.iconType] || '⚙️'

    const onDragStart = (e) => {
        e.dataTransfer.setData('application/agentforge-type', item.type)
        e.dataTransfer.setData('application/agentforge-label', item.label)
        e.dataTransfer.setData('application/agentforge-iconType', item.iconType)
        e.dataTransfer.setData('application/agentforge-icon', emoji)
        e.dataTransfer.effectAllowed = 'move'
    }

    return (
        <div
            className={`sidebar-item si-${item.type}`}
            draggable
            onDragStart={onDragStart}
            title={item.label}
        >
            <div className="si-icon" aria-hidden>{emoji}</div>
            {!collapsed && (
                <>
                    <span className="si-label">{item.label}</span>
                    {item.badge && <span className="si-badge">{item.badge}</span>}
                </>
            )}
        </div>
    )
}

export default function Sidebar({ collapsed, onToggle }) {
    const [search, setSearch] = useState('')
    const [closedSections, setClosed] = useState(new Set())

    const toggleSection = (s) => setClosed(prev => {
        const n = new Set(prev)
        n.has(s) ? n.delete(s) : n.add(s)
        return n
    })

    const filteredLibrary = useMemo(() => {
        if (!search.trim()) return LIBRARY
        const q = search.toLowerCase()
        return LIBRARY
            .map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(q)) }))
            .filter(s => s.items.length > 0)
    }, [search])

    return (
        <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
            <div className="sidebar-header">
                {!collapsed && <span className="sidebar-heading">Node Library</span>}
                <button className="icon-btn sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
                    {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </div>

            {!collapsed && (
                <div className="sidebar-search">
                    <Search size={12} className="sidebar-search-icon" />
                    <input
                        className="sidebar-search-input"
                        placeholder="Search nodes…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="sidebar-search-clear" onClick={() => setSearch('')}>
                            <X size={10} />
                        </button>
                    )}
                </div>
            )}

            <div className="sidebar-scroll">
                {filteredLibrary.map(({ section, items }) => (
                    <div className="sidebar-section" key={section}>
                        {!collapsed && (
                            <button
                                className="sidebar-section-label"
                                onClick={() => toggleSection(section)}
                            >
                                {section}
                                <ChevronDown
                                    size={10}
                                    className={`sidebar-chevron${closedSections.has(section) ? ' closed' : ''}`}
                                />
                            </button>
                        )}
                        {!closedSections.has(section) && items.map(item => (
                            <NodeItem key={item.label} item={item} collapsed={collapsed} />
                        ))}
                    </div>
                ))}
            </div>
        </nav>
    )
}
