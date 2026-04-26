import { LogConsole } from '../components/console/LogConsole'
import { Alert } from '../components/feedback/Alert'
import { PageContainer } from '../components/layout/PageContainer'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'

const sampleLines = [
  { level: 'info' as const, message: '[信息] 请求 req_f0_001 开始渲染运行界面' },
  { level: 'success' as const, message: '[成功] 侧栏、头部与内容布局已挂载' },
  { level: 'error' as const, message: '[错误] 当前阶段暂未接入执行绑定' },
]

export function LogsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="日志与记录"
        description="日志界面优先保证可读性、对比度与滚动体验。"
        statusSlot={<Badge variant="success">控制台已就绪</Badge>}
      />

      <Alert variant="warning" title="可读性优先">
        当前控制台聚焦排版与对比度，真实数据将在后续阶段接入。
      </Alert>

      <Card title="日志控制台">
        <LogConsole lines={sampleLines} />
      </Card>
    </PageContainer>
  )
}
