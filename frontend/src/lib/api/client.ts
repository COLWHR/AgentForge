import { ApiError } from './error'
import type { ApiRequestOptions, ApiSuccess, RawApiEnvelope } from './types'

interface ApiClientConfig {
  baseUrl: string
  getAccessToken: () => string | null
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function isPublicEndpoint(path: string): boolean {
  return path === '/health'
}

function getDefaultBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (configured && configured.trim().length > 0) {
    return configured
  }
  // In local dev, send requests directly to backend to avoid Vite HTML fallback.
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    return 'http://127.0.0.1:8000'
  }
  return '/api/v1'
}

function isDevAuthBypassEnabled(): boolean {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    return true
  }

  const explicit = import.meta.env.VITE_AUTH_DEV_BYPASS
  if (typeof explicit === 'boolean') {
    return explicit
  }
  if (typeof explicit === 'string') {
    const normalized = explicit.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
}

class ApiClient {
  private readonly baseUrl: string
  private readonly getAccessToken: () => string | null

  constructor(config: ApiClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl)
    this.getAccessToken = config.getAccessToken
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiSuccess<T>> {
    const method = options.method ?? 'GET'
    const authMode = options.authMode ?? 'auto'
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    }

    const token = this.getAccessToken()
    const publicEndpoint = isPublicEndpoint(path)

    if (authMode !== 'none' && !publicEndpoint && token) {
      headers.Authorization = `Bearer ${token}`
    }

    if (authMode === 'required' && !publicEndpoint && !token) {
      if (!isDevAuthBypassEnabled()) {
      throw new ApiError({
        code: 'AUTH_TOKEN_MISSING',
        message: 'Authorization token is required',
        raw: { path, method },
      })
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })

    let rawResponse: unknown = null

    try {
      rawResponse = (await response.json()) as RawApiEnvelope<T>
    } catch (error) {
      throw new ApiError({
        code: 'INVALID_RESPONSE_FORMAT',
        message: 'Response body is not valid JSON',
        raw: error,
      })
    }

    if (!response.ok) {
      throw new ApiError({
        code: 'HTTP_ERROR',
        message: `HTTP ${response.status}`,
        raw: rawResponse,
      })
    }

    const envelope = rawResponse as RawApiEnvelope<T>

    if (typeof envelope?.code !== 'number') {
      throw new ApiError({
        code: 'INVALID_RESPONSE_FORMAT',
        message: 'Response envelope is invalid',
        raw: rawResponse,
      })
    }

    if (envelope.code !== 0) {
      throw new ApiError({
        code: envelope.code,
        message: envelope.message ?? 'Business error',
        raw: rawResponse,
      })
    }

    return { data: envelope.data }
  }
}

function getAccessTokenFromStorage(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage.getItem('auth_token')
}

export const apiClient = new ApiClient({
  baseUrl: getDefaultBaseUrl(),
  getAccessToken: getAccessTokenFromStorage,
})

export { ApiClient }
