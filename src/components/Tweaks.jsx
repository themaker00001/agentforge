import { useState, useRef, useCallback } from 'react'
import './Tweaks.css'

const ACCENT_PRESETS = [
    '#c8ff00', '#ff2bd6', '#00f0ff', '#ff6a00', '#ffffff',
]

const NODE_COLOR_ROWS = [
    { key: 'ncAgent',     label: 'AGENT',     desc: 'Agent, Debate, Memory' },
    { key: 'ncTool',      label: 'TOOL',      desc: 'Tool nodes' },
    { key: 'ncKnowledge', label: 'KNOWLEDGE', desc: 'Vector stores' },
    { key: 'ncFlow',      label: 'FLOW',      desc: 'Condition, Loop, Merge…' },
    { key: 'ncIO',        label: 'I / O',     desc: 'Input, Output, Webhook' },
    { key: 'ncSpecial',   label: 'SPECIAL',   desc: 'Evaluator, Shell, File' },
]

const UI_COLOR_ROWS = [
    { key: 'uiBg',      label: 'BACKGROUND', desc: 'Main canvas + app bg' },
    { key: 'uiSurface', label: 'SURFACE',    desc: 'Panels, cards, topbar' },
    { key: 'uiBorder',  label: 'BORDER',     desc: 'All dividers + outlines' },
]

function Seg({ value, onChange, options }) {
    return (
        <div className="twk-seg">
            {options.map(([v, l]) => (
                <button key={v} className={`twk-seg-btn ${value === v ? 'active' : ''}`}
                    onClick={() => onChange(v)}>
                    {l}
                </button>
            ))}
        </div>
    )
}

function ColorRow({ label, desc, value, onChange }) {
    const inputRef = useRef(null)
    return (
        <div className="twk-color-row" onClick={() => inputRef.current?.click()}>
            <div className="twk-color-swatch-lg" style={{ background: value }} />
            <div className="twk-color-info">
                <span className="twk-color-label">{label}</span>
                <span className="twk-color-desc">{desc}</span>
            </div>
            <span className="twk-color-hex">{value.toUpperCase()}</span>
            <input
                ref={inputRef}
                type="color"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="twk-color-input"
            />
        </div>
    )
}

const DEFAULTS = {
    accent: '#c8ff00',
    theme: 'dark',
    nodeStyle: 'card',
    canvasBg: 'dots',
    density: 'relaxed',
    grain: false,
    ncAgent: '#6366f1',
    ncTool: '#3b82f6',
    ncKnowledge: '#f59e0b',
    ncFlow: '#14b8a6',
    ncIO: '#22c55e',
    ncSpecial: '#d946ef',
    uiBg: '#000000',
    uiSurface: '#0a0a0b',
    uiBorder: '#232327',
}

