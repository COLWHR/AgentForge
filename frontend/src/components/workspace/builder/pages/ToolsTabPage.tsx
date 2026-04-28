import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Save, Store } from 'lucide-react'

import { useAgentStore } from '../../../../features/agent/agent.store'
import { BUILTIN_TOOL_OPTIONS, normalizeBuiltinToolId } from '../../../../features/tools/tools.catalog'
import { notify } from '../../../../features/notifications/notify'
import { Button } from '../../../ui/Button'

export function ToolsTabPage() {
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const updateAgent = useAgentStore((state) => state.updateAgent)
  const [isSaving, setIsSaving] = useState(false)

  const enabledToolIds = useMemo(
    () => new Set((currentAgentDetail?.tools ?? []).map(normalizeBuiltinToolId)),
    [currentAgentDetail?.tools],
  )
  const [draftToolIds, setDraftToolIds] = useState<string[] | null>(null)
  const selectedToolIds = draftToolIds ?? BUILTIN_TOOL_OPTIONS.filter((tool) => enabledToolIds.has(tool.id)).map((tool) => tool.id)
  const selectedSet = new Set(selectedToolIds)
  const isDirty = draftToolIds !== null && selectedToolIds.join('|') !== BUILTIN_TOOL_OPTIONS.filter((tool) => enabledToolIds.has(tool.id)).map((tool) => tool.id).join('|')
  const isAgentReady = currentAgentId !== null && currentAgentDetail !== null && currentAgentDetail.is_available

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraftToolIds(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [currentAgentId])

  const toggleTool = (toolId: string) => {
    setDraftToolIds((currentDraft) => {
      const current = currentDraft ?? selectedToolIds
      return current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId]
    })
  }

  const saveTools = async () => {
    if (!isAgentReady || currentAgentId === null) {
      notify.warning('请先选择一个可用智能体')
      return
    }

    setIsSaving(true)
    try {
      await updateAgent(currentAgentId, {
        capability_flags: { supports_tools: true },
        tools: selectedToolIds,
      })
      setDraftToolIds(null)
      notify.success('工具配置已保存')
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '工具配置保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-full overflow-auto bg-surface p-5">
      <div className="max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-main">工具</h2>
            <p className="mt-1 text-sm text-text-sub">选择当前智能体可以主动调用的工具。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Store size={14} />}
              onClick={() => notify.info('工具插件市场暂未开放')}
            >
              工具插件市场
            </Button>
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Save size={14} />}
              disabled={!isAgentReady || !isDirty || isSaving}
              onClick={() => {
                void saveTools()
              }}
            >
              {isSaving ? '保存中' : '保存工具配置'}
            </Button>
          </div>
        </div>

        {!isAgentReady ? (
          <div className="rounded-token-md border border-border bg-bg-soft/50 px-4 py-3 text-sm text-text-sub">
            请先选择一个可用智能体，再配置工具。
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {BUILTIN_TOOL_OPTIONS.map((tool) => {
            const Icon = tool.icon
            const checked = selectedSet.has(tool.id)
            return (
              <label
                key={tool.id}
                className="flex min-h-32 cursor-pointer gap-3 rounded-token-md border border-border bg-bg p-4 transition-colors hover:border-primary/40"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  disabled={!isAgentReady || isSaving}
                  checked={checked}
                  onChange={() => toggleTool(tool.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-primary" />
                    <span className="font-semibold text-text-main">{tool.name}</span>
                    <span className="rounded-token-md bg-bg-soft px-2 py-0.5 font-mono text-[11px] text-text-muted">
                      {tool.id}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-text-sub">{tool.description}</p>
                  <p className="mt-3 text-xs text-text-muted">{checked ? '已启用，模型可按需调用。' : '未启用，模型不会看到该工具。'}</p>
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isDirty ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <CircleAlert size={14} /> 当前有未保存更改
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 size={14} /> 工具配置已同步
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
