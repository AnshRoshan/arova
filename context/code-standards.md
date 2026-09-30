# Code standards
Use TypeScript, Zod at API boundaries and Drizzle for PostgreSQL access. Never expose API keys in client props or JSON. Workspace-scope all writes and reads. Keep API failures honest; no simulated external execution described as complete. Preserve existing responsive UI components before introducing new ones.
