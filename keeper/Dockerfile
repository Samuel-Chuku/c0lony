# C0LONY keeper. Build from the repo root so the vote-wallet list in data/ is included:
#   docker compose -f keeper/docker-compose.yml up -d --build
FROM node:24-slim
WORKDIR /app/keeper
RUN corepack enable
COPY keeper/package.json keeper/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
COPY keeper/ ./
COPY data/ /app/data/
ENV NODE_ENV=production STATE_DIR=/app/keeper/state VOTERS_PUBLIC_DIR=/app/keeper/public/voters
EXPOSE 8787
CMD ["node", "src/main.ts"]
