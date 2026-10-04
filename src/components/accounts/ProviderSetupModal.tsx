/**
 * PROVIDER SETUP MODAL
 * ============================================================================
 * One reusable component behind the "Setup" action on every provider card, in
 * every screen (Connected Accounts, the per-channel page, and the Command
 * Center). Adding a sixth provider therefore needs no new modal.
 *
 * WHY THIS EXISTS
 * Previously an unconfigured provider had exactly one honest-looking UI option:
 * a disabled Connect button. That is a dead end for the user and tells the
 * administrator nothing. This modal turns the dead end into a checklist.
 *
 * SECURITY CONTRACT
 * It renders environment variable NAMES only. The API response type
 * (ProviderSetup) has no field that could carry a value, so there is nothing
 * here that *could* leak a secret even if the component were rewritten badly.
 * There is deliberately no password/token input anywhere in this file — a
 * connection is always established on the provider's own site.
 */

import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Copy, Check, Settings, ShieldAlert, ListChecks } from 'lucide-react';
import type { ProviderSetup } from '../../types';

interface Props {
  /** Provider display name, e.g. "Discord". */
  label: string;
  setup: ProviderSetup | null | undefined;
  open: boolean;
  onClose: () => void;
  /** Called after the user copies the redirect URI, for a confirmation toast. */
  onCopied?: (text: string) => void;
}

export const ProviderSetupModal: React.FC<Props> = ({ label, setup, open, onClose, onCopied }) => {
  const [copied, setCopied] = useState(false);

  // Escape closes, matching the rest of the app's dialogs.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset the transient "copied" tick whenever the modal is reopened.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open || !setup) return null;

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(setup.redirectUri);
      setCopied(true);
      onCopied?.(setup.redirectUri);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions; the URI is visible on screen
      // regardless, so a silent failure here is acceptable.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-[#2A3644] bg-[#0E131A] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} setup`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#1C232D] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border border-[#5A4A20] bg-[#2A2315] p-2">
              <Settings className="h-4 w-4 text-[#FFD166]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F4F1EA]">{label} setup required</h3>
              <p className="mt-0.5 text-[11px] font-medium text-[#FFD166]">Not configured on this server</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#8C98A9] transition-colors hover:bg-[#1C232D] hover:text-[#F4F1EA] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* Meta approval is a hard external gate, so it is stated up front. */}
          {setup.requiresProviderApproval && (
            <div className="flex items-start gap-2 rounded-xl border border-[#5A4A20] bg-[#2A2315] px-3.5 py-3 text-[11px] leading-relaxed text-[#FFD166]">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold">Provider approval/setup required.</strong> {label} uses
                Meta&apos;s official platform, so Meta must approve this app before any account can be
                connected. This app does not pretend otherwise.
              </span>
            </div>
          )}

          <p className="text-[11.5px] leading-relaxed text-[#C3CAD6]">{setup.summary}</p>
          {/* Missing variables — NAMES only */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8C98A9]">
              {setup.missing.length > 0 ? 'Missing configuration' : 'Configuration'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(setup.missing.length > 0 ? setup.missing : setup.required).map((name) => (
                <code
                  key={name}
                  className={`rounded-md border px-2 py-1 font-mono text-[10.5px] ${
                    setup.missing.length > 0
                      ? 'border-[#5A2A2A] bg-[#2E1A1A] text-[#FFB4B4]'
                      : 'border-[#2A5A34] bg-[#152E20] text-[#7EE787]'
                  }`}
                >
                  {name}
                </code>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8C98A9]">
              <ListChecks className="h-3 w-3" /> How to complete the official setup
            </p>
            <ol className="space-y-2">
              {setup.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11.5px] leading-relaxed text-[#C3CAD6]">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#2F7EF2]/40 bg-[#142640] text-[9px] font-bold text-[#6FB2FF]">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Redirect URI — the single most common thing to get wrong */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8C98A9]">
              Redirect URI to register (must match exactly)
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-[#1C232D] bg-[#0A0E13] px-2.5 py-2 font-mono text-[10.5px] text-[#6FB2FF]">
                {setup.redirectUri}
              </code>
              <button
                onClick={copyRedirect}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#1E2734] bg-[#141A22] px-2.5 py-2 text-[10.5px] font-semibold text-[#F4F1EA] transition-colors hover:bg-[#1E2734] cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3 text-[#7EE787]" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[#5A6675]">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            Variable values are never displayed or requested here — only the names. Enter them in the
            server&apos;s <code className="font-mono">.env</code> file and restart the server.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#1C232D] px-5 py-3.5">
          <a
            href={setup.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6FB2FF] hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Open setup documentation
          </a>
          <button
            onClick={onClose}
            className="rounded-lg bg-[#141A22] px-3.5 py-2 text-[11px] font-semibold text-[#F4F1EA] transition-colors hover:bg-[#1E2734] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProviderSetupModal;