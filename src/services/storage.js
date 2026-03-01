/**
 * AgentForge — local workflow persistence
 * Uses localStorage for zero-backend save/load.
 */

const STORAGE_KEY = 'agentforge_saved_flows'

function _getAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    } catch {
        return {}
    }
}

function _setAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/**
 * Save the current flow under a given name.
 * @param {string} name
 * @param {{ nodes: any[], edges: any[] }} flowData  — React Flow nodes+edges
 */
export function saveFlow(name, flowData) {
    const all = _getAll()
    all[name] = {
        ...flowData,
        savedAt: new Date().toISOString(),
    }
    _setAll(all)
}

/**
 * Load a saved flow by name.
 * @returns {{ nodes, edges, savedAt } | null}
 */
export function loadFlow(name) {
    const all = _getAll()
    return all[name] || null
}

/**
 * List all saved flow names, sorted by most recently saved.
 * @returns {{ name: string, savedAt: string }[]}
 */
export function listSavedFlows() {
    const all = _getAll()
    return Object.entries(all)
        .map(([name, data]) => ({ name, savedAt: data.savedAt || '' }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/**
 * Delete a saved flow by name.
 */
export function deleteFlow(name) {
    const all = _getAll()
    delete all[name]
    _setAll(all)
}

/**
 * Export the flow as a downloadable JSON file.
 * @param {string} name  — filename (without .json)
 * @param {{ nodes, edges }} flowData
 */
export function exportFlow(name, flowData) {
    const payload = JSON.stringify({ name, ...flowData, exportedAt: new Date().toISOString() }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || 'agentforge-flow'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Import a flow from a parsed JSON object (from file import).
 * @param {object} json  — the parsed file contents
 * @returns {{ name: string, nodes: any[], edges: any[] } | null}
 */
export function importFlowFromJSON(json) {
    if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.edges)) {
        return null
    }
    return {
        name:  json.name || 'Imported Flow',
        nodes: json.nodes,
        edges: json.edges,
    }
}
