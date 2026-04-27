import { useState } from 'react'
import { Brain, Database, History, Maximize2, MessageSquarePlus, Minimize2, Trash2, Wrench } from 'lucide-react'

import { useAgentStore } from '../../../features/agent/agent.store'
import { executionAdapter } from '../../../features/execution/execution.adapter'
import { getAssistantPlaceholder, getLiveExecutionStage } from '../../../features/execution/execution.presentation'
import { useExecutionStore } from '../../../features/execution/execution.store'
import type { ConversationMessage, ConversationSession, ExecutionStatus } from '../../../features/execution/execution.types'
import { notify } from '../../../features/notifications/notify'
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

function previousUserInput(messages: ConversationMessage[], index: number): string | null {
  for (let current = index - 1; current >= 0; current -= 1) {
    const message = messages[current]
    if (message.role === 'user' && message.content.trim().length > 0) {
      return message.content.trim()
    }
  }
  return null
}

function stageIcon(label: string) {
  if (label.includes('知识库')) return <Database size={14} className="text-primary" />
  if (label.includes('工具')) return <Wrench size={14} className="text-primary" />
  return <Brain size={14} className="text-primary" />
}

function formatConversationTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function conversationSummary(session: ConversationSession): string {
  const lastMeaningfulMessage = session.conversation_messages
    .slice()
    .reverse()
    .find((message) => message.content.trim().length > 0 && message.source !== 'opening')

  if (lastMeaningfulMessage === undefined) {
    return '新建对话'
  }

  const prefix = lastMeaningfulMessage.role === 'user' ? '你' : '预览'
  const content = lastMeaningfulMessage.content.replace(/\s+/g, ' ').trim()
  const compactContent = content.length > 28 ? `${content.slice(0, 28).trim()}...` : content
  return `${prefix}：${compactContent}`
}

export function CopilotPanel() {
  const rightPanelWidth = useUiShellStore((state) => state.rightPanelWidth)
  const leftPanelWidth = useUiShellStore((state) => state.leftPanelWidth)
  const currentAgentId = useAgentStore((state) => state.current_agent_id)
  const currentAgentDetail = useAgentStore((state) => state.current_agent_detail)
  const {
    current_execution_id,
    is_execution_starting,
    status,
    final_answer,
    error_message,
    termination_reason,
    last_user_input,
    conversation_messages,
    conversation_messages_hidden,
    conversation_cleared_execution_id,
    conversation_sessions,
    active_conversation_id,
    clearConversationMessages,
    createConversationSession,
    selectConversationSession,
    deleteConversationSession,
    step_logs,
  } =
    useExecutionStore()
  const [isPanelMaximized, setIsPanelMaximized] = useState(false)
  const [isHistoryVisible, setIsHistoryVisible] = useState(false)

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
  const canManageSessions = !is_execution_starting && status !== 'PENDING' && status !== 'RUNNING'

  const handleClearConversation = () => {
    clearConversationMessages(currentAgentId, currentAgentDetail?.opening_statement ?? null)
  }

  const handleCreateConversation = () => {
    if (currentAgentId === null) {
      notify.warning('请先选择一个可用智能体')
      return
    }
    createConversationSession(currentAgentId, currentAgentDetail?.opening_statement ?? null)
  }

  const handleSelectConversation = (sessionId: string) => {
    if (!canManageSessions) {
      notify.info('当前对话执行中，完成后再切换历史')
      return
    }
    selectConversationSession(sessionId)
  }

  const handleDeleteConversation = (sessionId: string) => {
    if (!canManageSessions) {
      notify.info('当前对话执行中，完成后再删除历史')
      return
    }
    deleteConversationSession(sessionId, currentAgentId, currentAgentDetail?.opening_statement ?? null)
  }

  const handleToggleMaximize = () => {
    setIsPanelMaximized((current) => !current)
  }
  const handleRegenerate = (input: string | null) => {
    if (currentAgentId === null || input === null) {
      notify.warning('没有可重新生成的用户输入')
      return
    }
    void executionAdapter.startExecution(currentAgentId, input)
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
            onClick={handleCreateConversation}
            disabled={!canManageSessions || currentAgentId === null}
            aria-label="新建对话"
            title="新建对话"
          >
            <MessageSquarePlus size={16} className="text-text-muted" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsHistoryVisible((current) => !current)}
            aria-label={isHistoryVisible ? '隐藏历史' : '显示历史'}
            title={isHistoryVisible ? '隐藏历史' : '显示历史'}
          >
            <History size={16} className={cn('text-text-muted', isHistoryVisible && 'text-primary')} />
          </Button>
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

      {isHistoryVisible ? (
        <div className="shrink-0 border-b border-border bg-bg-soft/30 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-sub">历史对话</span>
            <span className="text-[11px] text-text-muted">{conversation_sessions.length} 条</span>
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {conversation_sessions.map((session) => {
              const isActive = session.id === active_conversation_id
              return (
                <div
                  key={session.id}
                  className={cn(
                    'flex items-start gap-2 rounded-token-md border px-2.5 py-2 transition-colors',
                    isActive ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface',
                  )}
                >
                  <button
                    type="button"
                    disabled={!canManageSessions}
                    className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleSelectConversation(session.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-main">{session.title}</span>
                      {isActive ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">当前</span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-text-sub">{conversationSummary(session)}</p>
                    <p className="mt-1 text-[11px] text-text-muted">{formatConversationTimestamp(session.updated_at)}</p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleDeleteConversation(session.id)}
                    disabled={!canManageSessions}
                    aria-label="删除历史对话"
                    title="删除历史对话"
                  >
                    <Trash2 size={14} className="text-text-muted" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

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
            {conversation_messages.map((message, index) => {
              const regenerateInput = message.role === 'assistant' ? previousUserInput(conversation_messages, index) : null
              return (
                <MessageBubbleRich
                  key={message.id}
                  role={message.role}
                  compact={compact}
                  badge={message.knowledge_badge ?? null}
                  tone={message.source === 'opening' || message.source === 'activity' ? 'muted' : 'normal'}
                  content={renderMessageContent(message, compact)}
                  contentText={message.content}
                  status={message.status}
                  onRegenerate={message.role === 'assistant' && regenerateInput !== null ? () => handleRegenerate(regenerateInput) : undefined}
                />
              )
            })}
            {shouldShowLiveAssistant ? (
              <MessageBubbleRich
                role="assistant"
                compact={compact}
                content={<RichContentRenderer content={liveContent} compact={compact} />}
                contentText={liveContent}
                status={status}
                onRegenerate={() => handleRegenerate(last_user_input)}
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
