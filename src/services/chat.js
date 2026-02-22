/**
 * Chat with the active agent flow — streams SSE events and returns
 * a final 'response' event with the assembled output text.
 */

const BASE = 'http://localhost:8000'

export async function chatWithAgent(message, flow, model, sessionId = 'default', onLog, onResponse, signal) {
    const res = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, flow, model, sessionId }),
        signal,
    })
    if (!res.ok) throw new Error(`Chat failed: HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') return
            try {
                const event = JSON.parse(payload)
                if (event.type === 'response') {
                    onResponse(event.message)
                } else {
                    onLog?.(event)
                }
            } catch { /* skip malformed */ }
        }
    }
}
