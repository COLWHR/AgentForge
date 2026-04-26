import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../../layouts/AppShell'
import { AgentsPage } from '../../pages/AgentsPage'
import { LogsPage } from '../../pages/LogsPage'
import { MarketplacePage } from '../../pages/MarketplacePage'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { RunsPage } from '../../pages/RunsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/agents" replace /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'runs', element: <RunsPage /> },
      { path: 'marketplace', element: <MarketplacePage /> },
      { path: 'logs', element: <LogsPage /> },
      { path: 'settings', element: <Navigate to="/agents" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
