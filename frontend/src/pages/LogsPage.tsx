import { LogConsole } from '../components/console/LogConsole'
import { Alert } from '../components/feedback/Alert'
import { PageContainer } from '../components/layout/PageContainer'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'

const sampleLines = [
  { level: 'info' as const, message: '[INFO] request_id=req_f0_001 start run shell render' },
  { level: 'success' as const, message: '[SUCCESS] sidebar/header/content layout mounted' },
  { level: 'error' as const, message: '[ERROR] execution binding unavailable in phase F0 (expected)' },
]

export function LogsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Logs & Records"
        description="Log readability-first baseline with monospace, line-height, contrast, and scroll behavior."
        statusSlot={<Badge variant="success">Console Ready</Badge>}
      />

      <Alert variant="warning" title="Readability Priority">
        This console focuses on typography and contrast. Real data will connect in later phases.
      </Alert>

      <Card title="Log Console Container">
        <LogConsole lines={sampleLines} />
      </Card>
    </PageContainer>
  )
}
