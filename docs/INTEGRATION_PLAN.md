# Integration Plan — D Web Studio Lead AI

**Date:** 2026-09-24
**Status:** PLAN ONLY — **STOP.** No integration has been performed. This document awaits owner review together with `docs/OPEN_SOURCE_AUDIT.md`. Implementation begins only after explicit approval.
**Ground rules honored:** extend existing services (never V2 modules), keep the Instagram reader / evidence / portfolio / human-approval / learning systems custom, no auto-send, no private-data exposure, MIT attribution when copying verbatim content.

## Priority Overview

| ID | Plan item | Source | Decision |
|---|---|---|---|
| P1 | Website/business research + evidence collection | Build ourselves (OpenGTM ideas) | New service, existing Evidence model |
| P2 | Deterministic website audit checks | `ai-search-audit` (MIT) | REUSE WITH CONDITIONS |
| P3 | Deterministic lead scoring | Build ourselves (Prospex/OpenGTM ideas) | Extend lead pipeline |
| P4 | Reply analysis after human send | Build ourselves | Extend existing analyzer |
| P5 | Follow-up logic | Build ourselves + GTM Skills prompts | Extend lead service |
| P6 | CSV/JSON export | Build ourselves (Prospex route pattern) | New thin routes |
| P7 | Outreach prompt frameworks | GTM Skills (MIT) | REUSE WITH CONDITIONS |
| P8 | Fetch retry/SSRF utility | Build ourselves | New shared util |

---

## P1 — Website/Business Research + Evidence Collection

1. **Existing feature:** Evidence exists, but only as conversation quotes produced during AI analysis.
2. **Existing implementation:** `Evidence` Prisma model (`claim, evidence, source, confidence, createdAt`); `leadSchemas.ts` `EvidenceItemSchema`; evidence written by `leadService.runAnalysisOnLead`.
3. **Open-source alternative:** OpenGTM (MIT) research/qualification concepts — structured ICP questions to ask about a business; no TS code usable.
4. **License:** MIT (concepts only, no code copied).
5. **Reuse decision:** **Build ourselves; reference OpenGTM's ICP dimensions as a checklist.**
6. **Exact component to reuse:** None (documentation reference only).
7. **Files that would change:** `server/src/services/researchService.ts` (**new, single service**), `server/src/api/routes/leadRoutes.ts` (add `POST /api/leads/:id/research`), `prisma/schema.prisma` (optional: add nullable `url`, `observation`, `observedAt`, `evidenceType` columns to `Evidence` — additive migration only), `src/lib/api.ts`, `src/components/leads/LeadDetailModal.tsx` (Research tab).
8. **Dependencies required:** none new for fetching (native `fetch`); P8 utility + P2 checks plug in here.
9. **Risks:** schema migration must be additive/backward-compatible; research must be human-triggered per lead; timeouts on slow sites; strict No-Invention (only observable facts become evidence).
10. **Testing strategy:** unit tests with a local mock HTTP server (no real sites in CI); assert every Evidence row has `source` + `observedAt`; assert failure paths store "unreachable" observations rather than invented claims.

## P2 — Deterministic Website Audit Checks

