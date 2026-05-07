import { Suspense, type ReactNode } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import {
  AgentsPage,
  ForgotPasswordPage,
  LoginPage,
  LogsPage,
  MarketplacePage,
  NotFoundPage,
  ProfilePage,
  RegisterPage,
  ResetPasswordPage,
  RunsPage,
} from './lazyRoutes'
import { ProtectedLayout } from '../../features/auth/AuthGate'

function routeElement(element: ReactNode) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-surface text-sm text-text-muted">加载中...</div>}>
      {element}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: routeElement(<LoginPage />),
  },
  {
    path: '/register',
    element: routeElement(<RegisterPage />),
  },
  {
    path: '/forgot-password',
    element: routeElement(<ForgotPasswordPage />),
  },
  {
    path: '/reset-password',
    element: routeElement(<ResetPasswordPage />),
  },
  {
    path: '/',
    element: routeElement(<ProtectedLayout />),
    children: [
      { index: true, element: <Navigate to="/agents" replace /> },
      { path: 'agents', element: routeElement(<AgentsPage />) },
      { path: 'runs', element: routeElement(<RunsPage />) },
      { path: 'marketplace', element: routeElement(<MarketplacePage />) },
      { path: 'logs', element: routeElement(<LogsPage />) },
      { path: 'profile', element: routeElement(<ProfilePage />) },
      { path: 'settings', element: <Navigate to="/profile" replace /> },
      { path: '*', element: routeElement(<NotFoundPage />) },
    ],
  },
])
