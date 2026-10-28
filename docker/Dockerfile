# a-bot sandbox: one small Debian Linux that all bots live in, with a desktop you can watch.
# Build context is the packed box (npm run box:pack → dist/box): this file, the scripts next to it
# and agent/ (the bundled device agent). The desktop app uploads the same folder to a worker over SSH.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    A_BOT_HOME=/root/.a-bot \
    A_BOT_WORKSPACE=/workspace \
    DISPLAY=:1 \
    IS_SANDBOX=1 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl wget git openssh-client sudo procps less nano vim-tiny \
      jq ripgrep unzip zip xz-utils build-essential python3 python3-pip python3-venv \
      chromium fonts-liberation fonts-dejavu-core fonts-noto-color-emoji \
      tigervnc-standalone-server tigervnc-tools websockify openbox xterm x11-xserver-utils \
      supervisor tini \
    && rm -rf /var/lib/apt/lists/*

# Bots. Log in once from the app's Terminal tab (claude auth login / codex login);
# credentials stay in the a-bot-home volume.
RUN npm install -g @anthropic-ai/claude-code @openai/codex @playwright/mcp && npm cache clean --force

COPY agent /opt/a-bot/agent
RUN cd /opt/a-bot/agent \
    && npm install --omit=dev --no-package-lock --ignore-scripts \
    && npm cache clean --force \
    && chmod +x index.js \
    && ln -s /opt/a-bot/agent/index.js /usr/local/bin/a-bot-agent

COPY entrypoint.sh /usr/local/bin/a-bot-entrypoint
COPY browser.sh /usr/local/bin/browser
COPY supervisord.conf /etc/supervisor/conf.d/a-bot.conf
COPY openbox-menu.xml /etc/xdg/openbox/menu.xml
COPY openbox-autostart.sh /etc/xdg/openbox/autostart
RUN chmod +x /usr/local/bin/a-bot-entrypoint /usr/local/bin/browser

WORKDIR /workspace
VOLUME ["/workspace", "/root"]
# 6080: noVNC websocket for the desktop. Publish it on the host's loopback only; the app reaches it through SSH.
EXPOSE 6080
ENTRYPOINT ["/usr/bin/tini", "--", "a-bot-entrypoint"]
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
