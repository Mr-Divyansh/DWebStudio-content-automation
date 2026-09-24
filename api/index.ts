/**
 * Vercel serverless entry point.
 *
 * This is a THIN ADAPTER ONLY. It imports the existing Express application from
 * `server/src/index.ts` and hands it to Vercel, so there is exactly one Express
 * app and one copy of every route in the project:
 *
 *   /api/health
 *   /api/leads/*          (including /:id/research and /:id/qualify)
 *   /api/import/*
 *   /api/learnings/*
 *   /api/dashboard
 *   /api/portfolio
 *   /api/config
 *   /api/agent/*          (status, start/pause/stop, auto-dm, takeover, inbox…)
 *   /api/webhooks/instagram  (GET verification + POST delivery)
 *
 * No `app.listen()` is called here. `createExpressApp()` only wires middleware
 * and routes, so importing it is side-effect free (see the guard at the bottom of
 * server/src/index.ts).
 *
 * Vercel detects an Express request handler exported as `default` and adapts it
 * automatically, so the webhook's raw-body HMAC verification keeps working.
 */

import { createExpressApp } from '../server/src/index.js';

// Cached across warm invocations; Express apps are safe to reuse.
const app = createExpressApp();

export default app;
