# The official Node 24.19.0 image digest was verified on 2026-10-17.
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS builder
WORKDIR /opt/ask-bill
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate
COPY . .
RUN corepack pnpm install --frozen-lockfile && corepack pnpm build

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg poppler-utils poppler-data tesseract-ocr tesseract-ocr-eng \
    fontconfig fonts-dejavu-core bubblewrap util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/ask-bill
COPY --from=builder --chown=node:node /opt/ask-bill/apps ./apps
COPY --from=builder --chown=node:node /opt/ask-bill/packages ./packages
COPY --from=builder --chown=node:node /opt/ask-bill/node_modules ./node_modules
COPY --from=builder --chown=node:node /opt/ask-bill/migrations ./migrations
COPY --from=builder --chown=node:node /opt/ask-bill/scripts ./scripts
COPY --from=builder --chown=node:node /opt/ask-bill/infra ./infra
COPY --from=builder --chown=node:node /opt/ask-bill/content ./content
COPY --from=builder --chown=node:node /opt/ask-bill/package.json ./package.json
RUN chmod 0555 infra/run-source-sandbox.sh
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
USER node
EXPOSE 10000
CMD ["node","apps/web/application/start.mjs"]
