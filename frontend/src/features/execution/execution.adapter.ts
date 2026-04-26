import { notify } from '../notifications/notify'
import { apiClient } from '../../lib/api/client'
import { ApiError, normalizeApiError } from '../../lib/api/error'
import { useAgentStore } from '../agent/agent.store'
import { useExecutionStore } from './execution.store'
import {
  IDLE_EXECUTION_STATE,
  type ConversationMessage,
  type DeploymentStatus,
  type ExecutionSnapshot,
  type ExecutionStepLog,
  type ExecutionStatus,
  type PreviewPhase,
} from './execution.types'

interface ExecuteRequest {
  input: string
  conversation_history: ConversationHistoryItem[]
}

interface ConversationHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

interface ExecuteResponse {
  execution_id: string
}

const STARTABLE_STATUSES: ExecutionStatus[] = ['IDLE', 'SUCCEEDED', 'FAILED', 'TERMINATED']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createUserConversationMessage(input: string): ConversationMessage {
  return {
    id: `user:pending:${Date.now()}`,
    role: 'user',
    content: input,
    execution_id: null,
    status: 'PENDING',
    source: 'chat',
  }
}

function buildConversationHistory(messages: ConversationMessage[]): ConversationHistoryItem[] {
  return messages
    .filter((message) => {
      if (message.content.trim().length === 0) {
        return false
      }
      if (message.source === 'opening' || message.source === 'activity') {
        return false
      }
      if (message.role === 'user') {
        return message.execution_id !== null && message.status !== 'FAILED'
      }
      return message.status !== 'PENDING' && message.status !== 'FAILED'
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .slice(-20)
}

function asExecutionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: '执行响应字段无效：execution_id',
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
      message: '执行响应字段无效：status',
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
    message: `执行响应字段无效：${field}`,
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
    message: `执行响应字段无效：${field}`,
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
    message: `执行响应字段无效：${field}`,
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
          message: '执行响应字段无效：react_steps[]',
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
    message: '执行响应字段无效：react_steps',
    raw: value,
  })
}

function asStepLogPhase(value: unknown): ExecutionStepLog['phase'] {
  if (
    value === 'knowledge_retrieval' ||
    value === 'model_call' ||
    value === 'tool_call' ||
    value === 'observation' ||
    value === 'final_answer'
  ) {
    return value
  }
  throw new ApiError({
    code: 'INVALID_RESPONSE_FORMAT',
    message: '执行响应字段无效：step_logs[].phase',
    raw: value,
  })
}

function asStepLogs(value: unknown): ExecutionSnapshot['step_logs'] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: '执行响应字段无效：step_logs',
      raw: value,
    })
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ApiError({
        code: 'INVALID_RESPONSE_FORMAT',
        message: '执行响应字段无效：step_logs[]',
        raw: item,
      })
    }

    return {
      execution_id: asExecutionId(item.execution_id),
      step_index:
        typeof item.step_index === 'number' && Number.isFinite(item.step_index) && item.step_index > 0 ? item.step_index : index + 1,
      phase: asStepLogPhase(item.phase),
      tool_id: asNullableString(item.tool_id ?? null, 'step_logs[].tool_id'),
      status: item.status === 'error' ? 'error' : 'success',
      payload: asRecordOrEmpty(item.payload),
      timestamp: asNullableString(item.timestamp, 'step_logs[].timestamp') ?? '',
    }
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
    message: '执行响应字段无效：artifacts',
    raw: value,
  })
}

function mapExecutionResponse(data: unknown): ExecutionSnapshot {
  if (!isRecord(data)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: '执行响应内容无效',
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
    step_logs: asStepLogs(data.step_logs),
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
      notify.error('智能体上下文尚未就绪')
      return null
    }

    if (!canStart || store.is_execution_starting) {
      notify.info('模型正在处理当前消息，回复完成后可以继续输入')
      return null
    }

    if (normalizedInput.length === 0) {
      return null
    }

    const conversationHistory = buildConversationHistory(store.conversation_messages)
    const userMessage = createUserConversationMessage(normalizedInput)
    const conversationMessages = [...store.conversation_messages, userMessage]
    useExecutionStore.setState(() => ({
      ...IDLE_EXECUTION_STATE,
      current_execution_id: null,
      is_execution_starting: true,
      status: 'PENDING',
      last_user_input: normalizedInput,
      conversation_messages: conversationMessages,
      conversation_cleared_execution_id: null,
    }))

    try {
      const result = await apiClient.request<ExecuteResponse>(`/agents/${agent_id}/execute`, {
        method: 'POST',
        body: { input: normalizedInput, conversation_history: conversationHistory } satisfies ExecuteRequest,
        authMode: 'required',
      })
      const executionId = asExecutionId(result.data.execution_id)
      const messagesWithExecutionId = useExecutionStore.getState().conversation_messages.map((message) =>
        message.id === userMessage.id ? { ...message, execution_id: executionId } : message,
      )

      useExecutionStore.setState(() => ({
        ...IDLE_EXECUTION_STATE,
        current_execution_id: executionId,
        is_execution_starting: false,
        status: 'PENDING',
        last_user_input: normalizedInput,
        preview_phase: 'planning',
        conversation_messages: messagesWithExecutionId,
      }))

      return {
        execution_id: executionId,
      }
    } catch (error) {
      const apiError = normalizeApiError(error)
      useExecutionStore.setState(() => ({
        ...IDLE_EXECUTION_STATE,
        is_execution_starting: false,
        status: 'FAILED',
        error_message: apiError.message,
        termination_reason: apiError.message,
        last_user_input: normalizedInput,
        preview_phase: 'failed',
        deployment_status: 'FAILED',
        conversation_messages: [
          ...conversationMessages,
          {
            id: `assistant:start-failed:${Date.now()}`,
            role: 'assistant',
            content: apiError.message,
            execution_id: null,
            status: 'FAILED',
            source: 'chat',
          },
        ],
      }))
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
        step_logs: [],
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
