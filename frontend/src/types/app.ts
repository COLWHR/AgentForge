export type AppStatus = 'idle' | 'editing' | 'saving' | 'loading' | 'running' | 'success' | 'failed';

export interface ReactStep {
  step_index: number;
  step_status: string;
  thought?: string;
  action?: any;
  observation?: any;
  error_code?: string | number;
  error_source?: string;
  error_message?: string;
}

export interface ExecutionData {
  execution_id: string;
  status: string;
  final_state: string;
  termination_reason: string;
  steps_used: number;
  final_answer?: string;
  error_code?: string | number;
  error_source?: string;
  error_message?: string;
  react_steps: ReactStep[];
}

export interface ExecutionResult {
  execution_id: string;
  final_state: string;
  termination_reason: string;
  steps_used: number;
  request_id: string;
}

export interface AppErrorInfo {
  code?: number;
  message?: string;
  source?: string;
}
