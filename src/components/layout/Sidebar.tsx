import React from 'react';
import {
  LayoutDashboard,
  Users,
  UploadCloud,
  BrainCircuit,
  FolderGit2,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  geminiConfigured: boolean;
  followUpCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  geminiConfigured,
  followUpCount = 0,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'leads',
      label: 'Leads Hub',
      icon: Users,
      badge: followUpCount > 0 ? `${followUpCount} due` : undefined,
    },
    { id: 'imports', label: 'Data Imports', icon: UploadCloud },
    { id: 'learnings', label: 'Sales Learnings', icon: BrainCircuit },
    { id: 'portfolio', label: 'Portfolio Library', icon: FolderGit2 },
  ];

  return (
    <aside className="w-64 bg-[#0C0F13] border-r border-[#1C232D] flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-[#1C232D]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2F7EF2] to-[#164282] flex items-center justify-center font-bold text-white shadow-md shadow-[#2F7EF2]/20 border border-[#6FB2FF]/40">
              D
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[#F4F1EA] flex items-center gap-1.5">
                D Web Studio
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#2F7EF2]/20 text-[#6FB2FF] border border-[#2F7EF2]/40 font-mono">
                  LEAD AI
                </span>
              </h1>
              <p className="text-[11px] text-[#8C98A9]">Intelligence & Outreach</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#1C2430] text-[#F4F1EA] border border-[#2F7EF2]/30 shadow-sm'
                    : 'text-[#C3CAD6] hover:bg-[#141A22] hover:text-[#F4F1EA]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-[#2F7EF2]' : 'text-[#8C98A9]'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#2F7EF2]/20 text-[#6FB2FF] border border-[#2F7EF2]/40">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Human-in-the-loop Guardrail */}
      <div className="p-4 border-t border-[#1C232D] space-y-3">
        {/* Engine status */}
        <div className="p-3 rounded-lg bg-[#12171F] border border-[#1E2734]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8C98A9] flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5 text-[#2F7EF2]" />
              AI Engine
            </span>
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                geminiConfigured
                  ? 'text-[#7EE787] bg-[#152E20]'
                  : 'text-[#FFD166] bg-[#2E2815]'
              }`}
            >
              {geminiConfigured ? 'GEMINI 3.8 FLASH' : 'DETERMINISTIC RULES'}
            </span>
          </div>
          <p className="text-[11px] text-[#8C98A9] mt-1.5 leading-tight">
            Strict No-Invention verification active.
          </p>
        </div>

        {/* Safety Badge */}
        <div className="flex items-center gap-2 px-2 text-[11px] text-[#718096]">
          <ShieldCheck className="w-4 h-4 text-[#2F7EF2] shrink-0" />
          <span>Human-in-the-loop: Zero auto-sending.</span>
        </div>
      </div>
    </aside>
  );
};
