import { Clock, Eye, EyeOff, FolderKanban, MessageSquare, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { OPEN_CREATE_AGENT_CONFIG_EVENT, OPEN_EDIT_AGENT_CONFIG_EVENT } from '../../../features/agent/agent.events'
import { useAgentStore } from '../../../features/agent/agent.store'
import { notify } from '../../../features/notifications/notify'
import { useUiShellStore } from '../../../features/ui-shell/uiShell.store'
import { cn } from '../../../lib/cn'
import { NAV_ITEMS } from '../../../shared/navigation'
import { Drawer } from '../../overlay/Drawer'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { SessionList } from '../history/SessionList'
import { SessionListItem } from '../history/SessionListItem'
import { WorkspaceSwitcher } from '../history/WorkspaceSwitcher'

type ConfigMode = 'create' | 'edit'

interface AgentConfigFormState {
  name: string
  avatar_url: string
  description: string
  llm_provider_url: string
  llm_api_key: string
  llm_model_name: string
  temperature: string
  max_tokens: string
  supports_tools: boolean
}

const EMPTY_FORM: AgentConfigFormState = {
  name: '',
  avatar_url: '',
  description: '',
  llm_provider_url: '',
  llm_api_key: '',
  llm_model_name: '',
  temperature: '0.7',
  max_tokens: '1000',
  supports_tools: true,
}

function validateEndpoint(value: string): string | null {
  const normalized = value.trim()
  if (normalized.length === 0) return 'Base URL 为必填项'
  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.toLowerCase()
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Base URL 必须使用 http 或 https'
    if (host === 'localhost' || host === 'host.docker.internal' || host === 'docker.internal') return '禁止使用 localhost 或 docker internal host'
    if (host === '127.0.0.1' || host.startsWith('192.168.')) return '禁止使用内网地址'
  } catch {
    return 'Base URL 格式非法'
  }
  return null
}

function parseArcErrorCode(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const envelope = raw as Record<string, unknown>
  const data = envelope.data as Record<string, unknown> | undefined
  const error = data?.error as Record<string, unknown> | undefined
  return typeof error?.code === 'string' ? error.code : null
}

function mapArcErrorCode(code: string | null): string {
  if (code === 'AUTH_FAILED') return '鉴权失败：请检查 API Key'
  if (code === 'MODEL_NOT_FOUND') return '模型不存在：请检查 Model Name'
  if (code === 'MODEL_CAPABILITY_MISMATCH') return '模型能力不匹配：当前模型不支持工具调用'
  if (code === 'INVALID_ENDPOINT') return 'Endpoint 非法或被安全策略阻断'
  if (code === 'MISSING_API_KEY') return '缺少 API Key'
  if (code === 'PROVIDER_RATE_LIMITED') return 'Provider 限流，请稍后重试'
  if (code === 'INVALID_TOOL_CALL') return 'Tool Call 参数非法'
  if (code === 'MODEL_OUTPUT_TRUNCATED') return '模型输出被截断'
  if (code === 'NETWORK_ERROR') return '网络错误：请检查连接'
  return '请求失败，请检查配置后重试'
}

