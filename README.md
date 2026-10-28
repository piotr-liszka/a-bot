# a-bot

Chat with AI bots that live on **your own machine**. a-bot is an open-source desktop app (mobile later) for talking to
Claude Code, Codex, local Ollama models or a plain terminal, all running inside **one shared Linux container** on any
device you choose, using **your own subscriptions**.

```
┌──────────────┐   Supabase (Postgres + Realtime + Auth)   ┌─────────────────────────────────────┐
│ a-bot app    │ ◄──────────────────────────────────────► │ your device: docker container       │
│ (Electron)   │   history, live streaming, pairing        │  a-bot agent → claude / codex /     │
└──────────────┘                                           │  ollama / bash, Chromium, /workspace│
                                                           └─────────────────────────────────────┘
```

- **Hybrid by design.** Use the hosted a-bot account, or point the app at your own Supabase (cloud free tier or
  self-hosted). Same code either way.
- **No open ports.** The device agent dials out to Supabase; nothing on your device listens on the internet.
- **One box for all bots.** A small Debian container with your host folder mounted at `/workspace`, root inside,
  Chromium + Playwright MCP so bots can browse. Install anything you like; it persists.
- **Bots are detected, not configured.** The agent reports which CLIs are installed and logged in; the app shows it.

## Repository

| Path | What |
|---|---|
| `apps/desktop` | Electron + React app (also runs as a web app with `npm run web`) |
| `agent` | Device agent (Node). Pairs with your account, detects bots, runs chat turns, streams results |
| `packages/shared` | Types shared by app and agent |
| `supabase` | Database schema, row-level security, pairing functions (`supabase/migrations`) |
| `docker` | The shared box image: Debian, Chromium, Claude Code, Codex, Playwright MCP, the agent |

## Quick start (local, everything on one machine)

Requirements: Node 20+, Docker.

```bash
npm install
npm run db:start                 # local Supabase in Docker; prints API URL and anon key
npx supabase status -o env       # API_URL / ANON_KEY

# 1. the device: the shared box
cp .env.example .env             # set A_BOT_SUPABASE_URL=http://host.docker.internal:54321 and the anon key
docker compose up -d --build
docker compose logs a-bot        # shows a 6-character pairing code

# 2. the app
printf 'A_BOT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nA_BOT_PUBLIC_SUPABASE_ANON_KEY=<anon key>\n' > apps/desktop/.env.local
npm run dev                      # Electron; or: npm run web -w @a-bot/desktop
```

Create an account in the app, enter the pairing code under **Devices**, then log the bots in once inside the box:

```bash
docker exec -it a-bot claude auth login           # Claude Pro/Max subscription
docker exec -it a-bot codex login --device-auth   # ChatGPT Plus/Pro subscription
```

Ollama running on the host is picked up automatically (`OLLAMA_HOST=http://host.docker.internal:11434`).

## Using your own Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or self-host).
2. In Authentication → Providers enable **Email** and **Anonymous sign-ins** (devices sign in anonymously).
3. Apply the schema: `npx supabase link --project-ref <ref> && npx supabase db push`.
4. Put the project URL and publishable/anon key into the app (first screen → *Change*) and into the device `.env`.

The anon key is public by design; access is enforced by row-level security in `supabase/migrations`.

## Adding another CLI bot

Any CLI that takes a prompt and prints an answer can be added in `~/.a-bot/agent.json` inside the box:

```json
{ "customProviders": [ { "id": "aider", "name": "Aider", "command": ["aider", "--yes", "--message", "{prompt}"], "versionArgs": ["--version"] } ] }
```

## Development

```bash
npm run typecheck
npm run db:start && A_BOT_SUPABASE_ANON_KEY=<anon key> npm test -w @a-bot/agent   # unit + end-to-end tests
npm run dist -w @a-bot/desktop                                                   # installers (dmg / nsis / AppImage)
```

`agent/test/fixtures/bin/claude` is a stand-in Claude CLI that replays a realistic session; put it first on `PATH` to
demo the app without a subscription.

## Security notes (POC)

Bots run with permissions bypassed (`--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`)
inside the container: the container is the sandbox. Only mount folders you are happy for the bots to change.
Messages are stored in plain text in your Supabase project.

## License

MIT
