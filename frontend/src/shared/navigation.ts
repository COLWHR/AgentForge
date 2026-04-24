import { Blocks, Bot, FileText, PlayCircle, type LucideIcon } from 'lucide-react'

import type { NavItem } from '../types/navigation'

export const NAV_ITEMS: NavItem[] = [
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Runs', to: '/runs', icon: PlayCircle },
  { label: 'Marketplace', to: '/marketplace', icon: Blocks },
  { label: 'Logs', to: '/logs', icon: FileText },
]

export const DEFAULT_BREADCRUMB_MAP: Record<string, string> = {
  agents: 'Agents',
  runs: 'Execution Runs',
  marketplace: 'Tool Marketplace',
  logs: 'Logs & Records',
}

export type IconType = LucideIcon
