#!/usr/bin/env bash
# Chromium for the person on the shared desktop (bots use their own profile through Playwright MCP).
exec chromium --no-sandbox --disable-dev-shm-usage --no-first-run --user-data-dir=/root/.config/a-bot-browser "$@" >/dev/null 2>&1