export default function Tweaks({ tweaks, setTweak, open, onClose }) {
    const [pos, setPos] = useState({ x: 24, y: 24 })
    const posRef = useRef({ x: 24, y: 24 })
    const [activeTab, setActiveTab] = useState('style')

    const updatePos = useCallback(p => {
        posRef.current = p
        setPos(p)
    }, [])

    const onDragStart = useCallback(e => {
        if (e.button !== 0) return
        e.preventDefault()

        const sx = e.clientX, sy = e.clientY
        const ox = posRef.current.x, oy = posRef.current.y

        const onMove = ev => {
            const PANEL_W = 288, PANEL_H = 480
            updatePos({
                x: Math.min(globalThis.innerWidth - PANEL_W, Math.max(0, ox - (ev.clientX - sx))),
                y: Math.min(globalThis.innerHeight - PANEL_H, Math.max(0, oy - (ev.clientY - sy))),
            })
        }

        const onUp = () => {
            globalThis.removeEventListener('mousemove', onMove)
            globalThis.removeEventListener('mouseup', onUp)
        }

        globalThis.addEventListener('mousemove', onMove)
        globalThis.addEventListener('mouseup', onUp)
    }, [updatePos])

    const resetAll = () => Object.entries(DEFAULTS).forEach(([k, v]) => setTweak(k, v))

    if (!open) return null

    return (
        <div className="twk-panel" style={{ right: pos.x, bottom: pos.y }}>
            {/* Header */}
            <div className="twk-header" onMouseDown={onDragStart}>
                <span className="twk-title">// TWEAKS</span>
                <div className="twk-header-right">
                    <button className="twk-reset" onMouseDown={e => e.stopPropagation()} onClick={resetAll} title="Reset to defaults">↺ Reset</button>
                    <button className="twk-close" onMouseDown={e => e.stopPropagation()} onClick={onClose}>✕</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="twk-tabs">
                <button className={`twk-tab ${activeTab === 'style' ? 'active' : ''}`}
                    onClick={() => setActiveTab('style')}>Style</button>
                <button className={`twk-tab ${activeTab === 'nodes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('nodes')}>Nodes</button>
                <button className={`twk-tab ${activeTab === 'ui' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ui')}>UI</button>
            </div>

            <div className="twk-body">

                {/* ── STYLE TAB ── */}
                {activeTab === 'style' && <>
                    <div className="twk-section">
                        <div className="twk-label">ACCENT</div>
                        <div className="twk-accent-row">
                            {ACCENT_PRESETS.map(c => (
                                <button key={c}
                                    className={`twk-swatch ${tweaks.accent === c ? 'active' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => setTweak('accent', c)}
                                />
                            ))}
                            <label className="twk-custom-color" title="Custom accent">
                                <div className="twk-swatch twk-custom-swatch"
                                    style={{ background: tweaks.accent }}
                                    title="Custom">
                                    <span className="twk-custom-icon">+</span>
                                </div>
                                <input type="color" value={tweaks.accent}
                                    onChange={e => setTweak('accent', e.target.value)}
                                    className="twk-color-input" />
                            </label>
                        </div>
                    </div>

                    <div className="twk-section">
                        <div className="twk-label">THEME</div>
                        <Seg value={tweaks.theme} onChange={v => setTweak('theme', v)}
                            options={[['dark', 'Dark'], ['light', 'Light']]} />
                    </div>

                    <div className="twk-section">
                        <div className="twk-label">NODE STYLE</div>
                        <Seg value={tweaks.nodeStyle} onChange={v => setTweak('nodeStyle', v)}
                            options={[['card', 'Card'], ['terminal', 'Terminal'], ['pill', 'Pill']]} />
                    </div>

                    <div className="twk-section">
                        <div className="twk-label">CANVAS BG</div>
                        <Seg value={tweaks.canvasBg} onChange={v => setTweak('canvasBg', v)}
                            options={[['dots', 'Dots'], ['lines', 'Lines'], ['crosshair', 'Cross'], ['plain', 'Plain']]} />
                    </div>

                    <div className="twk-section">
                        <div className="twk-label">DENSITY</div>
                        <Seg value={tweaks.density} onChange={v => setTweak('density', v)}
                            options={[['relaxed', 'Relaxed'], ['compact', 'Compact']]} />
                    </div>

                    <div className="twk-section">
                        <div className="twk-label">GRAIN</div>
                        <Seg value={tweaks.grain ? 'on' : 'off'} onChange={v => setTweak('grain', v === 'on')}
                            options={[['on', 'On'], ['off', 'Off']]} />
                    </div>
                </>}

                {/* ── NODES TAB ── */}
                {activeTab === 'nodes' && <>
                    <p className="twk-hint">Click a row to open the color picker. Changes apply instantly across all nodes.</p>
                    {NODE_COLOR_ROWS.map(row => (
                        <ColorRow
                            key={row.key}
                            label={row.label}
                            desc={row.desc}
                            value={tweaks[row.key] || DEFAULTS[row.key]}
                            onChange={v => setTweak(row.key, v)}
                        />
                    ))}
                </>}

                {/* ── UI TAB ── */}
                {activeTab === 'ui' && <>
                    <p className="twk-hint">Customize panel backgrounds, surfaces, and border colors.</p>
                    {UI_COLOR_ROWS.map(row => (
                        <ColorRow
                            key={row.key}
                            label={row.label}
                            desc={row.desc}
                            value={tweaks[row.key] || DEFAULTS[row.key]}
                            onChange={v => setTweak(row.key, v)}
                        />
                    ))}
                    <div className="twk-section" style={{ marginTop: 4 }}>
                        <div className="twk-label">ACCENT COLOR</div>
                        <ColorRow
                            label="SIGNAL"
                            desc="Highlight, active, focus"
                            value={tweaks.accent}
                            onChange={v => setTweak('accent', v)}
                        />
                    </div>
                </>}
            </div>
        </div>
    )
}
