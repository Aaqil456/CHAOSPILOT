# ChaosPilot — Project Instructions

## Product
Build ChaosPilot, a polished AI workflow agent for turning natural-language requests into observable, multi-step tasks.

## Primary demo
The user supplies up to three business names and public website URLs. ChaosPilot inspects those sites, identifies potential website improvements, and drafts a personalised proposal for each business.

## Required stack
- React, Vite and TypeScript
- Cloudflare Pages Functions for server-side API routes
- Nebius Token Factory for model inference
- An eligible NVIDIA open-source model
- Zod for runtime validation
- Lucide React for icons
- localStorage for demo history

## Core requirements
1. The user can enter a task and start, cancel or retry it.
2. The server obtains a structured plan from the AI model.
3. The server executes only explicitly allowlisted tools.
4. Each step reports its status, inputs, outputs and errors.
5. The AI uses tool results to create the final answer.
6. The interface displays progress, evidence and editable proposals.
7. Handle timeouts, invalid model output, API errors and failed tools.
8. Include a clearly labelled sample/demo task.

## Security
- Never expose API keys to client-side code.
- Read NEBIUS_API_KEY and NEBIUS_MODEL from server-side environment variables.
- Never execute model-generated shell commands, JavaScript or Python.
- Restrict website inspection to validated public HTTP(S) destinations.
- Apply timeouts, response-size limits and redirect validation.
- Validate all model output and tool arguments with Zod.
- Limit execution steps and prevent infinite loops.
- Do not send emails or perform external actions without explicit user approval.

## Development rules
- Work in small, testable increments.
- Before each change, inspect the existing code.
- Do not replace working features unnecessarily.
- Run the build after each milestone and fix errors before continuing.
- Do not invent successful test results.
- Do not add authentication, payments, a database or extra AI agents unless explicitly requested.
- Keep dependencies and costs low.
- Keep a README with setup, testing, deployment and model configuration instructions.

## Definition of done
A new user can open the demo, run a task, observe genuine server-side tool execution, inspect the results and use the generated proposals. The deployed app must use the qualifying NVIDIA model through Nebius and must never require a secret in the browser.