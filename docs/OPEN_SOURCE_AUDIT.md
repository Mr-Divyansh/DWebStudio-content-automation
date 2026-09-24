# Open-Source Component Audit — D Web Studio Lead AI

**Date:** 2026-09-24
**Status:** PHASE 1 COMPLETE — P8/P1/P2 implemented. P3–P7 were not started. This remains a component audit; no third-party audit code was installed or copied.
**Method:** Each repository was inspected via its GitHub README, license badge/file, and file tree on the date above. The exact `ai-search-audit` npm package was also checked against the npm registry. No repository was cloned into the project. This document is not legal advice.

---

## 1. Existing System Summary (from internal inspection)

| Area | Current State |
|---|---|
| Architecture | Single-package TypeScript: React 19 + Vite frontend (`src/`), Express backend (`server.ts` + `server/src/`), Prisma + SQLite (`prisma/`), knowledge base (`knowledge/`) |
| Importers | Instagram ZIP (JSON), Instagram extracted HTML reader (own parser, `node-html-parser`), WhatsApp text, call transcripts — all feeding one `NormalizedConversation` format |
| AI pipeline | Gemini (`gemini-3.8-flash`) via `@google/genai` with deterministic heuristic fallback; Zod-validated structured outputs (`leadSchemas.ts`); prompts in `analysisPrompts.ts` + knowledge files |
| Qualification | Intent classes, qualification classes, No-Invention rule, verbatim-quote evidence, portfolio matching against our 8 verified case studies (`NO_MATCH` allowed) |
| Outreach | `OutreachDraft`: DRAFTED → APPROVED → REJECTED → SENT; **human approval mandatory; no auto-send anywhere** |
| Learning | Human corrections → `Correction` → `Learning` → injected into future prompts (`learningEngine.ts`); no model training |
| Database models | Lead, Conversation, Message, Analysis, Learning, Import, Correction, PortfolioProject, OutreachDraft, Evidence, and additive Phase 1 `BusinessResearch` records |
| API routes | `/api/leads`, `/api/import`, `/api/learnings`, `/api/dashboard`, `/api/portfolio`, `/api/config`, `/api/health` |
| Tests | 50 passing (including local-only P8/P1/P2 and existing Instagram import/parser cases); `tsc --noEmit` clean; `vite build` clean |

### Missing functionality (the gaps this audit targets)
1. **Research stage** — no website/business research between "store" and "evidence" in the target data flow
2. **Website audit / checks** — no deterministic site existence, HTTPS, booking-link, or structure checks
3. **External evidence** — Evidence currently comes only from conversation quotes; no `source URL / observation / fetched-at` evidence
4. **Numeric lead scoring** — qualification is categorical only
5. **Reply analysis after human send** — `SENT` status exists, but no inbound-reply → analysis → status loop
6. **Follow-up logic** — only a `followUpNeeded` boolean; no timing/content guidance
7. **CSV/JSON export** — leads are view-only in the UI
8. **Fetch retry/error handling** — no shared HTTP retry utility for future research calls

---

## 2. Repository Audits

### A) OpenGTM — `buildingopen/opengtm`
- **URL:** https://github.com/buildingopen/opengtm
- **License:** **MIT** (LICENSE file + sidebar; Copyright 2026 Federico De Ponte)
- **Stack:** Python CLI (`app.py`, `pyproject.toml`)
- **What it does:** B2B lead discovery via Gemini, ICP scoring (`qualify.py`, custom profiles), outreach message generation (`message.py`), multi-touch sequences, AEO health audit of a URL (robots.txt AI crawlers, JSON-LD, sameAs, llms.txt), Google-Apps-Script webhook lead sync (`sync.py`), keyword research, blog pipeline with Jaccard shingle duplicate detection
- **Dependencies/external:** Gemini API key (same provider we already use); HEAD-request domain validation; optional SERP services for keywords
- **Can we reuse code?** Not directly — Python, not TypeScript. Concepts and check-lists are directly adaptable
- **Decision:** **REFERENCE ONLY**
- **Reason:** A port would be a rewrite, which we avoid. Its AEO-check concept is covered by the project's own deterministic Phase 1 audit (§2E). ICP-profile schema and message-framework ideas inform plan items P3/P7 as references only. No dependency needed.

