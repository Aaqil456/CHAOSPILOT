# CHAOSPILOT

ChaosPilot opens directly to a one-page workspace with an open-ended task composer and optional details for up to three businesses. The **Website Growth Agent** currently runs in mock mode: it demonstrates a bounded agent/tool/skill orchestration path but does not use a live model or fetch websites.

## Setup

```sh
npm install
```

## Build and lint

```sh
npm run build
npm run lint
```

## Frontend demo

The app opens directly on the task form with one blank business row and a practical task prompt. Submitting a task calls `POST /api/run`; the UI shows the actual mock response, any skill instructions loaded by the runtime, and only tool calls returned by that run. The registered `inspect_website` tool is a mock and returns no page evidence. It makes no website request. The separate **Manual model test** button remains an explicit, independent action that can call the configured model API and may use paid Nebius credit; it is never triggered by the agent run.

The runtime loads its always-on instructions from `functions/agent/AGENT.md` and registers four optional skills under `functions/agent/skills/`. A skill is only reported as loaded after the runtime resolves the mock model's activation request against the registered skill catalog. The current mock model uses deterministic task-keyword rules; it is not semantic model reasoning or live model tool calling.

Run the agent tests with Node.js's built-in test runner (Node.js 24 or another version supporting `--experimental-strip-types`):

```sh
npm run test:agent
```

## Local Pages Functions

Copy `.dev.vars.example` to `.dev.vars` for local development. The example enables mock mode and contains placeholders only; `.dev.vars` is ignored by Git. Mock mode returns an explicit `mode: "mock"` response and is honored only for requests to a local hostname.

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run build
npm run pages:dev
```

Wrangler serves the built frontend and Pages Functions locally at `http://localhost:8788`. Check the health route:

```powershell
Invoke-RestMethod http://localhost:8788/api/health
```

Test the model route (in local mock mode, this does not contact Nebius):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8788/api/test-model `
  -ContentType 'application/json' -Body '{"prompt":"Reply with READY"}'
```

`GET /api/health` returns a simple JSON status. `POST /api/test-model` accepts an optional JSON `prompt` (up to 1200 characters). When credentials are configured, it calls the Nebius OpenAI-compatible chat completions endpoint using server-side `NEBIUS_API_KEY` and `NEBIUS_MODEL`. The frontend manual test sends only the task summary and business names/domains, not website text; the app does not fetch website content for this test.

For a real model request, configure `NEBIUS_API_KEY` as a Cloudflare Pages secret, and `NEBIUS_MODEL` and `NEBIUS_MAX_TOKENS` as server-side Pages environment variables. `NEBIUS_MAX_TOKENS` defaults to 600 and accepts values from 1 through 2048. For local real requests, set the values in `.dev.vars` and set `MOCK_MODE=false`. Do not add secrets to frontend variables, source files, or responses. Missing values produce a safe `503` response. The route has request/response size limits and a 30-second timeout, makes one inference request per explicit call, and does not retry automatically. Successful live responses include token usage when Nebius provides it.

## Model choice and cost

Keep `NEBIUS_MODEL` unset until its exact ID is confirmed in your Token Factory account and the hackathon rules. NVIDIA Nemotron 3 Nano is a promising low-cost open-model candidate; current third-party catalog/search listings indicate approximately **$0.06 per 1M input tokens and $0.24 per 1M output tokens**. Prices and availability can change, and those rates are not verified against your account. Confirm the current model ID, rates, and competition eligibility in [Nebius Token Factory](https://tokenfactory.nebius.com/) before sending live requests. Do not infer a model ID from its display name.

## Deployment

Cloudflare Pages serves the Vite build from `dist` and discovers Functions under `functions/`. The mock agent endpoint does not use Nebius credentials. The separate manual model test uses server-side environment values when explicitly invoked; keep `NEBIUS_API_KEY` as a Pages secret. Live website inspection remains disabled until a defensible SSRF-safe fetching approach is implemented and verified. The build runs `scripts/embed-agent-markdown.mjs` to embed the Markdown instructions into a generated TypeScript module. This avoids runtime filesystem access and Wrangler Markdown loader configuration; `npm run build` and the Pages Functions bundle build verify the generated module.
