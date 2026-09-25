/**
 * AI POWER — the one switch
 * ---------------------------------------------------------------------------
 * The owner wanted exactly one control: "start my AI / turn my AI off". This
 * component is that control, and it is the only place the switch is rendered
 * (the dashboard shows a compact version of the same component).
 *
 * What pressing ON actually does (all of it server-side, in one request):
 *   1. trains the AI on the owner's portfolio + pricing knowledge when needed,
 *   2. resumes public discovery when a city and niches are already configured,
 *   3. starts the run loop, and enables AUTO DM only when a provider that can
 *      really deliver is connected.
 *
 * Honesty rules kept from the rest of the product:
 *  - Nothing is claimed to be "sent" unless a provider confirmed delivery.
 *  - Missing API keys are shown by NAME with what they unlock. No key value is
 *    ever requested, displayed, or transmitted.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Power,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Circle,
  GraduationCap,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AgentStatus, AgentSetupReport } from '../../types';
import { ApiKeysPanel } from './ApiKeysPanel';

interface AiPowerCardProps {
  /** 'full' is used on the AI page, 'compact' on the dashboard. */
  variant?: 'full' | 'compact';
  onOpenControlCenter?: () => void;
}

/** Matches the state palette used across the AI Control Center. */
const stateStyles: Record<string, string> = {
  RUNNING: 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]',
  PAUSED: 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]',
  STOPPED: 'text-[#8C98A9] bg-[#141A22] border-[#252F3C]',
};

const checkTone: Record<string, { dot: string; text: string }> = {
  READY: { dot: 'text-[#7EE787]', text: 'text-[#C3CAD6]' },
  ACTION_REQUIRED: { dot: 'text-[#FFD166]', text: 'text-[#FFD166]' },
  OPTIONAL: { dot: 'text-[#5A6675]', text: 'text-[#8C98A9]' },
};

