import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  access?: 'all' | 'team_admin' | 'platform_admin'
}