### B) Prospex — `asiifdev/business-leads-ai-automation`
- **URL:** https://github.com/asiifdev/business-leads-ai-automation
- **License:** **MIT** (LICENSE + sidebar); repo includes a `DISCLAIMER.md` — review before any verbatim copy
- **Stack:** TypeScript pnpm/Turborepo monorepo: NestJS API + Next.js UI + Prisma **PostgreSQL** + Redis + Nginx + Docker; Puppeteer Google-Maps scraper targeting a separate scraping server
- **What it does:** Google Maps lead discovery, AI lead scoring (notably Bayesian star-rating average), personalized email/WhatsApp content engine, CRM dashboard, CSV/JSON/vCard export endpoints, campaign management
- **Dependencies/external:** PostgreSQL, Redis, Docker, external scraping server, OpenAI-compatible provider (OpenRouter/Ollama)
- **Can we reuse code?** Small deterministic ideas only (scoring math shape, export route pattern). The platform duplicates our product on different infrastructure
- **Decision:** **REFERENCE ONLY**
- **Reason:** Adopting it violates "do not replace architecture", "do not duplicate functionality", and "no random infrastructure". We use SQLite — no Redis/Docker. Its scraper targets Google Maps; our sources are Instagram exports and future website checks. Bayesian rating math is only meaningful if we store star ratings + review counts (we do not).

---

### C) Sales Intelligence MCP — `aria-agentworks/sales-intelligence-mcp`
- **URL:** https://github.com/aria-agentworks/sales-intelligence-mcp
- **License:** **MIT** (code license)
- **Stack:** Node.js 20+, official `@modelcontextprotocol/sdk`, single `server.js`
- **What it does:** 12 MCP tools (company lookup, contact finder, outreach generation, lead scoring, HubSpot sync) — the open repo is essentially a thin client for **their hosted service** at `https://mcp.ariaagent.agency/mcp`
- **Dependencies/external:** **Mandatory hosted API with API keys**; free tier 50 ops/month, Starter $29/mo, Pro $49/mo; Clearbit enrichment, HubSpot, Resend email, Razorpay payments
- **Commercial conditions:** Effectively a paid SaaS wrapper despite the MIT code license
- **Decision:** **DO NOT INTEGRATE**
- **Reason:** (1) Sends lead/business data to a third-party hosted endpoint — conflicts with our privacy posture and "no unnecessary external services" rule; (2) paid usage limits = lock-in without guarantee; (3) very low maturity (0 stars, 5 commits); (4) built-in outreach automation pulls toward exactly the auto-messaging our rules forbid; (5) we do not need MCP — our product is a human-operated dashboard, not an agent host. The generic MCP wiring pattern (JSON-RPC tool registry) remains documented upstream and can be referenced if we ever expose tools to an MCP client.

### D) GTM Skills — `gtm-skills/gtm`
- **URL:** https://github.com/gtm-skills/gtm
- **License:** **MIT** ("use these prompts however you want, commercially or personally")
- **Stack:** Mostly Markdown prompt/skill libraries (`outreach/`, `follow-up/`, `objections/`, `research/`, `icp/`, templates) plus optional Next.js site, browser extension, MCP server, Supabase
- **What it does:** Curated sales prompts: outreach sequences, follow-up strategies, objection handling, research playbooks, ICP definition
- **Dependencies/external:** Prompt files have zero dependencies; app portions need Next.js/Supabase (which we must NOT adopt)
- **Can we reuse code?** Prompt *content and frameworks* yes; app code no
- **Decision:** **REUSE WITH CONDITIONS** (prompt frameworks only)
- **Conditions:** Prefer adapting ideas into our own prompts over verbatim copying; if a substantial verbatim passage is adopted, record it in `THIRD_PARTY_NOTICES.md` with the MIT license text and copyright line. Never adopt their Supabase/Next/extension code. Every adopted prompt must still satisfy our No-Invention rule and human-approval boundary (draft-only, never send).

---

