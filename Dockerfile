# syntax=docker/dockerfile:1
# --- Frontend (Next.js) ---

# 1. Install dependencies with npm cache mount
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# BuildKit cache mount: npm cache persists on the host between builds.
# npm ci goes from ~5 min to ~30 sec on repeated builds.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --no-audit --fund=false

# 2. Build Next.js app
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

RUN npm run build

# 3. Production runner — minimal image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
