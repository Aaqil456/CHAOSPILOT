# CHAOSPILOT

ChaosPilot is a dark-mode mission control dashboard for turning a business brief into personalized website-improvement proposals.

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

The frontend continues to use its existing local demo data. It does not call the API routes; start a sample mission to watch the simulated execution timeline and review editable proposal drafts. Add `simulate error` to the task to preview failed-run and retry states. Runs can also be cancelled while in progress.

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

`GET /api/health` returns a simple JSON status. `POST /api/test-model` accepts an optional JSON `prompt`. When credentials are configured, it calls the Nebius OpenAI-compatible chat completions endpoint using server-side `NEBIUS_API_KEY` and `NEBIUS_MODEL`. The model identifier is intentionally not hard-coded; configure it only after selecting a verified eligible NVIDIA open-source model.

For a real model request, configure `NEBIUS_API_KEY` as a Cloudflare Pages secret and `NEBIUS_MODEL` as a server-side Pages environment variable. For local real requests, set both in `.dev.vars` and set `MOCK_MODE=false`. Do not add secrets to frontend variables, source files, or responses. Missing values produce a safe `503` response. The model route has request/response size limits and a 30-second timeout.

## Deployment

Cloudflare Pages serves the Vite build from `dist` and discovers Functions under `functions/`. Set production environment values in the Pages project settings; keep the API key as a secret. The frontend is not yet wired to call these endpoints.
