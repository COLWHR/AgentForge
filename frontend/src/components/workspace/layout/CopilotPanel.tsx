import { AlertCircle, CheckCircle2, ExternalLink, Maximize2, MoreHorizontal, X } from 'lucide-react'
import { useMemo } from 'react'

import { useExecutionStore } from '../../../features/execution/execution.store'
import type { PreviewPhase } from '../../../features/execution/execution.types'
import { useBuilderTabsStore } from '../../../features/ui-shell/builderTabs.store'
import { useUiShellStore } from '../../../features/ui-shell/uiShell.store'
import { cn } from '../../../lib/cn'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ChatComposer } from '../chat/ChatComposer'
import { MessageBubbleRich } from '../chat/MessageBubbleRich'
import { RichContentRenderer } from '../rich-content/RichContentRenderer'
import { SkillCallBox } from '../chat/SkillCallBox'
import { ThoughtCollapsibleBlock } from '../copilot/timeline/ThoughtCollapsibleBlock'
import { mapExecutionToTimeline } from '../copilot/timeline/mapExecutionToTimeline'
import type { TimelineItem } from '../copilot/timeline/timeline.types'

const STATUS_LABEL: Record<string, string> = {
  IDLE: '空闲',
  PENDING: '初始化中',
  RUNNING: '执行中',
  SUCCEEDED: '执行完成',
  FAILED: '执行失败',
  TERMINATED: '执行中断',
}

function phaseFromStatus(status: string, phase: PreviewPhase | null): PreviewPhase {
  if (phase !== null) {
    return phase
  }
  if (status === 'IDLE') return 'empty'
  if (status === 'PENDING') return 'planning'
  if (status === 'RUNNING') return 'building'
  if (status === 'SUCCEEDED') return 'ready'
  return 'failed'
}

