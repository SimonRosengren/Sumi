# One image serves the API under /api and the board at /. See docs/adr/0023-docker-image-and-compose.md.
FROM node:22-slim

RUN npm install -g pnpm@12.4.2
WORKDIR /app

# Dependencies first, so editing source does not reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contract/package.json packages/contract/
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/client/package.json packages/client/
COPY packages/cli/package.json packages/cli/
COPY packages/mcp/package.json packages/mcp/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages packages
RUN pnpm --filter @sumi/web build

ENV NODE_ENV=production \
    PORT=3000 \
    SUMI_WEB_DIR=/app/packages/web/dist
EXPOSE 3000
USER node
# Not through pnpm: it would try to re-check node_modules, which the non-root user cannot write.
WORKDIR /app/packages/api
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
