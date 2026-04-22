import { apiClient } from '../../lib/api/client'
import { ApiError } from '../../lib/api/error'

export interface AgentRuntimeConfig {
  temperature: number
  max_tokens: number | null
}

export interface AgentCapabilityFlags {
  supports_tools: boolean
}

export interface AgentDetail {
  id: string
  name: string
  description: string
  avatar_url: string | null
  llm_provider_url: string
  llm_model_name: string
  runtime_config: AgentRuntimeConfig
  capability_flags: AgentCapabilityFlags
  tools: string[]
  constraints: Record<string, unknown>
  has_api_key: boolean
}

export interface CreateAgentPayload {
  name: string
  description: string
  avatar_url: string | null
  llm_provider_url: string
  llm_api_key: string
  llm_model_name: string
  runtime_config: AgentRuntimeConfig
  capability_flags: AgentCapabilityFlags
  tools: string[]
  constraints: Record<string, unknown>
}

export interface UpdateAgentPayload {
  name?: string
  description?: string
  avatar_url?: string | null
  llm_provider_url?: string
  llm_api_key?: string
  llm_model_name?: string
  runtime_config?: AgentRuntimeConfig
  capability_flags?: AgentCapabilityFlags
  tools?: string[]
  constraints?: Record<string, unknown>
}

interface CreateAgentResponse {
  id: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: `Invalid agent field: ${field}`,
      raw: value,
    })
  }
  return value
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: `Invalid agent field: ${field}`,
      raw: value,
    })
  }
  return value
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: `Invalid agent field: ${field}`,
      raw: value,
    })
  }
  return value
}

function mapAgentRuntimeConfig(raw: unknown): AgentRuntimeConfig {
  const config = isRecord(raw) ? raw : {}
  const temperature = typeof config.temperature === 'number' && !Number.isNaN(config.temperature) ? config.temperature : 0.7
  const maxTokensRaw = config.max_tokens
  return {
    temperature,
    max_tokens: maxTokensRaw === null || maxTokensRaw === undefined ? null : asNumber(maxTokensRaw, 'runtime_config.max_tokens'),
  }
}

function mapAgentCapabilityFlags(raw: unknown): AgentCapabilityFlags {
  const flags = isRecord(raw) ? raw : {}
  return {
    supports_tools: typeof flags.supports_tools === 'boolean' ? flags.supports_tools : true,
  }
}

function mapAgentDetail(raw: unknown): AgentDetail {
  if (!isRecord(raw)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: 'Invalid agent detail payload',
      raw,
    })
  }

  const legacyConfig = isRecord(raw.config) ? raw.config : {}

  return {
    id: asString(raw.id, 'id'),
    name: asString((raw.name ?? legacyConfig.name ?? 'Untitled Agent') as unknown, 'name'),
    description: asString((raw.description ?? legacyConfig.description ?? '') as unknown, 'description'),
    avatar_url:
      raw.avatar_url === null || raw.avatar_url === undefined
        ? legacyConfig.avatar_url === null || legacyConfig.avatar_url === undefined
          ? null
          : asString(legacyConfig.avatar_url, 'avatar_url')
        : asString(raw.avatar_url, 'avatar_url'),
    llm_provider_url: asString((raw.llm_provider_url ?? legacyConfig.llm_provider_url ?? '') as unknown, 'llm_provider_url'),
    llm_model_name: asString((raw.llm_model_name ?? legacyConfig.llm_model_name ?? '') as unknown, 'llm_model_name'),
    runtime_config: mapAgentRuntimeConfig(raw.runtime_config ?? legacyConfig.runtime_config),
    capability_flags: mapAgentCapabilityFlags(raw.capability_flags ?? legacyConfig.capability_flags),
    tools: asStringArray((raw.tools ?? legacyConfig.tools ?? []) as unknown, 'tools'),
    constraints: isRecord(raw.constraints) ? raw.constraints : isRecord(legacyConfig.constraints) ? legacyConfig.constraints : {},
    has_api_key: Boolean(raw.has_api_key ?? legacyConfig.has_api_key ?? legacyConfig.llm_api_key_encrypted),
  }
}

function mapAgentList(raw: unknown): AgentDetail[] {
  if (!Array.isArray(raw)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: 'Invalid agent list payload',
      raw,
    })
  }

  return raw.map((item) => mapAgentDetail(item))
}

function mapCreateAgentResponse(raw: unknown): CreateAgentResponse {
  if (!isRecord(raw)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE_FORMAT',
      message: 'Invalid create agent payload',
      raw,
    })
  }
  return {
    id: asString(raw.id, 'id'),
  }
}

export const agentAdapter = {
  async fetchAgentList(): Promise<AgentDetail[]> {
    const result = await apiClient.request<unknown>('/agents', {
      method: 'GET',
      authMode: 'required',
    })
    return mapAgentList(result.data)
  },

  async fetchAgentDetail(agent_id: string): Promise<AgentDetail> {
    const result = await apiClient.request<unknown>(`/agents/${agent_id}`, {
      method: 'GET',
      authMode: 'required',
    })
    return mapAgentDetail(result.data)
  },

  async createAgent(payload: CreateAgentPayload): Promise<AgentDetail> {
    const result = await apiClient.request<unknown>('/agents', {
      method: 'POST',
      body: payload,
      authMode: 'required',
    })
    const created = mapCreateAgentResponse(result.data)
    return await this.fetchAgentDetail(created.id)
  },

  async updateAgent(agent_id: string, payload: UpdateAgentPayload): Promise<AgentDetail> {
    await apiClient.request<unknown>(`/agents/${agent_id}`, {
      method: 'PATCH',
      body: payload,
      authMode: 'required',
    })
    return await this.fetchAgentDetail(agent_id)
  },
}
