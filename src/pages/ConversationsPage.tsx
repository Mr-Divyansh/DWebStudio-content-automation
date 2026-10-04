/**
 * CONVERSATIONS — inbox-style reader
 * ============================================================================
 * Left: real conversations from /api/workspace/conversations.
 * Right: the selected conversation with its real messages.
 *
 * The AI / Lead / System badge is driven by the `senderType` the importer
 * already wrote (USER | CLIENT | UNKNOWN) — nothing is inferred or invented.
 * This screen is read-only: it deliberately has no composer, because the Lead
 * AI engine owns sending and no human reply flow exists yet.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Card, EmptyState, ErrorState, Skeleton, humanise, timeAgo } from '../components/ui';
import type { ConversationSummary, ConversationDetail } from '../types';

/** Maps the real senderType onto a clear actor badge. */
function actorOf(senderType: string): { label: string; tone: 'accent' | 'ok' | 'neutral' } {
  const t = (senderType || '').toUpperCase();
  if (t === 'USER') return { label: 'AI', tone: 'accent' };
  if (t === 'CLIENT') return { label: 'Lead', tone: 'ok' };
  return { label: 'System', tone: 'neutral' };
}

export const ConversationsPage: React.FC = () => {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getConversationList();
      setList(res.conversations);
      setSelectedId((prev) => prev ?? res.conversations[0]?.id ?? null);
    } catch (err: any) {
      setError(err?.message || 'Could not load conversations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .getConversation(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const filtered = list.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      (c.leadName ?? '').toLowerCase().includes(q) ||
      c.source.toLowerCase().includes(q)
    );
  });
return (
    <div className="flex h-full min-h-0 flex-col p-6 lg:p-8 max-w-[1600px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="cc-page-title">Conversations</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Imported message history, labelled by who sent each message.</p>
        </div>
        <button onClick={load} className="cc-btn cc-btn-secondary">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
          {/* List */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search conversations"
                  className="cc-input pl-9"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto cc-scroll">
              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title={query ? 'No matches' : 'No conversations yet'}
                  hint={
                    query
                      ? 'Try a different search term.'
                      : 'Import an Instagram export, WhatsApp chat or call transcript to populate this inbox.'
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          selectedId === c.id ? 'bg-raised' : 'hover:bg-raised'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-ink">{c.leadName || c.title}</span>
                          <span className="shrink-0 text-[10px] text-ink-faint">
                            {timeAgo(c.lastMessageAt ?? c.updatedAt)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-faint">
                          {c.preview || 'No message preview available.'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{humanise(c.source)}</Badge>
                          <span className="tabular text-[10px] text-ink-faint">{c.messageCount} messages</span>
                          {c.aiPaused && <Badge tone="warn">AI paused</Badge>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
{/* Detail */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            {!selectedId ? (
              <EmptyState title="Select a conversation" hint="Pick a conversation on the left to read it." />
            ) : detailLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !detail ? (
              <EmptyState title="Conversation unavailable" hint="This conversation could not be loaded." />
            ) : (
              <>
                <div className="border-b border-line px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold">{detail.lead?.businessName || detail.title}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                        <span>{humanise(detail.source)}</span>
                        <span>· {detail.messages.length} messages</span>
                        <span>· started {timeAgo(detail.createdAt)}</span>
                      </p>
                    </div>
                    {detail.lead && (
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">{humanise(detail.lead.status)}</Badge>
                        {detail.lead.aiPaused && <Badge tone="warn">AI paused</Badge>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto cc-scroll p-5">
                  {detail.messages.length === 0 ? (
                    <EmptyState title="No messages" hint="This conversation has no message rows." />
                  ) : (
                    detail.messages.map((m) => {
                      const actor = actorOf(m.senderType);
                      const fromLead = actor.label === 'Lead';
                      return (
                        <div key={m.id} className={`flex ${fromLead ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[80%] ${fromLead ? '' : 'text-right'}`}>
                            <div
                              className={`rounded-xl border px-3.5 py-2.5 ${
                                fromLead ? 'border-line bg-surface' : 'border-accent/25 bg-accent-dim/40'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words text-left text-xs leading-relaxed text-ink">
                                {m.content}
                              </p>
                            </div>
                            <p className="mt-1 flex items-center gap-2 text-[10px] text-ink-faint">
                              <Badge tone={actor.tone}>{actor.label}</Badge>
                              <span>{m.sender}</span>
                              <span>· {timeAgo(m.timestamp)}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {detail.lead?.notes && (
                  <div className="border-t border-line px-5 py-4">
                    <p className="cc-label">Lead notes</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{detail.lead.notes}</p>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConversationsPage;