/**
 * D Web Studio AI — Autonomous Control Center
 * ---------------------------------------------------------------------------
 * Control + visibility only. Every number on this screen is read from the
 * database through /api/agent; nothing is hardcoded or estimated.
 *
 * Safety messaging is explicit and never misleading:
 *  - AUTO DM is a switch, but with no authorized provider connected the agent
 *    physically cannot deliver anything (outbound rows are logged DRY_RUN).
 *  - Human take-over always suspends AI messaging for that lead.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Play,
  Pause,
  Square,
  Activity,
  ShieldAlert,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Hand,
  Lock,
  Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AgentStatus, AgentEventItem, OutboundMessageItem } from '../../types';
import { AiPowerCard } from './AiPowerCard';

const stateStyles: Record<string, string> = {
  RUNNING: 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]',
  PAUSED: 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]',
  STOPPED: 'text-[#8C98A9] bg-[#141A22] border-[#252F3C]',
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#0E131A] border border-[#1C232D] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[#718096] font-semibold">{label}</div>
      <div className="text-lg font-bold text-[#F4F1EA] font-mono mt-0.5">{value}</div>
    </div>
  );
}

export const AgentControlPanel: React.FC = () => {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [events, setEvents] = useState<AgentEventItem[]>([]);
  const [messages, setMessages] = useState<OutboundMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, e, m] = await Promise.all([
        api.getAgentStatus(),
        api.getAgentActivity(20),
        api.getOutboundMessages(15),
      ]);
      setStatus(s);
      setEvents(e);
      setMessages(m);
    } catch (err: any) {
      setError(err?.message || 'Unable to load agent status.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Modest polling that stops when the tab is hidden — no aggressive refresh.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (fn: () => Promise<AgentStatus>) => {
    try {
      setBusy(true);
      setError(null);
      setNotice(null);
      setStatus(await fn());
      await load();
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Runs one agent cycle immediately — handy right after adding API keys. */
  const runCycle = async () => {
    try {
      setBusy(true);
      setError(null);
      setNotice(null);
      const result = await api.runAgentTick();
      setNotice(
        `Cycle finished: processed ${result.processed}, researched ${result.researched}, drafted ${result.drafted}, sent ${result.sent}, blocked ${result.blocked}.`,
      );
      await load();
    } catch (err: any) {
      setError(err?.message || 'Cycle failed.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-10 text-center text-sm text-[#8C98A9]">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading autonomous agent status…
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="p-10 text-center">
        <AlertTriangle className="w-6 h-6 text-[#FFD166] mx-auto mb-2" />
        <p className="text-sm font-semibold text-[#F4F1EA]">Unable to load the AI Control Center</p>
        <p className="text-xs text-[#8C98A9] mt-1">{error}</p>
        <button
          onClick={load}
          className="mt-4 px-3 py-1.5 rounded-lg bg-[#141A22] border border-[#1E2734] text-xs text-[#F4F1EA] hover:bg-[#1E2734] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) return null;

  const c = status.counters;


  return (
    <div className="space-y-5">
      {/* THE ONE SWITCH — on/off, readiness checklist, training, API keys. */}
      <AiPowerCard variant="full" />

      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-[#2E1A1A] border border-[#5A2A2A] text-xs text-[#FFB4B4]">{error}</div>
      )}
      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-[#12171F] border border-[#1E2734] text-xs text-[#C3CAD6] flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0 text-[#7EE787]" />
          <span>{notice}</span>
        </div>
      )}

      {/* ------------------------------------------------ MAIN CONTROL CARD */}
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#141A22] border border-[#1E2734] flex items-center justify-center">
              <Bot className="w-5 h-5 text-[#2F7EF2]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F4F1EA] tracking-wide">RUNTIME DETAIL</h3>
              <p className="text-[11px] text-[#8C98A9] mt-0.5">
                What the loop is doing right now. The switch above is the only control you need.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${
                stateStyles[status.state] ?? stateStyles.STOPPED
              }`}
            >
              {status.state}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${
                status.autoDm
                  ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]'
                  : 'text-[#8C98A9] bg-[#141A22] border-[#252F3C]'
              }`}
            >
              AUTO DM: {status.autoDm ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Current task / last action / next action — never faked progress % */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 text-[11px]">
          <div className="px-3 py-2 rounded-lg bg-[#12171F] border border-[#1E2734]">
            <div className="text-[#718096] font-semibold uppercase tracking-wider text-[9px]">Current task</div>
            <div className="text-[#C3CAD6] mt-0.5">{status.currentTask ?? 'Idle'}</div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#12171F] border border-[#1E2734]">
            <div className="text-[#718096] font-semibold uppercase tracking-wider text-[9px]">Last action</div>
            <div className="text-[#C3CAD6] mt-0.5 truncate">{status.lastAction ?? 'No actions yet'}</div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#12171F] border border-[#1E2734]">
            <div className="text-[#718096] font-semibold uppercase tracking-wider text-[9px]">Next action</div>
            <div className="text-[#C3CAD6] mt-0.5 truncate">{status.nextAction ?? 'Awaiting data'}</div>
          </div>
        </div>

        {/* Fine controls. The AI ON/OFF switch above is the primary control; these
            are only for short-term adjustments while the AI runs. */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={() => act(api.pauseAgent)}
            disabled={busy || status.state !== 'RUNNING'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[11px] font-semibold text-[#F4F1EA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
          <button
            onClick={() => act(api.startAgent)}
            disabled={busy || status.state !== 'PAUSED'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[11px] font-semibold text-[#F4F1EA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Resume
          </button>
          <button
            onClick={runCycle}
            disabled={busy || status.state !== 'RUNNING'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[11px] font-semibold text-[#F4F1EA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-[#2F7EF2]" /> Run one cycle
          </button>
          <button
            onClick={() => act(api.stopAgent)}
            disabled={busy || status.state === 'STOPPED'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[11px] font-semibold text-[#8C98A9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
          <span className="text-[11px] text-[#718096]">
            AUTO DM follows the power switch and is only ON when a sending account is connected.
          </span>
        </div>

        {/* Messaging readiness — honest about what can actually happen */}
        <div
          className={`mt-4 px-3.5 py-3 rounded-lg border text-[11px] flex items-start gap-2.5 ${
            status.messaging.configured
              ? 'bg-[#152E20] border-[#2A5A34] text-[#7EE787]'
              : 'bg-[#2E2815] border-[#5A4A20] text-[#FFD166]'
          }`}
        >
          {status.messaging.configured ? (
            <CheckCircle2 className="w-4 h-4 mt-px shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {status.messaging.configured
                ? `Messaging provider connected: ${status.messaging.provider}`
                : 'Messaging integration required'}
            </div>
            {!status.messaging.configured && (
              <p className="text-[#C3CAD6] mt-0.5 leading-relaxed">
                No authorized provider is connected, so the agent can research, qualify and draft, but it{' '}
                <strong>cannot deliver any message</strong>. Prepared messages are logged as DRY_RUN. Nothing is
                being sent to anyone.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ LIVE COUNTERS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Metric label="Leads processed" value={c.leadsProcessed} />
        <Metric label="Messages sent" value={c.messagesSent} />
        <Metric label="Replies received" value={c.repliesReceived} />
        <Metric label="Interested" value={c.interested} />
        <Metric label="Not interested" value={c.notInterested} />
        <Metric label="Personal work" value={c.personalWork} />
        <Metric label="Human required" value={c.humanRequired} />
        <Metric label="No response" value={c.noResponse} />
        <Metric label="Closed" value={c.closed} />
        <Metric label="Failed" value={c.failed} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ------------------------------------------------------- ACTIVITY */}
        <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1C232D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#2F7EF2]" />
              <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">Live activity</h4>
            </div>
            <button onClick={load} className="text-[#718096] hover:text-[#F4F1EA] cursor-pointer" aria-label="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-[#1C232D]">
            {events.length === 0 && (
              <p className="p-6 text-center text-xs text-[#8C98A9]">No agent activity yet. Switch the AI on to begin.</p>
            )}
            {events.map((ev) => (
              <div key={ev.id} className="px-4 py-2.5 flex items-start gap-2.5">
                <span className="mt-1 shrink-0">
                  {ev.status === 'SUCCESS' && <CheckCircle2 className="w-3.5 h-3.5 text-[#7EE787]" />}
                  {ev.status === 'ERROR' && <XCircle className="w-3.5 h-3.5 text-[#FF6B6B]" />}
                  {ev.status === 'WARNING' && <AlertTriangle className="w-3.5 h-3.5 text-[#FFD166]" />}
                  {ev.status === 'HUMAN_REQUIRED' && <ShieldAlert className="w-3.5 h-3.5 text-[#6FB2FF]" />}
                  {ev.status === 'INFO' && <Activity className="w-3.5 h-3.5 text-[#718096]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[#C3CAD6] leading-snug">{ev.message}</p>
                  <p className="text-[10px] text-[#5A6675] font-mono mt-0.5">
                    {ev.type} · {ev.lead?.businessName ?? '—'} · {new Date(ev.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --------------------------------------------------- OUTBOUND LOG */}
        <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1C232D] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#2F7EF2]" />
            <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">Outbound message log</h4>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-[#1C232D]">
            {messages.length === 0 && (
              <p className="p-6 text-center text-xs text-[#8C98A9]">No messages prepared yet.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-[#F4F1EA] truncate">
                    {m.lead?.businessName ?? m.leadId}
                  </p>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                      m.status === 'SENT'
                        ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]'
                        : m.status === 'FAILED'
                          ? 'text-[#FF6B6B] bg-[#2E1A1A] border-[#5A2A2A]'
                          : m.status === 'BLOCKED'
                            ? 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]'
                            : 'text-[#6FB2FF] bg-[#0E2233] border-[#1E4A6B]'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
                <p className="text-[10px] text-[#5A6675] font-mono mt-0.5">
                  {m.channel} · {m.lead?.businessName ? '@' : ''}
                  {m.recipient ?? '—'} · {new Date(m.createdAt).toLocaleString()}
                  {m.error ? ` · ${m.error}` : ''}
                </p>
                <p className="text-[10px] text-[#8C98A9] mt-1 line-clamp-2 leading-snug">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- SAFETY BAR */}
      <div className="rounded-xl bg-[#12171F] border border-[#1E2734] px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-[#8C98A9]">
          <Lock className="w-3.5 h-3.5 text-[#2F7EF2]" /> Rate limit: {status.config.maxSendsPerHour}/hour
        </span>
        <span className="flex items-center gap-1.5 text-[#8C98A9]">
          <Hand className="w-3.5 h-3.5 text-[#2F7EF2]" /> Per-lead cap: {status.config.maxSendsPerLead}
        </span>
        <span className="flex items-center gap-1.5 text-[#8C98A9]">
          <RefreshCw className="w-3.5 h-3.5 text-[#2F7EF2]" /> Follow-up delay: {status.config.followUpDelayHours}h
        </span>
        <span className="text-[#5A6675]">Human take-over always overrides the AI.</span>
      </div>
    </div>
  );
};

