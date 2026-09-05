import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { PermissionDenied } from '../../components/feedback/PermissionDenied'
import { AppShell } from '../../app/routes/lazyRoutes'
import { useAuthStore } from './auth.store'
import { isPlatformAdmin, isTeamAdmin } from './permissions'

type AccessScope = 'authenticated' | 'team_admin' | 'platform_admin'

function LoadingShell() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg text-sm text-text-muted">
      正在验证登录状态...
    </div>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  return <AccessRoute>{children}</AccessRoute>
}

export function AccessRoute({ children, scope = 'authenticated' }: { children: ReactNode; scope?: AccessScope }) {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)

  if (status === 'loading') {
    return <LoadingShell />
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace />
  }

  if (scope === 'team_admin' && !isTeamAdmin(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md">
          <PermissionDenied />
        </div>
      </div>
    )
  }

  if (scope === 'platform_admin' && !isPlatformAdmin(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md">
          <PermissionDenied />
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  )
}