export function CopilotPanel() {
  const rightPanelWidth = useUiShellStore((state) => state.rightPanelWidth)
  const toggleRightPanel = useUiShellStore((state) => state.toggleRightPanel)
  const {
    current_execution_id,
    status,
    final_answer,
    error_code,
    error_source,
    error_message,
    react_steps,
    termination_reason,
    artifacts,
    preview_url,
    preview_phase,
    deployment_status,
    last_user_input,
  } = useExecutionStore()
  const openRunLogsTab = useBuilderTabsStore((state) => state.openRunLogsTab)
  const openCapabilityTab = useBuilderTabsStore((state) => state.openCapabilityTab)

  const compact = rightPanelWidth <= 360
  const timeline = useMemo(
    () =>
      mapExecutionToTimeline({
        currentExecutionId: current_execution_id,
        status,
        reactSteps: react_steps,
        finalAnswer: final_answer,
        errorCode: error_code,
        errorSource: error_source,
        errorMessage: error_message,
        terminationReason: termination_reason,
        artifacts,
      }),
    [
      artifacts,
      current_execution_id,
      error_code,
      error_message,
      error_source,
      final_answer,
      react_steps,
      status,
      termination_reason,
    ],
  )

  const toolCallCount = react_steps.filter((step) => step.action !== null).length
  const skillCallCount = react_steps.filter((step) => (step.action?.tool_id ?? '').toLowerCase().includes('skill')).length
  const currentPhase = phaseFromStatus(status, preview_phase)
  const progressLabel =
    status === 'RUNNING' || status === 'PENDING'
      ? `执行中 · 已完成 ${react_steps.length} 步`
      : status === 'SUCCEEDED'
        ? `执行完成 · 共 ${react_steps.length} 步`
        : status === 'FAILED' || status === 'TERMINATED'
          ? `执行异常 · 已记录 ${react_steps.length} 步`
          : '等待执行'

  const renderTimelineItem = (item: TimelineItem) => {
    if (item.type === 'status') {
      return (
        <div className="rounded-token-md border border-border bg-bg-soft/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-main">执行状态</span>
            <Badge variant={item.status === 'FAILED' ? 'error' : item.status === 'SUCCEEDED' ? 'success' : 'info'}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Badge>
          </div>
        </div>
      )
    }

    if (item.type === 'thought') {
      return (
        <ThoughtCollapsibleBlock
          thought={item.thought}
          stepIndex={item.stepIndex}
          defaultExpanded={item.defaultExpanded}
        />
      )
    }

    if (item.type === 'action') {
      return (
        <SkillCallBox
          toolId={item.toolId}
          argsSummary={item.argsSummary}
          status={item.status}
          detailsLabel="查看运行日志详情"
          onViewDetails={() => openRunLogsTab({ stepIndex: item.stepIndex, executionId: current_execution_id })}
        />
      )
    }

    if (item.type === 'observation') {
      return (
        <div className="space-y-2 rounded-token-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-main">Observation · Step {item.stepIndex}</span>
            <div className="flex items-center gap-1 text-[11px]">
              {item.ok ? <CheckCircle2 size={12} className="text-success" /> : <AlertCircle size={12} className="text-error" />}
              <span className={item.ok ? 'text-success' : 'text-error'}>{item.ok ? '成功' : '失败'}</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-text-sub">{item.summary}</p>
          {item.links.length > 0 ? (
            <div className="space-y-1 text-xs">
              {item.links.slice(0, 3).map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="block max-w-full truncate text-left text-primary underline-offset-2 hover:underline"
                  onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                >
                  {link.title}
                </button>
              ))}
            </div>
          ) : null}
          {item.files.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">文件产物</div>
              {item.files.map((file) => (
                <div key={file.id} className="rounded-token-sm border border-border bg-bg-soft/40 px-2 py-1 text-xs text-text-sub">
                  {file.title}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => openRunLogsTab({ stepIndex: item.stepIndex, executionId: current_execution_id })}
            >
              查看运行日志
            </Button>
          </div>
        </div>
      )
    }

    if (item.type === 'artifact') {
      return (
        <div className="space-y-2 rounded-token-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-main">文件变更产物</span>
            <span className="text-[11px] text-text-muted">
              {item.files.length} 项（原始 {item.rawCount}）
            </span>
          </div>
          {item.files.map((file) => (
            <div key={file.id} className="rounded-token-sm border border-border bg-bg-soft/40 px-2 py-1 text-xs text-text-sub">
              {file.title}
            </div>
          ))}
        </div>
      )
    }

    if (item.type === 'final_answer') {
      return (
        <div className="space-y-2 rounded-token-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-main">最终答复</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openRunLogsTab({ executionId: current_execution_id })}>
              查看运行日志
            </Button>
          </div>
          <RichContentRenderer content={item.content} compact={compact} />
        </div>
      )
    }

    return (
      <div className="rounded-token-md border border-error bg-error-soft p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-error">{item.title}</span>
          {item.code ? <Badge variant="error">{item.code}</Badge> : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-error">{item.message}</p>
        {item.source ? <p className="mt-1 text-[11px] text-error/90">来源：{item.source}</p> : null}
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] text-error hover:text-error"
            onClick={() => openRunLogsTab({ stepIndex: item.stepIndex ?? null, executionId: current_execution_id })}
          >
            查看运行日志
          </Button>
        </div>
      </div>
    )
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

      <div className="flex-1 overflow-y-auto p-4">
        {current_execution_id === null ? (
          <div className="flex h-full min-h-24 items-center justify-center rounded-token-md border border-dashed border-border px-4 text-sm text-text-muted">
            当前暂无执行内容
          </div>
        ) : (
          <MessageBubbleRich
            role="assistant"
            compact={compact}
            content={
              <div className="space-y-3">
                <div className="rounded-token-md border border-border bg-surface p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-text-main">云端构建概览</span>
                    <Badge variant={status === 'FAILED' ? 'error' : status === 'SUCCEEDED' ? 'success' : 'info'}>{STATUS_LABEL[status] ?? status}</Badge>
                  </div>
                  <div className="space-y-1 text-text-sub">
                    <p>用户需求：{last_user_input ?? '暂无输入'}</p>
                    <p>构建阶段：{currentPhase}</p>
                    <p>任务进度：{progressLabel}</p>
                    <p>工具调用：{toolCallCount} 次</p>
                    <p>技能调用：{skillCallCount} 次</p>
                    <p>沙箱状态：{currentPhase === 'ready' || currentPhase === 'deployed' ? '可用' : currentPhase === 'failed' ? '异常' : '处理中'}</p>
                    <p>预览 URL：{preview_url ?? '尚未生成'}</p>
                    <p>部署状态：{deployment_status}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openCapabilityTab('preview')}>
                      打开预览页
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openCapabilityTab('deploy')}>
                      打开部署页
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openRunLogsTab({ executionId: current_execution_id })}>
                      查看详情
                    </Button>
                    {preview_url ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        leftIcon={<ExternalLink size={11} />}
                        onClick={() => window.open(preview_url, '_blank', 'noopener,noreferrer')}
                      >
                        新窗口预览
                      </Button>
                    ) : null}
                  </div>
                </div>
                {timeline.map((item) => (
                  <div key={item.type === 'thought' ? `${item.id}:${status}` : item.id}>{renderTimelineItem(item)}</div>
                ))}
              </div>
            }
          />
        )}
      </div>

      <div className="shrink-0 border-t border-border p-4 bg-surface">
        <ChatComposer />
      </div>
    </aside>
  )
}
