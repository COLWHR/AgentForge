import { create } from 'zustand'

import { notify } from '../notifications/notify'
import { normalizeApiError } from '../../lib/api/error'
import { useExecutionStore } from '../execution/execution.store'
import { agentAdapter, type AgentDetail, type CreateAgentPayload, type UpdateAgentPayload } from './agent.adapter'

export const AGENT_RECENT_STORAGE_KEY = 'AGENTFORGE_RECENT_AGENT_ID'

type AgentContextStatus = 'EMPTY' | 'LIST_LOADING' | 'DETAIL_LOADING' | 'READY' | 'ERROR'

interface AgentStoreState {
  agent_list: AgentDetail[]
  current_agent_id: string | null
  current_agent_detail: AgentDetail | null
  is_agent_list_loading: boolean
  is_agent_detail_loading: boolean
  agent_context_status: AgentContextStatus
  loadAgentList: () => Promise<void>
  selectAgent: (agent_id: string) => Promise<void>
  createAgent: (payload: CreateAgentPayload) => Promise<void>
  updateAgent: (agent_id: string, payload: UpdateAgentPayload) => Promise<void>
  refreshCurrentAgent: () => Promise<void>
  resetCurrentAgent: () => void
}

function saveRecentAgentId(agentId: string | null): void {
  if (typeof window === 'undefined') {
    return
  }

  if (agentId === null) {
    window.localStorage.removeItem(AGENT_RECENT_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(AGENT_RECENT_STORAGE_KEY, agentId)
}

export function getRecentAgentIdFromStorage(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.localStorage.getItem(AGENT_RECENT_STORAGE_KEY)
  if (stored === null) {
    return null
  }

  const normalized = stored.trim()
  return normalized.length > 0 ? normalized : null
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  agent_list: [],
  current_agent_id: null,
  current_agent_detail: null,
  is_agent_list_loading: false,
  is_agent_detail_loading: false,
  agent_context_status: 'EMPTY',

  resetCurrentAgent: () => {
    useExecutionStore.getState().resetExecution()
    saveRecentAgentId(null)
    set(() => ({
      current_agent_id: null,
      current_agent_detail: null,
      is_agent_detail_loading: false,
      agent_context_status: 'EMPTY',
    }))
  },

  loadAgentList: async () => {
    set(() => ({
      is_agent_list_loading: true,
      agent_context_status: 'LIST_LOADING',
    }))

    try {
      const list = await agentAdapter.fetchAgentList()

      set(() => ({
        agent_list: list,
        is_agent_list_loading: false,
      }))

      if (list.length === 0) {
        get().resetCurrentAgent()
        set(() => ({
          agent_context_status: 'EMPTY',
        }))
      } else if (get().current_agent_id === null) {
        set(() => ({
          agent_context_status: 'EMPTY',
        }))
      }
    } catch (error) {
      const apiError = normalizeApiError(error)
      set(() => ({
        agent_list: [],
        is_agent_list_loading: false,
        agent_context_status: 'ERROR',
      }))
      notify.error(apiError.message)
    }
  },

  createAgent: async (payload) => {
    const newAgent = await agentAdapter.createAgent(payload)
    saveRecentAgentId(newAgent.id)
    set((state) => {
      const existingIndex = state.agent_list.findIndex((agent) => agent.id === newAgent.id)
      const nextList = [...state.agent_list]

      if (existingIndex >= 0) {
        nextList[existingIndex] = newAgent
      } else {
        nextList.push(newAgent)
      }

      return {
        agent_list: nextList,
        current_agent_id: newAgent.id,
        current_agent_detail: newAgent,
        agent_context_status: 'READY' as const,
        is_agent_detail_loading: false,
      }
    })
  },

  updateAgent: async (agent_id, payload) => {
    const updated = await agentAdapter.updateAgent(agent_id, payload)
    set((state) => ({
      agent_list: state.agent_list.map((agent) => (agent.id === updated.id ? updated : agent)),
      current_agent_id: updated.id,
      current_agent_detail: updated,
      agent_context_status: 'READY',
      is_agent_detail_loading: false,
    }))
    saveRecentAgentId(updated.id)
  },

  selectAgent: async (agent_id) => {
    const normalizedId = agent_id.trim()
    if (normalizedId.length === 0) {
      return
    }

    useExecutionStore.getState().resetExecution()
    saveRecentAgentId(normalizedId)
    set(() => ({
      current_agent_detail: null,
      agent_context_status: 'DETAIL_LOADING',
      current_agent_id: normalizedId,
    }))
    await get().refreshCurrentAgent()
  },

  refreshCurrentAgent: async () => {
    const currentAgentId = get().current_agent_id
    if (currentAgentId === null) {
      return
    }

    set(() => ({
      is_agent_detail_loading: true,
      agent_context_status: 'DETAIL_LOADING',
      current_agent_detail: null,
    }))

    try {
      const detail = await agentAdapter.fetchAgentDetail(currentAgentId)

      if (detail.id !== currentAgentId) {
        get().resetCurrentAgent()
        set(() => ({
          agent_context_status: 'ERROR',
        }))
        notify.error('Agent identity mismatch')
        return
      }

      saveRecentAgentId(currentAgentId)
      set(() => ({
        current_agent_detail: detail,
        is_agent_detail_loading: false,
        agent_context_status: 'READY',
      }))
    } catch (error) {
      const apiError = normalizeApiError(error)
      set(() => ({
        is_agent_detail_loading: false,
      }))
      notify.error(apiError.message)
      get().resetCurrentAgent()
    }
  },
}))

export type { AgentContextStatus, AgentStoreState, AgentDetail, CreateAgentPayload }
