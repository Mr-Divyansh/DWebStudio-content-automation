/**
 * PLATFORM ADAPTER CONTRACT
 * ============================================================================
 * Every platform implements the same small interface so the dashboard UI, the
 * routes and the disconnect logic stay platform-agnostic. Adding a platform
 * means adding one adapter file and one registry entry — no UI changes and no
 * changes to the automation layer.
 *
 * Note what is NOT in this interface: anything lead-related. Automation lives
 * in server/src/agent/* and reads a connection through ConnectionService, so
 * authentication can never leak into automation behaviour.
 */

import type { Platform, VerifiedConnection } from './types.js';

export interface AdapterStartContext {
  /** The signed-in application user, or null for an unauthenticated flow. */
  userId: string | null;
}

export type AdapterStartResult =
  /** The browser should be redirected to the platform's own login page. */
  | { kind: 'redirect'; url: string }
  /** The platform's widget/SDK runs on our page (e.g. Telegram Login Widget). */
  | { kind: 'client'; payload: Record<string, string> };

export interface PlatformAdapter {
  readonly platform: Platform;

  /** True when the one-time developer/平台 setup is complete on this server. */
  isConfigured(): boolean;

  /** Plain-language reason the Connect button is disabled, or null. */
  unavailableReason(): string | null;

  /** Begins the connect flow. Never returns a token to the browser. */
  start(ctx: AdapterStartContext): Promise<AdapterStartResult>;

  /**
   * Completes the flow AFTER the platform verified the credential, and returns
   * the verified identity + tokens for encrypted storage.
   */
  complete(input: { code?: string; state?: string; codeVerifier?: string } & Record<string, unknown>): Promise<VerifiedConnection>;

  /** Best-effort platform-side revocation when a user disconnects. */
  revoke(userId: string): Promise<void>;

  /** Re-verifies a stored connection against the platform. */
  verify(userId: string): Promise<{ ok: boolean; detail: string }>;
}