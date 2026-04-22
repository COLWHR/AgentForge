import { Link2 } from 'lucide-react'

import { EmptyState } from '../components/feedback/EmptyState'
import { PageContainer } from '../components/layout/PageContainer'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function MarketplacePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Tool Marketplace"
        description="Tool catalog shell with future install and binding workflows."
        statusSlot={<Badge variant="neutral">Catalog Skeleton</Badge>}
        actions={
          <Button variant="secondary" leftIcon={<Link2 size={14} />}>
            Manage Bindings
          </Button>
        }
      />

      <Card title="Tool Cards Placeholder" description="Consistent card hierarchy for Installed and Bound states.">
        <EmptyState
          title="No Tool Data Loaded"
          description="Marketplace integration is deferred. This page validates card spacing and action priority."
        />
      </Card>
    </PageContainer>
  )
}
