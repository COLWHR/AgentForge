import { Brain, Database, ExternalLink, MessageSquareText, Wrench } from 'lucide-react'
import { useEffect, useMemo, type ReactNode } from 'react'

import { getAssistantPlaceholder, getLiveExecutionStage } from '../../../../features/execution/execution.presentation'
import { useExecutionStore } from '../../../../features/execution/execution.store'
import type { ConversationMessage, ExecutionStatus } from '../../../../features/execution/execution.types'
import { useBuilderTabsStore } from '../../../../features/ui-shell/builderTabs.store'
import { Badge } from '../../../ui/Badge'
import { Button } from '../../../ui/Button'
import { MessageBubbleRich } from '../../chat/MessageBubbleRich'
import { RichContentRenderer } from '../../rich-content/RichContentRenderer'

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  IDLE: '空闲',
  PENDING: '准备中',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  TERMINATED: '已中断',
}

function assistantPreviewContent(status: ExecutionStatus, finalAnswer: string | null, errorMessage: string | null, terminationReason: string | null): string | null {
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

function renderMessageContent(message: ConversationMessage) {
  if (message.role === 'assistant') {
    return <RichContentRenderer content={message.content} />
  }
  return <span className="whitespace-pre-wrap break-words">{message.content}</span>
}

function stageIcon(label: string) {
  if (label.includes('知识库')) return <Database size={14} className="text-primary" />
  if (label.includes('工具')) return <Wrench size={14} className="text-primary" />
  return <Brain size={14} className="text-primary" />
}

export function PreviewTabPage() {
  const { current_execution_id, status, final_answer, error_message, termination_reason, preview_url, conversation_messages, conversation_cleared_execution_id, step_logs } =
    useExecutionStore()
  const openRunLogsTab = useBuilderTabsStore((state) => state.openRunLogsTab)
  const setTabStateByType = useBuilderTabsStore((state) => state.setTabStateByType)
  const liveStage = useMemo(() => getLiveExecutionStage(status, step_logs), [status, step_logs])
  const liveContent = useMemo(() => {
    const staticContent = assistantPreviewContent(status, final_answer, error_message, termination_reason)
    if (staticContent !== null) {
      return staticContent
    }
    if (status === 'PENDING' || status === 'RUNNING') {
      return getAssistantPlaceholder(status, step_logs)
    }
    return null
  }, [status, final_answer, error_message, termination_reason, step_logs])
  const hasLiveContentInHistory =
    liveContent !== null &&
    conversation_messages.some((message) => message.role === 'assistant' && message.content === liveContent)
  const isCurrentExecutionCleared = current_execution_id !== null && conversation_cleared_execution_id === current_execution_id
  const shouldShowLiveAssistant = liveContent !== null && !hasLiveContentInHistory && !isCurrentExecutionCleared
  const hasConversation = conversation_messages.length > 0 || shouldShowLiveAssistant

  useEffect(() => {
    setTabStateByType('preview', {
      status: status === 'FAILED' || status === 'TERMINATED' ? 'error' : status === 'PENDING' || status === 'RUNNING' ? 'loading' : hasConversation ? 'ready' : 'idle',
      message: hasConversation ? '对话已更新' : '暂无交流内容',
    })
  }, [hasConversation, setTabStateByType, status])

  let body: ReactNode
  if (!hasConversation) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-token-md border border-dashed border-border bg-bg-soft/30 px-6 text-center">
        <MessageSquareText size={28} className="text-primary" />
        <p className="text-base font-semibold text-text-main">暂无交流测试内容</p>
        <p className="max-w-xl text-sm text-text-sub">在右侧对话预览输入测试消息后，这里会展示用户与对话预览的气泡对话。</p>
      </div>
    )
  } else {
    body = (
      <div className="h-full overflow-auto rounded-token-md border border-border bg-bg-soft/30 p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {liveStage ? (
            <div className="rounded-token-md border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
                {stageIcon(liveStage.label)}
                <span>{liveStage.label}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-sub">{liveStage.description}</p>
            </div>
          ) : null}
          {conversation_messages.map((message) => (
            <MessageBubbleRich
              key={message.id}
              role={message.role}
              badge={message.knowledge_badge ?? null}
              tone={message.source === 'opening' || message.source === 'activity' ? 'muted' : 'normal'}
              content={renderMessageContent(message)}
            />
          ))}
          {shouldShowLiveAssistant ? (
            <MessageBubbleRich role="assistant" content={<RichContentRenderer content={liveContent} />} />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-token-md border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-xs text-text-muted">预览</p>
          <p className="text-sm font-semibold text-text-main">用户与对话预览测试对话</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === 'FAILED' || status === 'TERMINATED' ? 'error' : status === 'SUCCEEDED' ? 'success' : 'info'}>
            {STATUS_LABEL[status]}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => openRunLogsTab({ executionId: current_execution_id, stepIndex: null })}>
            查看运行日志
          </Button>
          {preview_url ? (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<ExternalLink size={14} />}
              onClick={() => window.open(preview_url, '_blank', 'noopener,noreferrer')}
            >
              打开沙箱页面
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
    </div>
  )
}
