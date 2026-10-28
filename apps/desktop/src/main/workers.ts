// Workers: machines the person reaches over SSH. The app installs the a-bot sandbox there,
// tunnels to its desktop and opens terminals inside the container. SSH credentials never
// leave this computer; secrets are encrypted with the OS keychain when available.
import { app, safeStorage, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { homedir } from 'node:os';
import { join, posix } from 'node:path';
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2';

export type AuthMethod = 'agent' | 'key' | 'password';

export interface WorkerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  keyPath?: string;
  /** Password, or the key passphrase. Plain text only on its way in. */
  secret?: string;
  workspaceDir: string;
}

export interface WorkerInfo extends Omit<WorkerInput, 'secret'> {
  id: string;
  deviceId?: string;
  hasSecret: boolean;
}

interface StoredWorker extends WorkerInfo {
  secretEnc?: string;
  secretPlain?: string;
}

export interface InstallOptions {
  backendUrl: string;
  anonKey: string;
}

export type InstallStep = 'connect' | 'docker' | 'upload' | 'build' | 'start' | 'pair';

export interface InstallEvent {
  workerId: string;
  step: InstallStep;
  status: 'running' | 'done' | 'error';
  log?: string;
  error?: string;
}

const REMOTE_DIR = '.a-bot/box';
const DESKTOP_PORT = 6080;

const storePath = () => join(app.getPath('userData'), 'workers.json');

function readStore(): StoredWorker[] {
  try {
    return JSON.parse(readFileSync(storePath(), 'utf8')) as StoredWorker[];
  } catch {
    return [];
  }
}

function writeStore(workers: StoredWorker[]) {
  writeFileSync(storePath(), JSON.stringify(workers, null, 2), { mode: 0o600 });
}

function publicInfo(w: StoredWorker): WorkerInfo {
  const { secretEnc: _e, secretPlain: _p, ...rest } = w;
  return { ...rest, hasSecret: Boolean(w.secretEnc || w.secretPlain) };
}

function encodeSecret(secret: string | undefined): Pick<StoredWorker, 'secretEnc' | 'secretPlain'> {
  if (!secret) return {};
  if (safeStorage.isEncryptionAvailable()) return { secretEnc: safeStorage.encryptString(secret).toString('base64') };
  return { secretPlain: secret };
}

function decodeSecret(w: StoredWorker): string | undefined {
  if (w.secretEnc) return safeStorage.decryptString(Buffer.from(w.secretEnc, 'base64'));
  return w.secretPlain;
}

/** Folder with the packed sandbox (Dockerfile, scripts, bundled agent). */
function boxDir(): string {
  const candidates = [join(process.resourcesPath ?? '', 'box'), join(app.getAppPath(), '../../dist/box'), join(process.cwd(), 'dist/box'), join(process.cwd(), '../../dist/box')];
  const found = candidates.find((p) => existsSync(join(p, 'Dockerfile')));
  if (!found) throw new Error('Brak paczki sandboxa. Uruchom „npm run box:pack” w repozytorium.');
  return found;
}

function connectConfig(w: WorkerInput | StoredWorker, secret: string | undefined): ConnectConfig {
  const cfg: ConnectConfig = { host: w.host, port: w.port || 22, username: w.username, readyTimeout: 15_000, keepaliveInterval: 15_000 };
  if (w.auth === 'agent') {
    cfg.agent = process.platform === 'win32' ? 'pageant' : process.env.SSH_AUTH_SOCK;
    if (!cfg.agent) throw new Error('Nie widzę agenta SSH (SSH_AUTH_SOCK). Wybierz klucz albo hasło.');
  } else if (w.auth === 'key') {
    const keyPath = (w.keyPath || '~/.ssh/id_ed25519').replace(/^~(?=$|\/)/, homedir());
    if (!existsSync(keyPath)) throw new Error(`Nie ma pliku klucza ${keyPath}.`);
    cfg.privateKey = readFileSync(keyPath);
    if (secret) cfg.passphrase = secret;
  } else {
    cfg.password = secret;
  }
  return cfg;
}

