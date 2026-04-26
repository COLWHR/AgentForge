import { create } from 'zustand'

import { IDLE_EXECUTION_STATE, type ConversationMessage, type ExecutionSnapshot, type ExecutionStepLog, type ExecutionStoreState } from './execution.types'
import { getBuiltinToolLabel } from '../tools/tools.catalog'

function assistantContentFromSnapshot(data: ExecutionSnapshot): string | null {
  if (data.final_answer !== null && data.final_answer.trim().length > 0) {
    return data.final_answer
  }
  if (data.status === 'FAILED' || data.status === 'TERMINATED') {
    return data.error_message ?? data.termination_reason ?? '本次执行未能完成，请查看运行日志。'
  }
  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function hasKnowledgeHit(log: ExecutionStepLog): boolean {
  const hits = Array.isArray(log.payload.knowledge_hits) ? log.payload.knowledge_hits : []
  const matchedCount = readNumber(log.payload.matched_count) ?? hits.length
  return log.status === 'success' && (log.payload.matched === true || matchedCount > 0 || readString(log.payload.context) !== null)
}

function knowledgeActivityContent(log: ExecutionStepLog): string {
  const hits = Array.isArray(log.payload.knowledge_hits) ? log.payload.knowledge_hits : []
  const matchedCount = readNumber(log.payload.matched_count) ?? hits.length
  const query = readString(log.payload.query)
  const queryText = query === null ? '' : `：${query}`
  const titles = hits
    .map((item) => (typeof item === 'object' && item !== null ? readString((item as Record<string, unknown>).title) : null))
    .filter((title): title is string => title !== null)
    .slice(0, 3)
  const titleText = titles.length > 0 ? `，相关资料：${titles.join('、')}` : ''
  return `我正在检索知识库${queryText}，已找到 ${matchedCount} 条相关资料${titleText}。`
}

function toolActivityContent(log: ExecutionStepLog): string {
  const toolId = readString(log.payload.resolved_tool_id) ?? readString(log.tool_id) ?? readString(log.payload.provider_tool_name) ?? '未知工具'
  const toolLabel = getBuiltinToolLabel(toolId)
  if (log.status === 'error') {
    return `工具调用失败：${toolLabel}。我会根据已有上下文继续处理。`
  }
  return `我正在调用工具：${toolLabel}。`
}

function knowledgeBadgeFromSnapshot(data: ExecutionSnapshot): string | null {
  const retrievalLogs = data.step_logs.filter((log) => log.phase === 'knowledge_retrieval' && log.status === 'success')
  if (retrievalLogs.length === 0) {
    return null
  }
  const latest = retrievalLogs[retrievalLogs.length - 1]
  const hits = Array.isArray(latest.payload.knowledge_hits) ? latest.payload.knowledge_hits : []
  const matchedCountRaw = latest.payload.matched_count
  const matchedCount = typeof matchedCountRaw === 'number' && Number.isFinite(matchedCountRaw) ? matchedCountRaw : hits.length
  if (matchedCount <= 0 && hits.length === 0) {
    return null
  }
  return matchedCount > 0 ? `已检索知识库 · ${matchedCount} 条候选` : '已检索知识库'
}

function activityMessagesFromSnapshot(data: ExecutionSnapshot): ConversationMessage[] {
  return data.step_logs
    .filter((log) => log.phase === 'tool_call' || (log.phase === 'knowledge_retrieval' && hasKnowledgeHit(log)))
    .map((log, index) => ({
      id: `activity:${data.execution_id}:${log.phase}:${log.step_index}:${log.tool_id ?? 'knowledge'}:${index}`,
      role: 'assistant',
      content: log.phase === 'knowledge_retrieval' ? knowledgeActivityContent(log) : toolActivityContent(log),
      execution_id: data.execution_id,
      status: data.status,
      source: 'activity',
    }))
}

function syncConversationMessages(messages: ConversationMessage[], data: ExecutionSnapshot): ConversationMessage[] {
  const userInput = data.last_user_input?.trim()
  let nextMessages = messages.map((message) => {
    if (message.role === 'user' && message.execution_id === data.execution_id) {
      return { ...message, status: data.status }
    }
    if (message.role === 'user' && message.execution_id === null && userInput && message.content === userInput) {
      return { ...message, execution_id: data.execution_id, status: data.status }
    }
    return message
  })

  const activityMessages = activityMessagesFromSnapshot(data)
  nextMessages = nextMessages.filter((message) => !(message.source === 'activity' && message.execution_id === data.execution_id))
  if (activityMessages.length > 0) {
    nextMessages = [...nextMessages, ...activityMessages]
  }

  const assistantContent = assistantContentFromSnapshot(data)
  if (assistantContent === null) {
    return nextMessages
  }

  const assistantId = `assistant:${data.execution_id}`
  const assistantMessage: ConversationMessage = {
    id: assistantId,
    role: 'assistant',
    content: assistantContent,
    execution_id: data.execution_id,
    status: data.status,
    source: 'chat',
    knowledge_badge: knowledgeBadgeFromSnapshot(data),
  }
  const existingIndex = nextMessages.findIndex((message) => message.id === assistantId)
  if (existingIndex >= 0) {
    nextMessages = nextMessages.slice()
    nextMessages.splice(existingIndex, 1)
  }
  return [...nextMessages, assistantMessage]
}

function normalizeIdlessState(
  state: Omit<
    ExecutionStoreState,
    | 'startExecution'
    | 'updateExecution'
    | 'finishExecution'
    | 'resetExecution'
    | 'clearConversationMessages'
    | 'setOpeningMessage'
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
      is_execution_starting: state.is_execution_starting,
      last_user_input: state.last_user_input,
      conversation_messages: state.conversation_messages,
      conversation_messages_hidden: state.conversation_messages_hidden,
      conversation_cleared_execution_id: state.conversation_cleared_execution_id,
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
    const hideConversationMessages = get().conversation_messages_hidden
    const clearedExecutionId = get().conversation_cleared_execution_id

    if (currentId !== null && currentId !== data.execution_id) {
      return
    }

    set(() =>
      normalizeIdlessState({
        current_execution_id: data.execution_id,
        is_execution_starting: false,
        status: data.status,
        final_answer: data.final_answer,
        error_code: data.error_code,
        error_source: data.error_source,
        error_details: data.error_details,
        error_message: data.error_message,
        react_steps: data.react_steps,
        step_logs: data.step_logs,
        artifacts: data.artifacts ?? [],
        termination_reason: data.termination_reason,
        total_token_usage: data.total_token_usage,
        preview_phase: data.preview_phase ?? null,
        preview_url: data.preview_url ?? null,
        deployment_status: data.deployment_status ?? 'IDLE',
        deployed_url: data.deployed_url ?? null,
        last_user_input: data.last_user_input ?? get().last_user_input ?? null,
        conversation_messages:
          hideConversationMessages || clearedExecutionId === data.execution_id
            ? get().conversation_messages
            : syncConversationMessages(get().conversation_messages, data),
        conversation_messages_hidden: hideConversationMessages,
        conversation_cleared_execution_id: clearedExecutionId,
      }),
    )
  },

  finishExecution: () => {
    set((state) =>
      normalizeIdlessState({
        current_execution_id: state.current_execution_id,
        is_execution_starting: false,
        status: state.status,
        final_answer: state.final_answer,
        error_code: state.error_code,
        error_source: state.error_source,
        error_details: state.error_details,
        error_message: state.error_message,
        react_steps: state.react_steps,
        step_logs: state.step_logs,
        artifacts: state.artifacts,
        termination_reason: state.termination_reason,
        total_token_usage: state.total_token_usage,
        preview_phase: state.preview_phase,
        preview_url: state.preview_url,
        deployment_status: state.deployment_status,
        deployed_url: state.deployed_url,
        last_user_input: state.last_user_input,
        conversation_messages: state.conversation_messages,
        conversation_messages_hidden: state.conversation_messages_hidden,
        conversation_cleared_execution_id: state.conversation_cleared_execution_id,
      }),
    )
  },

  resetExecution: () => {
    set(() => ({
      ...IDLE_EXECUTION_STATE,
    }))
  },

  clearConversationMessages: (agent_id = null, opening_statement = null) => {
    const openingMessages =
      agent_id !== null && opening_statement !== null && opening_statement.trim().length > 0
        ? [
            {
              id: `opening:${agent_id}`,
              role: 'assistant' as const,
              content: opening_statement.trim(),
              execution_id: null,
              status: 'IDLE' as const,
              source: 'opening' as const,
            },
          ]
        : []

    set(() => ({
      ...IDLE_EXECUTION_STATE,
      conversation_messages:
        openingMessages,
      conversation_messages_hidden: false,
      conversation_cleared_execution_id: null,
    }))
  },

  setOpeningMessage: (agent_id, opening_statement) => {
    const opening = opening_statement?.trim() ?? ''
    if (agent_id === null || opening.length === 0) {
      set(() => ({
        conversation_messages: [],
        conversation_messages_hidden: false,
        conversation_cleared_execution_id: null,
      }))
      return
    }

    set((state) => {
      const openingMessage: ConversationMessage = {
        id: `opening:${agent_id}`,
        role: 'assistant',
        content: opening,
        execution_id: null,
        status: 'IDLE',
        source: 'opening',
      }
      const nonOpeningMessages = state.conversation_messages.filter((message) => message.source !== 'opening')
      const hasChatMessages = nonOpeningMessages.some((message) => message.source !== 'activity')

      return {
        conversation_messages: hasChatMessages ? [openingMessage, ...nonOpeningMessages] : [openingMessage],
        conversation_messages_hidden: false,
      }
    })
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
