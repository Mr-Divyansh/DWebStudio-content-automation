# D Web Studio Lead AI

An internal AI-powered lead intelligence system for **D Web Studio**. Built for high-ticket web design and engineering client acquisition, lead qualification, and personalized outreach drafting.

---

## What the System Does

D Web Studio Lead AI ingests raw conversation exports (Instagram DMs, WhatsApp chats, and discovery call transcripts), normalizes multi-turn message histories, and runs an intelligence pipeline grounded by a **strict No-Invention verification policy**:

1. **Lead Extraction & Deduplication**: Identifies contacts and handles, deduplicating leads by Instagram handle or source conversation thread ID.
2. **Intent & Interest Classification**: Distinguishes authentic commercial buying intent (`INTERESTED`, `POSSIBLY_INTERESTED`) from casual greetings (`NEUTRAL`) or solicitations (`NOT_INTERESTED`).
3. **Lead Qualification**: Verifies business niche (Gym, Restaurant, Salon, Coaching, Local business, Service business, Creator, Startup).
4. **Strict Evidence Matrix**: Every claim about budget, pain points, or intent is backed by verbatim quote evidence from the conversation transcript.
5. **Portfolio Case Study Matching**: Automatically links leads to relevant verified D Web Studio projects (e.g. Apex Strength Club, Osteria Del Sole, Lumière Aesthetics).
6. **Outreach Drafting (Human-in-the-Loop)**: Drafts concise, tailored, low-friction outreach for human review. **The AI never auto-sends messages or makes calls.**
7. **Sales Learnings & Persistent Memory**: Records structured sales objections and human corrections into a persistent memory store to inform future AI prompts.

---

## Getting Started in VS Code

### 1. Prerequisites
- **Node.js**: v18 or later (Node 20+ recommended)
- **npm**: v9 or later

### 2. Clone / Open in VS Code
Open the project directory in VS Code:
```bash
code .
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and configure:
```ini
DATABASE_URL="file:./dev.db"
PORT=3000
GEMINI_API_KEY="your_gemini_api_key_here"
```
*(Note: If `GEMINI_API_KEY` is omitted, the application operates in safe deterministic demo mode with baseline rule evaluation without crashing).*

### 5. Setup Database
Initialize the SQLite database schema via Prisma:
```bash
npx prisma db push
```
*(Seed data with verified portfolio projects, objection patterns, and sample leads will automatically initialize on first server launch).*

### 6. Place Your Instagram Export ZIP
To import your actual Instagram Direct Message history:
1. Request a data download from your Instagram account (`Settings > Accounts Center > Your information and permissions > Download your information`). Select JSON format.
2. Place the downloaded `.zip` file into:
   ```
   data/instagram/export/
   ```
3. Alternatively, use the drag-and-drop file uploader on the **Data Imports** tab in the web dashboard.

### 7. Run the Application
Start the fullstack development server (Express backend + Vite frontend):
```bash
npm run dev
```
Open your browser to:
```
http://localhost:3000
```

---

## Running Automated Tests

Run the complete test suite covering ZIP extraction, Latin-1 encoding repairs, conversation normalization, No-Invention greeting rules, Zod schema validation, and Prisma database operations:
```bash
npm test
```

---

## Architecture & Project Structure

```
D-Web-Studio-Lead-AI/
├── data/
│   ├── instagram/export/       # Place Instagram export ZIPs here (gitignored)
│   ├── whatsapp/               # WhatsApp export chat logs (gitignored)
│   └── calls/                  # Discovery call transcripts (gitignored)
├── knowledge/
│   ├── business.md             # D Web Studio agency profile & core niches
│   ├── rules.md                # Strict AI operational rules & No-Invention constraints
│   ├── portfolio.md            # Verified portfolio project library
│   └── learnings.md            # Persistent sales learnings & objection repository
├── prisma/
│   ├── schema.prisma           # Prisma relational SQLite schema
│   └── dev.db                  # Local database file (gitignored)
├── server/
│   ├── src/
│   │   ├── ai/                 # Gemini 3.8 Flash integration, prompts, and Zod schemas
│   │   ├── database/           # Prisma client, repositories, and seed engine
│   │   ├── importers/          # Instagram ZIP extractor, parsers, WhatsApp, and call handlers
│   │   ├── learning/           # Persistent learning and user correction engine
│   │   ├── services/           # Lead, import, and portfolio service orchestrators
│   │   ├── api/routes/         # Express REST API routes
│   │   └── index.ts            # Standalone API server entry point
├── src/                        # React 19 + TypeScript + Tailwind CSS Frontend
│   ├── components/
│   │   ├── dashboard/          # Metric KPIs, conversion cards, and activity feeds
│   │   ├── leads/              # Lead table, filter bar, and deep intelligence dossier
│   │   ├── imports/            # Instagram scanner, WhatsApp, and call transcript tabs
│   │   ├── learnings/          # Sales learnings board and human corrections audit
│   │   ├── portfolio/          # Verified D Web Studio portfolio case studies
│   │   └── layout/             # Header and sidebar
│   ├── lib/api.ts              # Type-safe API client
│   ├── types/index.ts          # Unified TypeScript interfaces
│   ├── App.tsx                 # Root UI controller
│   ├── main.tsx                # Client entry point
│   └── index.css               # Tailwind CSS styles and color tokens
├── tests/                      # Automated test suite (13/13 passing)
├── server.ts                   # Unified fullstack Express + Vite dev server
└── package.json
```

---

## Strict AI Guardrails & Human Responsibility

### The Strict No-Invention Rule
The AI is strictly prohibited from inventing or hallucinating:
- Contact or company names (defaults to `UNKNOWN`)
- Phone numbers, email addresses, or physical locations
- Project budgets or pricing (only records explicit client or agency statements)
- Testimonials or past relationships
- Buying commitments (casual greetings like "Hi", "Thanks", or "Ok" are classified as `NEUTRAL`, never `INTERESTED`)

### Human-in-the-Loop Responsibility
- **The system will never automatically dispatch messages or dial calls.**
- The human operator reviews and approves every drafted message.
- The human operator is exclusively responsible for sending messages, pricing, negotiation, and closing clients.
- If an operator overrides an AI decision, the reason is logged and immediately enriches the AI's persistent memory.
