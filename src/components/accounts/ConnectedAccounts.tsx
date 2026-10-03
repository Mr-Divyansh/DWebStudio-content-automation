/**
 * CONNECTED ACCOUNTS
 * ============================================================================
 * The product's "connect your accounts" screen. The user never types a token,
 * key, page id or cookie — they press Connect and authorize on the platform.
 *
 * Each card has exactly two states, matching the product spec:
 *   Not connected -> [ Connect ]
 *   Connected      -> "Connected" + [ Manage ] [ Disconnect ]
 *
 * IMPORTANT HONESTY RULE: a card only shows "Connected" when the SERVER has a
 * real, platform-verified credential. The API has no endpoint that can set that
 * flag manually, so the UI cannot display a fake success.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Hash, Send, Check, Plug, Unplug, RefreshCw, ShieldCheck, AlertTriangle, Settings } from 'lucide-react';
import { api } from '../../lib/api';
import type { ConnectedAccountItem, ConnectedPlatform } from '../../types';

const ICONS: Record<ConnectedPlatform, React.ElementType> = {
  WHATSAPP: MessageCircle,
  DISCORD: Hash,
  TELEGRAM: Send,
};

/** Plain-language explanation of what each platform will be used for. */
const PLATFORM_PURPOSE: Record<ConnectedPlatform, string> = {
  WHATSAPP: 'Reply to WhatsApp conversations from your business number.',
  DISCORD: 'Take part in Discord conversations with your community.',
  TELEGRAM: 'Reply to Telegram conversations from your business account.',
};

interface Props {
  /** Optional message shown after an OAuth round-trip (from the URL). */
  initialMessage?: string | null;
  initialSuccess?: boolean | null;
}

