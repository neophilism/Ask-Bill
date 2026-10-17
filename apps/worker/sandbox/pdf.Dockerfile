FROM node:24.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr && rm -rf /var/lib/apt/lists/*
USER node
WORKDIR /app
ENTRYPOINT ["node", "/app/apps/worker/sandbox/pdf-entry.mjs"]
