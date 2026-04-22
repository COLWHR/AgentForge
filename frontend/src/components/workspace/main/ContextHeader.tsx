import { LayoutTemplate, Play, Settings } from 'lucide-react'

import { OPEN_EDIT_AGENT_CONFIG_EVENT } from '../../../features/agent/agent.events'
import { useAgentStore } from '../../../features/agent/agent.store'
import { RUN_AGENT_TRIGGER_EVENT } from '../../../features/execution/execution.events'
import { useExecutionStore } from '../../../features/execution/execution.store'
import { Button } from '../../ui/Button'

export function ContextHeader() {
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const agentContextStatus = useAgentStore((state) => state.agent_context_status)
  const executionStatus = useExecutionStore((state) => state.status)
  const title = currentAgentDetail?.name ?? 'No Agent Selected'
  const subtitle = currentAgentId === null ? 'Select or create an agent' : `Agent ID: ${currentAgentId}`
  const canOperateAgent = currentAgentId !== null && currentAgentDetail !== null && agentContextStatus === 'READY'
  const isExecutionLocked = executionStatus === 'PENDING' || executionStatus === 'RUNNING'
  const canRunAgent = canOperateAgent && !isExecutionLocked

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 shadow-token-sm z-10">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-token-md bg-primary/10 text-primary">
          <LayoutTemplate size={16} />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-text-main">{title}</h1>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
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
