import { Shield, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Card } from '../../components/ui/Card'
import { PageContainer } from '../../components/layout/PageContainer'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/feedback/Alert'
import { useAuthStore } from '../../features/auth/auth.store'
import { isPlatformAdmin } from '../../features/auth/permissions'
import { getAdminOverview, type AdminOverviewData } from '../../features/admin/admin.adapter'

export function AdminOverviewPage() {
  const user = useAuthStore((state) => state.user)
  const [overview, setOverview] = useState<AdminOverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getAdminOverview()
      .then((data) => {
        if (active) setOverview(data)
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : '加载平台概览失败')
        }
      })

    return () => {
      active = false
    }
  }, [])

  const platformAdmin = isPlatformAdmin(user)

  return (
    <PageContainer className="px-4 py-6 md:px-6">
      <PageHeader
        title="平台管理"
        description="平台级入口只对平台管理员开放。"
        statusSlot={<Badge variant={platformAdmin ? 'success' : 'warning'}>{platformAdmin ? '平台管理员' : '受限'}</Badge>}
      />

      {error ? <Alert variant="warning" title="概览加载失败">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="用户总数" description="当前平台可见用户数量。">
          <div className="flex items-center justify-between gap-3">
            <div className="text-3xl font-semibold text-text-main">{overview ? overview.users_total : '...'}</div>
            <Users size={20} className="text-primary" />
          </div>
        </Card>
        <Card title="团队总数" description="当前平台可见团队数量。">
          <div className="flex items-center justify-between gap-3">
            <div className="text-3xl font-semibold text-text-main">{overview ? overview.teams_total : '...'}</div>
            <Shield size={20} className="text-primary" />
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}

