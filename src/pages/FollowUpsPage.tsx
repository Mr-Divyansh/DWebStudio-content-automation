/**
 * FOLLOW-UPS — board built from real Lead.followUp* fields
 * ============================================================================
 * Buckets (overdue / due today / upcoming / completed) are computed server-side
 * by comparing followUpNextAt against the clock. Nothing is simulated: an empty
 * bucket says so.
 *
 * The only action offered is the existing, supported "Run due follow-ups"
 * endpoint (POST /api/agent/follow-ups/run), which still passes every safety
 * gate before anything is sent.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, PlayCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, humanise, timeAgo } from '../components/ui';
import type { WorkspaceFollowUps, WorkspaceLeadTask } from '../types';

export const LeadRow: React.FC<{ lead: WorkspaceLeadTask; showStage?: boolean }> = ({ lead, showStage }) => (
  <li className="flex flex-wrap items-center gap-3 px-5 py-3">
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold text-ink">{lead.businessName}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-faint">
        {lead.personName && lead.personName !== 'UNKNOWN' ? `${lead.personName} · ` : ''}
        {humanise(lead.source)}
      </p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {showStage && lead.conversationStage && lead.conversationStage !== 'UNKNOWN' && (
        <Badge tone="info">{humanise(lead.conversationStage)}</Badge>
      )}
      <Badge tone="neutral">{humanise(lead.status)}</Badge>
      {lead.aiPaused && <Badge tone="warn">AI paused</Badge>}
      {lead.doNotContact && <Badge tone="danger">Opt out</Badge>}
      {lead.followUpAttempts > 0 && (
        <span className="tabular text-[10px] text-ink-faint">
          {lead.followUpAttempts}/{lead.followUpMaxAttempts} attempts
        </span>
      )}
    </div>
    <div className="w-28 shrink-0 text-right text-[10px] text-ink-faint">
      <div>{lead.followUpNextAt ? timeAgo(lead.followUpNextAt) : 'Not scheduled'}</div>
      {lead.lastOutboundAt && <div className="mt-0.5">last sent {timeAgo(lead.lastOutboundAt)}</div>}
    </div>
  </li>
);

export const FollowUpsPage: React.FC = () => {
  const [data, setData] = useState<WorkspaceFollowUps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getFollowUps());
    } catch (err: any) {
      setError(err?.message || 'Could not load follow-ups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runDue = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const report = await api.runFollowUps();
      // Report the honest counters rather than claiming a blanket success.
      setResult(
        `Checked ${report.checked} · sent ${report.sent} · blocked ${report.blocked} · failed ${report.failed} · skipped ${report.skipped}`,
      );
      await load();
    } catch (err: any) {
      setError(err?.message || 'Follow-up run failed.');
    } finally {
      setRunning(false);
    }
  }, [load]);

  const buckets: Array<{ key: keyof WorkspaceFollowUps; label: string; hint: string }> = [
    { key: 'overdue', label: 'Overdue', hint: 'Past their scheduled time and still pending.' },
    { key: 'dueToday', label: 'Due today', hint: 'Scheduled for today.' },
    { key: 'upcoming', label: 'Upcoming', hint: 'Scheduled for a future date.' },
    { key: 'completed', label: 'Completed', hint: 'Leads that already received a follow-up.' },
  ];
return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Follow-ups"
        description="Every pending and completed follow-up, derived from the Lead AI's own scheduling fields."
        actions={
          <>
            <button onClick={load} className="cc-btn cc-btn-secondary">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <Button variant="primary" onClick={runDue} loading={running}>
              <PlayCircle className="h-3.5 w-3.5" /> Run due follow-ups
            </Button>
          </>
        }
      />

      {result && (
        <div className="mb-4 rounded-xl border border-line bg-raised px-4 py-3 text-xs text-ink-muted">
          <span className="font-semibold text-ink">Last run:</span> {result}
        </div>
      )}

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {buckets.map((b) => {
            const items = data?.[b.key] ?? [];
            return (
              <Card key={b.key} className="overflow-hidden">
                <CardHeader
                  title={b.label}
                  hint={b.hint}
                  action={
                    <span className="tabular rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold">
                      {items.length}
                    </span>
                  }
                />
                {items.length === 0 ? (
                  <EmptyState title="Nothing here" hint={`No leads are ${b.label.toLowerCase()} right now.`} />
                ) : (
                  <ul className="max-h-80 divide-y divide-line overflow-y-auto cc-scroll">
                    {items.map((l) => (
                      <LeadRow key={l.id} lead={l} showStage />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FollowUpsPage;