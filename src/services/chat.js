/**
 * Chat with the active agent flow — streams SSE events and returns
 * a final 'response' event with the assembled output text.
 * Also passes 'chunk' events to onLog for incremental rendering.
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
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Split on double-newline (SSE event boundary)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''   // keep incomplete last part

        for (const part of parts) {
            for (const line of part.split('\n')) {
                if (!line.startsWith('data: ')) continue
                const payload = line.slice(6).trim()
                if (payload === '[DONE]') return
                try {
                    const event = JSON.parse(payload)
                    if (event.type === 'response') {
                        onResponse(event.message)
                    } else {
                        // chunk events AND regular log events both go through onLog
                        onLog?.(event)
                    }
                } catch { /* skip malformed */ }
            }
        }
    }
}
