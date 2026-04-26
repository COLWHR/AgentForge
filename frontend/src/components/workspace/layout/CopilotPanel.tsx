import { useState } from 'react'
import { Brain, Database, Maximize2, Minimize2, Trash2, Wrench } from 'lucide-react'

import { useAgentStore } from '../../../features/agent/agent.store'
import { getAssistantPlaceholder, getLiveExecutionStage } from '../../../features/execution/execution.presentation'
import { useExecutionStore } from '../../../features/execution/execution.store'
import type { ConversationMessage, ExecutionStatus } from '../../../features/execution/execution.types'
import { useUiShellStore } from '../../../features/ui-shell/uiShell.store'
import { cn } from '../../../lib/cn'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ChatComposer } from '../chat/ChatComposer'
import { MessageBubbleRich } from '../chat/MessageBubbleRich'
import { RichContentRenderer } from '../rich-content/RichContentRenderer'

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  IDLE: '空闲',
  PENDING: '准备中',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  TERMINATED: '已中断',
}

function liveAssistantContent(status: ExecutionStatus, finalAnswer: string | null, errorMessage: string | null, terminationReason: string | null): string | null {
  if (finalAnswer !== null && finalAnswer.trim().length > 0) {
    return finalAnswer
  }
  if (status === 'PENDING' || status === 'RUNNING') {
    return null
  }
  if (status === 'FAILED' || status === 'TERMINATED') {
    return errorMessage ?? terminationReason ?? '本次执行未能完成，请查看运行日志。'
  }
  return null
}

function renderMessageContent(message: ConversationMessage, compact: boolean) {
  if (message.role === 'assistant') {
    return <RichContentRenderer content={message.content} compact={compact} />
  }
  return <span className="whitespace-pre-wrap break-words">{message.content}</span>
}

function stageIcon(label: string) {
  if (label.includes('知识库')) return <Database size={14} className="text-primary" />
  if (label.includes('工具')) return <Wrench size={14} className="text-primary" />
  return <Brain size={14} className="text-primary" />
}

export function CopilotPanel() {
  const rightPanelWidth = useUiShellStore((state) => state.rightPanelWidth)
  const leftPanelWidth = useUiShellStore((state) => state.leftPanelWidth)
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const { current_execution_id, status, final_answer, error_message, termination_reason, conversation_messages, conversation_messages_hidden, conversation_cleared_execution_id, clearConversationMessages, step_logs } =
    useExecutionStore()
  const [isPanelMaximized, setIsPanelMaximized] = useState(false)

  const compact = !isPanelMaximized && rightPanelWidth <= 360
  const liveStage = conversation_messages_hidden ? null : getLiveExecutionStage(status, step_logs)
  const liveContent = conversation_messages_hidden
    ? null
    : liveAssistantContent(status, final_answer, error_message, termination_reason) ?? (status === 'PENDING' || status === 'RUNNING' ? getAssistantPlaceholder(status, step_logs) : null)
  const isCurrentExecutionCleared = current_execution_id !== null && conversation_cleared_execution_id === current_execution_id
  const hasLiveContentInHistory =
    liveContent !== null &&
    conversation_messages.some((message) => message.role === 'assistant' && message.content === liveContent)
  const shouldShowLiveAssistant = liveContent !== null && !hasLiveContentInHistory && !isCurrentExecutionCleared
  const hasConversation = conversation_messages.length > 0 || shouldShowLiveAssistant
  const canClearConversation = hasConversation && status !== 'PENDING' && status !== 'RUNNING'
  const handleClearConversation = () => {
    clearConversationMessages(currentAgentId, currentAgentDetail?.opening_statement ?? null)
  }
  const handleToggleMaximize = () => {
    setIsPanelMaximized((current) => !current)
  }

  return (
    <aside
      style={isPanelMaximized ? { left: leftPanelWidth } : { width: rightPanelWidth }}
      className={cn(
        'flex h-full shrink-0 flex-col border-l border-border bg-surface transition-all duration-300',
        isPanelMaximized && 'fixed inset-y-0 right-0 z-50 shadow-token-lg',
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 font-semibold text-text-main">
          <span className="truncate">对话预览</span>
          <Badge variant={status === 'FAILED' || status === 'TERMINATED' ? 'error' : status === 'SUCCEEDED' ? 'success' : 'info'}>
            {STATUS_LABEL[status]}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearConversation}
            disabled={!canClearConversation}
            aria-label="清空聊天"
            title="清空聊天"
          >
            <Trash2 size={16} className="text-text-muted" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleMaximize}
            aria-label={isPanelMaximized ? '还原面板' : '放大面板'}
            title={isPanelMaximized ? '还原面板' : '放大面板'}
          >
            {isPanelMaximized ? (
              <Minimize2 size={16} className="text-text-muted" />
            ) : (
              <Maximize2 size={16} className="text-text-muted" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!hasConversation ? (
          <div className="flex h-full min-h-24 items-center justify-center rounded-token-md border border-dashed border-border px-4 text-center text-sm leading-relaxed text-text-muted">
            暂无交流内容。输入测试消息后，这里会以气泡形式展示用户与对话预览的对话。
          </div>
        ) : (
          <div className="space-y-4">
            {liveStage ? (
              <div className="rounded-token-md border border-primary/20 bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-text-main">
                  {stageIcon(liveStage.label)}
                  <span>{liveStage.label}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-text-sub">{liveStage.description}</p>
              </div>
            ) : null}
            {conversation_messages.map((message) => (
              <MessageBubbleRich
                key={message.id}
                role={message.role}
                compact={compact}
                badge={message.knowledge_badge ?? null}
                tone={message.source === 'opening' || message.source === 'activity' ? 'muted' : 'normal'}
                content={renderMessageContent(message, compact)}
              />
            ))}
            {shouldShowLiveAssistant ? (
              <MessageBubbleRich
                role="assistant"
                compact={compact}
                content={<RichContentRenderer content={liveContent} compact={compact} />}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface p-4">
        <ChatComposer />
      </div>
    </aside>
  )
}
