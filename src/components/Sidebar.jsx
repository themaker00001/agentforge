import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Search, X } from 'lucide-react'
import './Sidebar.css'

const LIBRARY = [
    {
        section: 'Agents',
        items: [
            { type: 'agent', label: 'AI Agent', icon: '🤖', badge: 'NEW' },
            { type: 'agent', label: 'Chain Agent', icon: '🔗' },
            { type: 'agent', label: 'ReAct Agent', icon: '⚡' },
        ],
    },
    {
        section: 'AI-Native',
        items: [
            { type: 'debate',    label: 'Debate',    icon: '⚖️', badge: 'NEW' },
            { type: 'evaluator', label: 'Evaluator', icon: '🎯', badge: 'NEW' },
        ],
    },
    {
        section: 'Flow Control',
        items: [
            { type: 'condition',    label: 'Condition',    icon: '🔀', badge: 'NEW' },
            { type: 'set_variable', label: 'Set Variable', icon: '📌', badge: 'NEW' },
            { type: 'parallel',     label: 'Parallel',     icon: '⚡', badge: 'NEW' },
            { type: 'merge',        label: 'Merge',        icon: '🔗', badge: 'NEW' },
            { type: 'loop',         label: 'Loop',         icon: '🔁', badge: 'NEW' },
            { type: 'note',         label: 'Sticky Note',  icon: '📝', badge: 'NEW' },
        ],
    },
    {
        section: 'Tools',
        items: [
            { type: 'tool', label: 'Web Search',    icon: '🔍' },
            { type: 'tool', label: 'Code Runner',   icon: '⚙️' },
            { type: 'tool', label: 'HTTP Request',  icon: '🌐' },
            { type: 'tool', label: 'File Reader',   icon: '📁' },
            { type: 'tool', label: 'Calculator',    icon: '🧮', badge: 'NEW' },
            { type: 'tool', label: 'JSON Parse',    icon: '{}', badge: 'NEW' },
            { type: 'tool', label: 'CSV Reader',    icon: '📊', badge: 'NEW' },
            { type: 'tool', label: 'Text Splitter', icon: '✂️', badge: 'NEW' },
            { type: 'tool', label: 'Date & Time',   icon: '🕐', badge: 'NEW' },
        ],
    },
    {
        section: 'Local',
        items: [
            { type: 'shell_exec',  label: 'Shell Executor',         icon: '💻', badge: 'NEW' },
            { type: 'file_system', label: 'File System',            icon: '📁', badge: 'NEW' },
            { type: 'powerbi',     label: '(Experimental) Power BI', icon: '📊', badge: 'NEW' },
        ],
    },
    {
        section: 'Knowledge',
        items: [
            { type: 'knowledge', label: 'Vector Store', icon: '📚' },
            { type: 'knowledge', label: 'Doc Loader',   icon: '📄' },
        ],
    },
    {
        section: 'Inputs / Triggers',
        items: [
            { type: 'input',       label: 'Text Input',  icon: '💬' },
            { type: 'input',       label: 'File Input',  icon: '📎' },
            { type: 'webhook',     label: 'Webhook',      icon: '🪝', badge: 'NEW' },
            { type: 'media_input', label: 'Media Input',  icon: '🖼️', badge: 'NEW' },
        ],
    },
    {
        section: 'Outputs',
        items: [
            { type: 'output', label: 'Text Output', icon: '📤' },
        ],
    },
]

function NodeItem({ item, collapsed }) {
    const onDragStart = (e) => {
        e.dataTransfer.setData('application/agentforge-type', item.type)
        e.dataTransfer.setData('application/agentforge-label', item.label)
        e.dataTransfer.setData('application/agentforge-icon', item.icon)
        e.dataTransfer.effectAllowed = 'move'
    }

    return (
        <div
            className={`sidebar-item si-${item.type}`}
            draggable
            onDragStart={onDragStart}
            title={item.label}
        >
            <div className="si-icon">{item.icon}</div>
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
