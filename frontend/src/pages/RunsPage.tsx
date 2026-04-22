import { Play } from 'lucide-react'

import { Alert } from '../components/feedback/Alert'
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton'
import { PageContainer } from '../components/layout/PageContainer'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function RunsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Execution Runs"
        description="Run pipeline shell with status visibility placeholders."
        statusSlot={<Badge variant="warning">No Runtime Binding</Badge>}
        actions={
          <Button variant="secondary" leftIcon={<Play size={14} />}>
            Trigger Run
          </Button>
        }
      />

      <Alert variant="info" title="F0 Scope Notice">
        Execution state machine and API orchestration are intentionally excluded in this phase.
      </Alert>

      <Card title="Run Queue Skeleton" description="Placeholder container for asynchronous run list.">
        <LoadingSkeleton />
      </Card>
    </PageContainer>
  )
}
