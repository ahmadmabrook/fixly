# syntax=docker/dockerfile:1.7
# Multi-stage build for the Fixly backend.
# Stage 1: install all deps + compile TypeScript.
# Stage 2: slim runtime with prod deps, runs migrations then starts the app.

# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY web/package.json ./web/
COPY admin/package.json ./admin/

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --frozen-lockfile --filter backend... --filter ./backend...

COPY backend ./backend
COPY docs/openapi.yaml ./backend/docs/openapi.yaml

WORKDIR /app/backend
RUN ./node_modules/.bin/prisma generate
RUN ./node_modules/.bin/tsc -p tsconfig.build.json

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 fixly && useradd --uid 1001 --gid fixly --shell /bin/sh fixly

WORKDIR /app

# Copy the workspace manifests + lockfile so pnpm can install prod deps cleanly.
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/web/package.json ./web/
COPY --from=build /app/admin/package.json ./admin/

# Install pnpm + prod-only deps (no devDependencies — clean image).
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --frozen-lockfile --filter backend... --prod

WORKDIR /app/backend

# Copy compiled JS, Prisma schema + generated client, startup script, and the
# OpenAPI spec served at /docs (swagger-ui-express reads it from ./docs at
# runtime — see src/interface/http/routes/docs.ts).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/start.sh ./start.sh
COPY --from=build /app/backend/docs ./docs
RUN chmod +x ./start.sh

# Re-generate Prisma client in the runtime stage so the query engine matches
# the runtime's OpenSSL/libc. Pin to the project's prisma version to avoid
# npx resolving to a newer major that rejects the schema.
RUN npx prisma@5.22.0 generate --schema ./prisma/schema.prisma

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

USER fixly

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["sh", "./start.sh"]
