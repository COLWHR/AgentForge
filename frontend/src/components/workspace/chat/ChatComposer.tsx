import { useCallback, useEffect, useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'

import { useAgentStore } from '../../../features/agent/agent.store'
import { executionAdapter } from '../../../features/execution/execution.adapter'
import { RUN_AGENT_TRIGGER_EVENT } from '../../../features/execution/execution.events'
import { useExecutionStore } from '../../../features/execution/execution.store'
import { Button } from '../../ui/Button'

export function ChatComposer() {
  const [input, setInput] = useState('')
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const agentContextStatus = useAgentStore((state) => state.agent_context_status)
  const executionStatus = useExecutionStore((state) => state.status)
  const isExecutionLocked = executionStatus === 'PENDING' || executionStatus === 'RUNNING'
  const isAgentReady = currentAgentId !== null && currentAgentDetail !== null && agentContextStatus === 'READY'
  const isDisabled = !isAgentReady || isExecutionLocked

  const submitExecution = useCallback(async () => {
    if (isDisabled || currentAgentId === null) {
      return
    }

    const normalizedInput = input.trim()
    if (normalizedInput.length === 0) {
      return
    }

    const response = await executionAdapter.startExecution(currentAgentId, normalizedInput)
    if (response !== null) {
      setInput('')
    }
  }, [currentAgentId, input, isDisabled])

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
        className="w-full resize-none bg-transparent py-1 text-sm text-text-main placeholder:text-text-muted focus:outline-none"
        rows={2}
        placeholder={isAgentReady ? '请输入本次执行任务' : '当前 Agent 未就绪，暂不可输入'}
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
