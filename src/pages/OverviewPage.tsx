/**
 * COMMAND CENTER — Overview
 * ============================================================================
 * The landing page. Every tile is a real COUNT from /api/workspace/overview or a
 * real ConnectionStatus. Nothing here is estimated or placeholder:
 *  - a metric the backend reports as null renders "No data yet"
 *  - a provider that is not configured renders "Setup required"
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  ArrowRight,
  CircleAlert,
  Users,
  MessagesSquare,
  CalendarClock,
  BadgeCheck,
  TrendingUp,
  Plug,
  Bot,
} from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, humanise, timeAgo } from '../components/ui';
import type { WorkspaceOverview, WorkspacePipeline, ConnectionsResponse } from '../types';
import { CHANNEL_ICONS, CHANNEL_ORDER } from '../components/shell/AppShell';
import type { Tone } from '../components/ui';

interface OverviewProps {
  connections: ConnectionsResponse | null;
  onNavigate: (tab: string) => void;
}

/** A single metric tile. `value: null` means "not enough data yet". */
const Stat: React.FC<{
  label: string;
  value: number | string | null;
  hint?: string;
  icon: React.ElementType;
  tone?: Tone;
  onClick?: () => void;
}> = ({ label, value, hint, icon: Icon, tone = 'accent', onClick }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className="cc-card cc-card-hover w-full p-4 text-left disabled:cursor-default disabled:hover:border-line disabled:hover:bg-surface"
  >
    <div className="flex items-center justify-between gap-3">
      <span className="cc-label">{label}</span>
      <Icon className="text-ink-faint h-3.5 w-3.5 shrink-0" />
    </div>
    <p className="tabular mt-2.5 text-2xl font-bold tracking-tight text-ink">
      {value === null ? <span className="text-sm font-medium text-ink-faint">No data yet</span> : value}
    </p>
    {hint && <p className="mt-1 truncate text-[11px] text-ink-faint">{hint}</p>}
  </button>
);

