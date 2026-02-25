import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
        section: 'Tools',
        items: [
            { type: 'tool', label: 'Web Search', icon: '🔍' },
            { type: 'tool', label: 'Code Runner', icon: '⚙️' },
            { type: 'tool', label: 'HTTP Request', icon: '🌐' },
            { type: 'tool', label: 'File Reader', icon: '📁' },
        ],
    },
    {
        section: 'Local',
        items: [
            { type: 'shell_exec', label: 'Shell Executor', icon: '💻', badge: 'NEW' },
            { type: 'file_system', label: 'File System', icon: '📁', badge: 'NEW' },
            { type: 'powerbi', label: '(Experimental) Power BI', icon: '📊', badge: 'NEW' },
        ],
    },
    {
        section: 'Knowledge',
        items: [
            { type: 'knowledge', label: 'Vector Store', icon: '📚' },
            { type: 'knowledge', label: 'Doc Loader', icon: '📄' },
        ],
    },
    {
        section: 'Inputs',
        items: [
            { type: 'input', label: 'Text Input', icon: '💬' },
            { type: 'input', label: 'File Input', icon: '📎' },
        ],
    },
    {
        section: 'Outputs',
        items: [
            { type: 'output', label: 'Text Output', icon: '📤' },
            { type: 'output', label: 'Webhook', icon: '🔔' },
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
    return (
        <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
            <div className="sidebar-header">
                {!collapsed && <span className="sidebar-heading">Node Library</span>}
                <button className="icon-btn sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
                    {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </div>

            <div className="sidebar-scroll">
                {LIBRARY.map(({ section, items }) => (
                    <div className="sidebar-section" key={section}>
                        {!collapsed && <div className="sidebar-section-label">{section}</div>}
                        {items.map(item => (
                            <NodeItem key={item.label} item={item} collapsed={collapsed} />
                        ))}
                    </div>
                ))}
            </div>
        </nav>
    )
}
