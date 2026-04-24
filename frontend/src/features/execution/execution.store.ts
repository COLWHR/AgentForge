import { create } from 'zustand'

import { IDLE_EXECUTION_STATE, type ExecutionSnapshot, type ExecutionStoreState } from './execution.types'

function normalizeIdlessState(
  state: Omit<
    ExecutionStoreState,
    | 'startExecution'
    | 'updateExecution'
    | 'finishExecution'
    | 'resetExecution'
    | 'setPreviewPhase'
    | 'setPreviewUrl'
    | 'setDeploymentState'
    | 'setLastUserInput'
  >,
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

  startExecution: () => {
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
        error_code: data.error_code,
        error_source: data.error_source,
        error_details: data.error_details,
        error_message: data.error_message,
        react_steps: data.react_steps,
        artifacts: data.artifacts ?? [],
        termination_reason: data.termination_reason,
        total_token_usage: data.total_token_usage,
        preview_phase: data.preview_phase ?? null,
        preview_url: data.preview_url ?? null,
        deployment_status: data.deployment_status ?? 'IDLE',
        deployed_url: data.deployed_url ?? null,
        last_user_input: data.last_user_input ?? get().last_user_input ?? null,
      }),
    )
  },

  finishExecution: () => {
    set((state) =>
      normalizeIdlessState({
        current_execution_id: state.current_execution_id,
        status: state.status,
        final_answer: state.final_answer,
        error_code: state.error_code,
        error_source: state.error_source,
        error_details: state.error_details,
        error_message: state.error_message,
        react_steps: state.react_steps,
        artifacts: state.artifacts,
        termination_reason: state.termination_reason,
        total_token_usage: state.total_token_usage,
        preview_phase: state.preview_phase,
        preview_url: state.preview_url,
        deployment_status: state.deployment_status,
        deployed_url: state.deployed_url,
        last_user_input: state.last_user_input,
      }),
    )
  },

  resetExecution: () => {
    set(() => ({
      ...IDLE_EXECUTION_STATE,
    }))
  },

  setPreviewPhase: (phase) => {
    set((state) => ({
      preview_phase: phase,
      status: phase === 'failed' ? 'FAILED' : state.status,
    }))
  },

  setPreviewUrl: (url) => {
    set(() => ({
      preview_url: url,
    }))
  },

  setDeploymentState: (status, deployedUrl = null) => {
    set(() => ({
      deployment_status: status,
      deployed_url: deployedUrl,
    }))
  },

  setLastUserInput: (input) => {
    set(() => ({
      last_user_input: input,
    }))
  },
}))
