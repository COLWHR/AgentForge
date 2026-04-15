import React from 'react';

const Sidebar: React.FC = () => {
  return (
    <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-10">
      {/* Brand Area */}
      <div className="p-8 pb-10 flex items-center gap-4">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xl shadow-indigo-500/20 rotate-3 transition-transform hover:rotate-0 cursor-default">
          <span className="text-white font-black text-lg">A</span>
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-black text-white tracking-tighter leading-none">AgentForge</h1>
          <span className="text-[10px] font-bold text-indigo-500 tracking-widest uppercase mt-1">v0.1 Beta</span>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-4 space-y-8 overflow-y-auto custom-scrollbar">
        {/* Workspace Group */}
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 px-4 mb-4">Workspace</div>
          
          <a href="#" className="group flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 rounded-2xl transition-all duration-200">
            <span className="text-xl group-hover:scale-110 transition-transform">📊</span>
            <span className="text-sm font-semibold tracking-tight">控制台 (占位)</span>
          </a>

          <a href="#" className="group flex items-center gap-3 px-4 py-3 bg-indigo-600/10 text-indigo-400 ring-1 ring-indigo-500/20 rounded-2xl shadow-sm">
            <span className="text-xl">🤖</span>
            <span className="text-sm font-black tracking-tight">我的智能体</span>
          </a>

          <a href="#" className="group flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 rounded-2xl transition-all duration-200">
            <span className="text-xl group-hover:scale-110 transition-transform">📚</span>
            <span className="text-sm font-semibold tracking-tight">知识库 (占位)</span>
          </a>
        </div>

        {/* System Group */}
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 px-4 mb-4">System</div>
          
          <a href="#" className="group flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 rounded-2xl transition-all duration-200">
            <span className="text-xl group-hover:scale-110 transition-transform">⚙️</span>
            <span className="text-sm font-semibold tracking-tight">设置 (占位)</span>
          </a>
          
          <a href="#" className="group flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 rounded-2xl transition-all duration-200">
            <span className="text-xl group-hover:scale-110 transition-transform">🛡️</span>
            <span className="text-sm font-semibold tracking-tight">审计 (占位)</span>
          </a>
        </div>
      </nav>

      {/* Team Footer */}
      <div className="p-6 mt-auto">
        <div className="glass-panel rounded-2xl p-4 flex items-center gap-4 group cursor-pointer hover:bg-slate-800/60 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center text-sm font-black text-slate-400 group-hover:text-indigo-400 transition-colors">
            TA
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-xs font-black text-slate-200 truncate leading-tight">Team Alpha</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Quota: 85%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
