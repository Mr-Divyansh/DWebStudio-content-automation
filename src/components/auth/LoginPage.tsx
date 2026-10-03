/**
 * APPLICATION LOGIN SCREEN
 * ============================================================================
 * The only technical concept a normal user ever meets here is "email and
 * password". There is no API key field, no token field, no page ID, no session
 * file — those are a developer concern and never appear in this flow.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Bot, LogIn, UserPlus, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import type { AuthSessionInfo } from '../../types';

interface LoginPageProps {
  onAuthenticated: () => void;
}

type Mode = 'login' | 'register';

const FIELD =
  'w-full bg-[#0C0F13] border border-[#1E2734] rounded-lg px-3.5 py-2.5 text-sm placeholder-[#5A6675] focus:outline-none focus:border-[#2F7EF2] focus:ring-1 focus:ring-[#2F7EF2]';
const LABEL = 'block text-[11px] font-semibold text-[#8C98A9] mb-1.5';

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<AuthSessionInfo | null>(null);

  useEffect(() => {
    api
      .getAuthSession()
      .then((s) => {
        setSession(s);
        // First visit with no accounts yet -> make "Create account" the default.
        if (!s.authenticated && !s.hasUsers) setMode('register');
      })
      .catch(() => setSession(null));
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        if (mode === 'register') {
          await api.register({ email, password, name: name || undefined });
        } else {
          await api.login(email, password);
        }
        onAuthenticated();
      } catch (err: any) {
        setError(err?.message || 'Something went wrong. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [mode, email, password, name, onAuthenticated],
  );

  const tab = (id: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(id);
        setError(null);
      }}
      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
        mode === id ? 'bg-[#1C2430] text-[#F4F1EA]' : 'text-[#8C98A9] hover:text-[#F4F1EA]'
      }`}
    >
      {label}
    </button>
  );
return (
    <div className="min-h-screen bg-[#0C0F13] text-[#F4F1EA] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2F7EF2] to-[#164282] flex items-center justify-center font-bold text-white shadow-lg shadow-[#2F7EF2]/20 border border-[#6FB2FF]/40">
            D
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              D Web Studio
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#2F7EF2]/20 text-[#6FB2FF] border border-[#2F7EF2]/40 font-mono">
                LEAD AI
              </span>
            </h1>
            <p className="text-xs text-[#8C98A9]">Your AI sales assistant</p>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-6 shadow-xl">
          <div className="flex gap-1 p-1 rounded-xl bg-[#0C0F13] border border-[#1C232D] mb-5">
            {tab('login', 'Sign in')}
            {tab('register', 'Create account')}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className={LABEL}>Your name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Sharma"
                  autoComplete="name"
                  className={FIELD}
                />
              </div>
            )}

            <div>
              <label className={LABEL}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className={FIELD}
              />
            </div>

            <div>
              <label className={LABEL}>Password</label>
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 10 characters' : '••••••••••'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className={FIELD}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#2E1A1A] border border-[#5A2A2A] text-[11px] text-[#FFB4B4]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          {mode === 'register' && session?.hasUsers === false && (
            <p className="mt-4 text-[11px] text-[#8C98A9] text-center">
              You are the first user — this account becomes the administrator.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-[#0E131A]/60 border border-[#1C232D] p-4">
          <h3 className="text-[11px] font-bold text-[#F4F1EA] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-[#2F7EF2]" /> After you sign in
          </h3>
          <ol className="space-y-1.5 text-[11px] text-[#8C98A9]">
            <li>1. Open your Dashboard.</li>
            <li>2. Connect WhatsApp, Discord or Telegram with one click.</li>
            <li>3. Authorize on the platform — done. Your Lead AI takes over.</li>
          </ol>
          <p className="mt-3 text-[10px] text-[#5A6675]">
            You will never be asked to paste API keys, tokens or account IDs. Those are handled securely on our servers.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;