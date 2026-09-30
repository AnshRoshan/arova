# Library references
- Next.js App Router and route handlers: https://nextjs.org/docs/app
- Drizzle PostgreSQL: https://orm.drizzle.team/docs/get-started/postgresql-new
- xAI chat completions (legacy but supported): https://docs.x.ai/developers/model-capabilities/legacy/chat-completions — endpoint `https://api.x.ai/v1/chat/completions`, bearer XAI_API_KEY. Responses API is preferred for future agentic features.
- OpenAI chat completions: https://platform.openai.com/docs/api-reference/chat
- OpenAI Chat Completions compatibility (the contract every provider here implements): `POST {base}/chat/completions`, `Authorization: Bearer <key>`, body `{model, messages, max_tokens, stream}`; reply at `choices[0].message.content`, streamed frames as `data: {choices:[{delta:{content}}]}` lines ending with `data: [DONE]`. Any server honouring this — including `https://inference.dahl.global/v1` and self-hosted vLLM/Ollama/TGI — is usable as a provider with no code change.
- Node.js built-in test runner: `node --test "src/lib/*.test.ts"`. Node 22+ strips TypeScript types itself, so unit tests need no transpiler or test dependency. `allowImportingTsExtensions` in tsconfig.json is what lets a test import `./model-gateway.ts`; app code must keep extensionless imports.
- project-context-system: local cloned source at project-context-system/SKILL.md (reference copy; not runtime code).
