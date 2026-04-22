import { notify } from '../notifications/notify'
import { apiClient } from '../../lib/api/client'
import { ApiError, normalizeApiError } from '../../lib/api/error'
import { useAgentStore } from '../agent/agent.store'
import { useExecutionStore } from './execution.store'
import { IDLE_EXECUTION_STATE, type ExecutionSnapshot, type ExecutionStatus } from './execution.types'

interface ExecuteRequest {
  input: string
}

interface ExecuteResponse {
  execution_id: string
}

const STARTABLE_STATUSES: ExecutionStatus[] = ['IDLE', 'SUCCEEDED', 'FAILED', 'TERMINATED']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asExecutionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: 'Invalid execution field: execution_id',
      raw: value,
    })
  }
  return value
}

function asStatus(value: unknown): ExecutionSnapshot['status'] {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    if (
      normalized === 'PENDING' ||
      normalized === 'RUNNING' ||
      normalized === 'SUCCEEDED' ||
      normalized === 'FAILED' ||
      normalized === 'TERMINATED'
    ) {
      return normalized
    }
  }

  if (
    value !== 'PENDING' &&
    value !== 'RUNNING' &&
    value !== 'SUCCEEDED' &&
    value !== 'FAILED' &&
    value !== 'TERMINATED'
  ) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: 'Invalid execution field: status',
      raw: value,
    })
  }
  return value
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null || typeof value === 'string') {
    return value as string | null
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: `Invalid execution field: ${field}`,
    raw: value,
  })
}

function asNullableNumber(value: unknown, field: string): number | null {
  if (value === null || (typeof value === 'number' && Number.isFinite(value))) {
    return value as number | null
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: `Invalid execution field: ${field}`,
    raw: value,
  })
}

function resolveTotalTokenUsage(data: Record<string, unknown>): number | null {
  if (data.total_token_usage === undefined) {
    const nestedData = data.data
    if (isRecord(nestedData)) {
      const tokenUsage = nestedData.token_usage
      if (isRecord(tokenUsage)) {
        return asNullableNumber(tokenUsage.total_tokens ?? null, 'data.token_usage.total_tokens')
      }
    }
    return null
  }

  return asNullableNumber(data.total_token_usage, 'total_token_usage')
}

function asReactSteps(value: unknown): ExecutionSnapshot['react_steps'] {
  if (Array.isArray(value)) {
    return value as ExecutionSnapshot['react_steps']
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: 'Invalid execution field: react_steps',
    raw: value,
  })
}

function mapExecutionResponse(data: unknown): ExecutionSnapshot {
  if (!isRecord(data)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: 'Invalid execution response payload',
      raw: data,
    })
  }

  return {
    execution_id: asExecutionId(data.execution_id),
    status: asStatus(data.status),
    final_answer: asNullableString(data.final_answer, 'final_answer'),
    react_steps: asReactSteps(data.react_steps),
    termination_reason: asNullableString(data.termination_reason, 'termination_reason'),
    total_token_usage: resolveTotalTokenUsage(data),
  }
}

export const executionAdapter = {
  initializeExecutionRuntime() {
    const store = useExecutionStore.getState()
    if (store.current_execution_id === null) {
      store.resetExecution()
    }
  },

  handleAgentSwitch() {
    useExecutionStore.getState().resetExecution()
  },

  handleNewConversation() {
    useExecutionStore.getState().resetExecution()
  },

  async startExecution(agent_id: string, input: string): Promise<ExecuteResponse | null> {
    const agentStore = useAgentStore.getState()
    const store = useExecutionStore.getState()
    const normalizedInput = input.trim()
    const canStart = STARTABLE_STATUSES.includes(store.status)

    if (
      agentStore.current_agent_id === null ||
      agentStore.current_agent_id !== agent_id ||
      agentStore.agent_context_status !== 'READY'
    ) {
      notify.error('Agent context is not ready')
      return null
    }

    if (!canStart) {
      return null
    }

    if (normalizedInput.length === 0) {
      return null
    }

    store.resetExecution()
    useExecutionStore.setState(() => ({
      ...IDLE_EXECUTION_STATE,
      status: 'PENDING',
    }))

    try {
      const result = await apiClient.request<ExecuteResponse>(`/agents/${agent_id}/execute`, {
        method: 'POST',
        body: { input: normalizedInput } satisfies ExecuteRequest,
        authMode: 'required',
      })
      const executionId = asExecutionId(result.data.execution_id)

      useExecutionStore.setState(() => ({
        ...IDLE_EXECUTION_STATE,
        current_execution_id: executionId,
        status: 'PENDING',
      }))

      return {
        execution_id: executionId,
      }
    } catch (error) {
      store.resetExecution()
      const apiError = normalizeApiError(error)
      notify.error(apiError.message)
      return null
    }
  },

  async fetchExecution(execution_id: string): Promise<ExecutionSnapshot> {
    const result = await apiClient.request<unknown>(`/executions/${execution_id}`, {
      method: 'GET',
      authMode: 'required',
    })
    return mapExecutionResponse(result.data)
  },

  applyExecutionSnapshot(response: unknown) {
    const store = useExecutionStore.getState()
    store.updateExecution(mapExecutionResponse(response))
  },

  handleExecutionFailure(error: unknown) {
    const store = useExecutionStore.getState()
    const apiError = normalizeApiError(error)

    if (store.current_execution_id === null) {
      store.resetExecution()
    } else {
      store.updateExecution({
        execution_id: store.current_execution_id,
        status: 'FAILED',
        final_answer: null,
        react_steps: [],
        termination_reason: apiError.message,
        total_token_usage: null,
      })
      store.finishExecution()
    }

    notify.error(apiError.message)
  },
}
