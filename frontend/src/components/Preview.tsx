import React from 'react';
import type { AppStatus, ExecutionData, ReactStep } from '../types/app';

interface PreviewProps {
  status: AppStatus;
  agent_id: string | null;
  execution_id: string | null;
  execution_data: ExecutionData | null;
  error_code: number | null;
  error_source: string | null;
  error_message: string | null;
}

const StepCard: React.FC<{ step: ReactStep }> = ({ step }) => {
  const renderValue = (val: any) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return val;
    return JSON.stringify(val, null, 2);
  };

  return (
    <div className="industrial-card bg-slate-800/50 border-slate-700/50 p-4 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Step {step.step_index}</span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
          step.step_status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
          step.step_status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
          'bg-amber-500/10 text-amber-500 border-amber-500/20'
        }`}>
          {step.step_status.toUpperCase()}
        </span>
      </div>

      {step.thought && (
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Thought</label>
          <p className="text-xs text-slate-300 leading-relaxed italic whitespace-pre-wrap break-words">{step.thought}</p>
        </div>
      )}

      {step.action !== null && step.action !== undefined && (
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Action</label>
          <pre className="text-[10px] text-indigo-300 bg-slate-900/50 p-2 rounded-lg overflow-x-auto custom-scrollbar font-mono whitespace-pre-wrap break-words">
            {renderValue(step.action)}
          </pre>
        </div>
      )}

      {step.observation !== null && step.observation !== undefined && (
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Observation</label>
          <div className="text-[10px] text-emerald-400 bg-slate-900/50 p-2 rounded-lg max-h-32 overflow-y-auto custom-scrollbar font-mono whitespace-pre-wrap break-words">
            {renderValue(step.observation)}
          </div>
        </div>
      )}

      {(step.error_code || step.error_message) && (
        <div className="mt-2 bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-2 text-red-500 text-[9px] font-black uppercase">
            <span>⚠️ Step Error</span>
            {step.error_code && <span className="opacity-60">[{step.error_code}]</span>}
          </div>
          <p className="text-[10px] text-red-400 leading-tight whitespace-pre-wrap break-words">{step.error_message}</p>
        </div>
      )}
    </div>
  );
};

const Preview: React.FC<PreviewProps> = ({ 
  status, 
  agent_id, 
  execution_id, 
  execution_data,
  error_code, 
  error_source, 
  error_message 
}) => {
  // Error priority: API error (props) > execution_data error
  const currentErrorCode = error_code || execution_data?.error_code;
  const currentErrorSource = error_code ? error_source : (execution_data?.error_source || 'UNKNOWN');
  const currentErrorMessage = error_code ? error_message : (execution_data?.error_message || 'No detailed error message provided.');

  return (
    <div className="w-[480px] h-screen bg-slate-900 flex flex-col shrink-0 overflow-hidden relative border-l border-slate-800">
      {/* Header / Status Bar */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-2xl shadow-inner">🤖</div>
          <div className="flex flex-col">
            <h3 className="text-sm font-black text-white tracking-tight">预览与执行日志</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${
                status === 'running' || status === 'loading' ? 'bg-amber-500 animate-pulse' : 
                status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 
                status === 'failed' ? 'bg-red-500' : 'bg-slate-600'
              }`}></div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{status}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all">🔄</button>
          <button className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all">📑</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar pb-32">
        {status === 'idle' ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30 grayscale">
            <div className="text-6xl animate-bounce">✨</div>
            <div className="space-y-2">
              <p className="text-lg font-black text-slate-300 tracking-tighter">等待执行测试</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Configure your agent and click "Run Agent"</p>
            </div>
          </div>
        ) : (
          <>
            {/* User Message Bubble */}
            <div className="flex flex-col items-end space-y-3">
              <div className="bg-indigo-600 text-white px-6 py-4 rounded-3xl rounded-tr-none max-w-[90%] text-sm font-medium shadow-xl shadow-indigo-500/10 leading-relaxed break-words whitespace-pre-wrap">
                指令已发送，正在处理中...
              </div>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-2">User</span>
            </div>

            {/* Execution Trace Header */}
            <div className="space-y-6 relative">
              <div className="flex items-center gap-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] px-2">
                <span>Execution Logs</span>
                <div className="h-[1px] flex-1 bg-slate-800"></div>
              </div>
              
              <div className="pl-2 space-y-4">
                <p className="text-xs text-slate-400 italic">
                  {status === 'loading' ? '正在连接引擎...' : status === 'running' ? '引擎正在思考中...' : status === 'success' ? '执行成功，请查看下方结果。' : status === 'failed' ? '执行终止。' : '准备就绪'}
                </p>
              </div>
            </div>

            {/* React Steps List */}
            {execution_data && execution_data.react_steps && execution_data.react_steps.length > 0 && (
              <div className="space-y-6">
                {execution_data.react_steps.map((step) => (
                  <StepCard key={step.step_index} step={step} />
                ))}
              </div>
            )}

            {/* Final Answer */}
            {execution_data?.final_answer && (
              <div className="flex flex-col items-start space-y-3">
                <div className="industrial-card bg-slate-800 border-slate-700/50 text-slate-100 px-6 py-5 rounded-3xl rounded-tl-none max-w-[95%] text-sm font-medium shadow-2xl shadow-black/20 leading-relaxed whitespace-pre-wrap break-words">
                  <p>{execution_data.final_answer}</p>
                </div>
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-2">AgentForge</span>
              </div>
            )}

            {/* Execution Metadata Card */}
            <div className="mt-12 space-y-6 pb-4">
              <div className="flex items-center gap-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] px-2">
                <span>Metadata</span>
                <div className="h-[1px] flex-1 bg-slate-800"></div>
              </div>
              <div className="industrial-card bg-slate-950/40 border-slate-800/80 p-5 font-mono text-[10px] space-y-3 shadow-inner">
                <div className="flex justify-between items-center group">
                  <span className="text-slate-600 font-black">EXECUTION_ID</span>
                  <span className="text-slate-400 group-hover:text-indigo-400 transition-colors truncate ml-4 max-w-[200px]" title={execution_id || ''}>{execution_id || '---'}</span>
                </div>
                {execution_data && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-black">STATUS</span>
                      <span className={`px-2 py-0.5 rounded font-black border ${
                        execution_data.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                        execution_data.status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>{execution_data.status.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-black">FINAL_STATE</span>
                      <span className="text-slate-300 font-black uppercase">{execution_data.final_state}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-black">TERMINATION</span>
                      <span className="text-slate-300 font-black uppercase">{execution_data.termination_reason}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-black">STEPS_USED</span>
                      <span className="text-slate-300 font-black uppercase">{execution_data.steps_used}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Global Error Card (Top Level Error) */}
            {currentErrorCode && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-4 shadow-xl shadow-red-500/5">
                <div className="flex items-center gap-3 text-red-500">
                  <span className="text-2xl animate-pulse">⚠️</span>
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Execution Failure</span>
                </div>
                <div className="space-y-3 font-mono text-[11px] bg-red-950/20 p-4 rounded-xl border border-red-500/10">
                  <div className="flex justify-between">
                    <span className="text-red-500/60 font-black">ERROR_CODE</span>
                    <span className="text-red-400 font-black">{currentErrorCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-500/60 font-black">SOURCE</span>
                    <span className="text-red-400 font-black">{currentErrorSource}</span>
                  </div>
                  <p className="text-red-300 mt-4 leading-relaxed border-t border-red-500/10 pt-4 whitespace-pre-wrap break-words">
                    {currentErrorMessage}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Overlay Bar - Kept for visual consistency, input handled by Editor */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent shrink-0">
        <div className="relative group opacity-50">
          <input 
            type="text" 
            placeholder="在中间编辑区输入指令..." 
            readOnly
            className="w-full bg-slate-800 border-2 border-slate-700/60 rounded-2xl px-6 py-4 pr-16 text-sm text-slate-500 placeholder:text-slate-600 cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
};

export default Preview;
