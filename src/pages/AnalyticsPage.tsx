/**
 * ANALYTICS — real aggregates only
 * ============================================================================
 * Every chart is drawn from rows that exist in the database. A metric with no
 * underlying rows renders "No data yet" rather than a flat fake line, and a
 * 30-day series with all-zero buckets is labelled as such instead of being
 * presented as a trend.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, MessageSquare, Inbox } from 'lucide-react';
import { api } from '../lib/api';
import { Bar, Card, CardHeader, ErrorState, PageHeader, Skeleton, humanise } from '../components/ui';
import type { WorkspaceAnalytics } from '../types';

/** Small sparkline drawn from real daily counts. No smoothing or fabrication. */
const Sparkline: React.FC<{ points: number[]; tone?: 'accent' | 'ok' }> = ({ points, tone = 'accent' }) => {
  const max = Math.max(...points, 1);
  const hasSignal = points.some((p) => p > 0);
  const stroke = tone === 'ok' ? 'var(--color-ok)' : 'var(--color-accent)';

  if (!hasSignal) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-faint">
        No data yet
      </div>
    );
  }

  const step = points.length > 1 ? 100 / (points.length - 1) : 100;
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = 100 - (p / max) * 92 - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Trend over time">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

const Breakdown: React.FC<{ title: string; rows: Array<{ key: string; count: number }>; emptyHint: string }> = ({
  title,
  rows,
  emptyHint,
}) => {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((r) => r.count), 1);
  return (
    <Card>
      <CardHeader title={title} />
      <div className="p-5">
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">{emptyHint}</p>
        ) : (
          <div className="space-y-3">
            {sorted.slice(0, 10).map((r) => (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs text-ink-muted">{humanise(r.key)}</span>
                  <span className="tabular shrink-0 text-xs font-semibold">{r.count}</span>
                </div>
                <div className="mt-1.5">
                  <Bar value={r.count} max={max} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<WorkspaceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAnalytics());
    } catch (err: any) {
      setError(err?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1600px]">
        <Skeleton className="h-7 w-48" />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8 max-w-[1600px]">
        <Card>
          <ErrorState message={error || 'Could not load analytics.'} onRetry={load} />
        </Card>
      </div>
    );
  }

  const leadPoints = data.series.map((s) => s.leads);
  const inboundPoints = data.series.map((s) => s.inbound);
  const delivered = data.outbound.find((o) => o.key === 'SENT')?.count ?? 0;
  const attempted = data.outbound.reduce((sum, o) => sum + o.count, 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Analytics"
        description={`Real aggregates across the last ${data.rangeDays} days. Nothing here is estimated.`}
        actions={
          <button onClick={load} className="cc-btn cc-btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="cc-label">Leads ({data.rangeDays}d)</p>
          <p className="tabular mt-2 text-2xl font-bold">{data.totals.leadsInRange}</p>
        </Card>
        <Card className="p-4">
          <p className="cc-label">Inbound replies</p>
          <p className="tabular mt-2 text-2xl font-bold">{data.totals.inboundInRange}</p>
        </Card>
        <Card className="p-4">
          <p className="cc-label">Messages delivered</p>
          <p className="tabular mt-2 text-2xl font-bold">{delivered}</p>
        </Card>
        <Card className="p-4">
          <p className="cc-label">Delivery rate</p>
          <p className="tabular mt-2 text-2xl font-bold">
            {attempted > 0 ? (
              `${Math.round((delivered / attempted) * 100)}%`
            ) : (
              <span className="text-sm font-medium text-ink-faint">No data yet</span>
            )}
          </p>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leads over time" hint={`Daily count across the last ${data.rangeDays} days.`} />
          <div className="p-5">
            <Sparkline points={leadPoints} />
            <p className="mt-2 text-[11px] text-ink-faint">
              {data.totals.leadsInRange === 0
                ? 'No leads created in this period.'
                : `Peak ${Math.max(...leadPoints, 0)} per day.`}
            </p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Inbound replies over time" hint="Messages received through the official provider webhook." />
          <div className="p-5">
            <Sparkline points={inboundPoints} tone="ok" />
            <p className="mt-2 text-[11px] text-ink-faint">
              {data.totals.inboundInRange === 0
                ? 'No replies received yet. A connected channel with a registered webhook is required.'
                : `Peak ${Math.max(...inboundPoints, 0)} per day.`}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="Leads by source" rows={data.bySource} emptyHint="No leads recorded yet." />
        <Breakdown title="Pipeline distribution" rows={data.byStatus} emptyHint="No leads recorded yet." />
        <Breakdown title="Buying intent" rows={data.byIntent} emptyHint="No intent analysis recorded yet." />
        <Breakdown title="Outbound outcomes" rows={data.outbound} emptyHint="No outbound messages attempted yet." />
        <Breakdown title="Agent events" rows={data.agentEvents} emptyHint="The engine has not recorded any events yet." />
        <Card>
          <CardHeader title="How to read this" />
          <div className="space-y-3 p-5">
            <div className="flex gap-2.5">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Only counts that exist in the database are shown. Metrics with no underlying rows read “No data yet”.
              </p>
            </div>
            <div className="flex gap-2.5">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Delivery rate counts only messages a provider confirmed as SENT. Dry runs are excluded by definition.
              </p>
            </div>
            <div className="flex gap-2.5">
              <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Inbound replies require a connected channel with a registered webhook. See Automation for setup status.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsPage;