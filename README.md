# CHAOSPILOT

ChaosPilot opens directly to a one-page workspace for drafting website-improvement ideas for up to three businesses. Its current workflow is a clearly labelled interactive demo; it does not fetch websites or generate live proposals.

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

The app opens directly on the task form with one blank business row and a practical task prompt. Add up to three public business URLs and start a demo task; progress is simulated and results are static editable examples, not live website research or AI-generated proposals. The separate **Manual model test** button is the only frontend action that calls the model API; it sends one request per click and is never triggered by page load or UI updates. Live model requests may use paid Nebius credit.

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

Cloudflare Pages serves the Vite build from `dist` and discovers Functions under `functions/`. Set production environment values in the Pages project settings; keep the API key as a secret. Only the explicit manual model test calls the API; automated missions remain simulated.
