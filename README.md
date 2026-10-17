# ChaosPilot

ChaosPilot is an AI workflow agent that turns a natural-language request into an observable, multi-step task. Its primary workflow is the **website audit agent**:

1. You enter a task and up to three business names with public website URLs.
2. An NVIDIA model on Nebius Token Factory decides which allowlisted tools to call.
3. A Cloudflare Pages Function runs those tools: it fetches each homepage (and up to two linked pages), extracts evidence, and validates every argument with Zod.
4. Each step streams to the browser as it happens, with its status, inputs, outputs, errors and timing.
5. The model writes a proposal for each business from the inspected evidence. Every finding cites the value it relies on, and you can edit, copy or download the proposals. Nothing is sent to the businesses.

A secondary **website builder** workflow (`#builder`) generates a small HTML/CSS/JS site in a sandboxed preview.

## Setup

```sh
npm install
```

Create `.dev.vars` (or `.env`) in the project root for local development:

```ini
NEBIUS_API_KEY=your-nebius-api-key
NEBIUS_MODEL=nvidia/Nemotron-3_5-Lightning
NEBIUS_AUDIT_MAX_TOKENS=3000   # optional; website audit output limit (default 3000, max 4096)
NEBIUS_MAX_TOKENS=600          # optional; website builder output limit (default 600, max 4096)
MOCK_MODE=false                # true = local mock without AI calls (localhost only)
```

The API key is read only by server-side Pages Functions. Never put it in a `VITE_` variable or client code.

## Model configuration

- `NEBIUS_MODEL` must be an NVIDIA model that Nebius Token Factory serves with **function (tool) calling**. The adapter uses the OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1/chat/completions`.
- Verified live on 2026-10-18 with `nvidia/Nemotron-3_5-Lightning`: a three-site audit finished in about 13 seconds over 7 model turns.
- Reasoning models spend output tokens on reasoning. If a run fails with `output_truncated`, raise `NEBIUS_AUDIT_MAX_TOKENS`.
- A larger Nemotron model may judge findings better, at higher cost. Every finding shows its evidence so you can spot weak claims.

## Run locally

```sh
npm run build        # embeds agent instructions, type-checks src/ and functions/, builds dist/
npm run pages:dev    # serves the app and /api routes at http://localhost:8788
```

Open http://localhost:8788, click **Load sample task**, then **Start run**.

**Mock mode:** with `MOCK_MODE=true` on localhost, `/api/audit` uses a deterministic stand-in model. It still runs the **real tools and real website fetches**, but the proposals are rule-based text labelled `[MOCK]`, and the UI shows *LOCAL MOCK · NO AI*. Mock mode is ignored on any non-local host.

## Testing

```sh
npm test         # 54 Node tests: runtime, Nebius adapter, URL safety, fetching, extraction, tools, /api/audit, client state
npm run lint
npm run build
```

The tests use stubbed `fetch`; they do not call Nebius or the public internet. A live run with real credentials is the only way to confirm a model works with tool calling.

## How the audit agent works

| Piece | File |
| --- | --- |
| Streaming endpoint `POST /api/audit` (NDJSON events) | `functions/api/audit.ts`, `functions/agent/auditHandler.ts` |
| Bounded agent loop (turn and tool-call limits, Zod argument validation, cancellation) | `functions/agent/runtime.ts` |
| Allowlisted tools: `inspect_website`, `inspect_page`, `save_proposal` | `functions/agent/auditTools.ts` |
| Safe fetching and HTML evidence extraction | `functions/agent/safeFetch.ts`, `urlSafety.ts`, `pageEvidence.ts` |
| Shared request, proposal and event schemas | `functions/agent/auditSchema.ts` |
| Agent instructions | `functions/agent/AUDIT_AGENT.md` |
| UI | `src/views/AuditView.tsx`, `src/components/*`, `src/audit/*` |

### Safety limits

- The model refers to businesses only by server-assigned IDs (`b1`–`b3`), so it can only fetch URLs the user submitted. `inspect_page` accepts only same-origin paths that were found as links on pages already inspected.
- URLs must be `http`/`https` on default ports, with a public domain name. IP literals, `localhost`, `.local`, `.internal` and other reserved names, and URLs with embedded credentials are rejected. Cloudflare Workers cannot resolve DNS before fetching, so blocking is name-based. Cloudflare's network does not route Worker requests to private networks.
- Redirects are followed manually: at most 3, each re-validated. Each fetch has an 8-second timeout, reads at most 512 KB of HTML, and must return `text/html`. Each run is capped at 24 outbound requests.
- Each run is limited to 12 model turns and 16 tool calls, and each model call to a 30-second timeout. Cancelling in the browser aborts in-flight model calls and fetches.
- Website text is passed to the model as untrusted data. No tool can send messages, run code or reach anything beyond the submitted sites.
- If the model tries to finish without saving a proposal for an inspected site, it is reminded at most twice. Any remaining gaps are shown as warnings, never as invented proposals.

### Known limitations

- Pages that render their content with JavaScript return little HTML. The UI flags these as "evidence is limited".
- There are no screenshots or real performance scores. Those would need a headless browser or a third-party API.
- History is stored in this browser's `localStorage` (last 8 runs). There are no accounts and no server-side storage.
- On the Cloudflare **free** plan, Functions have a 10 ms CPU limit per request. Parsing large pages may exceed it; the Workers Paid plan raises the limit.

## Deployment (Cloudflare Pages)

1. Connect the repository in Cloudflare Pages, or run `npm run build && npx wrangler pages deploy dist`.
2. Build command: `npm run build`. Output directory: `dist`. API routes are discovered under `functions/`.
3. In **Settings → Variables and Secrets**, add `NEBIUS_API_KEY` as a **secret**, and add `NEBIUS_MODEL` (plus the optional token limits) as variables. Do not set `MOCK_MODE` in production.
4. After deploying, run the sample task on the deployed URL and confirm the run status shows *LIVE NEBIUS MODEL*.

## Website builder (secondary workflow)

`POST /api/run` asks the model to create `index.html`, `styles.css` and `script.js` in a request-scoped workspace. The files are saved in `localStorage` and previewed in a sandboxed iframe whose CSP blocks network access. Editing existing projects is not implemented yet.
