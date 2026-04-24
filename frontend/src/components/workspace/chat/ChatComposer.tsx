import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'

import { useAgentStore } from '../../../features/agent/agent.store'
import { executionAdapter } from '../../../features/execution/execution.adapter'
import { RUN_AGENT_TRIGGER_EVENT } from '../../../features/execution/execution.events'
import { useExecutionStore } from '../../../features/execution/execution.store'
import { notify } from '../../../features/notifications/notify'
import { Button } from '../../ui/Button'

export function ChatComposer() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const agentContextStatus = useAgentStore((state) => state.agent_context_status)
  const executionStatus = useExecutionStore((state) => state.status)
  const isExecutionLocked = executionStatus === 'PENDING' || executionStatus === 'RUNNING'
  const isAgentAvailable = currentAgentDetail !== null && currentAgentDetail.is_available
  const isAgentReady = currentAgentId !== null && isAgentAvailable && agentContextStatus === 'READY'
  const isDisabled = !isAgentReady || isExecutionLocked
  const unavailableReason = currentAgentDetail?.availability_reason
  const disabledHint =
    currentAgentId === null
      ? '请先选择或创建一个可用智能体'
      : !isAgentAvailable
        ? `该智能体当前不可用${unavailableReason ? `：${unavailableReason}` : ''}`
        : '当前智能体未就绪，暂不可输入'

  const submitExecution = useCallback(async () => {
    if (isDisabled || currentAgentId === null) {
      if (!isAgentReady) {
        notify.warning(disabledHint)
      }
      return
    }

    const normalizedInput = input.trim()
    if (normalizedInput.length === 0) {
      notify.warning('请输入任务指令后再运行')
      textareaRef.current?.focus()
      return
    }

    const response = await executionAdapter.startExecution(currentAgentId, normalizedInput)
    if (response !== null) {
      setInput('')
    }
  }, [currentAgentId, disabledHint, input, isDisabled, isAgentReady])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleRunAgentTrigger = () => {
      void submitExecution()
    }

    window.addEventListener(RUN_AGENT_TRIGGER_EVENT, handleRunAgentTrigger)
    return () => {
      window.removeEventListener(RUN_AGENT_TRIGGER_EVENT, handleRunAgentTrigger)
    }
  }, [submitExecution])

  return (
    <div className="flex flex-col gap-2 rounded-token-md border border-border bg-bg px-3 py-2 shadow-token-sm transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50">
      <textarea
        ref={textareaRef}
        className="w-full resize-none bg-transparent py-1 text-sm text-text-main placeholder:text-text-muted focus:outline-none"
        rows={2}
        placeholder={isAgentReady ? '请输入本次执行任务' : disabledHint}
        disabled={isDisabled}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submitExecution()
          }
        }}
      />
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="attach file" disabled={isDisabled}>
            <Paperclip size={14} className="text-text-muted" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="voice input" disabled={isDisabled}>
            <Mic size={14} className="text-text-muted" />
          </Button>
        </div>
        <Button
          variant="primary"
          size="icon"
          aria-label="send message"
          className="h-6 w-6 rounded-token-md"
          disabled={isDisabled}
          onClick={() => {
            void submitExecution()
          }}
        >
          <Send size={12} className="text-white" />
        </Button>
      </div>
    </div>
  )
}
