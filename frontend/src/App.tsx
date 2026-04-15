import { useState, useRef, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import Preview from './components/Preview'
import type { AppStatus, ExecutionResult, AppErrorInfo, ExecutionData } from './types/app'
import { agentApi } from './api/agent'

function App() {
  // 全局状态定义
  const [status, setStatus] = useState<AppStatus>('idle')
  
  // 关键状态位
  const [agentId, setAgentId] = useState<string | null>(null)
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [executionData, setExecutionData] = useState<ExecutionData | null>(null)
  
  // 错误信息
  const [errorCode, setErrorCode] = useState<number | null>(null)
  const [errorSource, setErrorSource] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Polling handle
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // --- Guardrails & Helpers ---
  const canSave = () => status !== 'saving' && status !== 'running'
  const canExecute = () => status !== 'saving' && status !== 'running' && !!agentId

  const resetError = () => {
    setErrorCode(null)
    setErrorSource(null)
    setErrorMessage(null)
  }

  const isExecutionTerminalStatus = (statusStr: string) => {
    const terminalStatuses = ['success', 'failed', 'timeout', 'cancelled'];
    return terminalStatuses.includes(statusStr.toLowerCase());
  }

  const mapExecutionStatusToViewStatus = (rawStatus: string): AppStatus => {
    const s = rawStatus.toLowerCase();
    if (s === 'running' || s === 'created') return 'running'
    if (s === 'success') return 'success'
    if (s === 'failed' || s === 'timeout' || s === 'cancelled') return 'failed'
    return 'running' // Default to running if not terminal but not explicitly created/running
  }

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
  }, [])

  const resetExecutionViewState = useCallback(() => {
    setExecutionId(null)
    setExecutionData(null)
    resetError()
    stopPolling()
  }, [stopPolling])

  const pollExecutionOnce = useCallback(async (id: string) => {
    try {
      const response = await agentApi.getExecution(id)
      if (response.code === 0) {
        const data = response.data
        setExecutionData(data)
        
        // 只有在首次成功拿到 executionData 后，再从 loading 切换为 running/success/failed
        const nextStatus = mapExecutionStatusToViewStatus(data.status)
        setStatus(nextStatus)

        // 判断终态
        if (isExecutionTerminalStatus(data.status)) {
          stopPolling()
        }
      } else {
        throw new Error(response.message || 'Fetch execution failed')
      }
    } catch (err: any) {
      console.error('Polling error:', err)
      setErrorCode(err.code || 5003)
      setErrorMessage(err.message || '获取执行状态失败')
      setErrorSource('BACKEND')
      setStatus('failed')
      stopPolling()
    }
  }, [stopPolling])

  const startPolling = useCallback((id: string) => {
    stopPolling() // 确保清理旧轮询
    
    // 保持 executionViewState 为 loading
    setStatus('loading')
    
    // 立即执行一次
    pollExecutionOnce(id)
    
    // 启动定时轮询
    pollingTimerRef.current = setInterval(() => {
      pollExecutionOnce(id)
    }, 2000)
  }, [pollExecutionOnce, stopPolling])

  useEffect(() => {
    return () => stopPolling() // 卸载时清理
  }, [stopPolling])

  const handleExecutionResult = (data: ExecutionResult) => {
    setExecutionId(data.execution_id)
    startPolling(data.execution_id)
  }

  const handleStatusChange = useCallback((newStatus: AppStatus) => {
    if (newStatus === 'loading') {
      // 强约束：在点击 Run 的瞬间立即清理旧状态，防止竞态污染
      stopPolling()
      setExecutionData(null)
      setExecutionId(null)
      resetError()
    }
    setStatus(newStatus)
  }, [stopPolling])

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-200 overflow-hidden font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 左侧导航栏 (Sidebar) - 固定宽度 */}
      <Sidebar />

      {/* 中间编辑区 (Editor) - 自适应宽度 */}
      <Editor 
        status={status} 
        onStatusChange={handleStatusChange} 
        onAgentCreated={setAgentId}
        onExecutionFinished={handleExecutionResult}
        agent_id={agentId}
        canSave={canSave}
        canExecute={canExecute}
        resetExecution={resetExecutionViewState}
        onError={(err: AppErrorInfo) => {
          setErrorCode(err.code || 500)
          setErrorMessage(err.message || 'Unknown error')
          setErrorSource(err.source || 'FRONTEND')
        }}
      />

      {/* 右侧预览区 (Preview / Logs) - 固定宽度 */}
      <Preview 
        status={status}
        agent_id={agentId}
        execution_id={executionId}
        execution_data={executionData}
        error_code={errorCode}
        error_source={errorSource}
        error_message={errorMessage}
      />
    </div>
  )
}

export default App