### E) ai-search-audit — `Altyzo/ai-search-audit`
- **Source repository:** https://github.com/Altyzo/ai-search-audit
- **Exact npm package checked:** `ai-search-audit`; on 2026-09-24 the npm registry returned `404 Not Found`, so there is no current published npm version to install. The source repository is MIT-licensed, but that does not make an unpublished package installable.
- **Source behavior:** TypeScript CLI/library using ordinary HTTP fetches and static checks; it makes its own network requests and includes private-address/redirect checks. Those checks are not a substitute for routing every request through this project's P8 client, which also pins DNS at connection time.
- **Compatibility/maintenance:** The package is absent from the registry, its repository is very young, and the published artifact needed for a normal dependency import is unavailable. The project already has a compatible parser and the exact Phase 1 checks it needs.
- **Decision:** **DO NOT INSTALL; BUILD THE MINIMAL CHECKS OURSELVES**
- **Reason:** Installing an unresolvable, young external package would add supply-chain and maintenance risk without improving SSRF safety. Phase 1 therefore uses native `fetch`, the P8 safe HTTP client, and the existing `node-html-parser` dependency only.

### F) AuditKit — `nirholas/AuditKit`
- **URL:** https://github.com/nirholas/AuditKit
- **License:** **"All rights reserved"** (README license section; despite a LICENSE file existing, it is NOT MIT/OpenSource)
- **Stack:** Next.js 15 monorepo (pnpm/Turborebo), collectors for Google PageSpeed Insights, Chrome UX, Mozilla Observatory, GitHub API, optional Groq AI panel
- **Decision:** **DO NOT INTEGRATE**
- **Reason:** The license explicitly reserves all rights — copying or adapting its code would infringe. Only the *public API endpoints it calls* (PageSpeed, Observatory) are facts we may independently choose to use in a future phase with our own code.

### Screened but not investigated further (title-level screen only)
- `microsoft/markitdown`, various "leads scraper" repos, agent-framework repos surfaced in search: none presented a clearly useful, license-verified component for our specific gaps at this time. Revisit only against a concrete missing-problem.

---

## 3. Classification Summary

| Project | License | Component of interest | Decision |
|---|---|---|---|
| OpenGTM | MIT | ICP scoring, message frameworks, AEO audit | REFERENCE ONLY |
| Prospex | MIT | Scoring math, CSV/export route patterns | REFERENCE ONLY |
| Sales Intelligence MCP | MIT (code) | Hosted research/outreach tools | **DO NOT INTEGRATE** |
| GTM Skills | MIT | Outreach / follow-up / objection prompts | **REUSE WITH CONDITIONS** |
| ai-search-audit | MIT source / npm unpublished | Deterministic website audit concept | **DO NOT INSTALL; BUILD MINIMAL CHECKS** |
| AuditKit | All rights reserved | Website audit collectors | **DO NOT INTEGRATE** |

## 4. What We Build Ourselves (must remain custom)
1. **Instagram export reader** — already ours (`instagramHtmlParser.ts` etc.); export stays read-only, gitignored, never in logs/fixtures/docs
2. **Evidence system** — `NO EVIDENCE → NO CLAIM`; store source URL, observation, fetch date, evidence type; reuse our existing `Evidence` model
3. **Portfolio matching** — only our 8 verified case studies; `NO_MATCH`/null when nothing fits; never invent a project
4. **Human approval** — drafts only; UI approval gate; no auto-send (nothing from any repo may alter this)
5. **Learning system** — correction → structured learning → prompt context; no fine-tuning
6. **Reply-analysis loop, follow-up scheduling, lead scoring formula, export routes** — our domain logic; built by extending *existing* services (never a V2 module)
7. **No new dependency for:** structured AI outputs (Zod already in place), dedup, DB ops, status management

## 5. License Compliance Actions
- All reuse candidates are MIT; no GPL/AGPL/copyleft code will be copied (none encountered among accepted candidates)
- Create `THIRD_PARTY_NOTICES.md` if a substantial third-party passage is later adopted. Phase 1 adopted no third-party audit code and installed no `ai-search-audit` package.
- Preserve copyright headers in any copied file; keep license texts
- Nothing from `DO NOT INTEGRATE` repos enters the codebase in any form

## 6. Security / Privacy Review (verified this session)
- `git check-ignore` confirms `data/instagram/extracted/` is protected ✅
- 0 private Instagram files appear in `git status` ✅
- No private conversation content appears in tests (mock-only fixtures), logs, or these documents ✅
- Phase 1 research fetches **public** business websites only, human-initiated, with the P8 SSRF guards; private Instagram data is never sent to research targets or third-party services ✅
- No new external services proposed beyond Gemini (already in use) and optional public PageSpeed/Observatory endpoints (future, on human request only)

---



