import type { AuthUserProfile } from './auth.adapter'

export function isPlatformAdmin(user: AuthUserProfile | null | undefined): boolean {
  return Boolean(user?.is_platform_admin)
}

export function isTeamAdmin(user: AuthUserProfile | null | undefined): boolean {
  if (!user) return false
  return user.is_platform_admin || user.role === 'owner' || user.role === 'admin'
}

