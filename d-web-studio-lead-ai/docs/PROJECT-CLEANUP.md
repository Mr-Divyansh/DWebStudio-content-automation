# Project Cleanup & Repair Log

**Date:** 2026-09-24
**Scope:** Clean, organize, repair, and verify the existing `d-web-studio-lead-ai` project. No new features were added. No working code was rewritten.

---

## 1. Original Structure Problems Found

| # | Problem | Severity |
|---|---|---|
| 1 | Private extracted Instagram export (`Instagram-Leads/`) located at project root, mixed with source code | High |
| 2 | `Instagram-Leads/` was **not** listed in `.gitignore` — a `git add .` would have committed private DMs to GitHub | Critical |
| 3 | `package.json` name was `"react-example"` (template leftover) | Low |
| 4 | Duplicate lockfile `bun.lock` alongside `package-lock.json` (project documents npm; no `bunfig.toml` exists) | Low |
| 5 | Dependency conflict: root `esbuild@^0.25.0` violated `vite@8.3.0` peer requirement (`^0.27.0 || ^0.28.0`) — `npm install` failed with `ERESOLVE` | High |
| 6 | Dependencies had never been installed (`node_modules/` missing) | High |
| 7 | Prisma database never initialized (`prisma/dev.db` did not exist) | High |
| 8 | `.gitignore` ignored whole `output/` and `data/` placeholder folders, also blocking their README placeholders from being committed | Medium |

## 2. Files / Folders Moved

| From | To | Reason |
|---|---|---|
| `d-web-studio-lead-ai/Instagram-Leads/` (~200 files: HTML exports, DM threads, media) | `d-web-studio-lead-ai/data/instagram/extracted/Instagram-Leads/` | Separate private Instagram data from application code per target structure |

- The move was a **pure filesystem move**. No file inside the export was edited, renamed, or deleted.
- No source file referenced `Instagram-Leads` (verified via codebase search), so no import/path changes were required for the move.

## 3. Duplicate Files Identified

| Item | Determination | Action |
|---|---|---|
| `bun.lock` | Generated lockfile for a package manager the project does not document or configure | **Removed** (regenerable; `package-lock.json` is canonical) |
| `server/src/index.ts` vs root `server.ts` | Both wire the same Express routes. `server.ts` is the real entry (`npm run dev`); `index.ts` is documented as standalone API entry | **Preserved** |
| Instagram parsers/normalizers | Single implementation only — no duplicates found | None |
| `package.json` files | Only one exists (single-package structure) | None |

**No "NOBLE" folder exists** anywhere in the project or two levels of parent directories (searched). Nothing to separate.

## 4. Files Preserved

- All frontend code (`src/`, `index.html`, `vite.config.ts`, `tsconfig.json`) — untouched
- All backend code (`server.ts`, `server/src/**`) — untouched
- All AI code (`server/src/ai/**`) — untouched
- `prisma/schema.prisma` (10 models) — untouched
- All `knowledge/*.md`, `README.md`, data-folder README placeholders — untouched
- The entire Instagram export — preserved byte-for-byte at its new location
- `.env` — preserved, local-only, never printed or committed

## 5. Files Removed

| File | Why it was safe |
|---|---|
| `bun.lock` | Generated artifact; npm is the documented toolchain; regenerable |
| `dev-server.log`, `dev-error.log` | Temporary smoke-test artifacts created during this cleanup |

No source code, documentation, or private data was deleted.

## 6. Import / Path Fixes

- Audited all **63 relative imports** across `server/`, `src/`, and `tests/` — all internally consistent, **none broken** after reorganization.
- Nothing referenced the moved `Instagram-Leads/` folder, so no code changes were needed.
- Instagram/knowledge paths in code use `process.cwd()` and remain correct: `data/instagram/export/` (`instagramZipExtractor.ts`), `knowledge/` (`analyzer.ts`).

## 7. Configuration Fixed

