import React, { useMemo } from 'react';
import {
  Calendar,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Clock,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  MessageCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { LeadItem, LeadStatus, LeadIntent, chatLinksForLead } from '../../types';
import { Badge } from '../common/Badge';

interface LeadTableProps {
  leads: LeadItem[];
  onSelectLead: (lead: LeadItem) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  intentFilter: string;
  setIntentFilter: (i: string) => void;
  nicheFilter: string;
  setNicheFilter: (n: string) => void;
  sourceFilter: string;
  setSourceFilter: (src: string) => void;
  followUpOnly: boolean;
  setFollowUpOnly: (f: boolean) => void;
  isLoading?: boolean;
}

export const LeadTable: React.FC<LeadTableProps> = ({
  leads,
  onSelectLead,
  statusFilter,
  setStatusFilter,
  intentFilter,
  setIntentFilter,
  nicheFilter,
  setNicheFilter,
  sourceFilter,
  setSourceFilter,
  followUpOnly,
  setFollowUpOnly,
  isLoading = false,
}) => {
  const niches = [
    'ALL',
    'Gym',
    'Restaurant',
    'Salon',
    'Coaching',
    'Local business',
    'Service business',
    'Creator',
    'Startup',
  ];

  const statuses = [
    'ALL',
    'NEW',
    'RESEARCHING',
    'QUALIFIED',
    'REJECTED',
    'DRAFTED',
    'SENT',
    'REPLIED',
    'INTERESTED',
    'HANDOFF',
    'CLOSED',
  ];

  const intents = [
    'ALL',
    'INTERESTED',
    'POSSIBLY_INTERESTED',
    'NEUTRAL',
    'NOT_INTERESTED',
    'NO_RESPONSE',
    'UNKNOWN',
  ];

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="p-4 rounded-xl bg-[#0E131A] border border-[#1C232D] flex flex-wrap items-center gap-3">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#8C98A9]">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#141A22] border border-[#1E2734] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Intent */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#8C98A9]">Intent:</span>
          <select
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            className="bg-[#141A22] border border-[#1E2734] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
          >
            {intents.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        {/* Niche */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#8C98A9]">Niche:</span>
          <select
            value={nicheFilter}
            onChange={(e) => setNicheFilter(e.target.value)}
            className="bg-[#141A22] border border-[#1E2734] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
          >
            {niches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Source */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#8C98A9]">Source:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-[#141A22] border border-[#1E2734] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
          >
            <option value="ALL">ALL SOURCES</option>
            <option value="INSTAGRAM">INSTAGRAM</option>
            <option value="WHATSAPP">WHATSAPP</option>
            <option value="CALLS">CALLS</option>
          </select>
        </div>

        {/* Follow-up only toggle */}
        <button
          onClick={() => setFollowUpOnly(!followUpOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            followUpOnly
              ? 'bg-[#2F7EF2]/20 border-[#2F7EF2] text-[#6FB2FF]'
              : 'bg-[#141A22] border-[#1E2734] text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Follow-Up Needed Only
        </button>

        <div className="ml-auto text-xs text-[#8C98A9] font-mono">
          Showing {leads.length} Leads
        </div>
      </div>

      {/* Table Content */}
      <div className="rounded-xl border border-[#1C232D] bg-[#0C0F13] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#C3CAD6]">
            <thead className="bg-[#0E131A] text-[#8C98A9] uppercase font-mono text-[11px] border-b border-[#1C232D]">
              <tr>
                <th className="py-3 px-4 font-semibold">Lead / Business</th>
                <th className="py-3 px-4 font-semibold">Niche & Source</th>
                <th className="py-3 px-4 font-semibold">Buying Intent</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Suggested Action</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#18202B]">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-[#121820] transition-colors cursor-pointer group"
                >
                  {/* Lead / Business */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#141D29] border border-[#1E2B3C] flex items-center justify-center font-bold text-[#6FB2FF] text-xs shrink-0">
                        {lead.businessName.charAt(0) || 'L'}
                      </div>
                      <div>
                        <div className="font-semibold text-[#F4F1EA] text-sm group-hover:text-[#6FB2FF] transition-colors flex items-center gap-1.5">
                          {lead.businessName !== 'UNKNOWN' ? lead.businessName : lead.personName}
                          {lead.followUpNeeded && (
                            <span className="w-2 h-2 rounded-full bg-[#2F7EF2]" title="Follow-up due" />
                          )}
                        </div>
                        <div className="text-[11px] text-[#8C98A9] flex items-center gap-2">
                          <span>{lead.personName !== 'UNKNOWN' ? lead.personName : 'Contact Unspecified'}</span>
                          {lead.instagramUsername && (
                            <span>@{lead.instagramUsername}</span>
                          )}
                          {lead.location !== 'UNKNOWN' && (
                            <span>• {lead.location}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Niche & Source */}
                  <td className="py-3.5 px-4 space-y-1">
                    <div>
                      <Badge type="niche" value={lead.niche} />
                    </div>
                    <div className="text-[10px] font-mono text-[#8C98A9]">
                      {lead.source}
                    </div>
                  </td>

                  {/* Buying Intent */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Badge type="intent" value={lead.intent} />
                    </div>
                    <div className="text-[10px] text-[#8C98A9] font-mono mt-0.5">
                      Conf: {lead.confidence || 'MEDIUM'}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    <Badge type="status" value={lead.status} />
                  </td>

                  {/* Suggested Action */}
                  <td className="py-3.5 px-4 max-w-xs">
                    <p className="text-[11px] text-[#C3CAD6] truncate">
                      {lead.suggestedNextAction || 'Analyze conversation to determine next step.'}
                    </p>
                    {lead.followUpReason && (
                      <p className="text-[10px] text-[#6FB2FF] truncate font-medium">
                        Due: {lead.followUpReason}
                      </p>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <ChatButtons lead={lead} compact />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLead(lead);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#141A22] hover:bg-[#1E2734] text-xs font-semibold text-[#F4F1EA] border border-[#1E2734] transition-all inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        Dossier
                        <ArrowRight className="w-3 h-3 text-[#2F7EF2]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {leads.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#8C98A9]">
                    <AlertCircle className="w-8 h-8 text-[#8C98A9] mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-[#C3CAD6]">No leads found matching your criteria</p>
                    <p className="text-xs mt-1">Try clearing filters or import new conversations from the Imports tab.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const CHAT_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-3.5 h-3.5" />,
  instagram: <ExternalLink className="w-3.5 h-3.5" />,
  call: <Phone className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
};

/** 1-click chat — WhatsApp / Instagram / call / email seedha khulega. */
export const ChatButtons: React.FC<{ lead: LeadItem; compact?: boolean }> = ({ lead, compact = false }) => {
  const links = useMemo(
    () =>
      chatLinksForLead({
        phone: lead.phone ?? null,
        instagramUsername: lead.instagramUsername ?? null,
        email: lead.email ?? null,
        businessName: lead.businessName,
      }),
    [lead.phone, lead.instagramUsername, lead.email, lead.businessName],
  );
  if (links.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${link.label} — ${link.hint}`}
          className={`inline-flex items-center gap-1 rounded-lg border border-[#1E2734] bg-[#141A22] text-[#6FB2FF] hover:bg-[#1E2734] transition-colors ${
            compact ? 'px-2 py-1.5' : 'px-2.5 py-1.5 text-xs font-semibold'
          }`}
        >
          {CHAT_ICONS[link.id] ?? <MessageCircle className="w-3.5 h-3.5" />}
          {!compact && <span>{link.label}</span>}
        </a>
      ))}
    </div>
  );
};
