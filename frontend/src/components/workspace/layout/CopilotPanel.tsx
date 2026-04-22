import { Maximize2, MoreHorizontal, X } from 'lucide-react'

import { useExecutionStore } from '../../../features/execution/execution.store'
import type { ExecutionStep } from '../../../features/execution/execution.types'
import { useUiShellStore } from '../../../features/ui-shell/uiShell.store'
import { cn } from '../../../lib/cn'
import { Button } from '../../ui/Button'
import { ChatComposer } from '../chat/ChatComposer'
import { MessageBubbleRich } from '../chat/MessageBubbleRich'

interface CopilotMessage {
  id: string
  content: string
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

function getStepThought(step: ExecutionStep): string {
  const raw = step as unknown as Record<string, unknown>
  if (typeof raw.thought === 'string') {
    return raw.thought
  }
  if (typeof raw.reasoning === 'string') {
    return raw.reasoning
  }
  return ''
}

function formatStepMessage(step: ExecutionStep): string {
  const thought = getStepThought(step)
  const actionToolId = step.action?.tool_id ?? ''
  const actionArguments = stringifyValue(step.action?.arguments ?? null)
  const observation = stringifyValue(step.observation)

  return [
    `Step ${step.step_index}`,
    thought.length > 0 ? `Thought: ${thought}` : null,
    `Action: ${actionToolId}`,
    `Action Input: ${actionArguments}`,
    `Observation: ${observation}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function CopilotPanel() {
  const rightPanelWidth = useUiShellStore((state) => state.rightPanelWidth)
  const toggleRightPanel = useUiShellStore((state) => state.toggleRightPanel)
  const { current_execution_id, status, final_answer, react_steps, termination_reason } = useExecutionStore()

  const messages: CopilotMessage[] = []

  if (current_execution_id !== null) {
    messages.push({
      id: 'status',
      content: `状态：${status}`,
    })

    if (status === 'PENDING' || status === 'RUNNING') {
      react_steps.forEach((step) => {
        messages.push({
          id: `step-${step.step_index}`,
          content: formatStepMessage(step),
        })
      })
    } else if (status === 'SUCCEEDED') {
      react_steps.forEach((step) => {
        messages.push({
          id: `step-${step.step_index}`,
          content: formatStepMessage(step),
        })
      })
      if (final_answer !== null && final_answer.trim().length > 0) {
        messages.push({
          id: 'final-answer',
          content: final_answer,
        })
      }
    } else if (status === 'FAILED') {
      react_steps.forEach((step) => {
        messages.push({
          id: `step-${step.step_index}`,
          content: formatStepMessage(step),
        })
      })
      if (termination_reason !== null && termination_reason.trim().length > 0) {
        messages.push({
          id: 'termination-reason',
          content: termination_reason,
        })
      }
    } else if (status === 'TERMINATED') {
      if (termination_reason !== null && termination_reason.trim().length > 0) {
        messages.push({
          id: 'termination-reason',
          content: termination_reason,
        })
      }
      if (final_answer !== null && final_answer.trim().length > 0) {
        messages.push({
          id: 'final-answer',
          content: final_answer,
        })
      }
    }
  }

  return (
    <aside
      style={{ width: rightPanelWidth }}
      className={cn(
        'flex h-full shrink-0 flex-col border-l border-border bg-surface transition-all duration-300',
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 font-semibold text-text-main">
          <span>AI Copilot</span>
          <span className="rounded-token-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">v1.0</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="options">
            <MoreHorizontal size={16} className="text-text-muted" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="expand">
            <Maximize2 size={16} className="text-text-muted" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleRightPanel} aria-label="close panel">
            <X size={16} className="text-text-muted" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 p-4">
        {current_execution_id === null ? (
          <div className="flex h-full min-h-24 items-center justify-center rounded-token-md border border-dashed border-border px-4 text-sm text-text-muted">
            当前暂无执行内容
          </div>
        ) : (
          messages.map((message) => <MessageBubbleRich key={message.id} role="assistant" content={message.content} />)
        )}
      </div>

      <div className="shrink-0 border-t border-border p-4 bg-surface">
        <ChatComposer />
      </div>
    </aside>
  )
}
