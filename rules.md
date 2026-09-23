# D Web Studio Content Automation — Development Rules

## 1. General Rules

- Build intentionally.
- Prefer a simple working workflow over unnecessary features.
- Do not invent unresolved project decisions.
- Keep each source of truth in one appropriate file.

---

## 2. Content Rules

- Never invent a client's price, phone number, address, URL, testimonial, offer, date, result, or business claim.
- Preserve client-provided facts accurately.
- If required information is missing, flag it for review.
- Do not present generated assumptions as client facts.

---

## 3. Client Data Rules

- Collect only the information needed for content generation.
- Do not request or store unnecessary sensitive personal information.
- Treat client-provided information as confidential; never commit it to the repository.
- Use client-provided facts only for the purpose they were provided.

---

## 4. Prompt Rules

- Prompts must clearly define their expected inputs and outputs.
- Prompts should favor structured, reusable output.
- Prompt changes should not silently change unrelated generation behavior.
- Keep reusable prompt logic in `prompts/`.

---

## 5. AI Behavior Rules

- Follow `ai-loop.md` for every substantive change.
- Plan before changing files; implement only what the task requires.
- Never present assumptions as verified facts.
- Record unresolved decisions as open flags instead of guessing.
- Never mark work FINAL while a relevant check is failing.
- Report exactly what changed, including checks that were run.

---

## 6. UX Rules

- Keep the client workflow understandable.
- Make required information obvious.
- Avoid unnecessary questions.
- Provide a clear review step before content is treated as final.

---

## 7. Development Rules

- Use the technology appropriate to the final architecture decision.
- Avoid dependencies that do not have a clear purpose.
- Keep implementation separate from project documentation.
- Do not commit secrets, API keys, access tokens, or private client data.

---

## 8. Security Rules

- Never commit API keys, tokens, credentials, secrets, or environment files.
- Never add code that fakes an external integration.
- Do not add external services or SDKs before the related open decision is resolved.
- Protect client information in any future storage or transmission design.

---

## 9. Quality Rule

Work is not considered complete until the relevant implementation, documentation, and validation checks pass.
