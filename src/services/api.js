/**
 * AgentForge Backend API Client
 * Connects the React frontend to the FastAPI backend at http://localhost:8000
 */

const BASE = 'http://localhost:8000'

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkBackend() {
    try {
        const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) })
        return res.ok
    } catch {
        return false
    }
}

// ── Models ────────────────────────────────────────────────────────────────────

/**
 * Returns { ollama: [...], openai: [...], gemini: [...] }
 * Falls back to empty lists if backend is unavailable.
 */
export async function getModels() {
    try {
        const res = await fetch(`${BASE}/models`)
        if (!res.ok) return { ollama: [], openai: [], gemini: [] }
        return await res.json()
    } catch {
        return { ollama: [], openai: [], gemini: [] }
    }
}

// ── Flow Generation ───────────────────────────────────────────────────────────

/**
 * Convert a user prompt into a FlowGraph via the backend Planner.
 * @returns FlowGraph { nodes, edges } or null on failure
 */
export async function generateFlow(prompt, model = 'ollama:llama3') {
    try {
        const res = await fetch(`${BASE}/generate-flow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
    } catch (err) {
        console.warn('[AgentForge API] generateFlow failed:', err.message)
        return null
    }
}

// ── Execute (SSE stream) ──────────────────────────────────────────────────────

/**
 * Execute a flow graph and stream log events.
 * @param {object} flow     - FlowGraph { nodes, edges }
 * @param {string} userInput
 * @param {string} model
 * @param {string} sessionId
 * @param {function} onEvent - called with each parsed LogEvent object
 * @param {AbortSignal} signal
 */
export async function executeFlow(flow, userInput, model, sessionId = 'default', onEvent, signal) {
    const res = await fetch(`${BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, userInput, model, sessionId }),
        signal,
    })
    if (!res.ok) throw new Error(`Execute failed: HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n')
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const payload = line.slice(6).trim()
                if (payload === '[DONE]') return
                try {
                    const event = JSON.parse(payload)
                    onEvent(event)
                } catch { /* skip malformed */ }
            }
        }
    }
}

// ── Knowledge ─────────────────────────────────────────────────────────────────

export async function uploadKnowledge(text, title = 'Document') {
    try {
        const res = await fetch(`${BASE}/knowledge/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, title }),
        })
        return await res.json()
    } catch (err) {
        return { error: err.message }
    }
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export async function executeTool(tool, params = {}) {
    try {
        const res = await fetch(`${BASE}/tool/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool, params }),
        })
        return await res.json()
    } catch (err) {
        return { error: err.message }
    }
}