function friendlySshError(err: Error & { level?: string; code?: string }): string {
  if (err.level === 'client-authentication') return 'Serwer odrzucił logowanie. Sprawdź użytkownika i klucz albo hasło.';
  if (err.code === 'ENOTFOUND') return 'Nie znam takiego hosta.';
  if (err.code === 'ECONNREFUSED') return 'Połączenie odrzucone. Czy działa tam serwer SSH na tym porcie?';
  if (err.code === 'ETIMEDOUT' || /Timed out/i.test(err.message)) return 'Host nie odpowiada. Sprawdź adres i sieć.';
  if (/passphrase/i.test(err.message)) return 'Klucz jest zabezpieczony hasłem. Podaj je w polu „Hasło do klucza”.';
  return err.message;
}

function connect(cfg: ConnectConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.once('ready', () => resolve(c));
    c.once('error', (err) => reject(new Error(friendlySshError(err))));
    c.connect(cfg);
  });
}

function run(c: Client, command: string, onLine?: (line: string) => void): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    c.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let partial = '';
      const feed = (d: Buffer) => {
        const s = d.toString();
        out += s;
        if (out.length > 200_000) out = out.slice(-100_000);
        if (!onLine) return;
        partial += s;
        const lines = partial.split(/\r?\n|\r/);
        partial = lines.pop() ?? '';
        lines.forEach((l) => l.trim() && onLine(l));
      };
      stream.on('data', feed);
      stream.stderr.on('data', feed);
      stream.on('close', (code: number | null) => {
        if (onLine && partial.trim()) onLine(partial);
        resolve({ code: code ?? 0, out });
      });
    });
  });
}

function sftp(c: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => c.sftp((err, s) => (err ? reject(err) : resolve(s))));
}

async function uploadDir(s: SFTPWrapper, local: string, remote: string) {
  await new Promise<void>((resolve) => s.mkdir(remote, () => resolve()));
  for (const entry of readdirSync(local)) {
    if (entry === '.env' || entry.startsWith('Dockerfile.') || entry === 'proxy-ca.crt') continue;
    const lp = join(local, entry);
    const rp = posix.join(remote, entry);
    if (statSync(lp).isDirectory()) await uploadDir(s, lp, rp);
    else await new Promise<void>((resolve, reject) => s.fastPut(lp, rp, (err) => (err ? reject(err) : resolve())));
  }
}

function writeRemote(s: SFTPWrapper, path: string, content: string) {
  return new Promise<void>((resolve, reject) => s.writeFile(path, content, { mode: 0o600 }, (err) => (err ? reject(err) : resolve())));
}

const shellQuote = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;

export class WorkerManager {
  private clients = new Map<string, Client>();
  private tunnels = new Map<string, { server: Server; port: number }>();
  private terminals = new Map<string, ClientChannel>();

  list(): WorkerInfo[] {
    return readStore().map(publicInfo);
  }

  save(input: WorkerInput & { id?: string }): WorkerInfo {
    const workers = readStore();
    const existing = input.id ? workers.find((w) => w.id === input.id) : undefined;
    const { secret, id: _id, ...fields } = input;
    const next: StoredWorker = {
      ...(existing ?? { id: randomUUID() }),
      ...fields,
      ...(secret !== undefined ? encodeSecret(secret) : {}),
      hasSecret: false,
    };
    if (secret === '') {
      delete next.secretEnc;
      delete next.secretPlain;
    }
    writeStore(existing ? workers.map((w) => (w.id === existing.id ? next : w)) : [...workers, next]);
    this.drop(next.id);
    return publicInfo(next);
  }

  link(id: string, deviceId: string) {
    writeStore(readStore().map((w) => (w.id === id ? { ...w, deviceId } : w.deviceId === deviceId ? { ...w, deviceId: undefined } : w)));
  }

  remove(id: string) {
    this.drop(id);
    writeStore(readStore().filter((w) => w.id !== id));
  }

  /** Close everything held open for a worker (after edits or removal). */
  drop(id: string) {
    this.clients.get(id)?.end();
    this.clients.delete(id);
    const t = this.tunnels.get(id);
    t?.server.close();
    this.tunnels.delete(id);
  }

  private stored(id: string): StoredWorker {
    const w = readStore().find((x) => x.id === id);
    if (!w) throw new Error('Nie ma takiego workera.');
    return w;
  }

