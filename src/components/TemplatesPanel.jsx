/**
 * TemplatesPanel — pre-built one-click workflow templates.
 * Each template is a complete { nodes, edges } object in React Flow format.
 */
import { X, ArrowRight } from 'lucide-react'
import NodeIcon from './NodeIcon'
import './TemplatesPanel.css'

// ── Icon emoji lookup ──────────────────────────────────────────────────────
const ICON_MAP = {
    input: '💬', agent: '🤖', tool: '🔍', knowledge: '📚', output: '📤',
    shell_exec: '💻', file_system: '📁', condition: '🔀', set_variable: '📌',
    merge: '🔗', loop: '🔁', webhook: '🪝', debate: '🗣️', evaluator: '⚖️',
    parallel: '⚡', note: '📝', media_input: '🖼️',
    web_search: '🌐', http_request: '📡', code_runner: '💻', file_reader: '📄',
    summarize: '📋', json_parse: '{ }', csv_reader: '📊', text_splitter: '✂️',
    calculator: '🔢', datetime_helper: '🕐',
}
function iconEmoji(type) { return ICON_MAP[type] || '⚙️' }

// ── Helper to build a standard node data object ────────────────────────────
function nd(type, label, iconType, extra = {}) {
    return {
        nodeType: type, label, iconType, icon: iconEmoji(iconType),
        model: 'ollama:llama3:8b', status: 'idle',
        systemPrompt: '', temperature: 0.7, maxTokens: 4096,
        memory: true, toolsEnabled: true, streaming: false,
        toolName: null, params: null,
        command: null, workingDir: null, timeout: 30, language: 'bash',
        fsOperation: null, fsPath: null, fsContent: null, fsPattern: null,
        conditionExpr: null, variableName: null, variableValue: null,
        mergeMode: 'concat', mergeSeparator: '\n\n', loopVar: null,
        debatePersonas: null, debateRounds: 1, debateJudgePrompt: null,
        evaluatorRubric: null, evaluatorThreshold: 7.0,
        noteContent: null, noteColor: '#fef3c7',
        ...extra,
    }
}

function n(id, type, x, y, label, iconType, extra = {}) {
    return { id, type: 'agentNode', position: { x, y }, data: nd(type, label, iconType, extra) }
}

function e(id, source, target, handle) {
    return {
        id, source, target, type: 'smoothstep', animated: true,
        style: { stroke: '#c8ff00', strokeWidth: 1.5, opacity: 0.6 },
        ...(handle ? { sourceHandle: handle } : {}),
    }
}

