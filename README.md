# a-bot

Chat with AI bots that live on **your own machine**. a-bot is an open-source desktop app (mobile later) for talking to
bots you create yourself, each running on an engine such as Claude Code, Codex or a local Ollama model, all inside **one shared Linux container** on any
device you choose, using **your own subscriptions**.

```
┌──────────────┐   Supabase (Postgres + Realtime + Auth)   ┌─────────────────────────────────────┐
│ a-bot app    │ ◄──────────────────────────────────────► │ your device: docker container       │
│ (Electron)   │   history, live streaming, pairing        │  a-bot agent → claude / codex /     │
└──────────────┘                                           │  ollama, Chromium, /workspace       │
                                                           └─────────────────────────────────────┘
```

- **Hybrid by design.** Use the hosted a-bot account, or point the app at your own Supabase (cloud free tier or
  self-hosted). Same code either way.
- **No open ports.** The agent dials out to Supabase; desktop and terminal go through your SSH connection.
- **One box for all bots.** A small Debian container with your host folder mounted at `/workspace`, root inside,
  Chromium + Playwright MCP so bots can browse. Install anything you like; it persists.
- **Engines are detected, bots are yours.** The agent reports which CLIs (engines) are installed and logged in. You
  create bots on top of them: a name, an engine, optionally a model (e.g. `opus`, `llama3.1`) and standing instructions.

## Repository

| Path | What |
|---|---|
| `apps/desktop` | Electron + React app (also runs as a web app with `npm run web`) |
| `agent` | Device agent (Node). Pairs with your account, detects bots, runs chat turns, streams results |
| `packages/shared` | Types shared by app and agent |
| `supabase` | Database schema, row-level security, pairing functions (`supabase/migrations`) |
| `docker` | The sandbox: Debian, desktop (TigerVNC + openbox + noVNC websocket), Chromium, Claude Code, Codex, Playwright MCP, the agent |
| `scripts/pack-box.mjs` | Packs `docker/` + the bundled agent into `dist/box`, which the app uploads to workers |

## How it works for the person

1. Open the desktop app and create an account (or sign in).
2. **Add a worker over SSH**: host, user, key or password of any machine with Docker. The app uploads the sandbox,
   builds and starts it there, and pairs it with your account automatically.
3. Log in the engines once in **Ustawienia → Konta modeli** (runs `claude auth login` / `codex login` in the sandbox).
4. Create a bot and chat with it. Switch to **Pulpit** to watch the sandbox's Linux desktop (the same Chromium the bots
   drive). **Ustawienia → Terminal** is a root shell inside the sandbox; it runs in tmux, so the session survives
   closing the view or the app.

Supabase remembers sessions and history and shows which workers are live. SSH credentials stay on your computer
(encrypted with the OS keychain); the desktop and terminal travel through the SSH connection, nothing is exposed.

## Quick start (development)

Requirements: Node 20+, Docker.

```bash
npm install
npm run db:start                 # local Supabase in Docker
npx supabase status -o env       # API_URL / ANON_KEY
printf 'A_BOT_PUBLIC_SUPABASE_URL=http://<lan-ip>:54321\nA_BOT_PUBLIC_SUPABASE_ANON_KEY=<anon key>\n' > apps/desktop/.env.local
npm run box:pack                 # builds the agent and packs the sandbox into dist/box
npm run dev                      # Electron app; add a worker under "Workery"
```

Use an address for Supabase that the worker can reach too (not 127.0.0.1), or a Supabase Cloud project.

### Running the sandbox by hand

```bash
npm run box:pack && cd dist/box
cp ../../docker/.env.example .env   # fill in backend URL and key
docker compose -p a-bot up -d --build
docker logs a-bot 2>&1 | grep 'Kod parowania'   # enter the code in the app
```

The desktop is published on the worker's loopback only (`127.0.0.1:6080`, noVNC websocket, password in
`/root/.a-bot/vnc-password` inside the container).

## Using your own Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or self-host).
2. In Authentication → Providers enable **Email** and **Anonymous sign-ins** (devices sign in anonymously).
3. Apply the schema: `npx supabase link --project-ref <ref> && npx supabase db push`.
4. Put the project URL and publishable/anon key into the app (first screen → *Change*) and into the device `.env`.

The anon key is public by design; access is enforced by row-level security in `supabase/migrations`.

## Adding another CLI bot

Any CLI that takes a prompt and prints an answer can be added in `~/.a-bot/agent.json` inside the sandbox:

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
