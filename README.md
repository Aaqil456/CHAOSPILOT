# ChaosPilot

ChaosPilot is an AI workflow agent that turns a natural-language request into an observable, multi-step task. It has two workflows, each with its own tab and API endpoint.

**1. Website audit** audits **one** website:

1. You enter a task and one business name with its public website URL.
2. An NVIDIA model on Nebius Token Factory decides which allowlisted tools to call.
3. A Cloudflare Pages Function runs those tools: it fetches the homepage (and up to two linked pages), extracts evidence, and validates every argument with Zod.
4. The server computes an **on-page basics score out of 100** from that evidence, with a check-by-check breakdown. The model never calculates or edits the score.
5. Each step streams to the browser as it happens, with its status, inputs, outputs, errors and timing.
6. The model writes a proposal from the inspected evidence, based on where the score lost the most points. Every finding cites the value it relies on, and you can edit, copy, or download the proposal as TXT, HTML or PDF. PDF export opens the browser's print dialog; choose "Save as PDF" there (no PDF library is bundled). Nothing is sent to the business.

**2. Compare two sites** inspects **two** homepages, scores both with the same checks, shows them side by side (who leads, and by how much, check by check), and has the model write the comparison: the main differences with cited values, and what the lower-scoring site should fix first. Only homepages are fetched, so both sites are judged on the same page type.

**Live demo:** https://chaospilot.pages.dev (click **Load sample task**, then **Start run**). **License:** MIT.

## How it uses NVIDIA Nemotron and Nebius

- **Model:** `nvidia/Nemotron-3_5-Lightning`, NVIDIA's open-weights model, served through **Nebius Token Factory** (`https://api.tokenfactory.nebius.com/v1/chat/completions`).
- **What the model does:** it is the agent's decision-maker. On every turn it chooses a tool (`inspect_website`, `inspect_page`, `save_proposal` or `save_comparison`) through native function calling, reads the real tool results, and finally writes the findings and email draft, or the written comparison. Without the model nothing is planned or written.
- **What the model does not do:** it cannot browse, run code, or reach any URL the user did not submit. The server executes only four allowlisted tools (three per workflow) and validates every argument and every proposal with Zod. The scores are computed by the server, not the model.
- **Why Token Factory helped:** each run is a short loop of sequential model calls (one per tool step, plus a final summary). In live tests, a single-site audit finished in about 8 seconds over 6 model turns, and a two-site comparison in about 4 seconds over 3 turns, including the real website fetches. That keeps the live timeline responsive.
- **Other Nebius services:** none. The app runs on Cloudflare Pages Functions and calls Token Factory over HTTPS. Nebius Serverless Endpoints and Jobs are not used.
- **Mock mode** (`MOCK_MODE=true`, localhost only) is a development convenience. It runs the real tools but not the model, and every output is labelled `[MOCK]`. It is never used on the deployed site.

## What was built

This project was started on 2026-10-13, inside the hackathon's submission period, so it is entirely new work for this hackathon. Its main parts:

- Server-side website fetching with SSRF protections (public domains only, validated redirects, timeouts, size and request limits) and HTML evidence extraction.
- The `/api/audit` endpoint that streams each agent step to the browser, with cancellation.
- Allowlisted tools with strict schemas, per-site page limits, and a check that stops the model from finishing without saving its result.
- A deterministic on-page basics score (13 weighted checks, 100 points) with a visible breakdown, and a separate two-site comparison workflow.
- Fixes found only by running against the real model: Nebius returning `tool_calls: null`, output truncation, and models sending JSON arrays as strings.
- The UI: a responsive layout for phone to desktop, live timeline, score card, evidence panel, comparison table, editable proposals, TXT/HTML/PDF export, run history for audits, and sample tasks.

An earlier experiment in the same repository (a website generator) was dropped to focus on the audit agent.

## Setup

```sh
npm install
```

Create `.dev.vars` (or `.env`) in the project root for local development:

```ini
NEBIUS_API_KEY=your-nebius-api-key
NEBIUS_MODEL=nvidia/Nemotron-3_5-Lightning
NEBIUS_AUDIT_MAX_TOKENS=3000   # optional; output limit per model call (default 3000, max 4096)
MOCK_MODE=false                # true = local mock without AI calls (localhost only)
```

The API key is read only by server-side Pages Functions. Never put it in a `VITE_` variable or client code.

## Model configuration

