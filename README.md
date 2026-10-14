# ChaosPilot

ChaosPilot is a prompt-driven website-development workspace. It asks the configured Nebius model to create or update a small HTML/CSS/JavaScript project, applies only validated file operations to an in-memory request-scoped workspace, and returns the resulting files to the browser. The browser saves the project in `localStorage` and renders it in a sandboxed iframe preview.

## Setup

```sh
npm install
```

Set `NEBIUS_API_KEY` as a server-side Cloudflare Pages secret and `NEBIUS_MODEL` as a server-side environment variable. For local development, copy `.dev.vars.example` to `.dev.vars` and set values there. Never put the API key in client-side variables or source code.

The existing Nebius adapter uses the repository's Chat Completions request/response format and supports registered function tools. Automated tests mock its responses; they do **not** verify live compatibility for the configured Nebius model. A live run may consume credits.

## Run and test

```sh
npm run build
npx wrangler pages functions build functions --outdir dist
npm run lint
npm test
```

For local Pages Functions development:

```powershell
npm run pages:dev
```

Wrangler serves the site at `http://localhost:8788`. Set `MOCK_MODE=true` in local server-side environment configuration to use the deterministic mock on localhost without calling Nebius or consuming inference credits. The mock output is a fixed fixture, not generated from the prompt. Other hosts continue to require valid Nebius configuration and use the live model. Leave mock mode disabled when deliberately testing live inference.

## Project workspace and limits

- The only project paths are `index.html`, `styles.css`, and `script.js`.
- Each file is limited to 64 KB; all project files together are limited to 160 KB.
- A run accepts a request body of at most 512 KB, and each request-scoped workspace allows at most 12 project-tool operations.
- The agent runtime is bounded to eight model turns and 12 tool calls. File tools have no access to the server filesystem or shell.
- The browser stores the task and current file snapshot in localStorage. Clearing browser storage clears the local project; there is no account sync or server-side project persistence.
- The preview uses an iframe sandbox with scripts enabled but without same-origin privileges. Its Content Security Policy blocks network connections, external assets, forms, frames, and plugins; inline project CSS/JavaScript can run only inside that isolated preview.

Generated JavaScript is untrusted. The preview is isolated from the ChaosPilot application, but users should still avoid entering sensitive information into generated sites.

## Deployment

Cloudflare Pages serves the Vite build from `dist` and discovers API routes under `functions/`. Configure `NEBIUS_API_KEY`, `NEBIUS_MODEL`, and optionally `NEBIUS_MAX_TOKENS` as server-side Pages variables/secrets. Do not expose secrets through `VITE_` variables. Check `wrangler.jsonc` and the Cloudflare Pages configuration before deploying.

This milestone implements initial site generation, preview, and browser-local persistence. Existing files are protected from overwrites; follow-up editing is deliberately deferred to the next milestone. A real live Nebius tool-call run must still be performed to confirm compatibility with the selected model. There is no website browsing, web search, database, authentication, shell execution, or automatic deployment in the primary workflow.
