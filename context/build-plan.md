# Build plan
## Current slice: organisations an agent can build and staff (spec 07)
Agents create a company with reporting lines, consult each other along those lines, and hold a capability surface (tools, skills, MCP) in one place. The shell now reads like a working document: real markdown, per-agent identity, and a thread that admits when a reply was stopped or truncated.

## Later, not in this slice
Authenticated accounts and memberships; per-provider rate limits and true cost accounting (a real tokenizer instead of the ~4-char estimate); non-Chat-Completions adapters (OpenAI Responses, Anthropic, Gemini); actual isolated sandbox; OAuth connectors; scheduler/worker; approval broker that performs actions; message pagination and retention. Each needs its own spec.
