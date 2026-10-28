#!/usr/bin/env bash
# Prepares the sandbox on every start (idempotent), then hands over to supervisord.
set -euo pipefail

mkdir -p "${A_BOT_HOME:-/root/.a-bot}" /workspace /root/.vnc

# Desktop password: random, kept in the volume. The app reads it over SSH; it is never sent to the backend.
if [ ! -s /root/.vnc/passwd ]; then
  head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 8 > /root/.a-bot/vnc-password
  vncpasswd -f < /root/.a-bot/vnc-password > /root/.vnc/passwd
  chmod 600 /root/.vnc/passwd /root/.a-bot/vnc-password
fi

# Give the bots a browser on the shared desktop: Playwright MCP driving the system Chromium.
BROWSER_ARGS=(--browser chromium --executable-path /usr/bin/chromium --no-sandbox --user-data-dir /root/.cache/a-bot-bot-browser)

if command -v claude >/dev/null && ! grep -q '"playwright"' /root/.claude.json 2>/dev/null; then
  claude mcp add --scope user playwright -- playwright-mcp "${BROWSER_ARGS[@]}" >/dev/null 2>&1 || true
fi

if command -v codex >/dev/null; then
  mkdir -p /root/.codex
  if ! grep -q 'mcp_servers.playwright' /root/.codex/config.toml 2>/dev/null; then
    cat >> /root/.codex/config.toml <<TOML

[mcp_servers.playwright]
command = "playwright-mcp"
args = ["--browser", "chromium", "--executable-path", "/usr/bin/chromium", "--no-sandbox", "--user-data-dir", "/root/.cache/a-bot-bot-browser"]
TOML
  fi
fi

exec "$@"
