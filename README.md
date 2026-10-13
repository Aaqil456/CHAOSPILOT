# CHAOSPILOT

ChaosPilot is a dark-mode mission control dashboard for turning a business brief into personalized website-improvement proposals.

## Development

```sh
npm install
npm run dev
```

## Build and lint

```sh
npm run build
npm run lint
```

## Demo

The current frontend uses local mock data; it does not call an API or inspect live websites. Start a sample mission to watch the simulated execution timeline and review editable proposal drafts. Add `simulate error` to the task to preview the failed-run and retry states. Runs can also be cancelled while in progress.

## Deployment and model configuration

The frontend is a Vite application and can be previewed with `npm run preview` after building. Server-side execution, Cloudflare Pages Functions, and Nebius model configuration have not been implemented yet. When the backend is added, keep `NEBIUS_API_KEY` in server-side environment variables; never expose it in browser code.
