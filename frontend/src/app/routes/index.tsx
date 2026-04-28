import { Suspense, type ReactNode } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AgentsPage, AppShell, LogsPage, MarketplacePage, NotFoundPage, RunsPage } from './lazyRoutes'

function routeElement(element: ReactNode) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-surface text-sm text-text-muted">加载中...</div>}>
      {element}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: routeElement(<AppShell />),
    children: [
      { index: true, element: <Navigate to="/agents" replace /> },
      { path: 'agents', element: routeElement(<AgentsPage />) },
      { path: 'runs', element: routeElement(<RunsPage />) },
      { path: 'marketplace', element: routeElement(<MarketplacePage />) },
      { path: 'logs', element: routeElement(<LogsPage />) },
      { path: 'settings', element: <Navigate to="/agents" replace /> },
      { path: '*', element: routeElement(<NotFoundPage />) },
    ],
  },
])
