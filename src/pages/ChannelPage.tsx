/**
 * CHANNEL DETAIL — one page per provider
 * ============================================================================
 * Reuses the existing connect/complete/disconnect/verify endpoints rather than
 * re-implementing any of them, so a channel behaves identically wherever it is
 * managed.
 *
 * A channel reports exactly one of four honest states:
 *   Connected · Needs attention · Disconnected · Setup required
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Plug, Unplug, RefreshCw, Check, ShieldCheck, Settings, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { CHANNEL_ICONS } from '../components/shell/AppShell';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  Skeleton,
  humanise,
  timeAgo,
  type Tone,
} from '../components/ui';
import type { ConnectedAccountItem, ConnectedPlatform, ConnectionsResponse } from '../types';
import { ProviderSetupModal } from '../components/accounts/ProviderSetupModal';

interface ChannelPageProps {
  platform: ConnectedPlatform;
  connections: ConnectionsResponse | null;
  onRefreshConnections: () => void;
  onManage: () => void;
}

/** Which official mechanism each provider uses — shown so nobody has to guess. */
const MECHANISM: Record<ConnectedPlatform, string> = {
  INSTAGRAM: 'Facebook Login for Business (Instagram Platform)',
  WHATSAPP: 'Meta Embedded Signup (WhatsApp Business Cloud API)',
  GMAIL: 'Google OAuth 2.0 with PKCE',
  DISCORD: 'Discord OAuth2 Authorization Code with PKCE',
  TELEGRAM: 'Telegram official Login Widget (HMAC verified)',
};

export const ChannelPage: React.FC<ChannelPageProps> = ({
  platform,
  connections,
  onRefreshConnections,
  onManage,
}) => {
  const account: ConnectedAccountItem | undefined = connections?.accounts?.find(
    (a) => a.platform === platform,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Drives the reusable setup checklist instead of a dead Connect button. */
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    setError(null);
    setNotice(null);
    setBusy(false);
    setSetupOpen(false);
  }, [platform]);

  const Icon = CHANNEL_ICONS[platform];
  const label = account?.label ?? humanise(platform);
  const connected = account?.connected === true;
  const attention = account?.status === 'ERROR';
  // Prefer the server's single derived state; fall back for older responses.
  const state = account?.state ?? (connected ? 'CONNECTED' : attention ? 'AUTHORIZATION_FAILED' : account?.available ? 'READY' : 'SETUP_REQUIRED');
  const needsSetup = state === 'SETUP_REQUIRED';

  const status: { text: string; tone: Tone } = connected
    ? { text: 'Connected', tone: 'ok' }
    : attention
      ? { text: 'Needs attention', tone: 'danger' }
      : needsSetup
        ? { text: 'Setup required', tone: 'warn' }
        : { text: 'Ready to connect', tone: 'neutral' };

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.disconnectAccount(platform);
      setNotice(`${label} disconnected.`);
      onRefreshConnections();
    } catch (err: any) {
      setError(err?.message || 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  }, [label, onRefreshConnections, platform]);
if (!connections) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px]">
        <Skeleton className="h-7 w-48" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px]">
      <PageHeader
        title={label}
        description={`Connected via ${MECHANISM[platform]}.`}
        actions={
          <button onClick={onManage} className="cc-btn cc-btn-secondary">
            <Settings className="h-3.5 w-3.5" /> All connected accounts
          </button>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-dim/40 px-4 py-3 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-ok/25 bg-ok-dim/40 px-4 py-3 text-xs text-ok">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Identity */}
        <Card>
          <CardHeader title="Account" />
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-raised">
                <Icon className="h-5 w-5 text-ink-muted" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{label}</p>
                <p className="mt-1">
                  <Badge tone={status.tone}>{status.text}</Badge>
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-2.5 text-xs">
              {[
                { label: 'Account', value: account?.accountEmail || account?.username || account?.displayName },
                { label: 'Connected', value: account?.connectedAt ? timeAgo(account.connectedAt) : null },
                { label: 'Last verified', value: account?.lastVerifiedAt ? timeAgo(account.lastVerifiedAt) : null },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">{row.label}</dt>
                  <dd className="truncate text-right font-medium text-ink">{row.value || '—'}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              {connected ? (
                <>
                  <Button variant="secondary" onClick={onManage}>
                    <RefreshCw className="h-3.5 w-3.5" /> Reconnect
                  </Button>
                  <Button variant="danger" onClick={disconnect} loading={busy} disabled={busy}>
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                </>
              ) : needsSetup ? (
                  <Button variant="secondary" onClick={() => setSetupOpen(true)}>
                    <Settings className="h-3.5 w-3.5" /> Setup {label}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={onManage}>
                    <Plug className="h-3.5 w-3.5" /> {attention ? `Retry ${label}` : `Connect ${label}`}
                  </Button>
                )}
              </div>
          </div>
        </Card>

        {/* Permissions + honesty */}
        <Card>
          <CardHeader title="Permissions & health" />
          <div className="p-5">
            {needsSetup && (
              <div className="mb-4 rounded-lg border border-warn/25 bg-warn-dim/40 px-3.5 py-3 text-[11px] leading-relaxed text-warn">
                <p className="font-semibold">{label} setup required</p>
                <p className="mt-1">
                  {account?.setup.missing.length
                    ? `Missing: ${account.setup.missing.join(', ')}. `
                    : ''}
                  Press “Setup {label}” for the exact steps.{' '}
                  {account?.setup.requiresProviderApproval && 'This provider also requires Meta approval.'}
                </p>
              </div>
            )}
            {attention && account?.lastError && (
              <div className="mb-4 rounded-lg border border-danger/25 bg-danger-dim/40 px-3.5 py-3 text-[11px] leading-relaxed text-danger">
                {account.lastError}
              </div>
            )}

            <p className="cc-label">Granted scopes</p>
            {account && account.scopes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {account.scopes.map((s) => (
                  <span key={s} className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[10px] text-ink-muted">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-faint">No scopes granted — the channel is not connected.</p>
            )}

            <div className="mt-5 flex gap-2.5 border-t border-line pt-4">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <p className="text-[11px] leading-relaxed text-ink-faint">
                Tokens are encrypted on the server and are never sent to the browser. This page shows only your account
                identity and the permissions you granted.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <ProviderSetupModal
        label={label}
        setup={account?.setup}
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
      />
    </div>
  );
};

export default ChannelPage;