- `NEBIUS_MODEL` must be an NVIDIA model that Nebius Token Factory serves with **function (tool) calling**. The adapter uses the OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1/chat/completions`.
- Verified live on 2026-10-18 with `nvidia/Nemotron-3_5-Lightning`: a single-site audit finished in about 8 seconds over 6 model turns, and a two-site comparison in about 4 seconds over 3 turns.
- Reasoning models spend output tokens on reasoning. If a run fails with `output_truncated`, raise `NEBIUS_AUDIT_MAX_TOKENS`.
- A larger Nemotron model may judge findings better, at higher cost. Every finding shows its evidence so you can spot weak claims.

## Run locally

```sh
npm run build        # embeds agent instructions, type-checks src/ and functions/, builds dist/
npm run pages:dev    # serves the app and /api routes at http://localhost:8788
```

Open http://localhost:8788, click **Load sample task**, then **Start run**.

**Mock mode:** with `MOCK_MODE=true` on localhost, `/api/audit` and `/api/compare` use a deterministic stand-in model. It still runs the **real tools and real website fetches**, but the proposals are rule-based text labelled `[MOCK]`, and the UI shows *LOCAL MOCK · NO AI*. Mock mode is ignored on any non-local host.

## Testing

```sh
npm test         # Node tests: runtime, Nebius adapter, URL safety, fetching, extraction, tools, /api/audit, client state
npm run lint
npm run build
```

The tests use stubbed `fetch`; they do not call Nebius or the public internet. A live run with real credentials is the only way to confirm a model works with tool calling.

## How the audit agent works

| Piece | File |
| --- | --- |
| Streaming endpoint `POST /api/audit` (one website, NDJSON events) | `functions/api/audit.ts`, `functions/agent/auditHandler.ts` |
| Streaming endpoint `POST /api/compare` (two websites) | `functions/api/compare.ts`, `functions/agent/compareHandler.ts` |
| Shared streaming, cancellation and request parsing | `functions/agent/streamRun.ts` |
| Bounded agent loop (turn and tool-call limits, Zod argument validation, cancellation) | `functions/agent/runtime.ts` |
| Allowlisted tools: `inspect_website`, `inspect_page`, `save_proposal` (audit); `inspect_website`, `save_comparison` (compare) | `functions/agent/auditTools.ts` |
| On-page basics score (deterministic, 13 checks) | `functions/agent/siteScore.ts` |
| Safe fetching and HTML evidence extraction | `functions/agent/safeFetch.ts`, `urlSafety.ts`, `pageEvidence.ts` |
| Shared request, proposal, comparison and event schemas | `functions/agent/auditSchema.ts` |
| Agent instructions | `functions/agent/AUDIT_AGENT.md`, `functions/agent/COMPARE_AGENT.md` |
| UI | `src/views/AuditView.tsx`, `src/views/CompareView.tsx`, `src/components/*`, `src/audit/*` |

### The score

The **on-page basics score** is out of 100, from 13 weighted checks: HTTPS (10), mobile viewport (10), page title (6), meta description (12), one H1 (8), H2 headings (4), call to action (12), contact route (12), image alt text (8, skipped when the page has no images), social sharing preview (6), structured data (4), indexable (4) and enough page text (4). Skipped checks are left out of the total. Every point is traceable to an inspected value shown next to it.

The score covers on-page basics only. It does not measure page speed, design, rankings, backlinks or content quality, and it may be too low for JavaScript-rendered pages (the UI warns when it detects one).

### Safety limits

- The model refers to websites only by server-assigned IDs (`b1`, and `b2` for a comparison), so it can only fetch URLs the user submitted. `inspect_page` accepts only same-origin paths that were found as links on pages already inspected.
- URLs must be `http`/`https` on default ports, with a public domain name. IP literals, `localhost`, `.local`, `.internal` and other reserved names, and URLs with embedded credentials are rejected. Cloudflare Workers cannot resolve DNS before fetching, so blocking is name-based. Cloudflare's network does not route Worker requests to private networks.
- Redirects are followed manually: at most 3, each re-validated. Each fetch has an 8-second timeout, reads at most 512 KB of HTML, and must return `text/html`. Each run is capped at 24 outbound requests.
- Each run is limited to 12 model turns and 16 tool calls, and each model call to a 30-second timeout. Cancelling in the browser aborts in-flight model calls and fetches.
- Website text is passed to the model as untrusted data. No tool can send messages, run code or reach anything beyond the submitted sites.
- If the model tries to finish without saving its proposal (or comparison), it is reminded at most twice. Any remaining gap is shown as a warning, never as invented content. A comparison is only accepted when both sites were inspected successfully.

### Known limitations

- Pages that render their content with JavaScript return little HTML. The UI flags these as "evidence is limited".
- There are no screenshots or real performance scores. Those would need a headless browser or a third-party API.
- Audit history is stored in this browser's `localStorage` (last 8 runs). Comparisons are not saved. There are no accounts and no server-side storage.
- On the Cloudflare **free** plan, Functions have a 10 ms CPU limit per request. Parsing large pages may exceed it; the Workers Paid plan raises the limit.

## Deployment (Cloudflare Pages)

1. Connect the repository in Cloudflare Pages, or run `npm run build && npx wrangler pages deploy dist`.
2. Build command: `npm run build`. Output directory: `dist`. API routes are discovered under `functions/`.
3. In **Settings → Variables and Secrets**, add `NEBIUS_API_KEY` as a **secret**, and add `NEBIUS_MODEL` (plus the optional token limits) as variables. Do not set `MOCK_MODE` in production.
4. After deploying, run the sample task on the deployed URL and confirm the run status shows *LIVE NEBIUS MODEL*.
