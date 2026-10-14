# CHAOSPILOT

ChaosPilot opens directly to a one-page workspace with an open-ended task composer and optional details for up to three businesses. The **Website Growth Agent** uses the configured Nebius model in a bounded model/tool/skill loop. Live website fetching is disabled; the only registered website-inspection tool is mock-only and returns no page evidence.

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

The app opens directly on the task form with one blank business row and a practical task prompt. Submitting a task calls `POST /api/run`; this makes a Nebius request for each model turn, with at most eight turns by default. The UI shows the final response, any skill instructions loaded by the runtime, and only tool calls returned and executed by that run. Live model runs may use Nebius credits. The registered `inspect_website` tool is mock-only, returns no page evidence, and makes no website request. The separate **Manual model test** button remains an independent live inference action.

The runtime loads its always-on instructions from `functions/agent/AGENT.md` and registers four optional skills under `functions/agent/skills/`. The live model can request registered skills or call allowlisted tools through the OpenAI-compatible chat completions tool-call format. Skill names are validated against the registry before their instructions are loaded. Compatibility of the configured Nebius model with function calling has not yet been verified with a live run.

Run the agent tests with Node.js's built-in test runner (Node.js 24 or another version supporting `--experimental-strip-types`):

```sh
npm run test:agent
```

## Local Pages Functions

Copy `.dev.vars.example` to `.dev.vars` for local development. It contains placeholders only; `.dev.vars` is ignored by Git. Set valid `NEBIUS_API_KEY` and `NEBIUS_MODEL` values to run the live agent locally. `MOCK_MODE=true` only mocks the separate `/api/test-model` route on localhost; it does not mock `/api/run`.

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

`GET /api/health` returns a simple JSON status. `POST /api/run` and `POST /api/test-model` use the server-side Nebius configuration. The manual test sends a prompt and does not fetch websites. The agent run sends the task, supplied business names/URLs, agent instructions, tool definitions, and any activated skill instructions to Nebius; it does not fetch website content.

Configure `NEBIUS_API_KEY` as a Cloudflare Pages secret, and `NEBIUS_MODEL` and `NEBIUS_MAX_TOKENS` as server-side Pages environment variables. `NEBIUS_MAX_TOKENS` defaults to 600 and accepts values from 1 through 2048. For local live agent requests, set these values in `.dev.vars`. Do not add secrets to frontend variables, source files, or responses. Missing values produce a safe `503` response. Each model request has a 30-second timeout and response-size limit; the runtime bounds a run to eight model turns and six tool calls. No automatic retries occur.

## Model choice and cost

Keep `NEBIUS_MODEL` unset until its exact ID is confirmed in your Token Factory account and the hackathon rules. NVIDIA Nemotron 3 Nano is a promising low-cost open-model candidate; current third-party catalog/search listings indicate approximately **$0.06 per 1M input tokens and $0.24 per 1M output tokens**. Prices and availability can change, and those rates are not verified against your account. Confirm the current model ID, rates, and competition eligibility in [Nebius Token Factory](https://tokenfactory.nebius.com/) before sending live requests. Do not infer a model ID from its display name.

## Deployment

Cloudflare Pages serves the Vite build from `dist` and discovers Functions under `functions/`. Both model endpoints use server-side environment values; keep `NEBIUS_API_KEY` as a Pages secret. Live website inspection remains disabled until a defensible SSRF-safe fetching approach is implemented and verified. The build runs `scripts/embed-agent-markdown.mjs` to embed Markdown instructions into a generated TypeScript module, avoiding runtime filesystem access.
