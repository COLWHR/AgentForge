import { notify } from '../notifications/notify'
import { apiClient } from '../../lib/api/client'
import { ApiError, normalizeApiError } from '../../lib/api/error'
import { useAgentStore } from '../agent/agent.store'
import { useExecutionStore } from './execution.store'
import { IDLE_EXECUTION_STATE, type DeploymentStatus, type ExecutionSnapshot, type ExecutionStatus, type PreviewPhase } from './execution.types'

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

function asNullablePreviewPhase(value: unknown): PreviewPhase | null {
  if (value === null || value === undefined) {
    return null
  }
  if (
    value === 'empty' ||
    value === 'planning' ||
    value === 'building' ||
    value === 'booting' ||
    value === 'ready' ||
    value === 'failed' ||
    value === 'deployed'
  ) {
    return value
  }
  return null
}

function asNullableDeploymentStatus(value: unknown): DeploymentStatus | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value === 'IDLE' || value === 'PENDING' || value === 'SUCCEEDED' || value === 'FAILED') {
    return value
  }
  return null
}

function asNullableRecord(value: unknown, field: string): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null
  }
  if (isRecord(value)) {
    return value
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: `Invalid execution field: ${field}`,
    raw: value,
  })
}

function asRecordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
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
    return value.map((item, index) => {
      if (!isRecord(item)) {
        throw new ApiError({
          code: 'INVALID_RESPONSE_FORMAT',
          message: 'Invalid execution field: react_steps[]',
          raw: item,
        })
      }

      const actionRecord = item.action === null || item.action === undefined ? null : asRecordOrEmpty(item.action)
      const observationRecord =
        item.observation === null || item.observation === undefined ? null : asRecordOrEmpty(item.observation)
      const thought =
        typeof item.thought === 'string'
          ? item.thought
          : typeof item.reasoning === 'string'
            ? item.reasoning
            : item.thought === null
              ? null
              : null

      return {
        step_index:
          typeof item.step_index === 'number' && Number.isFinite(item.step_index) ? item.step_index : index + 1,
        thought,
        action:
          actionRecord === null
            ? null
            : {
                tool_id: typeof actionRecord.tool_id === 'string' ? actionRecord.tool_id : '',
                arguments: asRecordOrEmpty(actionRecord.arguments),
              },
        observation:
          observationRecord === null
            ? null
            : {
                ok: typeof observationRecord.ok === 'boolean' ? observationRecord.ok : observationRecord.error === undefined,
                content: observationRecord.content,
                error: asNullableRecord(observationRecord.error ?? null, 'react_steps[].observation.error'),
              },
      }
    })
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: 'Invalid execution field: react_steps',
    raw: value,
  })
}

function asOptionalArtifacts(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return []
  }
  if (Array.isArray(value)) {
    return value
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: 'Invalid execution field: artifacts',
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
    error_code: asNullableString(data.error_code ?? null, 'error_code'),
    error_source: asNullableString(data.error_source ?? null, 'error_source'),
    error_details: asNullableRecord(data.error_details ?? null, 'error_details'),
    error_message: asNullableString(data.error_message ?? null, 'error_message'),
    react_steps: asReactSteps(data.react_steps),
    artifacts: asOptionalArtifacts(data.artifacts),
    termination_reason: asNullableString(data.termination_reason ?? null, 'termination_reason'),
    total_token_usage: resolveTotalTokenUsage(data),
    preview_phase: asNullablePreviewPhase(data.preview_phase),
    preview_url: asNullableString(data.preview_url ?? null, 'preview_url'),
    deployment_status: asNullableDeploymentStatus(data.deployment_status),
    deployed_url: asNullableString(data.deployed_url ?? null, 'deployed_url'),
    last_user_input: asNullableString(data.last_user_input ?? null, 'last_user_input'),
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
      last_user_input: normalizedInput,
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
        last_user_input: normalizedInput,
        preview_phase: 'planning',
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
        error_code: null,
        error_source: null,
        error_details: null,
        error_message: apiError.message,
        react_steps: [],
        artifacts: [],
        termination_reason: apiError.message,
        total_token_usage: null,
        preview_phase: 'failed',
        preview_url: null,
        deployment_status: 'FAILED',
        deployed_url: null,
        last_user_input: store.last_user_input,
      })
      store.finishExecution()
    }

    notify.error(apiError.message)
  },
}
