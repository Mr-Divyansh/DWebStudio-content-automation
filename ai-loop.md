# D Web Studio Content Automation — AI Development Loop

## 1. Inputs

Before making a substantive project change, read the relevant sources in this order:

1. `prd.md`
2. `architecture.md`
3. `design.md`
4. `phases.md`
5. `rules.md`
6. `memory.md`
7. `README.md`
8. relevant files in `prompts/`, `client-form/`, and implementation directories

If an expected input is missing, do not silently replace it with assumptions. Record the gap and continue only when safe.

---

## 2. Development Loop

1. **READ** — read the inputs listed in Section 1.
2. **UNDERSTAND** — confirm the current project state from `memory.md` and the current phase in `phases.md`.
3. **IDENTIFY** — state the exact task and how its completion will be checked.
4. **PLAN** — decide which files will change and how, before editing anything.
5. **IMPLEMENT** — make only the changes the task requires.
6. **VERIFY** — run the relevant checks against the real files.
7. **TEST** — run the full relevant checklist, not only the checks most likely to pass.
8. **REVIEW** — re-read the changed files and check them against `rules.md`, `design.md`, and `prd.md`.
9. **CORRECT** — if anything fails: name the exact defect (file and what is wrong), fix that defect, then re-run from step 6.
10. **FINAL** — report exactly what changed: files created/modified, checks run, any failures or unresolved issues, and the next recommended action.

Never mark work FINAL while a relevant check is failing. If genuinely blocked, record an open flag instead of guessing.

---

## 3. Self-Review Checklist

Before declaring a change complete:

- Does it match `prd.md`?
- Does it follow `architecture.md`?
- Does it follow `design.md` where applicable?
- Does it obey `rules.md`?
- Does it preserve facts recorded in `memory.md`?
- Does it fit the current phase in `phases.md`?
- Are unresolved decisions clearly marked rather than guessed?

---

## 4. Self-Test Checklist

Run the relevant project-specific validation commands after implementation exists.

At the documentation stage, verify:

```powershell
Get-ChildItem -Recurse -File
```

and inspect the Git state with:

```powershell
git status
git diff --check
```

Once application code exists, update this section with the real test/build commands for the selected stack.

---

## 5. Self-Correction Rules

- Never invent client facts.
- Never invent prices, URLs, phone numbers, testimonials, or business claims.
- Never hide missing information behind assumptions.
- Never delete a project rule or file until its usage has been checked.
- Keep source-of-truth information in the correct documentation file.
- Do not add automation before its requirements are defined.

---

## 6. Final Report Format

After completing a task, report:

1. what changed;
2. files created/modified;
3. checks performed;
4. any failures or unresolved issues;
5. the next recommended project action.

---

## 7. Known Open Flags

The canonical list of open decisions lives in `memory.md` (Section 4). The flags below depend on external capabilities and need owner decisions before implementation. No API keys, credentials, or fake integration code may be added for any of them.

### [OPEN] Content generation provider/API

- **Capability needed:** generate text from a content brief plus a prompt from `prompts/`.
- **Why:** core of Phase 4 (Content Generation).
- **Possible future implementation:** a hosted LLM API, or manual prompt execution in a studio tool while the decision is pending.
- **External service required:** possibly Gemini/AI Studio, OpenAI API, or similar. Undecided.

### [OPEN] Client intake collection

- **Capability needed:** let clients submit the questions in `client-form/questions.md`.
- **Why:** core of Phase 3 (Client Intake).
- **Possible future implementation:** a local form, a spreadsheet-backed form, or a hosted form.
- **External service required:** possibly Google Forms / Google Sheets / Google Apps Script. Undecided.

### [OPEN] Storage and multi-client handling

- **Capability needed:** keep client briefs and generated content with review history.
- **Why:** repeatable multi-client workflow (Phase 5 onward).
- **Possible future implementation:** repository files, a spreadsheet, or a database.
- **External service required:** possibly Google Sheets or a database service. Undecided.

### [OPEN] Publishing/automation to Instagram

- **Capability needed:** publish or schedule approved content.
- **Why:** final step of the planned workflow in `automation/README.md`.
- **Possible future implementation:** manual export first; scheduled publishing only after approval workflow exists.
- **External service required:** possibly Instagram/Meta APIs. Undecided.

### [OPEN] Application type, technology stack, product name, visual identity

- Tracked in `memory.md` Section 4 and `prd.md` Section 9. No implementation may start until these are resolved.
