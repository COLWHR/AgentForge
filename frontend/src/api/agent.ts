import { apiClient } from './client';
import type { ExecutionData } from '../types/app';

export interface ModelConfig {
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface AgentConfig {
  system_prompt: string;
  model_config: ModelConfig;
  tools: string[];
  constraints: {
    max_steps: number;
  };
}

export interface CreateAgentResponse {
  code: number;
  message: string;
  data: {
    id: string;
  };
}

export interface ExecuteAgentResponse {
  code: number;
  message: string;
  data: {
    execution_id: string;
    final_state: string;
    termination_reason: string;
    steps_used: number;
    request_id: string;
  };
}

export interface GetExecutionResponse {
  code: number;
  message: string;
  data: ExecutionData;
}

export const agentApi = {
  createAgent: (config: AgentConfig): Promise<CreateAgentResponse> => {
    return apiClient('/agents', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },
  
  executeAgent: (agentId: string, input: string): Promise<ExecuteAgentResponse> => {
    return apiClient(`/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  },

  getExecution: (executionId: string): Promise<GetExecutionResponse> => {
    return apiClient(`/executions/${executionId}`, {
      method: 'GET',
    });
  },
};
