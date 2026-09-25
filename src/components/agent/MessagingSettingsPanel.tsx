/**
 * D Web Studio AI — Messaging Settings & Conversation Controls
 * ---------------------------------------------------------------------------
 * Read-only visibility of real provider/account/webhook state plus the explicit
 * [TAKE OVER] / [RELEASE TO AI] controls.
 *
 * Hard rules:
 *  - No token, app secret or verify token is ever requested or displayed.
 *  - Unsupported Meta capabilities are shown as NOT SUPPORTED, never faked.
 *  - There is deliberately no "send now" button; the agent loop owns sending.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings2,
  ShieldCheck,
  Webhook,
  Ban,
  PlayCircle,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { MessagingSettings, InboundMessageItem } from '../../types';

function StatusPill({ label, ok, pending }: { label: string; ok: boolean; pending?: boolean }) {
  const tone = pending
    ? 'text-[#8C98A9] bg-[#141A22] border-[#252F3C]'
    : ok
      ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]'
      : 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]';
  return <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${tone}`}>{label}</span>;
}

const CAPABILITY_LABEL: Record<string, string> = {
  SUPPORTED: 'SUPPORTED',
  NOT_SUPPORTED: 'NOT SUPPORTED',
  NOT_SUPPORTED_BY_META: 'NOT SUPPORTED BY META',
};

export const MessagingSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [inbox, setInbox] = useState<InboundMessageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, m] = await Promise.all([api.getMessagingSettings(), api.getInboundMessages(15)]);
      setSettings(s);
      setInbox(m);
    } catch (err: any) {
      setError(err?.message || 'Unable to load messaging settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    try {
      setBusyId(id);
      await fn();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-center text-xs text-[#8C98A9]">Loading messaging settings…</div>;
  }
  if (!settings) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-5 h-5 text-[#FFD166] mx-auto mb-2" />
        <p className="text-xs text-[#8C98A9]">{error ?? 'Messaging settings unavailable.'}</p>
      </div>
    );
  }

  const caps = settings.capabilities;


  return (
    <div className="space-y-4">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-[#2E1A1A] border border-[#5A2A2A] text-[11px] text-[#FFB4B4]">{error}</div>
      )}

      {/* ------------------------------------------------- CONNECTION STATUS */}
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-[#2F7EF2]" />
            <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">Connection</h4>
          </div>
          <button
            onClick={load}
            className="text-[#718096] hover:text-[#F4F1EA] cursor-pointer"
            aria-label="Refresh settings"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
          <div className="px-3 py-2.5 rounded-lg bg-[#12171F] border border-[#1E2734] flex items-center justify-between gap-2">
            <span className="text-[#8C98A9]">Provider</span>
            <StatusPill label={settings.configured ? 'CONNECTED' : 'NOT CONNECTED'} ok={settings.configured} />
          </div>
          <div className="px-3 py-2.5 rounded-lg bg-[#12171F] border border-[#1E2734] flex items-center justify-between gap-2">
            <span className="text-[#8C98A9]">Account</span>
            <StatusPill label={settings.account.authorized ? 'CONNECTED' : 'NOT CONNECTED'} ok={settings.account.authorized} />
          </div>
          <div className="px-3 py-2.5 rounded-lg bg-[#12171F] border border-[#1E2734] flex items-center justify-between gap-2">
            <span className="text-[#8C98A9] flex items-center gap-1.5">
              <Webhook className="w-3.5 h-3.5" /> Webhook
            </span>
            <StatusPill label={settings.webhook.status} ok={settings.webhook.status === 'ACTIVE'} />
          </div>
        </div>

        <p className="mt-2.5 text-[10px] text-[#5A6675] font-mono">
          {settings.provider} · {settings.account.reason}
        </p>
        <p className="mt-1 text-[10px] text-[#5A6675] font-mono">Callback: {settings.webhook.path}</p>
      </div>

      {/* --------------------------------------------------------- CAPABILITIES */}
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-4">
        <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider mb-3">Capabilities</h4>
        <div className="space-y-1.5 text-[11px]">
          {Object.entries(caps).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#12171F] border border-[#1E2734]"
            >
              <span className="text-[#C3CAD6]">{key.replace(/([A-Z])/g, ' $1')}</span>
              <StatusPill
                label={CAPABILITY_LABEL[value] ?? value}
                ok={value === 'SUPPORTED'}
                pending={value === 'NOT_SUPPORTED_BY_META'}
              />
            </div>
          ))}
        </div>
        {caps.proactiveColdOutreach === 'NOT_SUPPORTED_BY_META' && (
          <p className="mt-2.5 text-[10px] text-[#8C98A9] leading-relaxed">
            Meta only permits messaging people who have interacted with the business (or via an approved flow).
            Cold outreach to never-contacted accounts is not available through the official API, and this system
            will not attempt it by any unofficial method.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------- PREREQUISITES */}
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-4">
        <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider mb-3">Setup checklist</h4>
        <div className="space-y-1.5 text-[11px]">
          {settings.prerequisites.map((p) => (
            <div
              key={p.item}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#12171F] border border-[#1E2734]"
            >
              <span className="text-[#C3CAD6]">{p.item}</span>
              <StatusPill label={p.status.replace(/_/g, ' ')} ok={false} pending />
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------ CONVERSATION / TAKE OVER */}
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1C232D] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#2F7EF2]" />
          <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">Conversations & take-over</h4>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-[#1C232D]">
          {inbox.length === 0 && (
            <p className="p-6 text-center text-xs text-[#8C98A9]">
              No inbound replies yet. Replies appear here once the Meta webhook is active.
            </p>
          )}

          {inbox.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-[#F4F1EA] truncate">
                    {m.leadId ?? 'Untracked sender'}
                  </span>
                  {m.humanTakeover && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border text-[#6FB2FF] bg-[#0E2233] border-[#1E4A6B]">
                      HUMAN TAKEOVER
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#5A6675] font-mono">{new Date(m.createdAt).toLocaleString()}</span>
              </div>

              <p className="text-[10px] text-[#8C98A9] mt-1 line-clamp-2 leading-snug">{m.body || '(no text)'}</p>

              {m.leadId && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    onClick={() => act(m.id, () => api.takeOverLead(m.leadId!))}
                    disabled={busyId === m.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[10px] font-semibold text-[#F4F1EA] disabled:opacity-40 cursor-pointer"
                  >
                    <ShieldCheck className="w-3 h-3" /> TAKE OVER
                  </button>
                  <button
                    onClick={() => act(m.id, () => api.releaseLead(m.leadId!))}
                    disabled={busyId === m.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[10px] font-semibold text-[#F4F1EA] disabled:opacity-40 cursor-pointer"
                  >
                    <PlayCircle className="w-3 h-3" /> RELEASE TO AI
                  </button>
                  <button
                    onClick={() => act(m.id, () => api.optOutLead(m.leadId!))}
                    disabled={busyId === m.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2E1A1A] hover:bg-[#3A2020] border border-[#5A2A2A] text-[10px] font-semibold text-[#FFB4B4] disabled:opacity-40 cursor-pointer"
                  >
                    <Ban className="w-3 h-3" /> OPT OUT
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
