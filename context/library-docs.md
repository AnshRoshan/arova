# Library references

Rule: before using a library, check for its agent skill or MCP docs here, read them, and only then act. These are the sources this project was built against; re-check them when a version changes.

## Installed stack
- **Next.js 16 App Router** — route handlers, `after()`, `next/font`, server/client boundaries: https://nextjs.org/docs/app
- **React 19** — `useState`/`useEffect`/`useRef` only; no server components beyond layout/page shell: https://react.dev/reference/react
- **Drizzle ORM 0.45 + `pg` 8** — schema, queries, indexes: https://orm.drizzle.team/docs/get-started/postgresql-new
- **drizzle-kit 0.31** — `npx drizzle-kit push`; config is `drizzle.config.ts` and reads `process.env.DATABASE_URL`.
- **PostgreSQL** — 18.x on the local host; `to_tsvector`/GIN available, `pg_trgm` installable, **`vector` not available** (probed 2026-10-01). This is why memory is keyword recall.
- **Tailwind CSS 4** via `@tailwindcss/postcss` — used sparingly; the shell is mostly authored CSS in `src/app/globals.css`.
- **Zod 4** — parse every action body: https://zod.dev/
- **lucide-react** — icons only.
- **Node.js built-in test runner** — `node --test "src/lib/*.test.ts"`. Node ≥ 22.18 strips TypeScript types, so tests need no transpiler. `allowImportingTsExtensions` is what lets tests import `./model-gateway.ts`; app code keeps extensionless imports.
- **ESLint 9 + eslint-config-next 16** — `npm run lint`; currently clean.

## Model provider contract
OpenAI-compatible Chat Completions is the only adapter:
`POST {base}/chat/completions`, `Authorization: Bearer <key>`, body `{model, messages, max_tokens, stream}`. Reply at `choices[0].message.content`; SSE frames `data: {choices:[{delta:{content}}]}` ending with `data: [DONE]`; usage at `usage` when supplied and `stream_options.include_usage` is accepted (one-shot fallback otherwise).
- xAI legacy chat completions: https://docs.x.ai/developers/model-capabilities/legacy/chat-completions
- OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat
- Any server honouring the contract (dahl, vLLM, Ollama, TGI) works by env configuration: `PROVIDERS` + `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` / optional `_MAX_CONTEXT`.

## Project guidance
- project-context-system: https://github.com/AnshRoshan/project-context-system — local reference copy at `project-context-system/` (not runtime code). The operating rules are `context/workflow-rules.md`.
