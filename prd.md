# D Web Studio Content Automation — Product Requirements

## 1. Project Overview

D Web Studio Content Automation is intended to turn structured client marketing information into usable social-media content.

The initial content domain is Instagram.

---

## 2. Business Goal

Reduce the manual work required to turn a client's promotion, offer, service, or business information into ready-to-review Instagram content.

The first implementation should prioritize a simple, reliable workflow over a large feature set.

---

## 3. Target Users

### Primary User

A business/client who provides information about their business, offer, service, event, promotion, or content requirement.

### Operator

The person managing the automation workflow and reviewing generated content before it is used or published.

---

## 4. Client Workflow

The intended workflow:

1. The client answers the intake questions defined in `client-form/questions.md`.
2. Submitted answers are validated; missing required information is flagged instead of guessed.
3. Validated answers are turned into a structured content brief.
4. A prompt is selected from `prompts/` based on the requested content type.
5. Content is generated using only the supplied information.
6. The output is validated against the supplied facts.
7. A human reviews and approves the content.
8. Approved content is exported; publishing is a future, undecided capability (see Section 9).

The exact mechanics and tooling remain open.

---

## 5. Core User Questions

The system should be able to collect enough information to answer questions such as:

- What business or brand is this content for?
- What is being promoted?
- What is the goal of the content?
- Who is the target audience?
- What offer, price, date, or important detail should be included?
- What call to action should be used?
- What tone should the content have?
- What contact or social information should appear?
- What assets, such as images or videos, are available?

The exact intake fields remain subject to implementation review.

---

## 6. Main Features

### 6.1 Client Intake

Collect structured information from the client.

### 6.2 Content Brief

Turn the submitted information into a normalized content brief that can be used by generation prompts.

### 6.3 Instagram Post Generation

Generate a post concept, hook, body/copy, CTA, and hashtag suggestions from the approved client information.

### 6.4 Instagram Reel Generation

Generate a Reel concept and script structure from the approved client information.

### 6.5 Caption Generation

Generate captions without inventing client facts.

### 6.6 Review

Provide a human-review step before content is considered ready.

### 6.7 Prompt Library

Keep reusable generation instructions in `prompts/` rather than scattering prompt logic across unrelated files.

---

## 7. Success Criteria

The MVP should make it possible to:

1. collect a client's required content information;
2. transform that information into a structured brief;
3. generate useful Instagram content from the brief;
4. review the generated content;
5. avoid invented business facts;
6. keep generation instructions maintainable.

---

## 8. Content Principle

Write for the intended audience of the client's content, not for developers.

Business facts supplied by the client take priority over assumptions. If required information is missing, the system should identify the missing information instead of silently inventing it.

---

## 9. Open Product Decisions

The following are intentionally not fixed yet:

- exact application type;
- technology stack;
- generation provider/API;
- storage model;
- authentication and multi-client handling;
- exact intake fields;
- exact output/export formats;
- Instagram publishing method;
- final product name and branding.
