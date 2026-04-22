export type ExecutionStatus = 'IDLE' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED'

export interface ExecutionStep {
  step_index: number
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
  react_steps: ExecutionStep[]
  termination_reason: string | null
  total_token_usage: number | null
}

export interface ExecutionStoreState {
  current_execution_id: string | null
  status: ExecutionStatus
  final_answer: string | null
  react_steps: ExecutionStep[]
  termination_reason: string | null
  total_token_usage: number | null
  startExecution: (agent_id: string, input: string) => void
  updateExecution: (data: ExecutionSnapshot) => void
  finishExecution: () => void
  resetExecution: () => void
}

export const IDLE_EXECUTION_STATE: Omit<
  ExecutionStoreState,
  'startExecution' | 'updateExecution' | 'finishExecution' | 'resetExecution'
> = {
  current_execution_id: null,
  status: 'IDLE',
  final_answer: null,
  react_steps: [],
  termination_reason: null,
  total_token_usage: null,
}
