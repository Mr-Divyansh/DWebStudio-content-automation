# D Web Studio Content Automation

A D Web Studio content automation project for collecting a business's marketing information and turning that information into structured Instagram content.

## 1. Project Purpose

The project is intended to support a workflow where client-provided information can be transformed into content such as Instagram posts, Reels scripts, captions, hooks, calls to action, hashtag sets, and promotional copy.

Eventually, the system should be able to validate client input, build a content brief, generate content through reusable prompts, support human review, and export approved content — with publishing/automation considered only in later phases. None of this is implemented yet.

The exact application interface, technology stack, generation provider, storage model, and publishing workflow are still open decisions.

## 2. Documentation System

The project uses the same documentation philosophy as the D Web Studio project:

- `prd.md` — what the product should do
- `architecture.md` — how the repository is structured
- `design.md` — visual and interaction direction
- `rules.md` — permanent project constraints
- `memory.md` — durable project facts and current state
- `phases.md` — build order
- `ai-loop.md` — operating procedure for AI-assisted work

## 3. Repository Structure

```text
DWebStudio-content-automation/
├── README.md
├── prd.md
├── architecture.md
├── design.md
├── rules.md
├── memory.md
├── phases.md
├── ai-loop.md
├── client-form/
│   └── questions.md
├── prompts/
│   ├── instagram-post.md
│   ├── instagram-reel.md
│   └── caption.md
└── automation/
    └── README.md
```

`architecture.md` is the authoritative description of the repository structure.

## 4. Development Principle

- Documentation before implementation: decide and record before building.
- Never invent client facts, prices, offers, phone numbers, URLs, testimonials, or business claims.
- Record unresolved decisions as open flags instead of guessing.
- No technology, provider, or integration is adopted until it is explicitly decided.
- Every substantive change follows the procedure in `ai-loop.md`.

## 5. Current Status

**Status:** Documentation foundation created. Product implementation has not started.

Open decisions are tracked instead of being guessed. See `memory.md` and `ai-loop.md`.
