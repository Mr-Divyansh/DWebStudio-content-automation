/**
 * SETTINGS
 * ============================================================================
 * Deliberately read-mostly. It surfaces configuration STATE (is it set?) and
 * never surfaces configuration VALUES, so this screen can be shown to any
 * signed-in user without leaking a secret.
 *
 * The credential vault (operator-only API keys) is not reachable from here for
 * a normal member; the server returns 403 and the UI reflects that honestly.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, User, ShieldCheck, Cpu, Server, Plug, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, Card, CardHeader, PageHeader, Skeleton, humanise } from '../components/ui';
import type { ConfigInfo, SessionUser, VaultKeyStatus, AgentStatus } from '../types';

interface SettingsPageProps {
  user: SessionUser;
  isOwner: boolean;
  onManageConnections: () => void;
}

const SECURITY_POINTS = [
  'Passwords are hashed with scrypt and never stored in plain text.',
  'Sessions use an HttpOnly cookie; only a hash of the token is stored.',
  'Provider tokens are encrypted with AES-256-GCM on the server.',
  'OAuth callbacks validate a single-use, user-bound state.',
  'No token is ever returned to the browser or written to a log.',
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, isOwner, onManageConnections }) => {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [vault, setVault] = useState<VaultKeyStatus[] | null>(null);
  const [vaultDenied, setVaultDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      setAgent(await api.getAgentStatus().catch(() => null));
      // Vault is OWNER-only; a member legitimately gets 403.
      try {
        const res = await fetch('/api/vault/status', { credentials: 'include' });
        if (res.status === 403) setVaultDenied(true);
        else if (res.ok) {
          const body = await res.json();
          setVault(body.keys ?? []);
          setVaultDenied(false);
        }
      } catch {
        setVaultDenied(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px]">
        <Skeleton className="h-7 w-40" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px]">
      <PageHeader
        title="Settings"
        description="Configuration status for your account, the AI engine and this server. Secrets are never displayed."
        actions={
          <button onClick={load} className="cc-btn cc-btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-danger/25 bg-danger-dim/40 px-4 py-3 text-xs text-danger">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account */}
        <Card>
          <CardHeader title="Account" />
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raised text-sm font-bold text-ink-muted">
                {user.name?.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user.name || 'Unnamed account'}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
              <div className="ml-auto">
                <Badge tone={isOwner ? 'accent' : 'neutral'}>{humanise(user.role)}</Badge>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Member since</dt>
                <dd className="text-right font-medium">{new Date(user.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Password change</dt>
                <dd className="text-right text-ink-faint">Not implemented yet</dd>
              </div>
            </dl>
          </div>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader title="Security" />
          <div className="p-5">
            <ul className="space-y-2.5 text-xs">
              {SECURITY_POINTS.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                  <span className="leading-relaxed text-ink-muted">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* AI */}
        <Card>
          <CardHeader
            title="AI & automation"
            action={
              agent ? (
                <Badge tone={agent.state === 'RUNNING' ? 'ok' : agent.state === 'PAUSED' ? 'warn' : 'neutral'}>
                  {humanise(agent.state)}
                </Badge>
              ) : undefined
            }
          />
          <div className="p-5">
            <div className="flex gap-2.5">
              <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">AI provider</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                  {config?.geminiConfigured
                    ? 'A model provider is configured, so the Lead AI can draft and classify.'
                    : 'No model provider is configured. The Lead AI falls back to deterministic rules and still works.'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">Safety gates</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                  Opt-outs and human take-over always win. The AI never messages an opted-out lead, and it hands
                  uncertain decisions to a person.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* System */}
        <Card>
          <CardHeader title="System" />
          <div className="p-5">
            <div className="flex gap-2.5">
              <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink">Environment</p>
                <dl className="mt-2 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Application</dt>
                    <dd className="truncate font-medium">{config?.system ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Database</dt>
                    <dd>
                      <Badge tone={config?.databaseConnected ? 'ok' : 'danger'}>
                        {config?.databaseConnected ? 'Connected' : 'Unavailable'}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Mode</dt>
                    <dd>
                      <Badge tone={config?.geminiConfigured ? 'ok' : 'warn'}>
                        {config?.mode === 'AI_ACTIVE' ? 'AI active' : 'Deterministic rules'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="cc-label">Platform credentials</p>
              {vaultDenied ? (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  Visible to administrators only. Your account does not have access.
                </p>
              ) : vault === null ? (
                <p className="mt-2 text-[11px] text-ink-faint">Not loaded.</p>
              ) : vault.length === 0 ? (
                <p className="mt-2 text-[11px] text-ink-faint">No credentials configured.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {vault.map((k) => (
                    <li key={k.name} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="truncate font-mono text-ink-muted">{k.name}</span>
                      <Badge tone={k.set ? 'ok' : 'neutral'}>{k.set ? 'Set' : 'Not set'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button variant="secondary" className="mt-5" onClick={onManageConnections}>
              <Plug className="h-3.5 w-3.5" /> Manage connected accounts
            </Button>
          </div>
        </Card>
      </div>

      <p className="mt-6 flex items-center gap-2 text-[11px] text-ink-faint">
        <User className="h-3 w-3" />
        Preferences such as sidebar state are stored locally in this browser only.
      </p>
    </div>
  );
};

export default SettingsPage;