1. **Existing feature:** None (gap #2/#3).
2. **Existing implementation:** None. (`node-html-parser` already present for the Instagram reader.)
3. **Open-source alternative:** `ai-search-audit` (MIT, TypeScript) — 10 static checks per URL, scored, typed results, no API keys/LLM/browser, built-in SSRF guards.
4. **License:** MIT.
5. **Reuse decision:** **REUSE WITH CONDITIONS — prefer npm dependency over copying code.**
6. **Exact component to reuse:** The `audit(url)` library entry point and its check catalog (HTTPS presence, canonical/OG, structured data, robots.txt/llms.txt style checks as applicable to local-business sites).
7. **Files that would change:** `server/src/services/researchService.ts` (call audit, map results → Evidence rows), `package.json` (add pinned dependency), `docs/THIRD_PARTY_NOTICES.md` (MIT attribution), possibly `server/src/api/routes/leadRoutes.ts` (audit trigger alongside research).
8. **Dependencies required:** `ai-search-audit` (pinned exact version after review); no external APIs.
9. **Risks:** young package (0 stars) — pin version, review changelog before upgrades; only audits public sites we are directed to; all fetches must respect P8 SSRF/timeout rules; audit output is *observation*, never an auto-generated claim about a business.
10. **Testing strategy:** fixture-based tests using a local static server with known HTML → assert expected check statuses; verify private/internal IPs are refused; verify research still works when the package is unavailable (graceful degradation).

---

## P3 — Deterministic Lead Scoring

1. **Existing feature:** Categorical qualification (`QUALIFIED/DISQUALIFIED/PENDING_INFO`), intent classes, `confidence` — but no single sortable score.
2. **Existing implementation:** `leadService.runAnalysisOnLead` writes intent/qualification/confidence; `LeadRepository.getStats` aggregates dashboard counts.
3. **Open-source alternative:** OpenGTM `qualify.py` ICP profile shape (weights for industry/size/pain); Prospex Bayesian rating average (not applicable — we hold no star ratings).
4. **License:** MIT (concept reference; no code copied).
5. **Reuse decision:** **Build ourselves** as a pure deterministic function; no scoring library.
6. **Exact component to reuse:** None — adopt only the *idea* of a documented, weighted ICP profile (our version: niche fit from `knowledge/business.md`, intent, qualification, evidence count, follow-up flag).
7. **Files that would change:** `server/src/services/leadService.ts` (compute score after analysis — same service, no new module), `src/types/index.ts` (score field on `LeadItem`), optionally `prisma/schema.prisma` (add nullable `score Int` + `scoreBreakdown String`), `src/components/leads/LeadTable.tsx` (sortable score column), `server/src/database/seed.ts` (backfill demo leads).
8. **Dependencies required:** none.
9. **Risks:** score must never override human judgment (display-only); formula must be documented and versioned so changes are auditable; AI suggests components, code computes the number (no free-form AI scores).
10. **Testing strategy:** unit tests for the pure scoring function across the full intent×qualification×niche matrix; regression test that score is unchanged when evidence count doubles only within documented weights; property test: score always within 0–100.

## P4 — Reply Analysis After Human Send (close the loop)

1. **Existing feature:** Draft lifecycle reaches `SENT`; lead statuses include `SENT`, `REPLIED`, `INTERESTED`, `HANDOFF` — but nothing analyzes an inbound reply.
2. **Existing implementation:** `OutreachDraft` model + `leadRoutes.approveDraft`; `ConversationAnalyzer.analyzeConversation` (Zod + Gemini + heuristic fallback) currently runs only at import time; `LearningEngine` for extraction.
3. **Open-source alternative:** None suitable — Sales Intelligence MCP has outreach automation but is `DO NOT INTEGRATE`; GTM Skills offers reply-classification prompt ideas only.
4. **License:** N/A (build ourselves); GTM Skills MIT if prompt framing is adapted.
5. **Reuse decision:** **Extend the existing analyzer** — one new Zod schema + one new prompt + one new service method. Absolutely no second analyzer.
6. **Exact component to reuse:** `ConversationAnalyzer` pattern (Gemini → Zod validate → heuristic fallback), `leadSchemas.ts` conventions, `learningEngine.extract` on outcome.
7. **Files that would change:** `server/src/ai/schemas/leadSchemas.ts` (add `ReplyAnalysisSchema`: `INTERESTED | NOT_INTERESTED | FOLLOW_UP_NEEDED | UNCLEAR` + reason + confidence + verbatim evidence), `server/src/ai/prompts/analysisPrompts.ts` (add `buildReplyAnalysisPrompt`), `server/src/ai/analyzer.ts` (add `analyzeReply` method), `server/src/services/leadService.ts` (record reply text → analyze → update lead status → learning extraction), `server/src/api/routes/leadRoutes.ts` (`POST /api/leads/:id/reply` — **human pastes the reply**), UI: reply capture + status badge in `LeadDetailModal.tsx`, `src/lib/api.ts`.
8. **Dependencies required:** none (existing Gemini + Zod).
9. **Risks:** must never auto-fetch an inbox (human pastes replies only); UNCLEAR path must route to human handoff, never auto-close; evidence must be verbatim quotes; long replies truncated safely before prompts.
10. **Testing strategy:** schema validation tests (like existing analyzer tests) with mock replies per class; No-Invention test: ambiguous reply → `UNCLEAR` + LOW confidence; heuristic fallback test without API key; e2e: draft → approved → sent → reply recorded → status transitions correctly.

## P5 — Follow-up Logic

1. **Existing feature:** `followUpNeeded` boolean + `followUpReason` text set at analysis time.
2. **Existing implementation:** fields on `Lead`/schema; displayed in UI; no timing, no sequencing, no content guidance.
3. **Open-source alternative:** GTM Skills `follow-up/` prompt library (MIT) — follow-up cadence and framing patterns.
4. **License:** MIT — REUSE WITH CONDITIONS (adapt ideas; verbatim copies go to `THIRD_PARTY_NOTICES.md`).
5. **Reuse decision:** **Build the mechanism ourselves; adapt prompt framing from GTM Skills.**
6. **Exact component to reuse:** Follow-up cadence concepts (e.g., value-add second touch, never nag) re-expressed in our brand voice from `knowledge/business.md`; drafts still human-approved.
7. **Files that would change:** `server/src/services/leadService.ts` (compute `followUpDueAt` from intent + last-outreach date — same service), `prisma/schema.prisma` (nullable `followUpDueAt DateTime`, additive), `server/src/ai/prompts/analysisPrompts.ts` (follow-up draft framing), `server/src/api/routes/leadRoutes.ts` (filter `followUpOnly` already exists — extend with due-date filter), `LeadTable.tsx`/dashboard (due-soon indicator).
8. **Dependencies required:** none.
9. **Risks:** cadence suggestions must never trigger automatic sending or scheduling of messages; avoid spam-like frequency (respect `knowledge/rules.md` — no aggressive outreach); timezone handling kept simple/documented.
10. **Testing strategy:** unit tests for due-date computation per intent class; assert no follow-up computed for `NOT_INTERESTED`/opt-out leads; prompt test that follow-up drafts pass No-Invention schema validation.

---

## P6 — CSV/JSON Export

1. **Existing feature:** Leads viewable only through the UI; no file export.
2. **Existing implementation:** `LeadRepository.findAll(filters)` already returns filtered lead sets powering `/api/leads`.
3. **Open-source alternative:** Prospex export endpoints (`GET /api/export/leads/csv|json`) — route *pattern* only; MIT.
4. **License:** MIT (pattern reference; we write the code).
5. **Reuse decision:** **Build ourselves** — a thin route over our existing repository.
6. **Exact component to reuse:** None copied; endpoint shape `/api/export/leads.csv` + `/api/export/leads.json` honoring existing query filters.
7. **Files that would change:** `server/src/api/routes/leadRoutes.ts` (add export handlers — same router), `src/lib/api.ts` (download helpers), `LeadTable.tsx` (Export button), no schema changes.
8. **Dependencies required:** none (hand-rolled RFC-4180 CSV escaping; no CSV library needed at this size).
9. **Risks:** CSV injection (escape leading `= + - @` in cells); export contains lead business data only — never raw Instagram transcripts by default; file names sanitized.
10. **Testing strategy:** unit tests for CSV escaping (commas, quotes, newlines, injection prefixes); route test asserting filter parity with `/api/leads`; manual download check in smoke test.

## P7 — Outreach Prompt Frameworks

1. **Existing feature:** Personalized DM drafting with human approval (`generateOutreachDraft` + templates in `analysisPrompts.ts`).
2. **Existing implementation:** `ConversationAnalyzer.generateOutreachDraft` (Gemini + deterministic fallback), knowledge context from `business.md`, `portfolio.md`, `learnings.md`; brand voice documented in `knowledge/rules.md`.
3. **Open-source alternative:** GTM Skills `outreach/`, `objections/`, `templates/` prompt libraries (MIT).
4. **License:** MIT — REUSE WITH CONDITIONS.
5. **Reuse decision:** **Adapt selected frameworks into our existing prompt file** — no new prompt-engine files or dependencies.
6. **Exact component to reuse:** Idea-level: opener variety (problem-observation openers), value-add second touches, objection-response framing. Verbatim adoption (if any) limited to short passages, logged in `THIRD_PARTY_NOTICES.md`.
7. **Files that would change:** `server/src/ai/prompts/analysisPrompts.ts` (refine existing draft prompt), `docs/THIRD_PARTY_NOTICES.md` (create only if verbatim text is used).
8. **Dependencies required:** none.
9. **Risks:** every adapted framework must respect our learnings (short outreach, one friction point, one case study), must pass `OutreachDraftSchema`, must never claim unverifiable facts (No-Invention), must never instruct the AI to send anything.
10. **Testing strategy:** existing outreach schema tests remain green; add negative test: draft flow contains no auto-send path; human golden-sample review during item acceptance.

---

## P8 — Fetch Retry / Error Handling Utility

1. **Existing feature:** Analysis has a heuristic fallback; importers have per-file try/catch. Nothing fetches external URLs yet, so no shared HTTP utility exists.
2. **Existing implementation:** N/A — this is prerequisite infrastructure for P1/P2.
3. **Open-source alternative:** None needed — a small in-house utility covers it; `ai-search-audit`'s SSRF/timeout approach serves as the *specification*.
4. **License:** N/A (our own code).
5. **Reuse decision:** **Build ourselves** (~80 lines) — not worth a dependency for retries.
6. **Exact component to reuse:** Behavior spec from `ai-search-audit`: block private/internal IP ranges, re-check redirects (≤3), default 10s timeout, retry with backoff on network/5xx only (never 4xx), identifiable User-Agent.
7. **Files that would change:** `server/src/services/httpClient.ts` (**new shared util**, consumed only by P1/P2), `tests/httpClient.test.ts`.
8. **Dependencies required:** none (native `fetch` + `node:dns` for pre-flight IP checks).
9. **Risks:** DNS-rebinding edge cases (mitigated by resolving and validating before connecting); the util must stay internal — never expose unauthenticated arbitrary-URL fetching.
10. **Testing strategy:** local mock-server tests for retry/backoff, timeout, redirect limit, and private-IP refusal (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.x`).

---

## Deferred / Explicitly NOT Planned

| Item | Status |
|---|---|
| MCP tool architecture (Sales Intelligence MCP) | **DO NOT INTEGRATE** — never send lead data to their hosted service; revisit only if an MCP client is ever needed |
| Prospex platform/stack (Postgres/Redis/Docker/scraper) | NOT adopted — reference only |
| OpenGTM Python code | NOT ported — reference only |
| AuditKit collectors | NOT integrated — "All rights reserved" license |
| Google Sheets sync (OpenGTM webhook idea) | Deferred — CSV/JSON export (P6) first; only on explicit owner request |
| Third-party company-enrichment APIs (Clearbit-type) | NOT planned — paid external data services; owner decision required |
| Lighthouse/Playwright heavy audits | Deferred — static checks (P2) first; revisit only if static proves insufficient |
| Auto-send / auto-scheduling of any message | **PERMANENTLY FORBIDDEN** by project rules, regardless of review outcome |

## Global Testing Strategy
- Every item lands **with its tests in the same change**; the existing 26 tests must stay green throughout (`npm test`), plus `npm run lint` and `npm run build`
- New AI schemas follow the existing analyzer-test pattern (valid + invalid + No-Invention cases)
- No private Instagram content in any fixture, log, or assertion — mock data only
- Schema changes strictly additive (nullable columns / new tables); `prisma db push` verified against a copy of `dev.db` before real use
- Per item: `npm test` → `npm run lint` → `npm run build` → dev-server smoke test (`/api/health` + touched endpoints)
- Human-approval invariant: review checklist confirms no code path calls an external send API

## Execution Order (after approval)
1. P8 (utility) → 2. P1 + P2 (research & evidence) → 3. P3 (scoring) → 4. P4 (reply loop) → 5. P5 (follow-up) → 6. P6 (export) → 7. P7 (prompt tuning)
Each item is independently reviewable; work stops after any item for re-review.

---

# ⛔ STOP — AWAITING OWNER REVIEW

Audit (`docs/OPEN_SOURCE_AUDIT.md`) and plan (`docs/INTEGRATION_PLAN.md`) are complete.
**No integration was performed: no code copied, no dependency installed, no schema changed, no existing file modified in this phase.**
Reply with which plan items (if any) you approve before implementation begins.


