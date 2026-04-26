import { apiClient } from '../../lib/api/client'
import { ApiError } from '../../lib/api/error'

export interface KnowledgeDocument {
  id: string
  agent_id: string
  title: string
  content: string
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface KnowledgeSearchResult {
  document_id: string
  chunk_id: string
  title: string
  content: string
  score: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ApiError({ code: 'INVALID_RESPONSE_FORMAT', message: `知识库字段无效：${field}`, raw: value })
  }
  return value
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApiError({ code: 'INVALID_RESPONSE_FORMAT', message: `知识库字段无效：${field}`, raw: value })
  }
  return value
}

function mapDocument(raw: unknown): KnowledgeDocument {
  if (!isRecord(raw)) {
    throw new ApiError({ code: 'INVALID_RESPONSE_FORMAT', message: '知识文档响应无效', raw })
  }
  return {
    id: asString(raw.id, 'id'),
    agent_id: asString(raw.agent_id, 'agent_id'),
    title: asString(raw.title, 'title'),
    content: asString(raw.content, 'content'),
    chunk_count: asNumber(raw.chunk_count, 'chunk_count'),
    created_at: asString(raw.created_at, 'created_at'),
    updated_at: asString(raw.updated_at, 'updated_at'),
  }
}

function mapSearchResult(raw: unknown): KnowledgeSearchResult {
  if (!isRecord(raw)) {
    throw new ApiError({ code: 'INVALID_RESPONSE_FORMAT', message: '知识检索响应无效', raw })
  }
  return {
    document_id: asString(raw.document_id, 'document_id'),
    chunk_id: asString(raw.chunk_id, 'chunk_id'),
    title: asString(raw.title, 'title'),
    content: asString(raw.content, 'content'),
    score: asNumber(raw.score, 'score'),
  }
}

export const knowledgeAdapter = {
  async listDocuments(agentId: string): Promise<KnowledgeDocument[]> {
    const result = await apiClient.request<unknown[]>(`/agents/${agentId}/knowledge`, {
      method: 'GET',
      authMode: 'required',
    })
    return Array.isArray(result.data) ? result.data.map((item) => mapDocument(item)) : []
  },

  async createDocument(agentId: string, payload: { title: string; content: string }): Promise<KnowledgeDocument> {
    const result = await apiClient.request<unknown>(`/agents/${agentId}/knowledge`, {
      method: 'POST',
      body: payload,
      authMode: 'required',
    })
    return mapDocument(result.data)
  },

  async uploadDocument(agentId: string, payload: { file: File; title?: string }): Promise<KnowledgeDocument> {
    const formData = new FormData()
    formData.append('file', payload.file)
    if (payload.title?.trim()) {
      formData.append('title', payload.title.trim())
    }
    const result = await apiClient.request<unknown>(`/agents/${agentId}/knowledge/upload`, {
      method: 'POST',
      body: formData,
      authMode: 'required',
    })
    return mapDocument(result.data)
  },

  async search(agentId: string, payload: { query: string; limit?: number }): Promise<KnowledgeSearchResult[]> {
    const result = await apiClient.request<unknown[]>(`/agents/${agentId}/knowledge/search`, {
      method: 'POST',
      body: payload,
      authMode: 'required',
    })
    return Array.isArray(result.data) ? result.data.map((item) => mapSearchResult(item)) : []
  },

  async deleteDocument(agentId: string, documentId: string): Promise<void> {
    await apiClient.request<unknown>(`/agents/${agentId}/knowledge/${documentId}`, {
      method: 'DELETE',
      authMode: 'required',
    })
  },
}
