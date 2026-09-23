# Client Content Automation — Architecture

## 1. Architecture Goal

Keep the project simple, maintainable, and easy to extend. Separate product requirements, project rules, state, prompts, and implementation code so future AI work can inspect the correct source of truth.

---

## 2. Current Repository Structure

```text
client-content-automation/
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

This tree describes files that currently exist. Implementation folders should only be expanded when the corresponding technology is decided.
