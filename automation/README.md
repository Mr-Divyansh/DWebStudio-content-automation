# Automation

This directory is reserved for the actual automation implementation.

The technology and integration approach have not yet been decided.

Do not add provider-specific code here until the project architecture and generation provider are approved.

## Planned Workflow (Not Implemented)

```text
Client Input
  → Validate Information
  → Build Content Brief
  → Select Prompt (from prompts/)
  → Generate Content
  → Validate Output against supplied facts
  → Human Approval
  → Export / Publish
```

Notes:

- This workflow is documentation only; no automation code exists yet.
- Every step through Human Approval is required before content is treated as final.
- Export is the expected initial output method; publishing is an open flag (see `ai-loop.md`).
- No external APIs (Google, Gemini/OpenAI, Instagram/Meta) are integrated at this stage, and no fake integration code may be added.