export const AiPowerCard: React.FC<AiPowerCardProps> = ({ variant = 'full', onOpenControlCenter }) => {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [setup, setSetup] = useState<AgentSetupReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, report] = await Promise.all([api.getAgentStatus(), api.getAgentSetup()]);
      setStatus(s);
      setSetup(report);
    } catch (err: any) {
      setError(err?.message || 'Unable to read the AI status.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Modest polling, paused while the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const on = status?.state === 'RUNNING' || status?.state === 'PAUSED';
  const paused = status?.state === 'PAUSED';

  const toggle = async () => {
    try {
      setBusy('power');
      setError(null);
      setNotice(null);
      const result = on ? await api.deactivateAgent() : await api.activateAgent();
      setStatus(result.status);
      setSetup(result.report);
      setNotice(result.steps.join(' '));
    } catch (err: any) {
      setError(err?.message || 'Could not change the AI power state.');
    } finally {
      setBusy(null);
    }
  };

  const train = async () => {
    try {
      setBusy('train');
      setError(null);
      setNotice(null);
      const report = await api.trainAgent();
      setNotice(report.summary);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Training failed.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-5 flex items-center gap-3 text-sm text-[#8C98A9]">
        <RefreshCw className="w-4 h-4 animate-spin" /> Reading AI status…
      </div>
    );
  }

  const readyCount = setup ? setup.checks.filter((c) => c.status === 'READY').length : 0;
  const totalChecks = setup ? setup.checks.length : 0;
  const optionalMissing = setup
    ? setup.envKeys.filter((k) => !k.required && !k.set && !k.name.startsWith('DWS_'))
    : [];

  const switchButton = (
    <button
      onClick={toggle}
      disabled={busy !== null}
      aria-label={on ? 'Turn the AI off' : 'Turn the AI on'}
      className={`relative w-16 h-8 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
        on ? 'bg-[#2F7EF2]' : 'bg-[#252F3C]'
      }`}
    >
      <span
        className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? 'left-9' : 'left-1'}`}
      />
    </button>
  );

  const banner = (
    <>
      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-[#2E1A1A] border border-[#5A2A2A] text-xs text-[#FFB4B4] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-[#12171F] border border-[#1E2734] text-xs text-[#C3CAD6] flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0 text-[#7EE787]" />
          <span>{notice}</span>
        </div>
      )}
    </>
  );

  /* ------------------------------------------------------------ COMPACT VIEW */
  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                on ? 'bg-[#152E20] border-[#2A5A34]' : 'bg-[#141A22] border-[#1E2734]'
              }`}
            >
              <Bot className={`w-5 h-5 ${on ? 'text-[#7EE787]' : 'text-[#718096]'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
                <Power className={`w-3.5 h-3.5 ${on ? 'text-[#7EE787]' : 'text-[#718096]'}`} />
                AI is {on ? 'ON' : 'OFF'}
                {paused && <span className="text-[11px] font-semibold text-[#FFD166]">paused</span>}
              </p>
              <p className="text-[11px] text-[#8C98A9] truncate mt-0.5">
                {on
                  ? setup?.canSend
                    ? 'Answering people who message you, plus research and drafting.'
                    : 'Researching, qualifying and drafting only. Nothing is sent yet.'
                  : 'Nothing is running. Switch it on to start your AI.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[11px] font-mono text-[#8C98A9]">
              {readyCount}/{totalChecks} ready
            </span>
            {switchButton}
            {onOpenControlCenter && (
              <button
                onClick={onOpenControlCenter}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#141A22] border border-[#1E2734] text-[11px] font-semibold text-[#F4F1EA] hover:bg-[#1E2734] cursor-pointer transition-colors"
              >
                Details <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {banner}
      </div>
    );
  }

  /* --------------------------------------------------------------- FULL VIEW */
  const ready = setup?.aiReady === true;
  const sending = setup?.canSend === true;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ THE ONE ON/OFF SWITCH */}
      <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center ${
                on ? 'bg-[#152E20] border-[#2A5A34]' : 'bg-[#141A22] border-[#1E2734]'
              }`}
            >
              <Bot className={`w-5 h-5 ${on ? 'text-[#7EE787]' : 'text-[#718096]'}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F4F1EA] tracking-wide">AI POWER</h3>
              <p className="text-[11px] text-[#8C98A9] mt-0.5">
                One switch. Research → Qualify → Draft → Gated send → Learn.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${stateStyles[status?.state ?? 'STOPPED']}`}>
              {status?.state ?? 'STOPPED'}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${
                status?.autoDm
                  ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]'
                  : 'text-[#8C98A9] bg-[#141A22] border-[#252F3C]'
              }`}
            >
              AUTO DM: {status?.autoDm ? 'ON' : 'OFF'}
            </span>
            {switchButton}
            <span className={`text-xs font-mono font-bold w-8 ${on ? 'text-[#7EE787]' : 'text-[#8C98A9]'}`}>
              {on ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Honest description of what is happening right now. */}
        <div
          className={`mt-4 px-3.5 py-3 rounded-lg border text-[11px] flex items-start gap-2.5 ${
            on ? 'bg-[#12171F] border-[#1E2734] text-[#C3CAD6]' : 'bg-[#0C0F13] border-[#1C232D] text-[#8C98A9]'
          }`}
        >
          {on ? <ShieldCheck className="w-4 h-4 mt-px shrink-0 text-[#2F7EF2]" /> : <Power className="w-4 h-4 mt-px shrink-0 text-[#718096]" />}
          <div>
            {on ? (
              sending ? (
                <p>
                  <strong className="text-[#F4F1EA]">AI is ON and can deliver.</strong> It researches and qualifies
                  leads, drafts outreach, answers people who message you, and keeps every safety limit. Cold or
                  researched leads are still never messaged.
                </p>
              ) : (
                <p>
                  <strong className="text-[#F4F1EA]">AI is ON in draft-only mode.</strong> It researches, qualifies and
                  drafts, but no authorized sending account is connected, so <strong>nothing can be delivered</strong>.
                  Add the Instagram keys below to unlock real sending.
                </p>
              )
            ) : (
              <p>
                <strong className="text-[#F4F1EA]">AI is OFF.</strong> No research, no drafting and no sending is
                happening. Flip the switch to start it — pressing ON also trains the AI if it has not been trained yet.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={train}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-xs font-semibold text-[#F4F1EA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <GraduationCap className="w-3.5 h-3.5 text-[#2F7EF2]" />
            {busy === 'train' ? 'Training…' : 'Train AI'}
          </button>
          <button
            onClick={() => setShowDetails((value) => !value)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-xs font-semibold text-[#F4F1EA] cursor-pointer transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#2F7EF2]" />
            {showDetails ? 'Hide API keys' : 'API keys & setup'}
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[#8C98A9] hover:text-[#F4F1EA] cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Trained-on line: real numbers, read from the database. */}
        {setup && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8C98A9]">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-[#2F7EF2]" />
              {setup.trained.bootstrapped ? 'Trained' : 'Not trained yet'} · {setup.knowledge.ownerRules} owner rule(s)
              {` · ${setup.knowledge.coveragePercent}% coverage`}
            </span>
            <span className="flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-[#2F7EF2]" />
              {sending ? 'Sending account authorized' : 'No authorized sending account'}
            </span>
            <span className="font-mono">
              {readyCount}/{totalChecks} checks ready
            </span>
          </div>
        )}
      </div>

      {banner}

      {/* ------------------------------------------------- READINESS CHECKLIST */}
      {setup && (
        <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1C232D] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2F7EF2]" />
              <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">Is my AI ready?</h4>
            </div>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                ready
                  ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]'
                  : 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]'
              }`}
            >
              {ready ? 'READY' : `${readyCount}/${totalChecks}`}
            </span>
          </div>
          <div className="divide-y divide-[#1C232D]">
            {setup.checks.map((check) => {
              const tone = checkTone[check.status] ?? checkTone.OPTIONAL;
              return (
                <div key={check.id} className="px-4 py-2.5 flex items-start gap-2.5">
                  {check.status === 'READY' ? (
                    <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone.dot}`} />
                  ) : (
                    <Circle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone.dot}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[11px] font-semibold ${
                        check.status === 'READY' ? 'text-[#F4F1EA]' : tone.text
                      }`}
                    >
                      {check.label}
                    </p>
                    <p className="text-[11px] text-[#8C98A9] leading-snug mt-0.5">{check.detail}</p>
                    {check.keys.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {check.keys.map((name) => (
                          <code
                            key={name}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#141A22] border border-[#252F3C] text-[#6FB2FF]"
                          >
                            {name}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* -------------------------------------------------------- API KEY GUIDE */}
      {showDetails && setup && (
        <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#2F7EF2]" />
            <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">API keys — yahin se dalo</h4>
          </div>
          <p className="text-[11px] text-[#8C98A9] leading-relaxed">
            Paste karo → Save dabao → done. Keys encrypted vault me save hoti hain — server restart ya laptop
            band hone par bhi <strong className="text-[#F4F1EA]">khoyti nahi</strong>. Values kabhi wapas screen
            par nahi aati, sirf SAVED / NOT SET dikhta hai. Restart ki jarurat nahi.
          </p>
          <ApiKeysPanel onSaved={load} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {setup.envKeys.map((item) => (
              <div
                key={item.name}
                className="px-3 py-2 rounded-lg bg-[#12171F] border border-[#1E2734] flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <code className="text-[10px] font-mono text-[#6FB2FF] break-all">{item.name}</code>
                  <p className="text-[10px] text-[#8C98A9] mt-0.5">{item.purpose}</p>
                </div>
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                    item.set
                      ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]'
                      : item.required
                        ? 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]'
                        : 'text-[#8C98A9] bg-[#141A22] border-[#252F3C]'
                  }`}
                >
                  {item.set ? 'SET' : item.required ? 'REQUIRED' : 'OPTIONAL'}
                </span>
              </div>
            ))}
          </div>
          {optionalMissing.length > 0 && (
            <p className="text-[10px] text-[#5A6675] leading-relaxed">
              Optional keys unlock more capability: real sending, receiving replies and scheduled runs. The AI stays
              safe and honest without them.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

