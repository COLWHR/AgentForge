import { useState } from 'react'

import { Table } from '../components/data/Table'
import { PermissionDenied } from '../components/feedback/PermissionDenied'
import { PageContainer } from '../components/layout/PageContainer'
import { PageHeader } from '../components/layout/PageHeader'
import { Drawer } from '../components/overlay/Drawer'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const quotaRows = [
  { metric: 'Daily Runs', value: '0 / 1000', scope: 'Team' },
  { metric: 'Token Budget', value: '0 / 2M', scope: 'Team' },
]

export function SettingsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <PageContainer>
      <PageHeader
        title="System Settings"
        description="Configuration and quota surfaces are represented as UI shells in F0."
        statusSlot={<Badge variant="neutral">No Persistence</Badge>}
        actions={
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open Drawer Shell
          </Button>
        }
      />

      <Card title="Quota Table Shell" description="Base table style for future system data rendering.">
        <Table
          data={quotaRows}
          columns={[
            { key: 'metric', header: 'Metric' },
            { key: 'value', header: 'Usage' },
            { key: 'scope', header: 'Scope' },
          ]}
        />
      </Card>

      <PermissionDenied />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Settings Drawer">
        <p className="text-sm leading-relaxed text-text-muted">Drawer shell is ready. Detailed settings forms are deferred.</p>
      </Drawer>
    </PageContainer>
  )
}
