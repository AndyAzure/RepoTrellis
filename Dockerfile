FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder

WORKDIR /app
RUN corepack enable

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.mjs eslint.config.mjs ./
COPY drizzle.config.ts vitest.config.ts playwright.config.ts ./
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle
COPY scripts ./scripts
RUN pnpm build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=/app/data/repotrellis.db

RUN corepack enable && mkdir -p /app/data
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/db ./src/db
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
