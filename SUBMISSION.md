# Hackathon submission text

Track: **Best Apps and Agents**
Demo: https://chaospilot.pages.dev
Repository: https://github.com/Aaqil456/CHAOSPILOT (MIT)

## Project description

**What it is.** ChaosPilot is a website-audit agent for freelancers and small agencies. You enter up to three businesses and their public website URLs. The agent inspects each site and drafts a personalised improvement proposal for each business. Every finding in a proposal cites the exact value it was based on (for example `metaDescription: null` or `images.missingAlt: 7`), so a claim can be checked rather than trusted.

**Why I built it.** Cold outreach about a client's website usually ends up generic, because properly reviewing each site takes time. I wanted an agent that does the review with real evidence and hands back a draft I can edit, instead of an AI that writes confident text about a site it never opened.

**How it works.**
1. The browser sends the task and businesses to a Cloudflare Pages Function (`/api/audit`).
2. `nvidia/Nemotron-3_5-Lightning`, served on Nebius Token Factory, decides what to do next using native function calling. It can call three tools: `inspect_website`, `inspect_page` and `save_proposal`.
3. The server executes those tools. It fetches the page over HTTP, extracts evidence (SEO tags, headings, calls to action, contact routes, images, links), and returns a compact summary to the model.
4. The model reads the results, optionally opens up to two linked pages per business, and saves a proposal for each business.
5. Each step streams to the browser as it happens, with its inputs, outputs, errors and timing. Proposals can be edited, copied, or downloaded as TXT, HTML or PDF.

**What makes it trustworthy.**
- The model only sees server-fetched evidence and can only reach URLs the user submitted, plus pages linked from them.
- Tool arguments and proposals are validated with Zod. Invalid output is returned to the model with field-level errors so it can fix its own call.
- Fetching is restricted to public http(s) domains. Redirects are re-validated, and requests have timeouts, size limits and a per-run budget.
- Runs have turn and tool-call limits. If the model tries to finish without saving a proposal for a site it inspected, it is reminded. Any remaining gap is shown as a warning, never filled in.
- Nothing is ever sent to the businesses. Proposals are drafts for review.

**Tested against the live model.** A three-site audit finished in about 13 seconds over 7 model turns. Running against the real model found issues the stubbed tests missed, and the project fixes all of them (see the README).

**Known limits.** Sites that render everything with JavaScript return little HTML, and the UI flags this as limited evidence. There are no screenshots or real performance scores. History lives only in the browser. The model is small and occasionally misjudges a finding, which is why every finding shows its evidence.

## Feedback on Nebius Token Factory and NVIDIA Nemotron

All of this comes from building this project.

**What worked well**
- The OpenAI-compatible API meant a plain `fetch` adapter was enough. No SDK was needed.
- Native tool calling worked with `nvidia/Nemotron-3_5-Lightning` for a multi-step loop, including recovery after a tool-argument validation error.
- Latency was good. A full three-site audit including real website fetches took about 13 seconds.

**Friction and suggestions**
1. **`tool_calls: null`.** When the model answers in plain text, the response contains `"tool_calls": null` rather than omitting the field. A strict response parser rejects this, and the live run fails on the second turn. This is worth a line in the docs or a consistent shape.
2. **Truncation is easy to hit with reasoning models.** The response also carries a `reasoning` field, and reasoning appears to count against `max_tokens`. With a 600-token limit the output was cut off mid tool call. Documenting typical token needs for tool-calling workloads, or surfacing `finish_reason: "length"` more prominently, would save debugging time.
3. **Argument formatting is not always schema-exact.** The model sometimes sent a nested array (`findings`) as a JSON string instead of an array. I handle this by decoding that one field before validating, but stricter tool-argument conformance (or guided decoding for tool calls) would help.
4. **Text answers instead of tool calls.** The model sometimes wrote the finished proposal as plain text and claimed it had saved it, without calling `save_proposal`. A server-side check that reminds the model fixed it.
5. **Calibration.** The small model occasionally reported a non-problem as a finding (for example, calling a 5 KB page heavy, or citing `hasViewport: true` as a gap). Explicit rules in the system prompt reduced this. A larger Nemotron model would likely improve it, at higher cost.
6. **Docs.** The quickstart I read does not mention tool calling, JSON mode, or structured output. Adding a short section on which models support function calling, with an example, would be valuable.

**Tooling note (not Nebius).** The local `wrangler pages dev` binary rejected a compatibility date one day newer than it supported. This was easy to fix but confusing.
