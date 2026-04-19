FROM oven/bun:1 AS base

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    dumb-init \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bun", "run", "src/index.ts"]
