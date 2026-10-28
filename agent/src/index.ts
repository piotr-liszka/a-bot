import { HEARTBEAT_MS, type DeviceRow, type MessageRow } from '@a-bot/shared';
import { hostname, platform, release } from 'node:os';
import { createBackend, ensureSignedIn, type Db } from './backend.js';
import { AGENT_VERSION, loadConfig, type AgentConfig } from './config.js';
import { log } from './log.js';
import { buildProviders, detectAll } from './providers/index.js';
import { JobRunner } from './runner.js';

const PAIR_POLL_MS = 3000;

function printCode(code: string, name: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log(`  │  Kod parowania:  ${spaced.padEnd(28)}│`);
  console.log(`  │  Urządzenie:     ${name.slice(0, 28).padEnd(28)}│`);
  console.log('  │  W aplikacji: Urządzenia → Dodaj urządzenie  │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
}

/** Waits until a person claims this agent in the app. Refreshes the code before it expires. */
async function waitForPairing(db: Db, deviceId: string, cfg: AgentConfig): Promise<DeviceRow> {
  let codeIssuedAt = 0;
  for (;;) {
    const { data } = await db.from('devices').select('*').eq('id', deviceId).maybeSingle<DeviceRow>();
    if (data) return data;
    if (Date.now() - codeIssuedAt > 14 * 60 * 1000) {
      const { data: code, error } = await db.rpc('create_pairing', { p_device_name: cfg.deviceName, p_hostname: hostname() });
      if (error) throw new Error(`Nie mogę utworzyć kodu parowania: ${error.message}`);
      codeIssuedAt = Date.now();
      printCode(code as string, cfg.deviceName);
    }
    await new Promise((r) => setTimeout(r, PAIR_POLL_MS));
  }
}

async function run() {
  const cfg = loadConfig();
  const db = createBackend(cfg);
  const deviceId = await ensureSignedIn(db);
  log.info(`a-bot agent ${AGENT_VERSION} · id urządzenia ${deviceId}`);
  log.info(`katalog roboczy: ${cfg.workspace}`);

  let device = await waitForPairing(db, deviceId, cfg);
  log.info(`sparowano jako „${device.name}”`);

  let providers = buildProviders(cfg.customProviders);
  const runner = new JobRunner(db, deviceId, () => providers, cfg.workspace, cfg.maxParallelJobs);

  let published = '';
  let detecting = false;
  /** Detects engines and publishes them when something changed (e.g. someone just logged in to claude). */
  const publishProviders = async (force = false) => {
    if (detecting) return;
    detecting = true;
    try {
      providers = buildProviders(cfg.customProviders);
      const infos = await detectAll(providers);
      const snapshot = JSON.stringify(infos);
      if (!force && snapshot === published) return;
      const ready = infos.filter((p) => p.installed && p.authenticated).map((p) => p.name);
      log.info(`silniki gotowe: ${ready.join(', ') || 'brak'}`);
      const { error } = await db.from('devices').update({ providers: infos }).eq('id', deviceId);
      if (!error) published = snapshot;
    } finally {
      detecting = false;
    }
  };

  const heartbeat = async (status: 'online' | 'offline' = 'online') => {
    const { error } = await db
      .from('devices')
      .update({
        status,
        last_seen: new Date().toISOString(),
        hostname: hostname(),
        platform: `${platform()} ${release()}`,
        agent_version: AGENT_VERSION,
        workspace: cfg.workspace,
      })
      .eq('id', deviceId);
    if (error) log.warn(`heartbeat: ${error.message}`);
  };

  await heartbeat();
  await publishProviders(true);
  await runner.recoverInterrupted();

  const channel = db
    .channel(`device-${deviceId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `device_id=eq.${deviceId}` }, (payload) => {
      runner.enqueue(payload.new as MessageRow);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `device_id=eq.${deviceId}` }, (payload) => {
      const m = payload.new as MessageRow;
      if (m.cancel_requested && m.status === 'streaming') runner.cancel(m.id);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId}` }, (payload) => {
      const next = payload.new as DeviceRow;
      if (next.refresh_requested_at && next.refresh_requested_at !== device.refresh_requested_at) {
        log.info('odświeżanie silników na prośbę aplikacji');
        publishProviders(true).catch((e) => log.warn(String(e)));
      }
      device = next;
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId}` }, () => {
      log.warn('urządzenie zostało usunięte w aplikacji; zatrzymuję agenta');
      shutdown(0);
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        log.info('nasłuchuję wiadomości');
        // Catch anything sent while we were offline or reconnecting.
        runner.pickUpPending().catch((e) => log.warn(String(e)));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        log.warn(`realtime: ${status}${err ? ` ${err.message}` : ''}`);
      }
    });

  const beat = setInterval(() => heartbeat().catch(() => {}), HEARTBEAT_MS);
  // Realtime can silently drop; a slow poll makes sure nothing waits forever.
  const poll = setInterval(() => {
    runner.pickUpPending().catch(() => {});
    publishProviders().catch(() => {});
  }, 30_000);

  let stopping = false;
  async function shutdown(code: number) {
    if (stopping) return;
    stopping = true;
    clearInterval(beat);
    clearInterval(poll);
    runner.cancelAll();
    await heartbeat('offline').catch(() => {});
    await db.removeChannel(channel).catch(() => {});
    process.exit(code);
  }
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

async function detect() {
  const cfg = (() => {
    try {
      return loadConfig();
    } catch {
      return undefined;
    }
  })();
  const infos = await detectAll(buildProviders(cfg?.customProviders));
  for (const p of infos) {
    const state = !p.installed ? 'brak' : p.authenticated ? 'gotowy' : 'niezalogowany';
    console.log(`${p.name.padEnd(14)} ${state.padEnd(14)} ${p.version ?? ''}${p.setupHint ? `\n${' '.repeat(15)}${p.setupHint}` : ''}`);
  }
}

const command = process.argv[2] ?? 'run';
const main = command === 'detect' ? detect : command === 'run' ? run : undefined;
if (!main) {
  console.log('Użycie: a-bot-agent [run|detect]');
  process.exit(1);
}
main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
