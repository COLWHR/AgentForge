import { create } from 'zustand'

import { IDLE_EXECUTION_STATE, type ExecutionSnapshot, type ExecutionStoreState } from './execution.types'

function normalizeIdlessState(
  state: Omit<ExecutionStoreState, 'startExecution' | 'updateExecution' | 'finishExecution' | 'resetExecution'>,
) {
  if (state.current_execution_id === null) {
    return {
      ...IDLE_EXECUTION_STATE,
      current_execution_id: null,
    }
  }
  return state
}

export const useExecutionStore = create<ExecutionStoreState>((set, get) => ({
  ...IDLE_EXECUTION_STATE,

  startExecution: (_agent_id, _input) => {
    set(() => ({
      ...IDLE_EXECUTION_STATE,
    }))
  },

  updateExecution: (data: ExecutionSnapshot) => {
    const currentId = get().current_execution_id

    if (currentId !== null && currentId !== data.execution_id) {
      return
    }

    set(() =>
      normalizeIdlessState({
        current_execution_id: data.execution_id,
        status: data.status,
        final_answer: data.final_answer,
        react_steps: data.react_steps,
        termination_reason: data.termination_reason,
        total_token_usage: data.total_token_usage,
      }),
    )
  },

  finishExecution: () => {
    set((state) =>
      normalizeIdlessState({
        current_execution_id: state.current_execution_id,
        status: state.status,
        final_answer: state.final_answer,
        react_steps: state.react_steps,
        termination_reason: state.termination_reason,
        total_token_usage: state.total_token_usage,
      }),
    )
  },

  resetExecution: () => {
    set(() => ({
      ...IDLE_EXECUTION_STATE,
    }))
  },
}))
