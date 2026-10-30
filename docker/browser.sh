#!/usr/bin/env bash
# The browser on the shared desktop: Google Chrome where it is installed (amd64), Chromium otherwise.
# Bots use their own profile through Playwright MCP.
bin=$(command -v google-chrome-stable || command -v chromium)
exec "$bin" --no-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --user-data-dir=/root/.config/a-bot-browser "$@" >/dev/null 2>&1