| File | Change |
|---|---|
| `package.json` | `"name": "react-example"` → `"name": "d-web-studio-lead-ai"` |
| `package.json` | `esbuild` `^0.25.0` → `^0.28.2` (satisfies vite 8 peer requirement; fixes `npm install ERESOLVE`) |
| `.gitignore` | Rewritten to protect private data while keeping folder README placeholders trackable (see §8) |
| `.env.example` | Verified — keys match actual `.env` (`GEMINI_API_KEY`, `DATABASE_URL`, `PORT`, `APP_URL`); unchanged |
| `package.json` scripts | Verified unchanged and working: `dev`, `build`, `start`, `preview`, `test`, `lint`, `clean` |

## 8. Instagram Data Location & Privacy Protection

```
d-web-studio-lead-ai/data/instagram/
├── export/                      ← place the original ZIP here (currently: no ZIP exists)
│   └── README.md                (tracked)
└── extracted/
    └── Instagram-Leads/         ← full extracted export lives here (GITIGNORED)
```

**No original ZIP was found anywhere** in the project, repo, or parent directories — only the extracted data exists. The folder README was **not** deleted (its instruction to keep the ZIP here remains valid).

`.gitignore` now enforces:
- `data/instagram/extracted/` — entire extracted export ignored
- `data/instagram/export/*` + `!README.md` — any future ZIP ignored, placeholder tracked
- `data/whatsapp/*`, `data/calls/*` (+ README negations)
- `.env`, `.env.*` (except `.env.example`), `*.zip`, `*.db`, `*.sqlite` + journals
- `output/leads/*`, `output/reports/*` (+ README negations)

Verified with `git check-ignore` and `git status`: **zero private Instagram files appear in git status** (66 files eligible, all source/docs).

## 9. Environment & Database

- `.env` exists with real values; contents were never exposed (only key names inspected).
- `npx prisma generate` — succeeded (Prisma Client v5.22.0).
- `npx prisma db push` — succeeded; `prisma/dev.db` created and in sync with schema; auto-seeded on first server start.
- `dev.db` is gitignored via `*.db`.

## 10. Test / Verification Results (actually run)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run lint` (`tsc --noEmit`) | ✅ exit 0, no errors |
| Test suite | `npm test` | ✅ **13 Passed, 0 Failed** |
| Frontend build | `npm run build` (`vite build`) | ✅ built in 13.23s (`dist/` output) |
| Dev server smoke test | `npm run dev` → `GET /api/health`, `GET /` | ✅ 200 `{"status":"ok","service":"D Web Studio Lead AI",...}`; frontend 200 |
| DB seed | automatic on server start | ✅ "Demo database seeded successfully" |
| Private-data protection | `git check-ignore` + `git status` | ✅ no Instagram/WhatsApp/call data in status |

Note: local port 3000 was occupied by an unrelated application during testing, so the smoke test ran on port 3456 (via `PORT` env). `npm run dev` will use 3000 once that application is not running.

## 11. Remaining Issues / Known Limitations

1. **No original Instagram ZIP exists** — only HTML-formatted extracted data. The built-in importer expects a ZIP containing **JSON** `message_*.json` files; the current export is **HTML** (`message_1.html`), which the JSON parser does not consume. Importing existing data would require an HTML-aware reading path (future work, not done here).
2. **Vite deprecation warning:** `vite.config.ts` uses `__dirname` (warning only; works today). Not changed to avoid touching working config without need.
3. **npm install-scripts policy:** npm blocked postinstall scripts (`@prisma/client`, `esbuild`, etc.); running `npx prisma generate` explicitly resolved this. After a fresh reinstall, run `npx prisma generate` if the client is missing.
4. **Prisma 5.22 vs 8.0 available** — upgrade deferred intentionally (no upgrades without reason).
5. `server/src/index.ts` duplicates route wiring from `server.ts` (preserved by design; could share one factory later).
6. Nothing in `d-web-studio-lead-ai/` has been committed to git yet (all files untracked). Committing is left to the owner per the workflow documented in root `memory.md`.

## 12. Next Recommended Development Step

Build an **HTML conversation reader** for the existing extracted `data/instagram/extracted/Instagram-Leads/**/message_1.html` export so the current private data can be imported through the existing normalize → analyze pipeline — without modifying the original export files.

