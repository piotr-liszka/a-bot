#!/usr/bin/env bash
# Prepares the shared box on every start (idempotent), then runs the agent.
set -euo pipefail

mkdir -p "${A_BOT_HOME:-/root/.a-bot}" /workspace

# Give the bots a browser: Playwright MCP driving the system Chromium, headless.
BROWSER_ARGS=(--headless --browser chromium --executable-path /usr/bin/chromium --no-sandbox)

if command -v claude >/dev/null && ! grep -q '"playwright"' /root/.claude.json 2>/dev/null; then
  claude mcp add --scope user playwright -- playwright-mcp "${BROWSER_ARGS[@]}" >/dev/null 2>&1 || true
fi

if command -v codex >/dev/null; then
  mkdir -p /root/.codex
  if ! grep -q 'mcp_servers.playwright' /root/.codex/config.toml 2>/dev/null; then
    cat >> /root/.codex/config.toml <<TOML

[mcp_servers.playwright]
command = "playwright-mcp"
args = ["--headless", "--browser", "chromium", "--executable-path", "/usr/bin/chromium", "--no-sandbox"]
TOML
  fi
fi

exec "$@"
