# Build from the repository root: docker build -f apps/kanban/Dockerfile .
# Local development only; production deployment has not been verified.
FROM node:24-bookworm-slim
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @embody-apps/kanban build \
    && chown -R node:node /workspace
USER node
WORKDIR /workspace/apps/kanban
EXPOSE 3031
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3031/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/index.js"]
