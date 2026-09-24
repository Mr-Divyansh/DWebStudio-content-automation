import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  ShieldAlert,
  Send,
  Edit3,
  Calendar,
  Building,
  User,
  MapPin,
  Globe,
  AlertCircle,
  Clock,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import { LeadItem, PortfolioProjectItem } from '../../types';
import { Badge } from '../common/Badge';
import { api } from '../../lib/api';

interface LeadDetailModalProps {
  lead: LeadItem;
  onClose: () => void;
  onUpdate: () => void;
  portfolioProjects: PortfolioProjectItem[];
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  lead,
  onClose,
  onUpdate,
  portfolioProjects,
}) => {
  const [activeTab, setActiveTab] = useState<'intelligence' | 'conversation' | 'outreach' | 'correction'>('intelligence');
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [copiedQuote, setCopiedQuote] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Correction state
  const [correctionField, setCorrectionField] = useState('intent');
  const [correctedValue, setCorrectedValue] = useState('NOT_INTERESTED');
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);

  // Parse JSON fields
  let parsedObjections: string[] = [];
  try {
    if (lead.objections) parsedObjections = JSON.parse(lead.objections);
  } catch {
    parsedObjections = [];
  }

  let parsedEvidence: Array<{ claim: string; evidence: string; source: string; confidence: string }> = [];
  try {
    if (lead.evidence) parsedEvidence = JSON.parse(lead.evidence);
  } catch {
    parsedEvidence = [];
  }

  const latestDraft = lead.outreachDrafts?.[0];
  const matchedProject = portfolioProjects.find((p) => p.category.toLowerCase() === lead.portfolioMatch?.toLowerCase());

  const handleCopyText = (text: string, isDraft = false) => {
    navigator.clipboard.writeText(text);
    if (isDraft) {
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2500);
    } else {
      setCopiedQuote(text);
      setTimeout(() => setCopiedQuote(null), 2500);
    }
  };

  const handleRunAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      setNotice(null);
      const res = await api.analyzeLead(lead.id);
      if (res.warning) {
        setNotice(res.warning);
      }
      onUpdate();
    } catch (err: any) {
      setNotice(err?.message || 'Failed to analyze lead');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateDraft = async () => {
    try {
      setIsDrafting(true);
      await api.draftMessage(lead.id);
      onUpdate();
      setActiveTab('outreach');
    } catch (err: any) {
      setNotice(err?.message || 'Failed to draft outreach');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleApproveDraft = async (draftId: string) => {
    try {
      setIsApproving(true);
      await api.approveDraft(lead.id, draftId);
      onUpdate();
      setNotice('Draft marked as Approved. You can now copy and send it through Instagram or WhatsApp.');
    } catch (err: any) {
      setNotice(err?.message || 'Failed to approve draft');
    } finally {
      setIsApproving(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionReason.trim()) {
      setNotice('Please provide a reason for the correction to train the memory engine.');
      return;
    }

    try {
      setIsSubmittingCorrection(true);
      const original = (lead as any)[correctionField] || 'UNKNOWN';
      await api.submitCorrection({
        leadId: lead.id,
        field: correctionField,
        originalValue: String(original),
        correctedValue,
        userReason: correctionReason,
      });
      setNotice('Correction applied and saved to structured learnings repository!');
      setCorrectionReason('');
      onUpdate();
      setActiveTab('intelligence');
    } catch (err: any) {
      setNotice(err?.message || 'Failed to record correction');
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0C0F13] border border-[#1E2734] rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1C232D] bg-[#0E131A] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#182333] border border-[#2F7EF2]/30 flex items-center justify-center font-bold text-[#6FB2FF]">
              {lead.businessName.charAt(0) || 'L'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#F4F1EA]">
                  {lead.businessName !== 'UNKNOWN' ? lead.businessName : lead.personName}
                </h2>
                <Badge type="intent" value={lead.intent} />
                <Badge type="status" value={lead.status} />
                {lead.followUpNeeded && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#2F7EF2]/20 text-[#6FB2FF] border border-[#2F7EF2]/40 font-medium">
                    Follow-Up Due
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-[#8C98A9] mt-1">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {lead.personName !== 'UNKNOWN' ? lead.personName : 'Contact Unspecified'}
                </span>
                {lead.instagramUsername && (
                  <a
                    href={`https://instagram.com/${lead.instagramUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#6FB2FF] hover:underline flex items-center gap-1"
                  >
                    @{lead.instagramUsername}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {lead.location}
                </span>
                <Badge type="niche" value={lead.niche} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141A22] hover:bg-[#1C2533] text-[#C3CAD6] hover:text-[#F4F1EA] text-xs border border-[#1E2734] transition-all cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 text-[#2F7EF2] ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'Analyzing...' : 'Re-Analyze'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#8C98A9] hover:text-[#F4F1EA] hover:bg-[#141A22] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {notice && (
          <div className="px-6 py-2 bg-[#1A2533] border-b border-[#2F7EF2]/30 text-xs text-[#96C5FF] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#2F7EF2]" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-[#8C98A9] hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-6 border-b border-[#1C232D] bg-[#0C0F13] flex gap-6 shrink-0">
          <button
            onClick={() => setActiveTab('intelligence')}
            className={`py-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === 'intelligence'
                ? 'border-[#2F7EF2] text-[#6FB2FF]'
                : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
            }`}
          >
            AI Intelligence & Evidence
          </button>
          <button
            onClick={() => setActiveTab('conversation')}
            className={`py-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === 'conversation'
                ? 'border-[#2F7EF2] text-[#6FB2FF]'
                : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
            }`}
          >
            Conversation Transcript ({lead.conversations?.[0]?.messages?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('outreach')}
            className={`py-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === 'outreach'
                ? 'border-[#2F7EF2] text-[#6FB2FF]'
                : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
            }`}
          >
            Outreach Draft {latestDraft ? '(Ready)' : ''}
          </button>
          <button
            onClick={() => setActiveTab('correction')}
            className={`py-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === 'correction'
                ? 'border-[#2F7EF2] text-[#6FB2FF]'
                : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
            }`}
          >
            Correct AI & Teach Memory
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: INTELLIGENCE & EVIDENCE */}
          {activeTab === 'intelligence' && (
            <div className="space-y-6">
              {/* Summary Card */}
              <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8C98A9] tracking-wider uppercase">
                    Conversation Summary
                  </span>
                  <span className="text-xs text-[#8C98A9] font-mono">
                    Source: {lead.source}
                  </span>
                </div>
                <p className="text-sm text-[#F4F1EA] leading-relaxed">
                  {lead.conversationSummary || 'No summary available.'}
                </p>
                {lead.qualificationReason && (
                  <div className="pt-2 border-t border-[#1C232D] text-xs text-[#C3CAD6]">
                    <span className="font-semibold text-[#8C98A9]">Qualification Rationale: </span>
                    {lead.qualificationReason}
                  </div>
                )}
              </div>

              {/* Grid Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Intent & Confidence */}
                <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-2">
                  <div className="text-xs font-semibold text-[#8C98A9]">Buying Intent</div>
                  <div className="flex items-center gap-2">
                    <Badge type="intent" value={lead.intent} />
                    <Badge type="confidence" value={lead.confidence || 'MEDIUM'} />
                  </div>
                  <p className="text-xs text-[#8C98A9] mt-1 leading-snug">
                    Verified through conversation exchange analysis.
                  </p>
                </div>

                {/* Offer / Pricing Discussed */}
                <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-2">
                  <div className="text-xs font-semibold text-[#8C98A9]">Commercial Scope</div>
                  <div className="text-sm font-bold text-[#F4F1EA]">
                    {lead.priceDiscussed || lead.offerDiscussed || 'No Pricing Discussed Yet'}
                  </div>
                  <p className="text-xs text-[#8C98A9]">
                    Strict No-Invention rule: Only verified figures appear here.
                  </p>
                </div>

                {/* Suggested Action */}
                <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-2">
                  <div className="text-xs font-semibold text-[#8C98A9]">Recommended Next Action</div>
                  <div className="text-xs text-[#6FB2FF] font-medium leading-relaxed">
                    {lead.suggestedNextAction || 'Review conversation and send personalized outreach.'}
                  </div>
                  <button
                    onClick={handleGenerateDraft}
                    disabled={isDrafting}
                    className="mt-2 text-xs text-[#2F7EF2] hover:text-[#6FB2FF] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isDrafting ? 'Drafting...' : 'Generate Outreach Draft →'}
                  </button>
                </div>
              </div>

              {/* Matched Portfolio Card */}
              <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#8C98A9] tracking-wider uppercase flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[#2F7EF2]" />
                    Matched D Web Studio Portfolio Case Study
                  </div>
                  <Badge type="niche" value={lead.portfolioMatch || 'NO_MATCH'} />
                </div>
                {matchedProject ? (
                  <div className="p-3 rounded-lg bg-[#0C0F13] border border-[#1E2734] space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-[#F4F1EA]">{matchedProject.title}</h4>
                      {matchedProject.liveUrl && (
                        <a
                          href={matchedProject.liveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#2F7EF2] hover:underline flex items-center gap-1"
                        >
                          View Live <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-[#C3CAD6]">{matchedProject.description}</p>
                    {matchedProject.results && (
                      <div className="text-xs font-mono text-[#7EE787] bg-[#152E20]/40 p-2 rounded border border-[#238636]/30">
                        Result: {matchedProject.results}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#8C98A9]">
                    No portfolio match detected for this lead. Custom bespoke presentation recommended.
                  </p>
                )}
              </div>

              {/* STRICT EVIDENCE MATRIX */}
              <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#8C98A9] tracking-wider uppercase flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#2F7EF2]" />
                    Strict Grounding & Evidence (No-Invention Policy)
                  </div>
                  <span className="text-xs text-[#8C98A9] font-mono">
                    {parsedEvidence.length} Verified Claims
                  </span>
                </div>

                {parsedEvidence.length > 0 ? (
                  <div className="space-y-2">
                    {parsedEvidence.map((ev, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-[#0C0F13] border border-[#1E2734] space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#F4F1EA]">{ev.claim}</span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#1C232D] text-[#8C98A9]">
                            {ev.confidence} Confidence
                          </span>
                        </div>
                        <div className="p-2 rounded bg-[#141A22] border-l-2 border-[#2F7EF2] text-xs text-[#C3CAD6] italic font-mono flex items-center justify-between">
                          <span>"{ev.evidence}"</span>
                          <button
                            onClick={() => handleCopyText(ev.evidence)}
                            className="text-[#8C98A9] hover:text-[#F4F1EA] ml-2 shrink-0"
                            title="Copy Quote"
                          >
                            {copiedQuote === ev.evidence ? (
                              <Check className="w-3.5 h-3.5 text-[#7EE787]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8C98A9]">
                    No explicit quote evidence recorded. Re-running AI analysis will ground new claims from transcript.
                  </p>
                )}
              </div>

              {/* Objections List */}
              {parsedObjections.length > 0 && (
                <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-2">
                  <div className="text-xs font-bold text-[#8C98A9] tracking-wider uppercase">
                    Detected Objections & Friction Points
                  </div>
                  <ul className="space-y-1">
                    {parsedObjections.map((obj, i) => (
                      <li
                        key={i}
                        className="text-xs text-[#FF8E8E] bg-[#2B1B1D]/40 border border-[#5A2B2F]/40 px-3 py-2 rounded-lg flex items-center gap-2"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONVERSATION TRANSCRIPT */}
          {activeTab === 'conversation' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-[#12171F] border border-[#1E2734] flex items-center justify-between text-xs text-[#8C98A9]">
                <span>Conversation ID: {lead.conversations?.[0]?.externalId || lead.sourceConversationId || 'N/A'}</span>
                <span>Messages: {lead.conversations?.[0]?.messages?.length || 0}</span>
              </div>

              <div className="space-y-3">
                {lead.conversations?.[0]?.messages?.map((msg, i) => {
                  const isUser = msg.senderType === 'USER';
                  return (
                    <div
                      key={msg.id || i}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-[#8C98A9]">
                        <span className="font-semibold text-[#C3CAD6]">{msg.sender}</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`max-w-[75%] p-3.5 rounded-xl text-sm ${
                          isUser
                            ? 'bg-[#1D3256] text-[#F4F1EA] rounded-tr-none border border-[#2F7EF2]/40'
                            : 'bg-[#141A22] text-[#C3CAD6] rounded-tl-none border border-[#1E2734]'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  );
                })}

                {(!lead.conversations || lead.conversations.length === 0 || !lead.conversations[0]?.messages?.length) && (
                  <div className="p-8 text-center text-sm text-[#8C98A9]">
                    No messages stored for this conversation record.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: OUTREACH DRAFT */}
          {activeTab === 'outreach' && (
            <div className="space-y-6">
              {latestDraft ? (
                <div className="p-5 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#8C98A9] uppercase tracking-wider">
                        Tailored Outreach Draft
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#182333] text-[#6FB2FF] border border-[#2F7EF2]/30">
                        {latestDraft.channel}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-mono ${
                          latestDraft.status === 'APPROVED'
                            ? 'bg-[#152E20] text-[#7EE787]'
                            : 'bg-[#2A2315] text-[#FFD166]'
                        }`}
                      >
                        {latestDraft.status}
                      </span>
                    </div>

                    <button
                      onClick={handleGenerateDraft}
                      disabled={isDrafting}
                      className="text-xs text-[#2F7EF2] hover:text-[#6FB2FF] flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  </div>

                  {/* Message Body Card */}
                  <div className="p-4 rounded-lg bg-[#0C0F13] border border-[#1E2734] text-sm text-[#F4F1EA] whitespace-pre-wrap font-sans leading-relaxed relative group">
                    {latestDraft.messageBody}
                  </div>

                  {/* Personalization Reason */}
                  {latestDraft.personalizationReason && (
                    <div className="text-xs text-[#8C98A9] bg-[#0E131A] p-3 rounded-lg border border-[#1A222D]">
                      <span className="font-semibold text-[#C3CAD6]">Tailoring Rationale: </span>
                      {latestDraft.personalizationReason}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => handleCopyText(latestDraft.messageBody, true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-md shadow-[#2F7EF2]/20 transition-all cursor-pointer"
                    >
                      {copiedDraft ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          Copied to Clipboard!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Message
                        </>
                      )}
                    </button>

                    {latestDraft.status !== 'APPROVED' && (
                      <button
                        onClick={() => handleApproveDraft(latestDraft.id)}
                        disabled={isApproving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#141A22] hover:bg-[#1E2734] text-[#7EE787] text-xs font-semibold border border-[#238636]/40 transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#7EE787]" />
                        {isApproving ? 'Approving...' : 'Approve Draft'}
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-[#718096]">
                    Human Operator Policy: The system does not auto-send messages. Copy and dispatch through your Instagram or WhatsApp client directly.
                  </p>
                </div>
              ) : (
                <div className="p-12 text-center rounded-xl bg-[#12171F] border border-[#1E2734] space-y-4">
                  <div className="w-12 h-12 rounded-full bg-[#182333] border border-[#2F7EF2]/30 flex items-center justify-center mx-auto text-[#2F7EF2]">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F4F1EA]">No Outreach Draft Generated Yet</h3>
                    <p className="text-xs text-[#8C98A9] max-w-sm mx-auto mt-1">
                      Our intelligence engine drafts personalized, low-friction outreach tailored to verified conversation evidence.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateDraft}
                    disabled={isDrafting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-lg shadow-[#2F7EF2]/25 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isDrafting ? 'Generating...' : 'Generate Personalized Outreach'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: USER CORRECTIONS & MEMORY LEARNING */}
          {activeTab === 'correction' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-[#2F7EF2]" />
                    Correct AI Classification & Train Memory
                  </h3>
                  <p className="text-xs text-[#8C98A9] mt-1">
                    When you override an AI decision, your reasoning is permanently stored in the Structured Sales Learnings repository. Future AI analyses will ground themselves in your rules.
                  </p>
                </div>

                <form onSubmit={handleSubmitCorrection} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#8C98A9] mb-1.5">
                        Field to Correct
                      </label>
                      <select
                        value={correctionField}
                        onChange={(e) => setCorrectionField(e.target.value)}
                        className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
                      >
                        <option value="intent">Buying Intent (INTERESTED, NOT_INTERESTED, etc.)</option>
                        <option value="status">Lead Pipeline Status</option>
                        <option value="qualification">Qualification (QUALIFIED, DISQUALIFIED)</option>
                        <option value="niche">Business Niche</option>
                        <option value="portfolioMatch">Matched Portfolio Category</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#8C98A9] mb-1.5">
                        Corrected Value
                      </label>
                      {correctionField === 'intent' ? (
                        <select
                          value={correctedValue}
                          onChange={(e) => setCorrectedValue(e.target.value)}
                          className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
                        >
                          <option value="INTERESTED">INTERESTED</option>
                          <option value="POSSIBLY_INTERESTED">POSSIBLY_INTERESTED</option>
                          <option value="NEUTRAL">NEUTRAL</option>
                          <option value="NOT_INTERESTED">NOT_INTERESTED</option>
                          <option value="NO_RESPONSE">NO_RESPONSE</option>
                          <option value="UNKNOWN">UNKNOWN</option>
                        </select>
                      ) : correctionField === 'qualification' ? (
                        <select
                          value={correctedValue}
                          onChange={(e) => setCorrectedValue(e.target.value)}
                          className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
                        >
                          <option value="QUALIFIED">QUALIFIED</option>
                          <option value="DISQUALIFIED">DISQUALIFIED</option>
                          <option value="PENDING_INFO">PENDING_INFO</option>
                        </select>
                      ) : correctionField === 'niche' || correctionField === 'portfolioMatch' ? (
                        <select
                          value={correctedValue}
                          onChange={(e) => setCorrectedValue(e.target.value)}
                          className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
                        >
                          <option value="Gym">Gym</option>
                          <option value="Restaurant">Restaurant</option>
                          <option value="Salon">Salon</option>
                          <option value="Coaching">Coaching</option>
                          <option value="Local business">Local business</option>
                          <option value="Service business">Service business</option>
                          <option value="Creator">Creator</option>
                          <option value="Startup">Startup</option>
                          <option value="NO_MATCH">NO_MATCH</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={correctedValue}
                          onChange={(e) => setCorrectedValue(e.target.value)}
                          className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#8C98A9] mb-1.5">
                      Rationale / Explanation (Becomes Persistent Learning)
                    </label>
                    <textarea
                      rows={3}
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g. Lead clarified they only want a free social media consultation, not a web redesign."
                      className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg p-3 text-xs text-[#F4F1EA] placeholder-[#64748B] focus:outline-none focus:border-[#2F7EF2]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingCorrection || !correctionReason.trim()}
                    className="px-4 py-2 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSubmittingCorrection ? 'Recording...' : 'Apply Correction & Train Engine'}
                  </button>
                </form>
              </div>

              {/* Past Corrections on this lead */}
              {lead.corrections && lead.corrections.length > 0 && (
                <div className="p-4 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-3">
                  <div className="text-xs font-bold text-[#8C98A9] uppercase tracking-wider">
                    Historical Corrections on this Lead
                  </div>
                  <div className="space-y-2">
                    {lead.corrections.map((c, i) => (
                      <div key={c.id || i} className="p-3 rounded-lg bg-[#0C0F13] border border-[#1E2734] text-xs">
                        <div className="flex items-center justify-between text-[#8C98A9] mb-1">
                          <span className="font-semibold text-[#C3CAD6]">Field: {c.field}</span>
                          <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="line-through text-[#FF8E8E]">{c.originalValue}</span>
                          <span>→</span>
                          <span className="text-[#7EE787] font-bold">{c.correctedValue}</span>
                        </div>
                        {c.userReason && (
                          <p className="text-[11px] text-[#A0AEC0] mt-1.5 italic">
                            "{c.userReason}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
