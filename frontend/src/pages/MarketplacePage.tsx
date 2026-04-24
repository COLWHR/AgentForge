import { Link2 } from 'lucide-react'

import { PageContainer } from '../components/layout/PageContainer'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { MarketplaceCatalog } from '../components/workspace/mcp/MarketplaceCatalog'

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

      <Card title="Tool Catalog" description="真实读取 marketplace extensions；安装与绑定动作仍遵循分层 gated。">
        <MarketplaceCatalog />
      </Card>
    </PageContainer>
  )
}