export const ConnectedAccounts: React.FC<Props> = ({ initialMessage, initialSuccess }) => {
  const [accounts, setAccounts] = useState<ConnectedAccountItem[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<ConnectedPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    initialMessage ? { text: initialMessage, ok: Boolean(initialSuccess) } : null,
  );
  const [expanded, setExpanded] = useState<ConnectedPlatform | null>(null);
  const telegramRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getConnections();
      setAccounts(res.accounts);
      setStorageReady(res.storageReady);
      setServerNotice(res.notice);
    } catch (err: any) {
      setError(err?.message || 'Could not load your connected accounts.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------------------------------- WhatsApp (Embedded Signup) */

  const connectWhatsApp = useCallback(async () => {
    setBusy('WHATSAPP');
    setError(null);
    try {
      const started = await api.startConnection('WHATSAPP');
      if (started.action !== 'embedded_signup' || !started.payload) {
        throw new Error('WhatsApp sign-in is unavailable right now.');
      }
      const { app_id: appId, config_id: configId, graph_version: graphVersion } = started.payload;

      // Meta's official JavaScript SDK. The app secret never reaches the browser;
      // only these three public values do.
      await new Promise<void>((resolve, reject) => {
        const w = window as any;
        if (w.FB) return resolve();
        const s = document.createElement('script');
        s.src = 'https://connect.facebook.net/en_US/sdk.js';
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Could not load the secure Meta sign-in window.'));
        document.body.appendChild(s);
      });

      const w = window as any;
      w.FB.init({ app_id: appId, xfbml: true, version: graphVersion || 'v21.0' });

      // Embedded Signup returns a short-lived (30s) authorization code. It is
      // posted to our server immediately, which exchanges it for a verified
      // business token. The code itself never reaches the database.
      const code: string = await new Promise((resolve, reject) => {
        w.FB.login(
          (response: any) => {
            if (response?.authResponse?.code) return resolve(response.authResponse.code);
            if (response?.authResponse?.access_token) {
              return reject(new Error('Unexpected response from Meta. Please try again.'));
            }
            reject(new Error('WhatsApp authorization was cancelled.'));
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: '3' },
          },
        );
      });

      await api.completeConnection('WHATSAPP', { code });
      setMessage({ text: 'WhatsApp connected successfully.', ok: true });
      await load();
    } catch (err: any) {
      setError(err?.message || 'WhatsApp could not be connected.');
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  /* ------------------------------------------------------------ Discord (OAuth2) */

  const connectDiscord = useCallback(async () => {
    setBusy('DISCORD');
    setError(null);
    try {
      const started = await api.startConnection('DISCORD');
      if (started.action !== 'redirect' || !started.url) {
        throw new Error('Discord sign-in is unavailable right now.');
      }
      // Full-page redirect to Discord. The server handles the callback, verifies
      // the token against /users/@me, then returns to ?tab=connections.
      window.location.href = started.url;
    } catch (err: any) {
      setError(err?.message || 'Discord could not be connected.');
      setBusy(null);
    }
  }, []);

  /* ------------------------------------------------- Telegram (official Login Widget) */

  const connectTelegram = useCallback(async () => {
    setBusy('TELEGRAM');
    setError(null);
    try {
      const started = await api.startConnection('TELEGRAM');
      if (started.action !== 'widget' || !started.payload) {
        throw new Error('Telegram sign-in is unavailable right now.');
      }
      const { bot_id: botId, bot_username: botUsername, state } = started.payload;

      // The widget posts the signed payload to data-auth-url; our server then
      // verifies Telegram's HMAC. The bot TOKEN is never sent to the browser.
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '6');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-userpic', 'true');
      script.setAttribute('data-auth-url', `${window.location.origin}/api/connections/TELEGRAM/complete?state=${encodeURIComponent(state)}`);

      const container = telegramRef.current;
      if (!container) throw new Error('Could not render the Telegram sign-in button.');
      container.innerHTML = '';
      container.appendChild(script);
      setExpanded('TELEGRAM');
    } catch (err: any) {
      setError(err?.message || 'Telegram could not be connected.');
    } finally {
      setBusy(null);
    }
  }, []);

  const disconnect = useCallback(
    async (platform: ConnectedPlatform) => {
      setBusy(platform);
      setError(null);
      try {
        await api.disconnectAccount(platform);
        setMessage({ text: `${platform.charAt(0)}${platform.slice(1).toLowerCase()} disconnected.`, ok: true });
        if (expanded === platform) setExpanded(null);
        await load();
      } catch (err: any) {
        setError(err?.message || 'Could not disconnect.');
      } finally {
        setBusy(null);
      }
    },
    [expanded, load],
  );

  /** Asks the platform to re-confirm the stored credential. */
  const manage = useCallback(
    async (platform: ConnectedPlatform) => {
      setBusy(platform);
      setError(null);
      try {
        const result = await api.verifyAccount(platform);
        setMessage({ text: result.detail, ok: result.ok });
        if (!result.ok) await load();
      } catch (err: any) {
        setError(err?.message || 'Could not verify the connection.');
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const connectHandler: Record<ConnectedPlatform, () => void> = {
    WHATSAPP: connectWhatsApp,
    DISCORD: connectDiscord,
    TELEGRAM: connectTelegram,
  };

  const renderCard = (account: ConnectedAccountItem) => {
    const Icon = ICONS[account.platform];
    const isBusy = busy === account.platform;

    return (
      <div
        key={account.platform}
        className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              account.connected ? 'bg-[#152E20] border-[#2A5A34]' : 'bg-[#141A22] border-[#1E2734]'
            }`}
          >
            <Icon className={`w-5 h-5 ${account.connected ? 'text-[#7EE787]' : 'text-[#8C98A9]'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#F4F1EA]">{account.label}</h3>
              {account.connected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-[#7EE787] bg-[#152E20] border-[#2A5A34]">
                  <Check className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-[#8C98A9] bg-[#141A22] border-[#252F3C]">
                  Not connected
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8C98A9] mt-0.5">{PLATFORM_PURPOSE[account.platform]}</p>
            {account.connected && (
              <p className="text-[10px] text-[#5A6675] mt-1 truncate">
                {account.displayName || account.username || 'Authorized'}
                {account.connectedAt ? ` · connected ${new Date(account.connectedAt).toLocaleDateString()}` : ''}
              </p>
            )}
            {!account.connected && account.lastError && (
              <p className="text-[10px] text-[#FFD166] mt-1">{account.lastError}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {account.connected ? (
            <>
              <button
                onClick={() => manage(account.platform)}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141A22] hover:bg-[#1E2734] border border-[#1E2734] text-[11px] font-semibold text-[#F4F1EA] disabled:opacity-50 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" /> Manage
              </button>
              <button
                onClick={() => disconnect(account.platform)}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2E1A1A] hover:bg-[#3A2020] border border-[#5A2A2A] text-[11px] font-semibold text-[#FFB4B4] disabled:opacity-50 cursor-pointer"
              >
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connectHandler[account.platform]}
              disabled={isBusy || !account.available || !storageReady}
              title={!account.available ? account.unavailableReason || undefined : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
              Connect
            </button>
          )}
        </div>

        {/* Telegram's official widget renders itself here when requested. */}
        {account.platform === 'TELEGRAM' && expanded === 'TELEGRAM' && !account.connected && (
          <div ref={telegramRef} className="sm:col-span-2 w-full flex justify-center pt-1" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#F4F1EA]">Connected Accounts</h2>
        <p className="text-xs text-[#8C98A9] mt-0.5">
          Connect your messaging accounts so your Lead AI can work with you. You will sign in on the platform itself — no
          API keys or tokens to paste.
        </p>
      </div>

      {!storageReady && serverNotice && (
        <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-[#2E2815] border border-[#5A4A20] text-[11px] text-[#FFD166]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{serverNotice}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-[#2E1A1A] border border-[#5A2A2A] text-[11px] text-[#FFB4B4]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div
          className={`flex items-start gap-2 px-3.5 py-3 rounded-xl text-[11px ${
            message.ok ? 'bg-[#152E20] border-[#2A5A34] text-[#7EE787]' : 'bg-[#2E2815] border-[#5A4A20] text-[#FFD166]'
          } border`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="space-y-3">{accounts.map(renderCard)}</div>

      <p className="text-[10px] text-[#5A6675] flex items-center gap-1.5">
        <ShieldCheck className="w-3 h-3 text-[#2F7EF2]" />
        Your authorization is stored encrypted on our servers and is never shown in your browser.
      </p>
    </div>
  );
};

export default ConnectedAccounts;