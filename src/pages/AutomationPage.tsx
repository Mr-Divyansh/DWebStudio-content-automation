/**
 * AUTOMATION CENTER
 * ============================================================================
 * Documents the pipeline the Lead AI actually runs today:
 *
 *   Trigger (inbound reply / discovery / cron)
 *     -> Research + Qualification
 *       -> Quality Gate (safety.ts)
 *         -> Action (reply, escalate, follow-up) or human task
 *           -> Result (delivered / blocked / failed)
 *
 * Only capabilities that already exist in the backend are listed. The controls
 * call the EXISTING endpoints (start/pause/stop, enable, auto-dm, tick) so
 * nothing here is a mock.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Play, Pause, Square, Zap, ShieldCheck, ArrowRight, CloudCog } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, humanise, timeAgo } from '../components/ui';
import type { WorkspaceAutomation } from '../types';

/** The real stage sequence the agent executes for each lead. */
const STAGES = [
  { key: 'Trigger', detail: 'Inbound reply, public discovery, or a scheduled tick.' },
  { key: 'Processing', detail: 'Research and deterministic qualification.' },
  { key: 'Quality Gate', detail: 'Opt-out, take-over, rate limits and delay checks.' },
  { key: 'Action', detail: 'Send a reply, schedule a follow-up, or escalate.' },
  { key: 'Result', detail: 'Delivered, blocked, dry-run, or handed to a human.' },
];

export const AutomationPage: React.FC = () => {
  const [data, setData] = useState<WorkspaceAutomation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAutomation());
    } catch (err: any) {
      setError(err?.message || 'Could not load automation status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (action: 'start' | 'pause' | 'stop' | 'tick', label: string) => {
      setBusy(action);
      setFeedback(null);
      try {
        if (action === 'start') await api.startAgent();
        else if (action === 'pause') await api.pauseAgent();
        else if (action === 'stop') await api.stopAgent();
        else await api.runAgentTick();
        setFeedback(`${label} completed.`);
        await load();
      } catch (err: any) {
        setFeedback(err?.message || 'Action failed.');
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1600px]">
        <Skeleton className="h-7 w-56" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8 max-w-[1600px]">
        <Card>
          <ErrorState message={error || 'Could not load automation status.'} onRetry={load} />
        </Card>
      </div>
    );
  }

  const running = data.state === 'RUNNING';
return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Automation"
        description="What the Lead AI does, and exactly how far it gets without a human."
        actions={
          <button onClick={load} className="cc-btn cc-btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {feedback && (
        <div className="mb-4 rounded-xl border border-line bg-raised px-4 py-3 text-xs text-ink-muted">{feedback}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status */}
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader
            title="Engine status"
            action={
              <Badge tone={running ? 'ok' : data.state === 'PAUSED' ? 'warn' : 'neutral'}>{humanise(data.state)}</Badge>
            }
          />
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => act('start', 'Start')} disabled={busy !== null} loading={busy === 'start'}>
                <Play className="h-3.5 w-3.5" /> Start
              </Button>
              <Button variant="secondary" onClick={() => act('pause', 'Pause')} disabled={busy !== null} loading={busy === 'pause'}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
              <Button variant="secondary" onClick={() => act('stop', 'Stop')} disabled={busy !== null} loading={busy === 'stop'}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
              <Button variant="secondary" onClick={() => act('tick', 'Single tick')} disabled={busy !== null} loading={busy === 'tick'}>
                <Zap className="h-3.5 w-3.5" /> Run one tick
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Leads processed', value: data.counters?.leadsProcessed },
                { label: 'Messages delivered', value: data.counters?.messagesSent },
                { label: 'Replies received', value: data.counters?.repliesReceived },
                { label: 'Escalated', value: data.counters?.humanRequired },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-line bg-raised px-3 py-2.5">
                  <p className="cc-label">{m.label}</p>
                  <p className="tabular mt-1.5 text-lg font-bold">{m.value ?? 0}</p>
                </div>
              ))}
            </div>

            {data.limits && (
              <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
                Safety limits: max {data.limits.maxSendsPerHour} sends/hour, {data.limits.maxSendsPerLead} per lead,{' '}
                {data.limits.followUpDelayHours}h follow-up delay. Auto DM is currently{' '}
                <span className="font-semibold text-ink-muted">{data.autoDm ? 'ON' : 'OFF'}</span>.
              </p>
            )}
          </div>
        </Card>

        {/* Delivery honesty */}
        <Card>
          <CardHeader title="Delivery" hint="Only provider-confirmed deliveries are counted." />
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Attempted</span>
              <span className="tabular text-sm font-semibold">{data.delivery.attempted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Delivered</span>
              <span className="tabular text-sm font-semibold text-ok">{data.delivery.delivered}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Inbound replies</span>
              <span className="tabular text-sm font-semibold">{data.delivery.inboundReplies}</span>
            </div>
            {data.delivery.attempted === 0 && (
              <p className="pt-1 text-[11px] leading-relaxed text-ink-faint">
                Nothing has been attempted yet. Real delivery needs an authorized messaging provider.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Workflow stages */}
      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Active workflow" hint="The exact sequence the agent executes for each lead." />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
          {STAGES.map((s, i) => (
            <div key={s.key} className="bg-surface p-5">
              <span className="tabular grid h-6 w-6 place-items-center rounded-md bg-raised text-[11px] font-bold text-accent">
                {i + 1}
              </span>
              <p className="mt-2.5 text-xs font-bold text-ink">{s.key}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{s.detail}</p>
            </div>
          ))}
        </div>
      </Card>
<div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Runs */}
        <Card className="overflow-hidden">
          <CardHeader title="Recent automation runs" hint="Real events from the engine log." />
          <div className="max-h-96 overflow-y-auto cc-scroll">
            {data.recentRuns.length === 0 ? (
              <EmptyState title="No runs recorded yet" hint="Start the engine or run a single tick." />
            ) : (
              <ul className="divide-y divide-line">
                {data.recentRuns.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] text-ink-muted">{r.type}</span>
                      <span className="shrink-0 text-[10px] text-ink-faint">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* 24/7 readiness */}
        <Card>
          <CardHeader title="24/7 readiness" hint="What this server still needs to run unattended." />
          <div className="space-y-2.5 p-5">
            {[
              {
                title: 'Deployed on an always-on host',
                detail:
                  'The engine runs inside this Node process. Deploy to a host that stays up (Vercel/Render/VM) so it keeps running while your PC is off.',
              },
              {
                title: 'External scheduler configured',
                detail:
                  'Point a cron service at /api/cron/agent and /api/cron/follow-ups using the CRON_SECRET bearer token.',
              },
              {
                title: 'Production database',
                detail: 'DATABASE_URL must point at a persistent server-side database, not the local SQLite file.',
              },
              {
                title: 'Provider webhooks registered',
                detail: 'Inbound replies only arrive through a public HTTPS webhook registered with each provider.',
              },
              {
                title: 'Secrets in the host environment',
                detail: 'DWS_TOKEN_ENCRYPTION_KEY and provider secrets must be set on the host, never committed.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-2.5">
                <CloudCog className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <div>
                  <p className="text-xs font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AutomationPage;