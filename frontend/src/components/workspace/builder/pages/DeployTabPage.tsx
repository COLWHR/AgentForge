import { CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react'

import { useExecutionStore } from '../../../../features/execution/execution.store'
import { useBuilderTabsStore } from '../../../../features/ui-shell/builderTabs.store'
import { Button } from '../../../ui/Button'

export function DeployTabPage() {
  const { deployment_status, deployed_url, setDeploymentState, setPreviewPhase, preview_url } = useExecutionStore()
  const setTabStateByType = useBuilderTabsStore((state) => state.setTabStateByType)

  const statusView =
    deployment_status === 'PENDING'
      ? { text: '部署中', icon: <Loader2 size={14} className="animate-spin" />, className: 'text-info' }
      : deployment_status === 'SUCCEEDED'
        ? { text: '已部署', icon: <CheckCircle2 size={14} />, className: 'text-success' }
        : deployment_status === 'FAILED'
          ? { text: '部署失败', icon: <XCircle size={14} />, className: 'text-error' }
          : { text: '未部署', icon: <Rocket size={14} />, className: 'text-text-sub' }

  return (
    <div className="h-full overflow-auto rounded-token-lg border border-border bg-surface p-5">
      <div className="max-w-4xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text-main">部署</h2>
          <p className="mt-1 text-sm text-text-sub">发布当前云端构建结果，并生成可分享链接。</p>
        </div>
        <div className="rounded-token-md border border-border bg-bg-soft/40 p-4">
          <div className={`inline-flex items-center gap-1 text-sm font-medium ${statusView.className}`}>
            {statusView.icon}
            {statusView.text}
          </div>
          {deployed_url ? <p className="mt-2 break-all text-sm text-text-main">{deployed_url}</p> : null}
          {!deployed_url && preview_url ? (
            <p className="mt-2 text-xs text-text-muted">当前可用预览链接：{preview_url}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Rocket size={14} />}
            onClick={() => {
              setDeploymentState('PENDING')
              setPreviewPhase('booting')
              setTabStateByType('deploy', { status: 'loading', message: '部署中' })
              window.setTimeout(() => {
                const url = preview_url ?? 'https://agentforge-preview.example.com/app/latest'
                setDeploymentState('SUCCEEDED', url)
                setPreviewPhase('deployed')
                setTabStateByType('deploy', { status: 'ready', message: '部署成功' })
              }, 1000)
            }}
          >
            发起部署（P0 前端占位）
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDeploymentState('FAILED')
              setTabStateByType('deploy', { status: 'error', message: '部署失败' })
            }}
          >
            模拟失败
          </Button>
        </div>
      </div>
    </div>
  )
}
