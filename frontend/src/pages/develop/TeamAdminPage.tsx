import { Eye, EyeOff, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageContainer } from '../../components/layout/PageContainer'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../../features/auth/auth.store'
import { isPlatformAdmin, isTeamAdmin } from '../../features/auth/permissions'

export function TeamAdminPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const platformAdmin = isPlatformAdmin(user)
  const teamAdmin = isTeamAdmin(user)
  const roleLabel = platformAdmin ? '平台管理员' : teamAdmin ? '团队管理员' : '成员'

  return (
    <PageContainer className="px-4 py-6 md:px-6">
      <PageHeader
        title="团队管理"
        description="团队级资源与可见范围的入口。"
        statusSlot={<Badge variant={teamAdmin ? 'success' : 'neutral'}>{roleLabel}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" leftIcon={<LayoutDashboard size={14} />} onClick={() => navigate('/develop/agents')}>
              智能体
            </Button>
            <Button type="button" variant="secondary" leftIcon={<Users size={14} />} onClick={() => navigate('/develop/profile')}>
              账户
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="团队内可见" description="当前角色默认能看到的范围。">
          <div className="space-y-2 text-sm text-text-sub">
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-primary" />
              <span>本团队的智能体、运行记录、工具市场和日志。</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-primary" />
              <span>团队成员与当前账号资料。</span>
            </div>
          </div>
        </Card>

        <Card title="团队外不可见" description="权限边界会在路由和后端双层收紧。">
          <div className="space-y-2 text-sm text-text-sub">
            <div className="flex items-center gap-2">
              <EyeOff size={14} className="text-text-muted" />
              <span>其他团队的智能体、运行和知识内容。</span>
            </div>
            <div className="flex items-center gap-2">
              <EyeOff size={14} className="text-text-muted" />
              <span>平台级概览与全局管理入口，除非你是平台管理员。</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="当前身份" description="用于确认你在系统里的有效范围。">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="info">{user?.email ?? 'unknown'}</Badge>
          <Badge variant="neutral">team_id: {user?.team_id ?? 'unknown'}</Badge>
          <Badge variant={platformAdmin ? 'success' : 'neutral'}>{platformAdmin ? '平台管理员' : '非平台管理员'}</Badge>
        </div>
      </Card>
    </PageContainer>
  )
}

