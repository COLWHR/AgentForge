import { apiClient } from './client'

export interface ConfigField {
  key: string
  label: string
  type: string
  required: boolean
  placeholder?: string | null
  help_text?: string | null
}

export interface ExtensionSummary {
  id: string
  name: string
  description?: string | null
  icon_url?: string | null
  tool_type: string
  categories: string[]
  author?: string | null
  homepage?: string | null
  popularity: number
  is_official: boolean
  config_fields: ConfigField[]
}

export interface ExtensionTool {
  id: string
  name: string
  display_name?: string | null
  description?: string | null
  input_schema: Record<string, unknown>
}

export interface ExtensionDetail extends ExtensionSummary {
  status: string
  tools: ExtensionTool[]
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  missing_fields: string[]
}

export const marketplaceApi = {
  listExtensions: (): Promise<ExtensionSummary[]> => apiClient('/api/v1/marketplace/extensions', { method: 'GET' }),

  getExtension: (extensionId: string): Promise<ExtensionDetail> =>
    apiClient(`/api/v1/marketplace/extensions/${extensionId}`, { method: 'GET' }),

  testConnection: (extensionId: string, config: Record<string, string>): Promise<ConnectionTestResult> =>
    apiClient(`/api/v1/marketplace/extensions/${extensionId}/test-connection`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),

  installExtension: (extensionId: string, userId: string, config: Record<string, string>) =>
    apiClient(`/api/v1/marketplace/extensions/${extensionId}/install`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, config }),
    }),

  bindTools: (agentId: string, toolIds: string[]) =>
    apiClient(`/api/v1/marketplace/agents/${agentId}/tools/bind`, {
      method: 'POST',
      body: JSON.stringify({ tool_ids: toolIds }),
    }),
}
