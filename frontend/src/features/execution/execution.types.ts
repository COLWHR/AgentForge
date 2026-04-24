export type ExecutionStatus = 'IDLE' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED'
export type PreviewPhase = 'empty' | 'planning' | 'building' | 'booting' | 'ready' | 'failed' | 'deployed'
export type DeploymentStatus = 'IDLE' | 'PENDING' | 'SUCCEEDED' | 'FAILED'

export interface ExecutionStep {
  step_index: number
  thought?: string | null
  action: {
    tool_id: string
    arguments: Record<string, unknown>
  } | null
  observation: {
    ok: boolean
    content: unknown
    error: Record<string, unknown> | null
  } | null
}

export interface ExecutionSnapshot {
  execution_id: string
  status: Exclude<ExecutionStatus, 'IDLE'>
  final_answer: string | null
  error_code: string | null
  error_source: string | null
  error_details: Record<string, unknown> | null
  error_message: string | null
  react_steps: ExecutionStep[]
  artifacts?: unknown[]
  termination_reason: string | null
  total_token_usage: number | null
  preview_phase?: PreviewPhase | null
  preview_url?: string | null
  deployment_status?: DeploymentStatus | null
  deployed_url?: string | null
  last_user_input?: string | null
}

export interface ExecutionStoreState {
  current_execution_id: string | null
  status: ExecutionStatus
  final_answer: string | null
  error_code: string | null
  error_source: string | null
  error_details: Record<string, unknown> | null
  error_message: string | null
  react_steps: ExecutionStep[]
  artifacts: unknown[]
  termination_reason: string | null
  total_token_usage: number | null
  preview_phase: PreviewPhase | null
  preview_url: string | null
  deployment_status: DeploymentStatus
  deployed_url: string | null
  last_user_input: string | null
  startExecution: (agent_id: string, input: string) => void
  updateExecution: (data: ExecutionSnapshot) => void
  finishExecution: () => void
  resetExecution: () => void
  setPreviewPhase: (phase: PreviewPhase | null) => void
  setPreviewUrl: (url: string | null) => void
  setDeploymentState: (status: DeploymentStatus, deployedUrl?: string | null) => void
  setLastUserInput: (input: string | null) => void
}

export const IDLE_EXECUTION_STATE: Omit<
  ExecutionStoreState,
  | 'startExecution'
  | 'updateExecution'
  | 'finishExecution'
  | 'resetExecution'
  | 'setPreviewPhase'
  | 'setPreviewUrl'
  | 'setDeploymentState'
  | 'setLastUserInput'
> = {
  current_execution_id: null,
  status: 'IDLE',
  final_answer: null,
  error_code: null,
  error_source: null,
  error_details: null,
  error_message: null,
  react_steps: [],
  artifacts: [],
  termination_reason: null,
  total_token_usage: null,
  preview_phase: null,
  preview_url: null,
  deployment_status: 'IDLE',
  deployed_url: null,
  last_user_input: null,
}
