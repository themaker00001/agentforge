// Ollama REST API service
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md

const BASE = 'http://localhost:11434'

/**
 * Fetch list of locally available models from Ollama.
 * Returns an array of model name strings, or [] if Ollama isn't running.
 */
export async function listModels() {
    try {
        const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
        if (!res.ok) return []
        const data = await res.json()
        return (data.models || []).map(m => m.name)
    } catch {
        return []
    }
}

/**
 * Check if Ollama is reachable.
 */
export async function ping() {
    try {
        await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) })
        return true
    } catch {
        return false
    }
}

/**
 * Send a chat request to Ollama (streaming).
 * @param {string} model  - model name, e.g. "llama3"
 * @param {Array}  messages - OpenAI-style [{role, content}]
 * @param {Function} onChunk - called with each text chunk as it streams
 * @param {AbortSignal} signal - optional AbortSignal to cancel
 */
export async function chatStream(model, messages, onChunk, signal) {
    const res = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
        signal,
    })
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
            try {
                const json = JSON.parse(line)
                if (json.message?.content) onChunk(json.message.content)
            } catch { /* skip malformed chunks */ }
        }
    }
}

/**
 * Simple one-shot generate (no streaming).
 */
export async function generate(model, prompt) {
    const res = await fetch(`${BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
    })
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
    const data = await res.json()
    return data.response
}
