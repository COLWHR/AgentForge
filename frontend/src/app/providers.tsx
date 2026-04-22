import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { Toaster } from 'sonner'

import { getRecentAgentIdFromStorage, useAgentStore } from '../features/agent/agent.store'
import { executionAdapter } from '../features/execution/execution.adapter'
import { useExecutionStore } from '../features/execution/execution.store'
import { useExecutionPolling } from '../features/execution/useExecutionPolling'

export function AppProviders({ children }: PropsWithChildren) {
  const currentExecutionId = useExecutionStore((state) => state.current_execution_id)
  useExecutionPolling(currentExecutionId)

  useEffect(() => {
    executionAdapter.initializeExecutionRuntime()

    async function initializeAgentRuntimeContext() {
      const store = useAgentStore.getState()
      await store.loadAgentList()

      const postLoad = useAgentStore.getState()
      if (postLoad.agent_context_status === 'ERROR') {
        return
      }

      const restoredAgentId = getRecentAgentIdFromStorage()
      if (restoredAgentId !== null && postLoad.agent_list.some((agent) => agent.id === restoredAgentId)) {
        await useAgentStore.getState().selectAgent(restoredAgentId)
        return
      }

      useAgentStore.getState().resetCurrentAgent()
    }

    void initializeAgentRuntimeContext()
  }, [])

  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  )
}
