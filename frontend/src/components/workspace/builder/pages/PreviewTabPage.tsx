import { AlertTriangle, ExternalLink, Loader2, Rocket, WandSparkles } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { useExecutionStore } from '../../../../features/execution/execution.store'
import type { PreviewPhase } from '../../../../features/execution/execution.types'
import { useBuilderTabsStore } from '../../../../features/ui-shell/builderTabs.store'
import { Button } from '../../../ui/Button'

function phaseStatus(phase: PreviewPhase): { title: string; description: string; state: 'idle' | 'loading' | 'ready' | 'error' } {
  if (phase === 'empty') {
    return { title: '等待构建需求', description: '请在右侧 Copilot 输入你的智能体需求，系统将在云端开始构建。', state: 'idle' }
  }
  if (phase === 'planning') {
    return { title: '正在规划', description: 'Copilot 正在拆解需求并生成构建计划。', state: 'loading' }
  }
  if (phase === 'building') {
    return { title: '正在构建', description: '云端沙箱正在生成应用产物。', state: 'loading' }
  }
  if (phase === 'booting') {
    return { title: '沙箱启动中', description: '构建完成，正在启动预览运行环境。', state: 'loading' }
  }
  if (phase === 'ready') {
    return { title: '预览已就绪', description: '你可以直接查看当前云端预览结果。', state: 'ready' }
  }
  if (phase === 'deployed') {
    return { title: '已部署', description: '部署完成，可通过公开链接访问。', state: 'ready' }
  }
  return { title: '构建失败', description: '构建失败，可查看运行日志定位错误并重试。', state: 'error' }
}

export function PreviewTabPage() {
  const { current_execution_id, status, error_message, preview_phase, preview_url, deployment_status, deployed_url } = useExecutionStore()
  const openRunLogsTab = useBuilderTabsStore((state) => state.openRunLogsTab)
  const setTabStateByType = useBuilderTabsStore((state) => state.setTabStateByType)
  const openCapabilityTab = useBuilderTabsStore((state) => state.openCapabilityTab)

  const phase: PreviewPhase =
    deployment_status === 'SUCCEEDED'
      ? 'deployed'
      : preview_phase ??
        (status === 'IDLE'
          ? 'empty'
          : status === 'PENDING'
            ? 'planning'
            : status === 'RUNNING'
              ? 'building'
              : status === 'SUCCEEDED'
                ? 'ready'
                : 'failed')
  const detail = phaseStatus(phase)

  useEffect(() => {
    setTabStateByType('preview', { status: detail.state, message: detail.description })
  }, [detail.description, detail.state, setTabStateByType])

  let body: ReactNode
  if (phase === 'ready' && preview_url) {
    body = (
      <iframe
        title="cloud-sandbox-preview"
        src={preview_url}
        className="h-full w-full rounded-token-md border border-border bg-white"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    )
  } else {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-token-md border border-dashed border-border bg-bg-soft/30 px-6 text-center">
        {detail.state === 'loading' ? (
          <Loader2 size={28} className="animate-spin text-primary" />
        ) : detail.state === 'error' ? (
          <AlertTriangle size={28} className="text-error" />
        ) : (
          <WandSparkles size={28} className="text-primary" />
        )}
        <p className="text-base font-semibold text-text-main">{detail.title}</p>
        <p className="max-w-xl text-sm text-text-sub">{detail.description}</p>
        {detail.state === 'error' ? <p className="text-xs text-error">{error_message ?? '请在运行日志中查看失败原因。'}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-token-md border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-xs text-text-muted">Cloud Builder Preview</p>
          <p className="text-sm font-semibold text-text-main">{detail.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => openRunLogsTab({ executionId: current_execution_id, stepIndex: null })}>
            查看运行日志
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Rocket size={14} />} onClick={() => openCapabilityTab('deploy')}>
            打开部署页
          </Button>
          {preview_url ? (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<ExternalLink size={14} />}
              onClick={() => window.open(preview_url, '_blank', 'noopener,noreferrer')}
            >
              新窗口预览
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
      {phase === 'deployed' && (deployed_url || preview_url) ? (
        <div className="rounded-token-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          已部署成功：{deployed_url ?? preview_url}
        </div>
      ) : null}
    </div>
  )
}
