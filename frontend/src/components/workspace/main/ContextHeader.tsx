import { LayoutTemplate, Palette, Play, Rocket, Share2, SquareArrowOutUpRight, PanelsTopLeft, Settings } from 'lucide-react'

import { OPEN_EDIT_AGENT_CONFIG_EVENT } from '../../../features/agent/agent.events'
import { useAgentStore } from '../../../features/agent/agent.store'
import { RUN_AGENT_TRIGGER_EVENT } from '../../../features/execution/execution.events'
import { useExecutionStore } from '../../../features/execution/execution.store'
import { useBuilderTabsStore } from '../../../features/ui-shell/builderTabs.store'
import { useUiShellStore } from '../../../features/ui-shell/uiShell.store'
import { notify } from '../../../features/notifications/notify'
import { Button } from '../../ui/Button'

export function ContextHeader() {
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const agentContextStatus = useAgentStore((state) => state.agent_context_status)
  const executionStatus = useExecutionStore((state) => state.status)
  const title = currentAgentDetail?.name ?? 'No Agent Selected'
  const subtitle =
    currentAgentId === null
      ? 'No agent selected'
      : currentAgentDetail === null
        ? 'Selected agent unavailable'
        : currentAgentDetail.is_available
          ? `Agent ID: ${currentAgentId}`
          : `Selected agent unavailable${currentAgentDetail.availability_reason ? `: ${currentAgentDetail.availability_reason}` : ''}`
  const canOperateAgent = currentAgentDetail !== null
  const isExecutionLocked = executionStatus === 'PENDING' || executionStatus === 'RUNNING'
  const canRunAgent =
    currentAgentDetail !== null && currentAgentDetail.is_available && agentContextStatus === 'READY' && !isExecutionLocked
  const tabs = useBuilderTabsStore((state) => state.tabs)
  const activeTabId = useBuilderTabsStore((state) => state.activeTabId)
  const openCapabilityTab = useBuilderTabsStore((state) => state.openCapabilityTab)
  const toggleRightPanel = useUiShellStore((state) => state.toggleRightPanel)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 shadow-token-sm z-10">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-token-md bg-primary/10 text-primary">
          <LayoutTemplate size={16} />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-text-main">{title || 'Cloud Builder Browser'}</h1>
          <p className="text-xs text-text-muted">
            {activeTab ? `当前云端页面：${activeTab.title}` : subtitle}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Palette size={14} />}
          onClick={() => notify.info('外观设置将在后续阶段开放')}
        >
          外观
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<PanelsTopLeft size={14} />} onClick={toggleRightPanel}>
          面板
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<Share2 size={14} />} onClick={() => notify.success('分享链接已复制（占位）')}>
          分享
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<SquareArrowOutUpRight size={14} />}
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.open(window.location.href, '_blank', 'noopener,noreferrer')
            }
          }}
        >
          新窗口
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Rocket size={14} />} onClick={() => openCapabilityTab('deploy')}>
          部署
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Settings size={14} />}
          disabled={!canOperateAgent}
          onClick={() => {
            if (typeof window === 'undefined') {
              return
            }
            window.dispatchEvent(new Event(OPEN_EDIT_AGENT_CONFIG_EVENT))
          }}
        >
          Config
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Play size={14} />}
          disabled={!canRunAgent}
          onClick={() => {
            if (typeof window === 'undefined') {
              return
            }
            window.dispatchEvent(new Event(RUN_AGENT_TRIGGER_EVENT))
          }}
        >
          Run Agent
        </Button>
      </div>
    </div>
  )
}
