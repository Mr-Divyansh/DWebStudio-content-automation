/**
 * LEADS — table + detail drawer
 * ============================================================================
 * Reuses the EXISTING /api/leads endpoints and the existing LeadDetailModal, so
 * research / qualification / draft actions keep working exactly as before.
 * Nothing about lead storage or the LeadStatus pipeline is duplicated here.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, humanise, statusTone, timeAgo } from '../components/ui';
import { LeadDetailModal } from '../components/leads/LeadDetailModal';
import type { LeadItem, LeadStatus } from '../types';

type SortKey = 'updatedAt' | 'opportunityScore' | 'businessName';

interface LeadsPageProps {
  onNavigate: (tab: string) => void;
}

/** Statuses offered in the filter; mirrors the real LeadStatus set. */
const STATUS_OPTIONS = [
  'NEW',
  'RESEARCHING',
  'QUALIFIED',
  'OUTREACH_READY',
  'AI_CONVERSATION',
  'FOLLOW_UP',
  'INTERESTED',
  'HUMAN_REQUIRED',
  'CLOSED',
  'REJECTED',
];

export const LeadsPage: React.FC<LeadsPageProps> = ({ onNavigate }) => {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LeadItem | null>(null);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [sort, setSort] = useState<SortKey>('updatedAt');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getLeads({ status, source, limit: 200 });
      setLeads(res.leads);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Could not load leads.');
    } finally {
      setLoading(false);
    }
  }, [status, source]);

  useEffect(() => {
    load();
  }, [load]);

  const sources = useMemo(
    () => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort() as string[],
    [leads],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? leads.filter((l) =>
          [l.businessName, l.personName, l.instagramUsername, l.email, l.niche, l.location]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : leads;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === 'businessName') return String(a.businessName).localeCompare(String(b.businessName));
      if (sort === 'opportunityScore') return (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return sorted;
  }, [leads, query, sort]);

  const hasFilters = query.trim() !== '' || status !== 'ALL' || source !== 'ALL';

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Leads"
        description={`${total} lead${total === 1 ? '' : 's'} in the pipeline. Open any lead for its full intelligence record.`}
        actions={
          <button onClick={load} className="cc-btn cc-btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business, person, handle, niche or city"
              className="cc-input pl-9"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="cc-input cc-select w-auto min-w-[150px]">
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="cc-input cc-select w-auto min-w-[140px]">
            <option value="ALL">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="cc-input cc-select w-auto min-w-[150px]"
            title="Sort"
          >
            <option value="updatedAt">Recently updated</option>
            <option value="opportunityScore">Highest score</option>
            <option value="businessName">Business name</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => {
                setQuery('');
                setStatus('ALL');
                setSource('ALL');
              }}
              className="cc-btn cc-btn-ghost"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </Card>
{error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            title={hasFilters ? 'No leads match these filters' : 'No leads yet'}
            hint={
              hasFilters
                ? 'Try clearing the filters.'
                : 'Import a conversation or run public discovery from the Automation Center to populate your pipeline.'
            }
            action={
              hasFilters ? undefined : (
                <button onClick={() => onNavigate('imports')} className="cc-btn cc-btn-secondary">
                  <UploadCloud className="h-3.5 w-3.5" /> Import conversations
                </button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto cc-scroll">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-line">
                  {['Business', 'Status', 'Score', 'Source', 'Follow-up', 'Last activity'].map((h) => (
                    <th key={h} className="cc-label px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelected(lead)} className="cc-card-hover cursor-pointer">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{lead.businessName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                        {lead.personName && lead.personName !== 'UNKNOWN' ? `${lead.personName} · ` : ''}
                        {humanise(lead.niche)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(lead.status as LeadStatus)}>{humanise(lead.status)}</Badge>
                      {lead.aiPaused && (
                        <span className="ml-1">
                          <Badge tone="warn">AI paused</Badge>
                        </span>
                      )}
                    </td>
                    <td className="tabular px-4 py-3 font-semibold">{lead.opportunityScore ?? 0}</td>
                    <td className="px-4 py-3 text-ink-muted">{humanise(lead.source)}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {lead.followUpNeeded ? (lead.followUpNextAt ? timeAgo(lead.followUpNextAt) : 'Due') : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-faint">{timeAgo(lead.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selected && (
        <LeadDetailModal lead={selected} portfolioProjects={[]} onClose={() => setSelected(null)} onUpdate={load} />
      )}
    </div>
  );
};

export default LeadsPage;