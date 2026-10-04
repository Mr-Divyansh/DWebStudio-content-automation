/**
 * CONTROL CENTER UI KIT
 * ============================================================================
 * Small, unopinionated primitives shared by every page, so spacing, radius,
 * borders and status colours stay identical across the app.
 *
 * Every data surface uses the same three states — loading (Skeleton), empty
 * (EmptyState) and error (ErrorState) — so no page can quietly render a blank
 * box or hide a failure.
 */

import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

const TONE: Record<Tone, string> = {
  neutral: 'text-ink-muted bg-raised border-line-strong',
  ok: 'text-ok bg-ok-dim border-ok/30',
  warn: 'text-warn bg-warn-dim border-warn/30',
  danger: 'text-danger bg-danger-dim border-danger/30',
  info: 'text-info bg-info-dim border-info/30',
  accent: 'text-accent-soft bg-accent-dim border-accent/40',
};

/* ------------------------------------------------------------------ Card */

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`cc-card ${className}`}>{children}</div>
);

export const CardHeader: React.FC<{
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, hint, action, className = '' }) => (
  <div className={`flex items-start justify-between gap-4 px-5 py-4 border-b border-line ${className}`}>
    <div className="min-w-0">
      <h3 className="cc-section-title">{title}</h3>
      {hint && <p className="text-xs text-ink-faint mt-1 leading-relaxed">{hint}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ------------------------------------------------------------------ Badge */

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({
  tone = 'neutral',
  children,
  className = '',
}) => <span className={`cc-pill ${TONE[tone]} ${className}`}>{children}</span>;

/* ---------------------------------------------------------------- Button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export const Button: React.FC<ButtonProps> = ({ variant = 'secondary', loading, children, className = '', disabled, ...rest }) => (
  <button className={`cc-btn cc-btn-${variant} ${className}`} disabled={disabled || loading} {...rest}>
    {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
    {children}
  </button>
);

/* -------------------------------------------------------------- Skeleton */

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`cc-skeleton ${className}`} aria-hidden="true" />
);

/** Card-shaped loading placeholder used while a page's data is in flight. */
export const SkeletonCard: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="cc-card p-5 space-y-3">
    <Skeleton className="h-3 w-24" />
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-8 w-full" />
    ))}
  </div>
);
/* ------------------------------------------------------------ Empty/Error */

export const EmptyState: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({
  title,
  hint,
  action,
}) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-12">
    <div className="w-10 h-10 rounded-xl bg-raised border border-line flex items-center justify-center mb-3">
      <Inbox className="w-4 h-4 text-ink-faint" />
    </div>
    <p className="text-sm font-semibold text-ink">{title}</p>
    {hint && <p className="text-xs text-ink-faint mt-1.5 max-w-sm leading-relaxed">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-10">
    <div className="w-10 h-10 rounded-xl bg-danger-dim border border-danger/30 flex items-center justify-center mb-3">
      <AlertTriangle className="w-4 h-4 text-danger" />
    </div>
    <p className="text-sm font-semibold text-ink">Something went wrong</p>
    <p className="text-xs text-ink-faint mt-1.5 max-w-sm leading-relaxed">{message}</p>
    {onRetry && (
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5" /> Try again
      </Button>
    )}
  </div>
);

/* --------------------------------------------------------------- Sections */

export const PageHeader: React.FC<{ title: string; description?: string; actions?: React.ReactNode }> = ({
  title,
  description,
  actions,
}) => (
  <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
    <div className="min-w-0">
      <h1 className="cc-page-title">{title}</h1>
      {description && <p className="text-sm text-ink-muted mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </header>
);

/* ------------------------------------------------------------------ Misc */

/** Horizontal bar used by the pipeline and analytics breakdowns. */
export const Bar: React.FC<{ value: number; max: number; tone?: Tone }> = ({ value, max, tone = 'accent' }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const fill: Record<Tone, string> = {
    accent: 'bg-accent',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    info: 'bg-info',
    neutral: 'bg-ink-faint',
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-overlay overflow-hidden">
      <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

/* ------------------------------------------------------------- Formatting */

/** Formats a timestamp; falls back to an em dash rather than "Invalid Date". */
export const timeAgo = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
};

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

/**
 * Turns a raw backend token (lead status, source, intent...) into a readable
 * label. Unknown values are shown verbatim rather than hidden.
 */
export const humanise = (value: string | null | undefined): string => {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
};

/**
 * Maps an existing LeadStatus onto a semantic tone.
 * Anything unrecognised renders neutral rather than being mis-coloured.
 */
export const statusTone = (status: string | null | undefined): Tone => {
  switch (status) {
    case 'CLOSED':
    case 'INTERESTED':
    case 'QUALIFIED':
    case 'APPROVED':
      return 'ok';
    case 'HUMAN_REQUIRED':
    case 'FAILED':
    case 'REJECTED':
    case 'NOT_INTERESTED':
      return 'danger';
    case 'AI_CONVERSATION':
    case 'FOLLOW_UP':
    case 'REPLIED':
    case 'OUTREACH_SENT':
    case 'SENT':
      return 'info';
    case 'RESEARCHING':
      return 'warn';
    default:
      return 'neutral';
  }
};