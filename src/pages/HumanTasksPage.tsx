/**
 * HUMAN TASKS — the attention queue
 * ============================================================================
 * Every item here is a real signal the Lead AI engine already wrote:
 *   - Lead.status === 'HUMAN_REQUIRED' → the quality gate or a low-confidence
 *     decision escalated
 *   - Lead.aiPaused === true           → a human has taken over
 *   - Lead.doNotContact === true       → an opt-out that must be honoured
 *   - AgentEvent.status === 'HUMAN_REQUIRED'
 *
 * The take-over / release / opt-out actions call the EXISTING endpoints
 * (POST /api/agent/leads/:id/takeover|release|opt-out); nothing new is invented.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, PlayCircle, Ban } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, humanise, timeAgo } from '../components/ui';
import type { WorkspaceHumanTasks, WorkspaceLeadTask } from '../types';

export const HumanTasksPage: React.FC = () => {
  const [data, setData] = useState<WorkspaceHumanTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getHumanTasks());
    } catch (err: any) {
      setError(err?.message || 'Could not load human tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (lead: WorkspaceLeadTask, action: 'takeover' | 'release' | 'opt-out') => {
      setBusyId(lead.id);
      setFeedback(null);
      try {
        if (action === 'takeover') await api.takeOverLead(lead.id);
        else if (action === 'release') await api.releaseLead(lead.id);
        else await api.optOutLead(lead.id);
        setFeedback({ text: `${lead.businessName}: ${action} recorded.`, ok: true });
        await load();
      } catch (err: any) {
        setFeedback({ text: err?.message || 'Action failed.', ok: false });
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const total = (data?.needsHuman.length ?? 0) + (data?.takenOver.length ?? 0) + (data?.optedOut.length ?? 0);

  const sections: Array<{ key: 'needsHuman' | 'takenOver' | 'optedOut'; label: string; hint: string }> = [
    { key: 'needsHuman', label: 'Needs a human', hint: 'The AI escalated and stopped. Your judgement is required.' },
    { key: 'takenOver', label: 'Taken over', hint: 'You have control. The AI will not message these leads.' },
    { key: 'optedOut', label: 'Opted out', hint: 'Do not contact. Permanently blocked for the AI.' },
  ];
return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Human Tasks"
        description="Everything the Lead AI deliberately stopped on and handed to a person."
        actions={
          <button onClick={load} className="cc-btn cc-btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {feedback && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-xs ${
            feedback.ok ? 'border-ok/25 bg-ok-dim/40 text-ok' : 'border-danger/25 bg-danger-dim/40 text-danger'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {sections.map((s) => (
              <Card key={s.key} className="p-4">
                <p className="cc-label">{s.label}</p>
                <p className="tabular mt-2 text-2xl font-bold">{data?.[s.key].length ?? 0}</p>
              </Card>
            ))}
          </div>

          {total === 0 && (data?.escalations.length ?? 0) === 0 && (
            <Card>
              <EmptyState
                title="Nothing needs you right now"
                hint="When the quality gate is unsure, or you take over a conversation, it appears here."
              />
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {sections.map((s) => {
              const items = data?.[s.key] ?? [];
              return (
                <Card key={s.key} className="overflow-hidden">
                  <CardHeader title={s.label} hint={s.hint} />
                  {items.length === 0 ? (
                    <EmptyState title="Clear" hint={`No leads are ${s.label.toLowerCase()}.`} />
                  ) : (
                    <ul className="max-h-[420px] divide-y divide-line overflow-y-auto cc-scroll">
                      {items.map((l) => (
                        <li key={l.id} className="px-5 py-3">
                          <p className="truncate text-xs font-semibold text-ink">{l.businessName}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{l.reason}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{humanise(l.status)}</Badge>
                            <span className="text-[10px] text-ink-faint">{timeAgo(l.updatedAt)}</span>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {s.key === 'needsHuman' && (
                              <Button variant="secondary" onClick={() => act(l, 'takeover')} disabled={busyId === l.id}>
                                <ShieldCheck className="h-3 w-3" /> Take over
                              </Button>
                            )}
                            {s.key === 'takenOver' && (
                              <Button variant="secondary" onClick={() => act(l, 'release')} disabled={busyId === l.id}>
                                <PlayCircle className="h-3 w-3" /> Release to AI
                              </Button>
                            )}
                            {s.key !== 'optedOut' && (
                              <Button variant="danger" onClick={() => act(l, 'opt-out')} disabled={busyId === l.id}>
                                <Ban className="h-3 w-3" /> Opt out
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>

          {(data?.escalations.length ?? 0) > 0 && (
            <Card className="mt-4 overflow-hidden">
              <CardHeader title="Escalation log" hint="Events the engine marked as requiring a human." />
              <ul className="max-h-72 divide-y divide-line overflow-y-auto cc-scroll">
                {data!.escalations.map((e) => (
                  <li key={e.id} className="px-5 py-3">
                    <p className="text-xs leading-relaxed text-ink">{e.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
                      <span className="font-mono">{e.type}</span>
                      {e.leadName && <span>· {e.leadName}</span>}
                      <span>· {timeAgo(e.createdAt)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default HumanTasksPage;