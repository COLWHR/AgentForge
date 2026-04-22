import { Outlet } from 'react-router-dom'

import { useUiShellStore } from '../features/ui-shell/uiShell.store'
import { CopilotPanel } from '../components/workspace/layout/CopilotPanel'
import { WorkspaceRail } from '../components/workspace/layout/WorkspaceRail'

export function AppShell() {
  const rightPanelCollapsed = useUiShellStore((state) => state.rightPanelCollapsed)

  return (
    <div className="flex h-screen w-screen flex-row overflow-hidden bg-bg text-text-main">
      <WorkspaceRail />
      
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-hidden bg-bg relative">
          <Outlet />
        </main>
      </div>

      {!rightPanelCollapsed && <CopilotPanel />}
    </div>
  )
}