// ── Template definitions ───────────────────────────────────────────────────
const TEMPLATES = [
    {
        id: 'research',
        name: 'Research Assistant',
        description: 'Searches the web and synthesizes a clear answer. Perfect for knowledge queries.',
        icon: 'web_search',
        color: '#3b82f6',
        tags: ['search', 'beginner'],
        nodes: [
            n('r1', 'input', 0, 150, 'User Question', 'input'),
            n('r2', 'tool', 280, 150, 'Web Search', 'web_search', { toolName: 'web_search' }),
            n('r3', 'agent', 560, 150, 'Synthesizer', 'agent', {
                systemPrompt: 'You are a research assistant. Using the search results below, write a clear, accurate, well-structured answer to the user\'s question. Cite sources where possible.',
            }),
            n('r4', 'output', 840, 150, 'Answer', 'output'),
        ],
        edges: [e('re1', 'r1', 'r2'), e('re2', 'r2', 'r3'), e('re3', 'r3', 'r4')],
    },

    {
        id: 'debate',
        name: 'Multi-Perspective Debate',
        description: 'Three AI personas argue different sides, then a judge synthesizes the best answer. Uniquely AI-native.',
        icon: 'debate',
        color: '#d946ef',
        tags: ['ai-native', 'analysis'],
        nodes: [
            n('d1', 'input', 0, 150, 'Topic / Question', 'input'),
            n('d2', 'debate', 300, 150, 'Debate Council', 'debate', {
                debatePersonas: [
                    { name: 'Optimist', systemPrompt: 'You are an optimist. Argue the most positive, hopeful perspective with genuine enthusiasm and evidence.' },
                    { name: 'Skeptic', systemPrompt: 'You are a critical skeptic. Challenge assumptions, expose weaknesses, and ask hard questions.' },
                    { name: 'Realist', systemPrompt: 'You are a pragmatic realist. Focus on what actually works in practice, with nuance and balance.' },
                ],
                debateJudgePrompt: 'You are a wise synthesis judge. Read all perspectives and write a final nuanced answer that incorporates the strongest points from each side.',
                temperature: 0.8,
            }),
            n('d3', 'output', 650, 150, 'Synthesis', 'output'),
        ],
        edges: [e('de1', 'd1', 'd2'), e('de2', 'd2', 'd3')],
    },

    {
        id: 'quality_gate',
        name: 'Quality-Gated Writing',
        description: 'Writes content, scores it with an AI evaluator (≥7/10 to pass), then either approves or sends to a reviser.',
        icon: 'evaluator',
        color: '#f59e0b',
        tags: ['writing', 'quality', 'advanced'],
        nodes: [
            n('q1', 'input', 0, 200, 'Topic / Brief', 'input'),
            n('q2', 'agent', 280, 200, 'Content Writer', 'agent', {
                systemPrompt: 'You are an expert content writer. Write a high-quality, engaging, well-structured response to the brief. Be thorough and precise.',
                temperature: 0.75,
            }),
            n('q3', 'evaluator', 580, 200, 'Quality Gate', 'evaluator', {
                evaluatorRubric: 'Rate this content on: accuracy, clarity, completeness, and engagement. Penalise vague, generic, or off-topic responses.',
                evaluatorThreshold: 7.0,
            }),
            n('q4', 'output', 880, 80, 'Approved ✓', 'output'),
            n('q5', 'agent', 880, 320, 'Reviser', 'agent', {
                systemPrompt: 'The previous draft did not meet quality standards. Rewrite it to be significantly better: more accurate, detailed, and engaging.',
                temperature: 0.6,
            }),
            n('q6', 'output', 1160, 320, 'Revised', 'output'),
        ],
        edges: [
            e('qe1', 'q1', 'q2'), e('qe2', 'q2', 'q3'),
            e('qe3', 'q3', 'q4', 'pass'), e('qe4', 'q3', 'q5', 'fail'),
            e('qe5', 'q5', 'q6'),
        ],
    },

    {
        id: 'parallel',
        name: 'Parallel Research',
        description: 'Simultaneously searches the web AND brainstorms internally, then merges and synthesizes — 2× coverage.',
        icon: 'parallel',
        color: '#06b6d4',
        tags: ['search', 'parallel', 'advanced'],
        nodes: [
            n('p1', 'input', 0, 200, 'Research Question', 'input'),
            n('p2', 'parallel', 260, 200, 'Fan-out', 'parallel'),
            n('p3', 'tool', 520, 80, 'Web Search', 'web_search', { toolName: 'web_search' }),
            n('p4', 'agent', 520, 320, 'Internal Expert', 'agent', {
                systemPrompt: 'You are an expert with deep knowledge. Share what you know about this topic from your training data — be thorough and specific.',
            }),
            n('p5', 'merge', 800, 200, 'Merge Results', 'merge', { mergeMode: 'concat', mergeSeparator: '\n\n---\n\n' }),
            n('p6', 'agent', 1060, 200, 'Final Synthesizer', 'agent', {
                systemPrompt: 'You have web search results AND expert knowledge below. Synthesize them into a comprehensive, well-organized answer. Identify any contradictions and resolve them.',
            }),
            n('p7', 'output', 1320, 200, 'Answer', 'output'),
        ],
        edges: [
            e('pe1', 'p1', 'p2'), e('pe2', 'p2', 'p3'), e('pe3', 'p2', 'p4'),
            e('pe4', 'p3', 'p5'), e('pe5', 'p4', 'p5'),
            e('pe6', 'p5', 'p6'), e('pe7', 'p6', 'p7'),
        ],
    },

    {
        id: 'data_pipeline',
        name: 'Data Transform Pipeline',
        description: 'Parse JSON data, extract values with variables, run calculations, then generate an AI narrative report.',
        icon: 'csv_reader',
        color: '#10b981',
        tags: ['data', 'tools', 'intermediate'],
        nodes: [
            n('dp1', 'input', 0, 150, 'Raw JSON Data', 'input'),
            n('dp2', 'tool', 280, 150, 'JSON Parser', 'json_parse', { toolName: 'json_parse' }),
            n('dp3', 'set_variable', 560, 150, 'Store Data', 'set_variable', { variableName: 'parsed_data' }),
            n('dp4', 'tool', 840, 150, 'Calculator', 'calculator', {
                toolName: 'calculator',
                params: { expression: '42' },  // user should update this
            }),
            n('dp5', 'agent', 1120, 150, 'Report Writer', 'agent', {
                systemPrompt: 'You are a data analyst. Given the data context, write a clear, insightful narrative report. Highlight key findings, trends, and actionable recommendations. The parsed data is: {{parsed_data}}',
            }),
            n('dp6', 'output', 1400, 150, 'Report', 'output'),
            n('dp7', 'note', 280, 340, 'Tip: Edit the\nJSON Parse node\nwith a path query\ne.g. data.items', 'note', {
                noteContent: '💡 Edit the JSON Parse node\nto add a path query\ne.g. "data.items.0.value"',
                noteColor: '#dbeafe',
            }),
        ],
        edges: [
            e('dpe1', 'dp1', 'dp2'), e('dpe2', 'dp2', 'dp3'),
            e('dpe3', 'dp3', 'dp4'), e('dpe4', 'dp4', 'dp5'), e('dpe5', 'dp5', 'dp6'),
        ],
    },

    {
        id: 'code_review',
        name: 'AI Code Reviewer',
        description: 'Reviews code for bugs and quality, scores it with an evaluator, routes to approval or improvement.',
        icon: 'shell_exec',
        color: '#8b5cf6',
        tags: ['code', 'quality', 'intermediate'],
        nodes: [
            n('cr1', 'input', 0, 200, 'Code to Review', 'input'),
            n('cr2', 'agent', 280, 200, 'Code Reviewer', 'agent', {
                systemPrompt: 'You are an expert code reviewer. Analyse the code for:\n• Bugs and logic errors\n• Security vulnerabilities\n• Performance issues\n• Code style and readability\n• Missing error handling\n\nBe specific. Quote the problematic lines. Suggest concrete fixes.',
                temperature: 0.3,
            }),
            n('cr3', 'evaluator', 580, 200, 'Quality Gate', 'evaluator', {
                evaluatorRubric: 'Rate this code review on: thoroughness (did it find real issues?), specificity (are suggestions actionable?), and correctness. Score higher if concrete fixes are provided.',
                evaluatorThreshold: 6.5,
            }),
            n('cr4', 'output', 880, 80, 'Review Report ✓', 'output'),
            n('cr5', 'agent', 880, 320, 'Improve Review', 'agent', {
                systemPrompt: 'The code review was too vague. Redo it with more specific, actionable feedback. Include exact line references and working code examples for all suggested fixes.',
                temperature: 0.3,
            }),
            n('cr6', 'output', 1160, 320, 'Enhanced Review', 'output'),
        ],
        edges: [
            e('cre1', 'cr1', 'cr2'), e('cre2', 'cr2', 'cr3'),
            e('cre3', 'cr3', 'cr4', 'pass'), e('cre4', 'cr3', 'cr5', 'fail'),
            e('cre5', 'cr5', 'cr6'),
        ],
    },
]

