import { useEffect, useMemo, useState } from 'react'

import { marketplaceApi, type ConnectionTestResult, type ExtensionDetail, type ExtensionSummary } from './api/marketplace'

const FEATURED_TOOL_IDS = ['github', 'filesystem', 'brave_search']

function App() {
  const [userId, setUserId] = useState('demo-user')
  const [agentId, setAgentId] = useState('demo-agent')
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([])
  const [details, setDetails] = useState<Record<string, ExtensionDetail>>({})
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [globalMessage, setGlobalMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const items = await marketplaceApi.listExtensions()
        const featured = items.filter((item) => FEATURED_TOOL_IDS.includes(item.id))
        setExtensions(featured)

        const loadedDetails = await Promise.all(featured.map((item) => marketplaceApi.getExtension(item.id)))
        setDetails(Object.fromEntries(loadedDetails.map((item) => [item.id, item])))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load marketplace data.'
        setGlobalMessage(message)
      }
    })()
  }, [])

  const orderedExtensions = useMemo(
    () =>
      FEATURED_TOOL_IDS.map((id) => extensions.find((item) => item.id === id)).filter(Boolean) as ExtensionSummary[],
    [extensions]
  )

  const setConfigValue = (extensionId: string, key: string, value: string) => {
    setConfigs((current) => ({
      ...current,
      [extensionId]: {
        ...(current[extensionId] || {}),
        [key]: value,
      },
    }))
  }

  const runAction = async (extensionId: string, action: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [extensionId]: true }))
    try {
      await action()
    } finally {
      setBusy((current) => ({ ...current, [extensionId]: false }))
    }
  }

  const handleTestConnection = async (extensionId: string) => {
    await runAction(extensionId, async () => {
      const result: ConnectionTestResult = await marketplaceApi.testConnection(extensionId, configs[extensionId] || {})
      setMessages((current) => ({
        ...current,
        [extensionId]: result.ok ? `Connected: ${result.message}` : `Check failed: ${result.message}`,
      }))
    })
  }

  const handleEnableForUser = async (extensionId: string) => {
    await runAction(extensionId, async () => {
      await marketplaceApi.installExtension(extensionId, userId, configs[extensionId] || {})
      setMessages((current) => ({
        ...current,
        [extensionId]: 'Enabled for this user.',
      }))
    })
  }

  const handleBindToAgent = async (extensionId: string) => {
    const extension = details[extensionId]
    if (!extension) {
      return
    }
    await runAction(extensionId, async () => {
      await marketplaceApi.bindTools(
        agentId,
        extension.tools.map((tool) => tool.id)
      )
      setMessages((current) => ({
        ...current,
        [extensionId]: 'Bound to the current agent.',
      }))
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10 grid gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-black/20">
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Tool Marketplace</p>
            <h1 className="text-4xl font-black tracking-tight">Select tools on the platform, not on the local machine.</h1>
            <p className="max-w-3xl text-sm text-slate-400">
              Curated MCP tools are listed here for users to enable, configure, test, and bind to an agent.
              Platform operators only need to add manifests and backend support once.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">User ID</span>
              <input
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none ring-0 transition focus:border-cyan-500"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Agent ID</span>
              <input
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none ring-0 transition focus:border-cyan-500"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              />
            </label>
          </div>

          {globalMessage && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {globalMessage}
            </div>
          )}
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          {orderedExtensions.map((extension) => {
            const detail = details[extension.id]
            const config = configs[extension.id] || {}
            const loading = busy[extension.id] || false

            return (
              <article
                key={extension.id}
                className="grid gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20"
              >
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">{extension.name}</h2>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-cyan-400">{extension.tool_type}</p>
                    </div>
                    <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
                      {extension.categories.join(' / ') || 'tool'}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-slate-400">{extension.description}</p>
                </div>

                <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Configuration</p>
                  {extension.config_fields.length === 0 && (
                    <p className="text-sm text-slate-500">No user configuration required.</p>
                  )}
                  {extension.config_fields.map((field) => (
                    <label key={field.key} className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-200">{field.label}</span>
                      <input
                        type={field.type === 'password' ? 'password' : 'text'}
                        value={config[field.key] || ''}
                        onChange={(event) => setConfigValue(extension.id, field.key, event.target.value)}
                        placeholder={field.placeholder || ''}
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none transition focus:border-cyan-500"
                      />
                      {field.help_text && <span className="text-xs text-slate-500">{field.help_text}</span>}
                    </label>
                  ))}
                </div>

                <div className="grid gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tools</p>
                  <div className="flex flex-wrap gap-2">
                    {(detail?.tools || []).map((tool) => (
                      <span key={tool.id} className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                        {tool.display_name || tool.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleTestConnection(extension.id)}
                    className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Working...' : 'Test configuration'}
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleEnableForUser(extension.id)}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-500 disabled:opacity-50"
                  >
                    Enable for user
                  </button>
                  <button
                    type="button"
                    disabled={loading || !detail || detail.tools.length === 0}
                    onClick={() => void handleBindToAgent(extension.id)}
                    className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                  >
                    Bind tools to agent
                  </button>
                  {messages[extension.id] && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                      {messages[extension.id]}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}

export default App
