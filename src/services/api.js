/**
 * AgentForge Backend API Client
 * Defaults to same-origin /api (recommended for Docker + reverse proxy).
 * Can be overridden with VITE_API_BASE.
 */
const rawBase = (import.meta.env.VITE_API_BASE || '/api').trim()
const BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

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
    if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
            const data = await res.json()
            if (data?.detail) {
                if (Array.isArray(data.detail)) {
                    detail = data.detail
                        .map(d => `${(d.loc || []).join('.')} ${d.msg}`.trim())
                        .join('; ')
                } else {
                    detail = String(data.detail)
                }
            }
        } catch {
            // ignore JSON parse errors
        }
        throw new Error(`Execute failed: ${detail}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
            for (const line of part.split('\n')) {
                if (!line.startsWith('data: ')) continue
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

export async function listCustomTools() {
    try {
        const res = await fetch(`${BASE}/tools/custom`)
        if (!res.ok) return []
        const data = await res.json()
        return data.tools || []
    } catch {
        return []
    }
}

export async function saveCustomTool(toolDef) {
    const res = await fetch(`${BASE}/tools/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolDef),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Save custom tool failed: HTTP ${res.status}`)
    }
    return await res.json()
}

export async function deleteCustomTool(toolName) {
    const res = await fetch(`${BASE}/tools/custom/${encodeURIComponent(toolName)}`, { method: 'DELETE' })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Delete custom tool failed: HTTP ${res.status}`)
    }
    return await res.json()
}

export async function uploadToolFile(file) {
    const formData = new FormData()
    formData.append('file', file)
    try {
        const res = await fetch(`${BASE}/tool/upload`, {
            method: 'POST',
            body: formData,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
    } catch (err) {
        console.error('File upload failed:', err)
        return null
    }
}

// ── Background Tasks ──────────────────────────────────────────────────────────

/**
 * Submit a flow for background execution.
 * @returns { task_id: string }
 */
export async function submitBackgroundTask(flow, userInput = '') {
    const res = await fetch(`${BASE}/agent-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, userInput }),
    })
    if (!res.ok) throw new Error(`Submit task failed: HTTP ${res.status}`)
    return await res.json()
}

/**
 * Poll the status and result of a background task.
 * @returns BackgroundTask { task_id, status, result, created_at, ... }
 */
export async function getTaskStatus(taskId) {
    const res = await fetch(`${BASE}/agent-tasks/${taskId}`)
    if (!res.ok) throw new Error(`Get task failed: HTTP ${res.status}`)
    return await res.json()
}

/**
 * List all background tasks.
 * @returns BackgroundTask[]
 */
export async function listTasks() {
    try {
        const res = await fetch(`${BASE}/agent-tasks`)
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

/**
 * Delete/cancel a background task.
 */
export async function deleteTask(taskId) {
    const res = await fetch(`${BASE}/agent-tasks/${taskId}`, { method: 'DELETE' })
    return res.ok
}

// ── Deploy as API ─────────────────────────────────────────────────────────────

export async function deployFlow(slug, flow, model, api_key = null) {
    const payload = { slug, flow, model }
    if (api_key) payload.api_key = api_key

    const res = await fetch(`${BASE}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Deploy failed: HTTP ${res.status}`)
    }
    return await res.json()
}

export async function listDeployed() {
    try {
        const res = await fetch(`${BASE}/deploy`)
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getDeployInfo(slug) {
    const res = await fetch(`${BASE}/deploy/${slug}`)
    if (!res.ok) throw new Error(`Deploy not found: HTTP ${res.status}`)
    return await res.json()
}

export async function undeployFlow(slug) {
    const res = await fetch(`${BASE}/deploy/${slug}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Undeploy failed: HTTP ${res.status}`)
    return res.ok
}

// ── Run History ───────────────────────────────────────────────────────────────

export async function listRuns(limit = 50) {
    try {
        const res = await fetch(`${BASE}/runs?limit=${limit}`)
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getRun(runId) {
    const res = await fetch(`${BASE}/runs/${runId}`)
    if (!res.ok) throw new Error(`Run not found: HTTP ${res.status}`)
    return await res.json()
}

export async function deleteRun(runId) {
    const res = await fetch(`${BASE}/runs/${runId}`, { method: 'DELETE' })
    return res.ok
}

// ── Media Upload ──────────────────────────────────────────────────────────────

export async function uploadMedia(file) {
    const formData = new FormData()
    formData.append('file', file)
    try {
        const res = await fetch(`${BASE}/media/upload`, {
            method: 'POST',
            body: formData,
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || `HTTP ${res.status}`)
        }
        return await res.json()
    } catch (err) {
        console.error('Media upload failed:', err)
        throw err
    }
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export async function getStats() {
    try {
        const res = await fetch(`${BASE}/stats`)
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

export async function listSchedules() {
    try {
        const res = await fetch(`${BASE}/schedules`)
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createSchedule(payload) {
    const res = await fetch(`${BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Create schedule failed: HTTP ${res.status}`)
    }
    return await res.json()
}

export async function toggleSchedule(scheduleId) {
    const res = await fetch(`${BASE}/schedules/${encodeURIComponent(scheduleId)}/toggle`, {
        method: 'PUT',
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Toggle schedule failed: HTTP ${res.status}`)
    }
    return await res.json()
}

export async function deleteSchedule(scheduleId) {
    const res = await fetch(`${BASE}/schedules/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Delete schedule failed: HTTP ${res.status}`)
    }
    return await res.json()
}
