# Arova — one container, one process. The scheduler worker starts with the server (src/instrumentation.ts),
# so as long as this container is up, routines fire on time. Build from the repo root:
#   docker build -f deploy/Dockerfile -t arova .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# dev dependencies stay: drizzle-kit applies the schema when the container starts
RUN npm ci --include=dev
COPY . .
RUN NODE_ENV=production npm run build
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# The schema push is destructive by design (drizzle-kit push), so it only runs when explicitly
# asked for: set DRIZZLE_PUSH=on for a first boot or a deliberate migration, never by default.
CMD ["sh", "-c", "if [ \"$DRIZZLE_PUSH\" = \"on\" ]; then npx drizzle-kit push --force; fi && npm start"]