  private async client(id: string): Promise<Client> {
    const cached = this.clients.get(id);
    if (cached) return cached;
    const w = this.stored(id);
    const c = await connect(connectConfig(w, decodeSecret(w)));
    c.on('close', () => {
      if (this.clients.get(id) === c) this.clients.delete(id);
    });
    c.on('error', () => {});
    this.clients.set(id, c);
    return c;
  }

  /** Connects with unsaved settings and reports whether Docker is usable there. */
  async test(input: WorkerInput): Promise<{ docker: string }> {
    const c = await connect(connectConfig(input, input.secret));
    try {
      return { docker: await dockerVersion(c) };
    } finally {
      c.end();
    }
  }

  async install(id: string, opts: InstallOptions, sender: WebContents): Promise<{ pairingCode?: string; deviceId?: string }> {
    const w = this.stored(id);
    const emit = (e: Omit<InstallEvent, 'workerId'>) => !sender.isDestroyed() && sender.send('workers:progress', { workerId: id, ...e });
    let step: InstallStep = 'connect';
    try {
      emit({ step, status: 'running', log: `ssh ${w.username}@${w.host}:${w.port}` });
      this.drop(id);
      const c = await this.client(id);
      emit({ step, status: 'done' });

      step = 'docker';
      emit({ step, status: 'running' });
      const version = await dockerVersion(c);
      emit({ step, status: 'done', log: `Docker ${version}` });

      step = 'upload';
      emit({ step, status: 'running' });
      const home = (await run(c, 'printf %s "$HOME"')).out.trim();
      const remoteDir = posix.join(home, REMOTE_DIR);
      const workspace = w.workspaceDir.replace(/^~(?=$|\/)/, home);
      await run(c, `mkdir -p ${shellQuote(remoteDir)} ${shellQuote(workspace)}`);
      const s = await sftp(c);
      await uploadDir(s, boxDir(), remoteDir);
      const env = [
        `A_BOT_SUPABASE_URL=${opts.backendUrl}`,
        `A_BOT_SUPABASE_ANON_KEY=${opts.anonKey}`,
        `A_BOT_DEVICE_NAME=${w.name.replace(/\n/g, ' ')}`,
        `A_BOT_WORKSPACE_DIR=${workspace}`,
        `A_BOT_DESKTOP_PORT=${DESKTOP_PORT}`,
        '',
      ].join('\n');
      await writeRemote(s, posix.join(remoteDir, '.env'), env);
      s.end();
      emit({ step, status: 'done', log: `${remoteDir} · /workspace → ${workspace}` });

      step = 'build';
      emit({ step, status: 'running' });
      const build = await run(c, `cd ${shellQuote(remoteDir)} && docker compose -p a-bot build 2>&1`, (line) => emit({ step: 'build', status: 'running', log: line }));
      if (build.code !== 0) throw new Error(`Budowanie obrazu nie powiodło się:\n${build.out.split('\n').slice(-12).join('\n')}`);
      emit({ step, status: 'done' });

      step = 'start';
      emit({ step, status: 'running' });
      // A container from an earlier manual setup may hold the name; replace it (its volume, and so the device identity, stays).
      await run(c, `docker ps -a --format '{{.Names}} {{.Label "com.docker.compose.project.working_dir"}}' | awk '$1=="a-bot" && $2!=${shellQuote(remoteDir)} {print $1}' | xargs -r docker rm -f`);
      const up = await run(c, `cd ${shellQuote(remoteDir)} && docker compose -p a-bot up -d --remove-orphans 2>&1`, (line) => emit({ step: 'start', status: 'running', log: line }));
      if (up.code !== 0) throw new Error(`Uruchomienie nie powiodło się:\n${up.out.split('\n').slice(-8).join('\n')}`);
      emit({ step, status: 'done' });

      step = 'pair';
      emit({ step, status: 'running', log: 'Czekam na agenta…' });
      const result = await waitForAgent(c);
      emit({ step, status: 'running', log: result.pairingCode ? `Kod: ${result.pairingCode}` : 'Urządzenie jest już sparowane.' });
      return result;
    } catch (err) {
      emit({ step, status: 'error', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /** Local port forwarded over SSH to the sandbox desktop, plus its VNC password. */
  async desktop(id: string): Promise<{ url: string; password: string }> {
    const c = await this.client(id);
    const pw = await run(c, 'docker exec a-bot cat /root/.a-bot/vnc-password 2>&1');
    if (pw.code !== 0) throw new Error(/No such container|is not running/i.test(pw.out) ? 'Kontener a-bot nie działa na tym workerze.' : pw.out.trim());
    let tunnel = this.tunnels.get(id);
    if (!tunnel) {
      const server = createServer((socket) => {
        this.client(id)
          .then((cl) =>
            cl.forwardOut('127.0.0.1', 0, '127.0.0.1', DESKTOP_PORT, (err, stream) => {
              if (err) return socket.destroy();
              socket.pipe(stream).pipe(socket);
              stream.on('close', () => socket.destroy());
              socket.on('close', () => stream.close());
            }),
          )
          .catch(() => socket.destroy());
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      tunnel = { server, port: (server.address() as AddressInfo).port };
      this.tunnels.set(id, tunnel);
    }
    return { url: `ws://127.0.0.1:${tunnel.port}/websockify`, password: pw.out.trim() };
  }

  async exec(id: string, command: 'browser' | 'restart'): Promise<void> {
    const c = await this.client(id);
    if (command === 'browser') await run(c, 'docker exec -d a-bot browser');
    if (command === 'restart') await run(c, 'docker restart a-bot');
  }

  async openTerminal(id: string, cols: number, rows: number, sender: WebContents): Promise<string> {
    const c = await this.client(id);
    const termId = randomUUID();
    const stream = await new Promise<ClientChannel>((resolve, reject) =>
      c.exec('docker exec -it -e TERM=xterm-256color -e COLORTERM=truecolor -w /workspace a-bot bash -l', { pty: { term: 'xterm-256color', cols, rows } }, (err, s) =>
        err ? reject(err) : resolve(s),
      ),
    );
    this.terminals.set(termId, stream);
    const send = (data: Buffer) => !sender.isDestroyed() && sender.send('terminal:data', { termId, data: data.toString('utf8') });
    stream.on('data', send);
    stream.stderr.on('data', send);
    stream.on('close', () => {
      this.terminals.delete(termId);
      if (!sender.isDestroyed()) sender.send('terminal:exit', { termId });
    });
    return termId;
  }

  writeTerminal(termId: string, data: string) {
    this.terminals.get(termId)?.write(data);
  }

  resizeTerminal(termId: string, cols: number, rows: number) {
    this.terminals.get(termId)?.setWindow(rows, cols, 0, 0);
  }

  closeTerminal(termId: string) {
    this.terminals.get(termId)?.close();
    this.terminals.delete(termId);
  }

  dispose() {
    for (const id of [...this.clients.keys()]) this.drop(id);
  }
}

async function dockerVersion(c: Client): Promise<string> {
  const v = await run(c, "docker version --format '{{.Server.Version}}' 2>&1");
  if (v.code === 0) return v.out.trim();
  if (/permission denied/i.test(v.out)) throw new Error('Użytkownik nie ma dostępu do Dockera. Dodaj go do grupy docker: sudo usermod -aG docker $USER (i zaloguj się ponownie).');
  if (/not found/i.test(v.out)) throw new Error('Na tym komputerze nie ma Dockera. Zainstaluj Docker Engine i spróbuj ponownie.');
  throw new Error(`Docker nie odpowiada: ${v.out.trim()}`);
}

/** Reads the agent's log until it shows a pairing code or reports that it is already paired. */
async function waitForAgent(c: Client): Promise<{ pairingCode?: string; deviceId?: string }> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const { out } = await run(c, 'docker logs --tail 200 a-bot 2>&1');
    const deviceId = out.match(/id urządzenia ([0-9a-f-]{36})/)?.[1];
    const codes = [...out.matchAll(/Kod parowania:\s+([A-Z0-9]{3}) ([A-Z0-9]{3})/g)];
    const paired = /sparowano jako/.test(out.slice(out.lastIndexOf('id urządzenia')));
    if (deviceId && paired) return { deviceId };
    if (codes.length) return { pairingCode: codes[codes.length - 1].slice(1).join(''), deviceId };
    const fatal = out.match(/✗ (.+)$/m);
    if (fatal && /konfiguracji backendu|Logowanie agenta/.test(fatal[1])) throw new Error(fatal[1]);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Agent nie zgłosił się w ciągu 2 minut. Sprawdź: docker logs a-bot');
}
