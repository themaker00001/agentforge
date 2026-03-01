import { useState, useEffect } from 'react'
import { Rocket, Trash2, Copy, X, Key, Check } from 'lucide-react'
import { deployFlow, listDeployed, undeployFlow } from '../services/api'
import './DeployPanel.css'

export default function DeployPanel({ flow, model, onClose }) {
    const [slug, setSlug] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [useApiKey, setUseApiKey] = useState(false)
    const [deployedApis, setDeployedApis] = useState([])
    const [deploying, setDeploying] = useState(false)
    const [error, setError] = useState(null)
    const [copiedSlug, setCopiedSlug] = useState(null)

    const fetchDeploys = async () => {
        const apis = await listDeployed()
        setDeployedApis(apis)
    }

    useEffect(() => {
        fetchDeploys()
        // Auto-generate a random slug if empty
        const randomId = Math.random().toString(36).substring(2, 6)
        setSlug(`my-agent-${randomId}`)
    }, [])

    const handleDeploy = async () => {
        if (!slug.trim()) {
            setError('URL path is required')
            return
        }
        if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
            setError('Path must be 3-50 chars, lowercase letters, numbers, and hyphens only.')
            return
        }

        setError(null)
        setDeploying(true)
        try {
            await deployFlow(slug, flow, model, useApiKey ? apiKey : null)
            await fetchDeploys()
            // Reset form for next deploy
            const randomId = Math.random().toString(36).substring(2, 6)
            setSlug(`my-agent-${randomId}`)
            setApiKey('')
            setUseApiKey(false)
        } catch (err) {
            setError(err.message)
        } finally {
            setDeploying(false)
        }
    }

    const handleUndeploy = async (targetSlug) => {
        try {
            await undeployFlow(targetSlug)
            await fetchDeploys()
        } catch (err) {
            setError(err.message)
        }
    }

    const copyToClipboard = async (text, targetSlug) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedSlug(targetSlug)
            setTimeout(() => setCopiedSlug(null), 2000)
        } catch (err) {
            console.error('Failed to copy', err)
        }
    }

    return (
        <div className="task-panel deploy-panel">
            <div className="task-panel-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Rocket size={14} style={{ color: 'var(--accent-primary)' }} />
                    Deploy as API
                </span>
                <button className="icon-btn" onClick={onClose}><X size={13} /></button>
            </div>

            <div className="deploy-panel-body">
                <div className="deploy-form">
                    <label>API Endpoint Path</label>
                    <div className="slug-input-wrapper">
                        <span className="slug-prefix">/api/</span>
                        <input
                            className="prompt-input slug-input"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            placeholder="my-agent-name"
                        />
                    </div>

                    <div className="auth-toggle">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
                            <input
                                type="checkbox"
                                checked={useApiKey}
                                onChange={(e) => setUseApiKey(e.target.checked)}
                            />
                            Require API Key Authorization
                        </label>
                    </div>

                    {useApiKey && (
                        <div className="api-key-input-wrapper" style={{ marginTop: 8 }}>
                            <Key size={12} className="key-icon" />
                            <input
                                type="text"
                                className="prompt-input"
                                style={{ paddingLeft: 28, fontSize: 11 }}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter a secret key..."
                            />
                        </div>
                    )}

                    {error && <div className="deploy-error">{error}</div>}

                    <button
                        className={`btn btn-primary deploy-btn mt-main ${deploying ? 'btn-loading' : ''}`}
                        onClick={handleDeploy}
                        disabled={deploying}
                    >
                        {deploying ? 'Deploying...' : 'Deploy Endpoint'}
                    </button>
                </div>

                {deployedApis.length > 0 && (
                    <div className="deployed-list">
                        <div className="deployed-list-header">Live Endpoints</div>
                        {deployedApis.map(api => (
                            <div key={api.slug} className="deployed-item">
                                <div className="deployed-item-header">
                                    <div className="live-indicator">
                                        <div className="live-dot" />
                                    </div>
                                    <span className="deployed-slug">/api/{api.slug}</span>
                                    {api.has_api_key && <Key size={10} style={{ color: 'var(--text-muted)' }} title="Protected by API Key" />}
                                    <div style={{ flex: 1 }} />
                                    <button
                                        className="icon-btn copy-btn"
                                        onClick={() => copyToClipboard(api.endpoint_url, api.slug)}
                                        title="Copy URL"
                                    >
                                        {copiedSlug === api.slug ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                    </button>
                                    <button
                                        className="icon-btn delete-btn"
                                        onClick={() => handleUndeploy(api.slug)}
                                        title="Undeploy"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <div className="curl-snippet">
                                    <code>
                                        {`curl -X POST ${api.endpoint_url} \\`}
                                        {api.has_api_key ? `\n  -H "X-API-Key: YOUR_KEY" \\` : ''}
                                        {`\n  -H "Content-Type: application/json" \\
  -d '{"input": "Hello"}'`}
                                    </code>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
