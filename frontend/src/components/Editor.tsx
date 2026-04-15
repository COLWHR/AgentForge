import React, { useState } from 'react';
import { agentApi } from '../api/agent';
import type { AppStatus, ExecutionResult, AppErrorInfo } from '../types/app';

interface EditorProps {
  status: AppStatus;
  onStatusChange: (status: AppStatus) => void;
  onAgentCreated: (id: string) => void;
  onExecutionFinished: (data: ExecutionResult) => void;
  agent_id: string | null;
  onError: (err: AppErrorInfo) => void;
  canSave: () => boolean;
  canExecute: () => boolean;
  resetExecution: () => void;
}

const Editor: React.FC<EditorProps> = ({ 
  status, 
  onStatusChange, 
  onAgentCreated, 
  onExecutionFinished,
  agent_id,
  onError,
  canSave,
  canExecute,
  resetExecution
}) => {
  // 1. Form state
  const [agentName, setAgentName] = useState('沈航考勤专家');
  const [description, setDescription] = useState('描述这个智能体的核心能力边界');
  const [systemPrompt, setSystemPrompt] = useState('你是一个专业的校园助手，负责回答学生关于考勤、选课和校园生活的问题。你必须保持严谨、客观，并优先检索知识库信息...');
  const [openingMessage, setOpeningMessage] = useState('你好！我是沈航考勤助手，有什么我可以帮你的吗？');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [tools, setTools] = useState<string[]>(['echo']); // Default tool
  const [testInput, setTestInput] = useState('');

  // 2. Actions
  const handleSave = async () => {
    // --- Guardrail ---
    if (!canSave()) {
      onError({ code: 4001, message: `当前状态 (${status}) 不允许保存配置`, source: 'GUARDRAIL' });
      return;
    }

    onStatusChange('saving');
    try {
      const response = await agentApi.createAgent({
        system_prompt: systemPrompt,
        model_config: {
          model: 'openai/gpt-4o-mini', // Backend model identifier
          temperature: temperature,
          max_tokens: maxTokens,
        },
        tools: tools,
        constraints: {
          max_steps: 5,
        },
      });

      if (response.code === 0) {
        onAgentCreated(response.data.id);
        onStatusChange('idle'); // Save success, move to idle (ready for execution)
      } else {
        throw new Error(response.message || 'Create Agent failed');
      }
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; source?: string };
      onError({
        code: error.code || 5001,
        message: error.message || '保存配置失败',
        source: error.source || 'BACKEND'
      });
      onStatusChange('failed'); // Error state, allows retry
    }
  };

  const handleRun = async () => {
    // --- Guardrail ---
    if (!canExecute()) {
      if (!agent_id) {
        onError({ code: 4002, message: '请先保存 Agent 配置再执行测试', source: 'GUARDRAIL' });
      } else {
        onError({ code: 4003, message: `当前状态 (${status}) 不允许触发执行`, source: 'GUARDRAIL' });
      }
      return;
    }
    
    // Cleanup handled by App.tsx upon receiving new execution_id
    onStatusChange('loading');
    
    try {
      const response = await agentApi.executeAgent(agent_id, testInput);
      if (response.code === 0) {
        onExecutionFinished(response.data);
        // Lifecycle controlled by App.tsx polling
      } else {
        throw new Error(response.message || 'Execution failed');
      }
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; source?: string };
      onError({
        code: error.code || 5002,
        message: error.message || '执行引擎错误',
        source: error.source || 'BACKEND'
      });
      onStatusChange('failed');
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-900 border-r border-slate-800 flex flex-col min-w-[500px] custom-scrollbar">
      <div className="p-10 space-y-12 max-w-4xl mx-auto w-full">
        {/* Page Header */}
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black text-white tracking-tighter">智能体构建器</h2>
          <p className="text-sm font-medium text-slate-500 tracking-tight">配置并测试你的单智能体 ReAct 执行环境</p>
        </div>

        {/* Step 1: 设定身份 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-base font-black shadow-sm shadow-indigo-500/10">1</div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight">设定身份</h3>
          </div>
          
          <div className="industrial-card space-y-8">
            <div className="flex items-start gap-8">
              <div className="w-24 h-24 rounded-2xl bg-slate-900/50 flex items-center justify-center text-slate-600 text-3xl border-2 border-dashed border-slate-700 hover:border-indigo-500/50 hover:text-indigo-400 transition-all cursor-pointer group">
                <span className="group-hover:scale-110 transition-transform">🖼️</span>
              </div>
              <div className="flex-1 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">智能体名称</label>
                  <input 
                    type="text" 
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="例如: 沈航考勤专家" 
                    className="industrial-input"
                    disabled={status === 'saving' || status === 'running'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">简短描述</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="描述这个智能体的核心能力边界" 
                    className="industrial-input"
                    disabled={status === 'saving' || status === 'running'}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2: 赋予灵魂 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-base font-black shadow-sm shadow-indigo-500/10">2</div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight">赋予灵魂</h3>
          </div>
          
          <div className="industrial-card space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">系统提示词 (System Prompt)</label>
              <textarea 
                rows={8}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="你是一个专业的校园助手，负责回答学生关于考勤、选课和校园生活的问题。你必须保持严谨、客观，并优先检索知识库信息..." 
                className="industrial-input resize-none leading-relaxed"
                disabled={status === 'saving' || status === 'running'}
              />
              <p className="text-[10px] text-slate-600 px-1 italic">提示：系统提示词决定了 Agent 的基础性格与任务执行方式。</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">开场白</label>
              <input 
                type="text" 
                value={openingMessage}
                onChange={(e) => setOpeningMessage(e.target.value)}
                placeholder="你好！我是沈航考勤助手，有什么我可以帮你的吗？" 
                className="industrial-input"
                disabled={status === 'saving' || status === 'running'}
              />
            </div>
          </div>
        </section>

        {/* Step 3: 回复设置 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-base font-black shadow-sm shadow-indigo-500/10">3</div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight">回复设置</h3>
          </div>
          
          <div className="industrial-card grid grid-cols-2 gap-10">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">温度 (Temperature)</label>
                <span className="text-xs font-black text-indigo-400 font-mono">{temperature}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50" 
                disabled={status === 'saving' || status === 'running'}
              />
              <div className="flex justify-between text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">最大回复长度 (Max Tokens)</label>
              <input 
                type="number" 
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="industrial-input font-mono"
                disabled={status === 'saving' || status === 'running'}
              />
            </div>
          </div>
        </section>

        {/* Step 4: 工具与知识库 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-base font-black shadow-sm shadow-indigo-500/10">4</div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight">能力扩展</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div 
              className={`industrial-card p-5 flex items-center justify-between group cursor-pointer border-indigo-500/20 ${tools.includes('web_search') ? 'bg-indigo-500/5' : ''} ${(status === 'saving' || status === 'running') ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (status === 'saving' || status === 'running') return;
                if (tools.includes('web_search')) {
                  setTools(tools.filter(t => t !== 'web_search'));
                } else {
                  setTools([...tools, 'web_search']);
                }
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">🌐</div>
                <div className="flex flex-col">
                  <p className="text-sm font-black text-slate-200">网页搜索</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">Web Search Tool</p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full relative transition-colors shadow-inner ${tools.includes('web_search') ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${tools.includes('web_search') ? 'right-1' : 'left-1'}`}></div>
              </div>
            </div>
            
            <div 
              className={`industrial-card p-5 flex items-center justify-between group cursor-pointer ${tools.includes('python_add') ? 'bg-indigo-500/5' : ''} ${(status === 'saving' || status === 'running') ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (status === 'saving' || status === 'running') return;
                if (tools.includes('python_add')) {
                  setTools(tools.filter(t => t !== 'python_add'));
                } else {
                  setTools([...tools, 'python_add']);
                }
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform grayscale group-hover:grayscale-0">💻</div>
                <div className="flex flex-col">
                  <p className="text-sm font-black text-slate-400 group-hover:text-slate-200 transition-colors">代码执行</p>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight mt-1">Python Sandbox</p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full relative transition-colors shadow-inner ${tools.includes('python_add') ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${tools.includes('python_add') ? 'right-1' : 'left-1'}`}></div>
              </div>
            </div>
          </div>

          <div className="industrial-card space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">挂载知识库 (Vector Knowledge)</label>
            <div className="flex flex-wrap gap-3">
              <div className="px-4 py-2 bg-slate-900/50 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold rounded-xl flex items-center gap-2 shadow-sm">
                <span>📄</span> 沈航考勤规则.pdf
              </div>
              <div className="px-4 py-2 bg-slate-900/50 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold rounded-xl flex items-center gap-2 shadow-sm">
                <span>📄</span> 学生手册2024.pdf
              </div>
              <button className="px-4 py-2 border-2 border-dashed border-slate-700 text-slate-500 text-[11px] font-black rounded-xl hover:border-indigo-500/50 hover:text-indigo-400 transition-all">
                + 添加本地文档
              </button>
            </div>
          </div>
        </section>

        {/* Step 5: 执行入口 */}
        <section className="space-y-8 pt-8 border-t border-slate-800 pb-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-base font-black shadow-sm shadow-indigo-500/10">5</div>
              <h3 className="text-xl font-black text-slate-100 tracking-tight">执行测试</h3>
            </div>
            <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-800/80 rounded-full border border-slate-700/50 shadow-sm">
              <div className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{status}</span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="relative group">
              <textarea 
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="在此输入测试指令，例如：'帮我总结考勤规则的重点'..." 
                className="w-full bg-slate-800/80 border-2 border-slate-700/50 rounded-3xl px-8 py-6 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all resize-none shadow-2xl leading-relaxed text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                rows={4}
                disabled={status === 'running' || status === 'saving'}
              />
              <button 
                onClick={handleRun}
                disabled={!canExecute()}
                className="absolute bottom-6 right-6 primary-button px-8 py-3 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
              >
                {status === 'running' ? (
                  <>
                    <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span className="tracking-tight">Executing Engine...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">⚡</span>
                    <span className="tracking-tight">Run Agent</span>
                  </>
                )}
              </button>
            </div>
            <div className="flex justify-center gap-6">
              <button 
                onClick={handleSave}
                disabled={!canSave()}
                className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'saving' ? 'Saving...' : '💾 Save Configuration'}
              </button>
              <div className="w-[1px] h-4 bg-slate-800 self-center"></div>
              <button 
                onClick={resetExecution}
                className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 hover:text-red-400 transition-colors"
              >
                🧹 Clear Logs
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Editor;