export default function TemplatesPanel({ onLoad, onClose }) {
    return (
        <div className="tpl-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="tpl-panel">
                <div className="tpl-header">
                    <div>
                        <div className="tpl-eyebrow">FLOW TEMPLATES</div>
                        <div className="tpl-title">Start from a template.</div>
                        <div className="tpl-subtitle">{TEMPLATES.length} pre-built workflows — click to load</div>
                    </div>
                    <button className="icon-btn" onClick={onClose}><X size={13} /></button>
                </div>

                <div className="tpl-grid">
                    {TEMPLATES.map(tpl => (
                        <button
                            key={tpl.id}
                            className="tpl-card"
                            onClick={() => { onLoad(tpl); onClose() }}
                            style={{ '--tpl-color': tpl.color }}
                        >
                            <div className="tpl-card-icon">
                                <NodeIcon type={tpl.icon} size={18} />
                            </div>
                            <div className="tpl-card-body">
                                <div className="tpl-card-name">{tpl.name}</div>
                                <div className="tpl-card-desc">{tpl.description}</div>
                                <div className="tpl-card-tags">
                                    {tpl.tags.map(tag => (
                                        <span key={tag} className="tpl-tag">{tag}</span>
                                    ))}
                                    <span className="tpl-node-count">{tpl.nodes.length} nodes</span>
                                </div>
                            </div>
                            <ArrowRight size={14} className="tpl-card-arrow" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
