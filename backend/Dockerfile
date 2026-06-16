# syntax=docker/dockerfile:1.7
# Multi-stage build for the Fixly backend. Produces a small distroless image
# that runs the compiled JS from dist/ — no tsx, no devDependencies, no
# source maps shipped to prod.

# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install only what's needed for the build (prisma generate needs openssl).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy the lockfile + manifests first so dependency layer caches.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY web/package.json ./web/
COPY admin/package.json ./admin/

# Install pnpm matching the project's packageManager pin (9.x).
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --frozen-lockfile --filter backend... --filter ./backend...

# Now bring in the backend sources + Prisma schema.
COPY backend ./backend
COPY backend/prisma ./backend/prisma

# Generate the Prisma client (the JS that the runtime imports).
WORKDIR /app/backend
RUN ./node_modules/.bin/prisma generate

# Compile TypeScript → dist/.
RUN ./node_modules/.bin/tsc -p tsconfig.build.json

# Prune devDependencies from the prod runtime tree (keeps the image small).
RUN pnpm prune --prod --filter backend

# ---------- runtime stage ----------
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
WORKDIR /app/backend

# Copy only the built artifacts + prod node_modules from the build stage.
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=4000

# distroless nonroot image already runs as uid 65532; document the port.
EXPOSE 4000

# Container-level liveness check. distroless has no shell/curl, so use node's
# global fetch against the dependency-free /live endpoint. Orchestrators that
# read Docker health (Compose, Swarm) get a signal without an external probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Liveness probe-friendly: the process should print logs and listen on PORT.
CMD ["dist/main.js"]
