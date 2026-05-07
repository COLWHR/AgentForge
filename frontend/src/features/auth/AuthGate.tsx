import { Navigate } from 'react-router-dom'

import { AppShell } from '../../layouts/AppShell'
import { useAuthStore } from './auth.store'

function LoadingShell() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg text-sm text-text-muted">
      正在验证登录状态...
    </div>
  )
}

export function ProtectedLayout() {
  const status = useAuthStore((state) => state.status)

  if (status === 'loading') {
    return <LoadingShell />
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace />
  }

  return <AppShell />
}