export const OverviewPage: React.FC<OverviewProps> = ({ connections, onNavigate }) => {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [pipeline, setPipeline] = useState<WorkspacePipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p] = await Promise.all([api.getOverview(), api.getPipeline()]);
      setOverview(o);
      setPipeline(p);
    } catch (err: any) {
      setError(err?.message || 'Could not load the command center.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <Skeleton className="h-7 w-56" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !overview || !pipeline) {
    return (
      <div className="p-6 lg:p-8">
        <Card>
          <ErrorState message={error || 'Could not load the command center.'} onRetry={load} />
        </Card>
      </div>
    );
  }

  const c = overview.cards;
  const agent = overview.agent;
  const connectedCount = connections ? connections.accounts.filter((a) => a.connected).length : null;

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Command Center"
        description="Everything the Lead AI is doing right now, and everything waiting on you."
        actions={
          <button onClick={load} className="cc-btn cc-btn-secondary" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      {/* ---------------------------------------------------------- Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total leads" value={c.totalLeads} icon={Users} onClick={() => onNavigate('leads')} />
        <Stat label="New (7 days)" value={c.newLeadsLast7Days} icon={TrendingUp} onClick={() => onNavigate('leads')} />
        <Stat
          label="Conversations"
          value={c.activeConversations}
          icon={MessagesSquare}
          onClick={() => onNavigate('conversations')}
        />
        <Stat
          label="Follow-ups due"
          value={c.followUpsDue}
          icon={CalendarClock}
          onClick={() => onNavigate('follow-ups')}
        />
        <Stat label="Qualified" value={c.qualifiedLeads} icon={BadgeCheck} onClick={() => onNavigate('leads')} />
        <Stat
          label="Needs a human"
          value={c.humanRequired}
          icon={CircleAlert}
          onClick={() => onNavigate('human-tasks')}
          hint={c.aiPaused > 0 ? `${c.aiPaused} taken over` : undefined}
        />
        <Stat
          label="Conversion"
          value={c.conversionRate === null ? null : `${c.conversionRate}%`}
          icon={TrendingUp}
          hint={c.decidedLeads > 0 ? `${c.decidedLeads} decided leads` : undefined}
        />
        <Stat
          label="Connected channels"
          value={connectedCount === null ? null : `${connectedCount} / ${CHANNEL_ORDER.length}`}
          icon={Plug}
          onClick={() => onNavigate('connections')}
        />
      </div>

      {/* ----------------------------------------------------- Pipeline + AI */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Lead pipeline"
            hint="Grouped from the existing LeadStatus values — no separate pipeline is stored."
            action={
              <button onClick={() => onNavigate('leads')} className="cc-btn cc-btn-ghost">
                Leads <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
          />
          <div className="p-5">
            {pipeline.total === 0 ? (
              <EmptyState
                title="No leads yet"
                hint="Import a conversation or run public discovery to populate the pipeline."
              />
            ) : (
              <div className="space-y-3.5">
                {pipeline.groups.map((g) => {
                  const max = Math.max(...pipeline.groups.map((x) => x.count), 1);
                  return (
                    <div key={g.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-medium text-ink-muted">{g.label}</span>
                        <span className="tabular text-xs font-semibold text-ink">{g.count}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-overlay">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.round((g.count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {pipeline.unmapped.length > 0 && (
                  <p className="pt-1 text-[11px] text-ink-faint">
                    Also present: {pipeline.unmapped.map((u) => `${humanise(u.status)} (${u.count})`).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="AI status"
            action={
              <button onClick={() => onNavigate('automation')} className="cc-btn cc-btn-ghost">
                <Bot className="h-3.5 w-3.5" />
              </button>
            }
          />
          <div className="space-y-3 p-5">
            {!agent ? (
              <p className="text-xs text-ink-faint">No automation state recorded yet.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">Engine</span>
                  <Badge tone={agent.state === 'RUNNING' ? 'ok' : agent.state === 'PAUSED' ? 'warn' : 'neutral'}>
                    {humanise(agent.state)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">Auto DM</span>
                  <Badge tone={agent.autoDm ? 'ok' : 'neutral'}>{agent.autoDm ? 'On' : 'Off'}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">Leads processed</span>
                  <span className="tabular text-xs font-semibold">{agent.leadsProcessed}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">Messages delivered</span>
                  <span className="tabular text-xs font-semibold">{c.messagesSent}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">Replies received</span>
                  <span className="tabular text-xs font-semibold">{c.repliesReceived}</span>
                </div>
                {agent.lastAction && (
                  <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
                    {agent.lastAction}
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      </div>
{/* ------------------------------------------- Activity + channel health */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" hint="Real events recorded by the Lead AI engine." />
          <div className="max-h-96 overflow-y-auto cc-scroll">
            {overview.recentActivity.length === 0 ? (
              <EmptyState title="No activity recorded yet" hint="Events appear here as the engine runs." />
            ) : (
              <ul className="divide-y divide-line">
                {overview.recentActivity.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        e.status === 'ERROR'
                          ? 'bg-danger'
                          : e.status === 'HUMAN_REQUIRED'
                            ? 'bg-warn'
                            : e.status === 'SUCCESS'
                              ? 'bg-ok'
                              : 'bg-ink-faint'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed text-ink">{e.message}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                        <span className="font-mono">{e.type}</span>
                        {e.leadName && <span>· {e.leadName}</span>}
                        <span>· {timeAgo(e.createdAt)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Channel health"
            action={
              <button onClick={() => onNavigate('connections')} className="cc-btn cc-btn-ghost">
                Manage <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
          />
          <ul className="divide-y divide-line">
            {CHANNEL_ORDER.map((platform) => {
              const account = connections?.accounts.find((a) => a.platform === platform);
              const Icon = CHANNEL_ICONS[platform];
              const connected = account?.connected === true;
              const attention = account?.status === 'ERROR';
              const needsSetup = !account?.available;
              const tone: Tone = connected ? 'ok' : attention ? 'danger' : needsSetup ? 'warn' : 'neutral';
              const label = connected
                ? 'Connected'
                : attention
                  ? 'Needs attention'
                  : needsSetup
                    ? 'Setup required'
                    : 'Disconnected';

              return (
                <li key={platform}>
                  <button
                    onClick={() => onNavigate(`channel:${platform}`)}
                    className="cc-card-hover flex w-full items-center gap-3 px-5 py-3 text-left"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised border border-line">
                      <Icon className="h-4 w-4 text-ink-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{account?.label ?? platform}</p>
                      <p className="truncate text-[11px] text-ink-faint">
                        {connected
                          ? account?.accountEmail || account?.username || account?.displayName || 'Authorized'
                          : account?.lastError || 'Not connected'}
                      </p>
                    </div>
                    <Badge tone={tone}>{label}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default OverviewPage;