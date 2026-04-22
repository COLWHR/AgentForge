import { BugPlay } from 'lucide-react'

import { Badge } from '../../ui/Badge'
import type { ExecutionStatus, ExecutionStep } from '../../../features/execution/execution.types'
import { PanelSection } from '../shared/PanelSection'

interface ReActDebugPanelProps {
  react_steps: ExecutionStep[]
  status: ExecutionStatus
  termination_reason: string | null
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getThought(step: ExecutionStep): string {
  const raw = step as unknown as Record<string, unknown>
  const thought = raw.thought
  if (typeof thought === 'string') {
    return thought
  }
  const reasoning = raw.reasoning
  if (typeof reasoning === 'string') {
    return reasoning
  }
  return ''
}

export function ReActDebugPanel({ react_steps, status, termination_reason }: ReActDebugPanelProps) {
  return (
    <PanelSection title="ReAct Debug" icon={<BugPlay size={16} />} className="flex-1">
      <div className="flex h-full flex-col gap-3 p-4">
        {status === 'FAILED' && (
          <div className="rounded-token-md border border-error bg-error-soft p-3 text-sm text-error">
            {termination_reason ?? ''}
          </div>
        )}

        {react_steps.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-text-muted">No ReAct Steps</div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-auto">
            {react_steps.map((step) => (
              <div key={step.step_index} className="rounded-token-md border border-border bg-surface p-3 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-text-main">Step {step.step_index}</span>
                  <Badge variant="info">ReAct</Badge>
                </div>
                <div className="space-y-2 text-text-sub">
                  <div>
                    <span className="font-medium text-text-main">Thought: </span>
                    <span className="whitespace-pre-wrap">{getThought(step)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-text-main">Action: </span>
                    <span>{step.action?.tool_id ?? ''}</span>
                  </div>
                  <div>
                    <span className="font-medium text-text-main">Action Input: </span>
                    <pre className="mt-1 whitespace-pre-wrap rounded-token-sm border border-border bg-bg-soft p-2">
                      {stringifyValue(step.action?.arguments ?? null)}
                    </pre>
                  </div>
                  <div>
                    <span className="font-medium text-text-main">Observation: </span>
                    <pre className="mt-1 whitespace-pre-wrap rounded-token-sm border border-border bg-bg-soft p-2">
                      {stringifyValue(step.observation)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelSection>
  )
}
