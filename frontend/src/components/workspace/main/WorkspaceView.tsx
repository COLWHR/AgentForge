import type { ReactNode } from 'react'

import { useExecutionStore } from '../../../features/execution/execution.store'
import { AgentOutputPanel } from '../output/AgentOutputPanel'
import { ReActDebugPanel } from '../debug/ReActDebugPanel'
import { StatusStrip } from '../status/StatusStrip'
import { ContextHeader } from './ContextHeader'

function EmptyState() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-token-lg border border-dashed border-border bg-surface text-sm text-text-muted">
      No Execution Yet
    </div>
  )
}

function TerminationNotice() {
  return (
    <div className="rounded-token-lg border border-warning bg-warning-soft p-3 text-sm text-warning">
      Execution Terminated
    </div>
  )
}

export function WorkspaceView() {
  const { current_execution_id, status, final_answer, react_steps, termination_reason } = useExecutionStore()

  let content: ReactNode
  if (current_execution_id === null && status !== 'IDLE') {
    content = <EmptyState />
  } else if (current_execution_id === null) {
    content = <EmptyState />
  } else if (status === 'PENDING') {
    content = <StatusStrip status="PENDING" />
  } else if (status === 'RUNNING') {
    content = (
      <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
        <StatusStrip status="RUNNING" />
        <ReActDebugPanel react_steps={react_steps} status={status} termination_reason={termination_reason} />
      </div>
    )
  } else if (status === 'SUCCEEDED') {
    content = (
      <div className="flex h-full w-full gap-4 overflow-hidden">
        <div className="flex w-1/2 flex-col overflow-hidden">
          <ReActDebugPanel react_steps={react_steps} status={status} termination_reason={termination_reason} />
        </div>
        <div className="flex w-1/2 flex-col overflow-hidden">
          <AgentOutputPanel final_answer={final_answer} />
        </div>
      </div>
    )
  } else if (status === 'FAILED') {
    content = (
      <ReActDebugPanel react_steps={react_steps} status={status} termination_reason={termination_reason} />
    )
  } else {
    content = (
      <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
        <TerminationNotice />
        {final_answer !== null && final_answer.trim().length > 0 ? (
          <AgentOutputPanel final_answer={final_answer} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ContextHeader />

      <div className="flex flex-1 flex-col overflow-hidden bg-bg p-4 md:p-6">
        <div className="flex h-full gap-4 overflow-hidden">{content}</div>
      </div>
    </div>
  )
}
