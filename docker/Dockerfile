# a-bot shared box: one small Debian Linux that all bots live in.
# Your host folder is mounted at /workspace; inside you are root and can install anything.

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY agent/package.json agent/
RUN npm ci --workspace @a-bot/agent --include-workspace-root=false
COPY packages/shared packages/shared
COPY agent agent
RUN npm run build -w @a-bot/agent \
    && node -e "const p=require('./agent/package.json'); delete p.devDependencies; delete p.scripts; require('fs').writeFileSync('agent/dist/package.json', JSON.stringify(p, null, 2))"

FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive \
    A_BOT_HOME=/root/.a-bot \
    A_BOT_WORKSPACE=/workspace \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    IS_SANDBOX=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl wget git openssh-client sudo procps less nano vim-tiny \
      jq ripgrep unzip zip xz-utils build-essential python3 python3-pip python3-venv \
      chromium fonts-liberation fonts-noto-color-emoji tini \
    && rm -rf /var/lib/apt/lists/*

# Bots. Log in once with `docker exec -it a-bot claude auth login` / `codex login --device-auth`;
# credentials stay in the a-bot-home volume.
RUN npm install -g @anthropic-ai/claude-code @openai/codex @playwright/mcp && npm cache clean --force

WORKDIR /opt/a-bot/agent
COPY --from=build /src/agent/dist ./dist
RUN mv dist/package.json package.json
RUN npm install --omit=dev --no-package-lock --ignore-scripts \
    && npm cache clean --force \
    && ln -s /opt/a-bot/agent/dist/index.js /usr/local/bin/a-bot-agent \
    && chmod +x dist/index.js

COPY docker/entrypoint.sh /usr/local/bin/a-bot-entrypoint
RUN chmod +x /usr/local/bin/a-bot-entrypoint

WORKDIR /workspace
VOLUME ["/workspace", "/root"]
ENTRYPOINT ["/usr/bin/tini", "--", "a-bot-entrypoint"]
CMD ["a-bot-agent", "run"]
