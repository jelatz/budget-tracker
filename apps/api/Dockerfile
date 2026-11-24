# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile --filter @repo/api...

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN pnpm --filter @repo/api build
RUN pnpm --filter @repo/api deploy --prod --legacy /prod/api
RUN rm -f /prod/api/.env /prod/api/.env.*
RUN cp -r /app/apps/api/dist /prod/api/dist

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=96"

COPY --from=builder --chown=node:node /prod/api ./

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]
