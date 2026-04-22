import { Blocks, Bot, FileText, PlayCircle, Settings, type LucideIcon } from 'lucide-react'

import type { NavItem } from '../types/navigation'

export const NAV_ITEMS: NavItem[] = [
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Runs', to: '/runs', icon: PlayCircle },
  { label: 'Marketplace', to: '/marketplace', icon: Blocks },
  { label: 'Logs', to: '/logs', icon: FileText },
  { label: 'Settings', to: '/settings', icon: Settings },
]

export const DEFAULT_BREADCRUMB_MAP: Record<string, string> = {
  agents: 'Agents',
  runs: 'Execution Runs',
  marketplace: 'Tool Marketplace',
  logs: 'Logs & Records',
  settings: 'System Settings',
}

export type IconType = LucideIcon