export function WorkspaceRail() {
  const sidebarCollapsed = useUiShellStore((state) => state.sidebarCollapsed)
  const leftPanelWidth = useUiShellStore((state) => state.leftPanelWidth)
  const toggleSidebar = useUiShellStore((state) => state.toggleSidebar)
  const agentList = useAgentStore((state) => state.agent_list)
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const isAgentListLoading = useAgentStore((state) => state.is_agent_list_loading)
  const createAgent = useAgentStore((state) => state.createAgent)
  const updateAgent = useAgentStore((state) => state.updateAgent)
  const selectAgent = useAgentStore((state) => state.selectAgent)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [configMode, setConfigMode] = useState<ConfigMode>('create')
  const [form, setForm] = useState<AgentConfigFormState>({ ...EMPTY_FORM })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<keyof AgentConfigFormState, string>> = {}
    if (form.name.trim().length === 0) errors.name = 'Name 为必填项'
    if (form.description.trim().length === 0) errors.description = 'Description 为必填项'
    const endpointErr = validateEndpoint(form.llm_provider_url)
    if (endpointErr) errors.llm_provider_url = endpointErr
    if (form.llm_model_name.trim().length === 0) errors.llm_model_name = 'Model Name 为必填项'
    if (configMode === 'create' && form.llm_api_key.trim().length === 0) errors.llm_api_key = 'API Key 为必填项'
    if (configMode === 'edit' && currentAgentDetail?.has_api_key === false && form.llm_api_key.trim().length === 0) {
      errors.llm_api_key = '当前 Agent 尚未保存 API Key，请填写'
    }
    return errors
  }, [configMode, currentAgentDetail?.has_api_key, form])

  const canSubmit = Object.keys(fieldErrors).length === 0 && !isSubmitting

  useEffect(() => {
    const onOpenCreate = () => {
      setConfigMode('create')
      setForm({ ...EMPTY_FORM })
      setSubmitError(null)
      setShowApiKey(false)
      setDrawerOpen(true)
    }
    const onOpenEdit = () => {
      const detail = useAgentStore.getState().current_agent_detail
      if (detail === null) return
      setConfigMode('edit')
      setForm({
        name: detail.name,
        avatar_url: detail.avatar_url ?? '',
        description: detail.description,
        llm_provider_url: detail.llm_provider_url,
        llm_api_key: '',
        llm_model_name: detail.llm_model_name,
        temperature: String(detail.runtime_config.temperature),
        max_tokens: detail.runtime_config.max_tokens === null ? '' : String(detail.runtime_config.max_tokens),
        supports_tools: detail.capability_flags.supports_tools,
      })
      setSubmitError(null)
      setShowApiKey(false)
      setDrawerOpen(true)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener(OPEN_CREATE_AGENT_CONFIG_EVENT, onOpenCreate)
      window.addEventListener(OPEN_EDIT_AGENT_CONFIG_EVENT, onOpenEdit)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(OPEN_CREATE_AGENT_CONFIG_EVENT, onOpenCreate)
        window.removeEventListener(OPEN_EDIT_AGENT_CONFIG_EVENT, onOpenEdit)
      }
    }
  }, [])

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      if (configMode === 'create') {
        await createAgent({
          name: form.name.trim(),
          description: form.description.trim(),
          avatar_url: form.avatar_url.trim().length > 0 ? form.avatar_url.trim() : null,
          llm_provider_url: form.llm_provider_url.trim(),
          llm_api_key: form.llm_api_key.trim(),
          llm_model_name: form.llm_model_name.trim(),
          runtime_config: {
            temperature: Number(form.temperature || '0.7'),
            max_tokens: form.max_tokens.trim().length > 0 ? Number(form.max_tokens) : null,
          },
          capability_flags: { supports_tools: form.supports_tools },
          tools: [],
          constraints: { max_steps: 6 },
        })
      } else {
        const targetId = useAgentStore.getState().current_agent_id
        if (targetId === null) {
          setSubmitError('当前无可编辑 Agent')
          return
        }
        await updateAgent(targetId, {
          name: form.name.trim(),
          description: form.description.trim(),
          avatar_url: form.avatar_url.trim().length > 0 ? form.avatar_url.trim() : null,
          llm_provider_url: form.llm_provider_url.trim(),
          llm_model_name: form.llm_model_name.trim(),
          runtime_config: {
            temperature: Number(form.temperature || '0.7'),
            max_tokens: form.max_tokens.trim().length > 0 ? Number(form.max_tokens) : null,
          },
          capability_flags: { supports_tools: form.supports_tools },
          ...(form.llm_api_key.trim().length > 0 ? { llm_api_key: form.llm_api_key.trim() } : {}),
        })
      }
      setDrawerOpen(false)
    } catch (error) {
      const code = parseArcErrorCode((error as { raw?: unknown })?.raw ?? null)
      setSubmitError(mapArcErrorCode(code))
    } finally {
      setIsSubmitting(false)
    }
  }

  const runConnectionValidation = () => {
    const endpointErr = validateEndpoint(form.llm_provider_url)
    if (endpointErr) return setSubmitError(endpointErr)
    if (form.llm_model_name.trim().length === 0) return setSubmitError('Model Name 为必填项')
    if (configMode === 'create' && form.llm_api_key.trim().length === 0) return setSubmitError('API Key 为必填项')
    setSubmitError(null)
    notify.info('连接参数本地校验通过，保存后在真实执行链路中验证连接')
  }

  return (
    <aside
      style={{ width: sidebarCollapsed ? 80 : leftPanelWidth }}
      className={cn('flex h-full shrink-0 flex-col border-r border-border bg-surface transition-all duration-300', sidebarCollapsed ? 'overflow-hidden' : '')}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
        {!sidebarCollapsed && <div className="w-full"><WorkspaceSwitcher /></div>}
        {sidebarCollapsed && (
          <button onClick={toggleSidebar} className="flex h-10 w-10 items-center justify-center rounded-token-md bg-primary text-white">
            <FolderKanban size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        {!sidebarCollapsed ? (
          <div className="space-y-6">
            <div className="px-3">
              <Button className="w-full" leftIcon={<Plus size={16} />} onClick={() => { setConfigMode('create'); setForm({ ...EMPTY_FORM }); setSubmitError(null); setDrawerOpen(true) }}>
                New Agent Flow
              </Button>
            </div>

            <SessionList title="Current Agent">
              <SessionListItem id="current-agent" title={currentAgentDetail?.name ?? 'No Agent Selected'} subtitle={currentAgentDetail?.llm_model_name ?? 'EMPTY'} icon={<FolderKanban size={16} />} active={currentAgentId !== null} />
            </SessionList>

            <SessionList title="Recent Agents">
              {isAgentListLoading && <SessionListItem id="loading-agents" title="Loading agents..." icon={<Clock size={16} />} />}
              {!isAgentListLoading && agentList.map((agent) => (
                <SessionListItem key={agent.id} id={agent.id} title={agent.name} subtitle={agent.llm_model_name} icon={<MessageSquare size={16} />} active={agent.id === currentAgentId} onClick={() => { void selectAgent(agent.id) }} />
              ))}
              {!isAgentListLoading && agentList.length === 0 && <SessionListItem id="empty-agent-list" title="No agents found" subtitle="Create Agent to continue" />}
            </SessionList>

            <SessionList title="Recent Runs">
              <SessionListItem id="run-1" title="Code Reviewer #452" subtitle="Failed" icon={<Clock size={16} />} />
              <SessionListItem id="run-2" title="Data Analyzer #112" subtitle="Success" icon={<Clock size={16} />} />
            </SessionList>

            <SessionList title="Platform">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('group flex w-full items-center gap-3 rounded-token-md px-3 py-2 text-left transition-colors', isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-sub hover:bg-bg-soft hover:text-text-main')}>
                  <item.icon size={16} className="text-text-muted group-hover:text-primary" />
                  <span className="truncate text-sm">{item.label}</span>
                </NavLink>
              ))}
            </SessionList>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <Button variant="ghost" size="icon" aria-label="new" onClick={() => { setConfigMode('create'); setForm({ ...EMPTY_FORM }); setSubmitError(null); setDrawerOpen(true) }}>
              <Plus size={20} />
            </Button>
            <div className="h-px w-8 bg-border" />
            <Button variant="ghost" size="icon" aria-label="recent"><Clock size={20} className="text-text-muted" /></Button>
            <Button variant="ghost" size="icon" aria-label="sessions"><MessageSquare size={20} className="text-text-muted" /></Button>
            <Button variant="ghost" size="icon" aria-label="expand" onClick={toggleSidebar}><FolderKanban size={20} className="text-text-muted" /></Button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <button type="button" className="flex w-full items-center justify-center gap-3 rounded-token-md px-3 py-2 text-sm text-text-sub transition-colors hover:bg-bg-soft hover:text-text-main">
          <Settings2 size={16} />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={configMode === 'create' ? 'Create Agent' : 'Edit Agent'}>
        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-text-main">Agent Identity</h4>
            <Input id="agent-name" label="Name" placeholder="输入 Agent 名称" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <p className="text-xs text-text-muted">用于工作区与 Agent 列表显示。</p>
            {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
            <Input id="agent-avatar" label="Avatar" placeholder="https://example.com/avatar.png" value={form.avatar_url} onChange={(e) => setForm((prev) => ({ ...prev, avatar_url: e.target.value }))} />
            <p className="text-xs text-text-muted">可选，填写头像 URL。</p>
            <div className="space-y-1">
              <label htmlFor="agent-description" className="text-xs font-medium text-text-sub">Description</label>
              <textarea id="agent-description" className="min-h-20 w-full rounded-token-md border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder="输入 Agent 描述，将注入执行 prompt 链路" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
              <p className="text-xs text-text-muted">执行时作为 Agent description 注入，不仅用于展示。</p>
              {fieldErrors.description && <p className="text-xs text-red-500">{fieldErrors.description}</p>}
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-text-main">Model Connection</h4>
            <Input id="provider-url" label="Base URL" placeholder="https://api.openai.com/v1" value={form.llm_provider_url} onChange={(e) => setForm((prev) => ({ ...prev, llm_provider_url: e.target.value }))} />
            <p className="text-xs text-text-muted">必须为 OpenAI-compatible endpoint，禁止 localhost/内网地址。</p>
            {fieldErrors.llm_provider_url && <p className="text-xs text-red-500">{fieldErrors.llm_provider_url}</p>}
            <div className="space-y-1">
              <label htmlFor="api-key" className="text-xs font-medium text-text-sub">API Key</label>
              <div className="flex items-center gap-2">
                <Input id="api-key" type={showApiKey ? 'text' : 'password'} placeholder={configMode === 'edit' && currentAgentDetail?.has_api_key ? '已保存，留空表示不变更' : '输入 API Key'} value={form.llm_api_key} onChange={(e) => setForm((prev) => ({ ...prev, llm_api_key: e.target.value }))} />
                <Button type="button" variant="ghost" size="icon" aria-label="toggle api key visibility" onClick={() => setShowApiKey((prev) => !prev)}>
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
              <p className="text-xs text-text-muted">已保存 key 不回显；编辑时仅支持覆盖更新。</p>
              {fieldErrors.llm_api_key && <p className="text-xs text-red-500">{fieldErrors.llm_api_key}</p>}
            </div>
            <Input id="model-name" label="Model Name" placeholder="gpt-4o-mini" value={form.llm_model_name} onChange={(e) => setForm((prev) => ({ ...prev, llm_model_name: e.target.value }))} />
            <p className="text-xs text-text-muted">填写 provider 已开通的模型名称。</p>
            {fieldErrors.llm_model_name && <p className="text-xs text-red-500">{fieldErrors.llm_model_name}</p>}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-text-main">Advanced Runtime</h4>
            <Input id="temperature" label="Temperature" placeholder="0.7" value={form.temperature} onChange={(e) => setForm((prev) => ({ ...prev, temperature: e.target.value }))} />
            <p className="text-xs text-text-muted">控制生成随机性，默认 0.7。</p>
            <Input id="max-tokens" label="Max Tokens" placeholder="1000" value={form.max_tokens} onChange={(e) => setForm((prev) => ({ ...prev, max_tokens: e.target.value }))} />
            <p className="text-xs text-text-muted">留空表示由 provider 默认处理。</p>
            <div className="space-y-1">
              <label htmlFor="supports-tools" className="text-xs font-medium text-text-sub">Capability Flags</label>
              <select id="supports-tools" className="h-10 w-full rounded-token-md border border-border bg-surface px-3 text-sm text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" value={form.supports_tools ? 'true' : 'false'} onChange={(e) => setForm((prev) => ({ ...prev, supports_tools: e.target.value === 'true' }))}>
                <option value="true">supports_tools = true</option>
                <option value="false">supports_tools = false</option>
              </select>
              <p className="text-xs text-text-muted">与模型能力一致时才允许工具调用。</p>
            </div>
          </section>

          {submitError && <p className="rounded-token-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">{submitError}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={runConnectionValidation} disabled={isSubmitting}>Test Connection</Button>
            <Button type="button" variant="secondary" onClick={() => setDrawerOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="button" variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {isSubmitting ? 'Saving...' : configMode === 'create' ? 'Create Agent' : 'Save Agent'}
            </Button>
          </div>
        </div>
      </Drawer>
    </aside>
  )
}
