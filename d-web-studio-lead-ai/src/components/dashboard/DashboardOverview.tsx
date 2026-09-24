import React from 'react';
import {
  Users,
  Target,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  UploadCloud,
  Layers,
  Send,
  ExternalLink,
} from 'lucide-react';
import { DashboardStats, LeadItem } from '../../types';
import { Badge } from '../common/Badge';

interface DashboardOverviewProps {
  stats: DashboardStats;
  onSelectLead: (leadId: string) => void;
  onNavigateToLeads: (filter?: { followUpOnly?: boolean }) => void;
  onOpenImport: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  stats,
  onSelectLead,
  onNavigateToLeads,
  onOpenImport,
}) => {
  const kpis = [
    {
      label: 'Total Leads',
      value: stats.total,
      icon: Users,
      color: 'text-[#F4F1EA]',
      bg: 'bg-[#182333]',
      border: 'border-[#2F7EF2]/30',
      action: () => onNavigateToLeads(),
    },
    {
      label: 'Qualified Leads',
      value: stats.qualified,
      icon: Target,
      color: 'text-[#6FB2FF]',
      bg: 'bg-[#142640]',
      border: 'border-[#2F7EF2]/40',
      action: () => onNavigateToLeads(),
    },
    {
      label: 'High Intent',
      value: stats.interested,
      icon: Sparkles,
      color: 'text-[#7EE787]',
      bg: 'bg-[#152E20]',
      border: 'border-[#238636]/40',
      action: () => onNavigateToLeads(),
    },
    {
      label: 'Follow-Ups Due',
      value: stats.followUps,
      icon: Clock,
      color: 'text-[#FFD166]',
      bg: 'bg-[#2A2315]',
      border: 'border-[#8A6D1E]/50',
      action: () => onNavigateToLeads({ followUpOnly: true }),
      highlight: true,
    },
    {
      label: 'Disqualified / Rejected',
      value: stats.rejected,
      icon: XCircle,
      color: 'text-[#FF8E8E]',
      bg: 'bg-[#2B1B1D]',
      border: 'border-[#5A2B2F]/40',
      action: () => onNavigateToLeads(),
    },
    {
      label: 'Closed Deals',
      value: stats.closed,
      icon: CheckCircle2,
      color: 'text-[#7EE787]',
      bg: 'bg-[#152E20]',
      border: 'border-[#238636]/40',
      action: () => onNavigateToLeads(),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#142133] via-[#0E1520] to-[#0C0F13] border border-[#2F7EF2]/30 flex items-center justify-between shadow-xl">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-[#F4F1EA] tracking-tight">
            D Web Studio Intelligence Dashboard
          </h2>
          <p className="text-xs text-[#C3CAD6] max-w-xl leading-relaxed">
            Multi-source conversation intelligence for Instagram exports, WhatsApp, and discovery calls. Zero automated sending. Every lead strictly grounded in verifiable message evidence.
          </p>
        </div>

        <button
          onClick={onOpenImport}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-lg shadow-[#2F7EF2]/25 cursor-pointer shrink-0 transition-all"
        >
          <UploadCloud className="w-4 h-4" />
          Import Instagram Export
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={i}
              onClick={kpi.action}
              className={`p-4 rounded-xl bg-[#0E131A] border hover:border-[#2F7EF2]/60 transition-all cursor-pointer flex flex-col justify-between ${
                kpi.highlight ? 'ring-1 ring-[#FFD166]/40' : 'border-[#1C232D]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#8C98A9]">{kpi.label}</span>
                <div className={`p-1.5 rounded-md ${kpi.bg} ${kpi.border} border`}>
                  <Icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
              </div>
              <div className={`text-2xl font-bold font-mono ${kpi.color}`}>
                {kpi.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Two Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Leads & Follow-Up Alert Feed */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Leads Feed */}
          <div className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2F7EF2]" />
                Recent Lead Interactions
              </h3>
              <button
                onClick={() => onNavigateToLeads()}
                className="text-xs text-[#2F7EF2] hover:text-[#6FB2FF] flex items-center gap-1 font-semibold"
              >
                View all in Leads Hub →
              </button>
            </div>

            <div className="divide-y divide-[#18202B]">
              {stats.recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => onSelectLead(lead.id)}
                  className="py-3 flex items-center justify-between hover:bg-[#121820] px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#141D29] border border-[#1E2B3C] flex items-center justify-center font-bold text-[#6FB2FF] text-xs">
                      {lead.businessName.charAt(0) || 'L'}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[#F4F1EA] flex items-center gap-2">
                        {lead.businessName !== 'UNKNOWN' ? lead.businessName : lead.personName}
                        {lead.followUpNeeded && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#FFD166]/20 text-[#FFD166] border border-[#FFD166]/30 font-medium">
                            Follow-up
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8C98A9] flex items-center gap-2 mt-0.5">
                        <Badge type="niche" value={lead.niche} />
                        <span>Source: {lead.source}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge type="intent" value={lead.intent} />
                    <ArrowRight className="w-3.5 h-3.5 text-[#8C98A9]" />
                  </div>
                </div>
              ))}

              {stats.recentLeads.length === 0 && (
                <div className="py-8 text-center text-xs text-[#8C98A9]">
                  No leads recorded yet. Drop an Instagram ZIP into data/instagram/export/ or use the import screen.
                </div>
              )}
            </div>
          </div>

          {/* Outreach Drafts Queue */}
          <div className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <Send className="w-4 h-4 text-[#2F7EF2]" />
              Latest Outreach Drafts for Operator Review
            </h3>

            <div className="space-y-3">
              {stats.recentDrafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => onSelectLead(draft.leadId)}
                  className="p-3.5 rounded-lg bg-[#0C0F13] border border-[#1C232D] hover:border-[#2F7EF2]/40 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#F4F1EA]">
                      Target: {draft.lead?.businessName || 'Lead'} ({draft.lead?.niche || 'General'})
                    </span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        draft.status === 'APPROVED'
                          ? 'bg-[#152E20] text-[#7EE787]'
                          : 'bg-[#2A2315] text-[#FFD166]'
                      }`}
                    >
                      {draft.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#C3CAD6] line-clamp-2 italic">
                    "{draft.messageBody}"
                  </p>
                </div>
              ))}

              {stats.recentDrafts.length === 0 && (
                <div className="py-6 text-center text-xs text-[#8C98A9]">
                  No outreach drafts pending review.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Niche Breakdown & Memory Learnings */}
        <div className="space-y-6">
          {/* Niche Breakdown */}
          <div className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2F7EF2]" />
              Leads by Niche
            </h3>

            <div className="space-y-2.5">
              {stats.niches.map((n) => (
                <div key={n.niche} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#C3CAD6]">{n.niche}</span>
                    <span className="font-mono text-[#8C98A9] font-semibold">{n.count}</span>
                  </div>
                  <div className="w-full bg-[#141A22] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#2F7EF2] h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (n.count / Math.max(1, stats.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Sales Learnings Teaser */}
          <div className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#2F7EF2]" />
                Recent Sales Learnings
              </h3>
            </div>

            <div className="space-y-3">
              {stats.recentLearnings.map((l) => (
                <div
                  key={l.id}
                  className="p-3 rounded-lg bg-[#0C0F13] border border-[#1E2734] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8C98A9]">
                    <span>{l.type}</span>
                    <span className="text-[#6FB2FF]">{l.appliesTo}</span>
                  </div>
                  <p className="text-[#C3CAD6] leading-snug">{l.learning}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
