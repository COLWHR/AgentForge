import { Activity, AlertTriangle } from 'lucide-react'
import { useMemo, useEffect } from 'react'

import { useExecutionStore } from '../../../../features/execution/execution.store'
import { useBuilderTabsStore } from '../../../../features/ui-shell/builderTabs.store'
import { ReActDebugPanel } from '../../debug/ReActDebugPanel'
import { AgentOutputPanel } from '../../output/AgentOutputPanel'

function readFocusedStep(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function RunLogsTabPage() {
  const { current_execution_id, status, react_steps, final_answer, termination_reason, error_message } = useExecutionStore()
  const tabs = useBuilderTabsStore((state) => state.tabs)
  const activeTabId = useBuilderTabsStore((state) => state.activeTabId)
  const setTabStateByType = useBuilderTabsStore((state) => state.setTabStateByType)
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs])
  const focusedStepIndex = readFocusedStep(activeTab?.params?.stepIndex)

  useEffect(() => {
    if (status === 'FAILED' || status === 'TERMINATED') {
      setTabStateByType('run_logs', { status: 'error', message: '运行失败，请查看详情' })
      return
    }
    if (status === 'PENDING' || status === 'RUNNING') {
      setTabStateByType('run_logs', { status: 'loading', message: '运行中' })
      return
    }
    if (current_execution_id === null) {
      setTabStateByType('run_logs', { status: 'idle', message: '暂无运行记录' })
      return
    }
    setTabStateByType('run_logs', { status: 'ready', message: '运行日志就绪' })
  }, [current_execution_id, setTabStateByType, status])

  if (current_execution_id === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-token-lg border border-dashed border-border bg-surface text-center">
        <Activity size={28} className="text-text-muted" />
        <p className="mt-2 text-sm font-medium text-text-main">暂无运行日志</p>
        <p className="mt-1 text-xs text-text-muted">发起一次构建后，这里会显示工具调用、思考过程和错误信息。</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="rounded-token-md border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-text-muted">Run ID</p>
            <p className="text-sm font-semibold text-text-main">{current_execution_id}</p>
          </div>
          <div className="text-xs text-text-sub">状态：{status}</div>
        </div>
        {(status === 'FAILED' || status === 'TERMINATED') && (error_message || termination_reason) ? (
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-error">
            <AlertTriangle size={13} />
            {error_message ?? termination_reason}
          </div>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
        <div className="min-h-0 overflow-hidden">
          <ReActDebugPanel
            react_steps={react_steps}
            status={status}
            final_answer={final_answer}
            termination_reason={termination_reason}
            error_message={error_message}
            focusedStepIndex={focusedStepIndex}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <AgentOutputPanel final_answer={final_answer} />
        </div>
      </div>
    </div>
  )
}
