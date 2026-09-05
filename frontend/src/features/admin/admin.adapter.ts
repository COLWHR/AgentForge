import { apiClient } from '../../lib/api/client'

export interface AdminOverviewData {
  status: string
  users_total: number
  teams_total: number
}

export async function getAdminOverview(): Promise<AdminOverviewData> {
  const response = await apiClient.request<AdminOverviewData>('/admin/overview', {
    method: 'GET',
    authMode: 'required',
  })
  return response.data
}

