import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Run a command to completion and capture its output. Never throws for a missing binary. */
export function exec(cmd: string, args: string[], opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 15_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr || err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function which(cmd: string): Promise<string | undefined> {
  const res = await exec('sh', ['-c', `command -v ${cmd}`]);
  return res.code === 0 ? res.stdout.trim() || undefined : undefined;
}

export interface StreamOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal: AbortSignal;
  stdin?: string;
  onLine: (line: string) => void;
  onStderr?: (chunk: string) => void;
}

/**
 * Spawn a long-running command in its own process group, feeding stdout to onLine.
 * Aborting the signal kills the whole group (CLIs spawn their own children).
 */
export function streamLines(cmd: string, args: string[], opts: StreamOptions): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: [opts.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      detached: true,
    });
    const kill = () => {
      if (child.pid === undefined || child.exitCode !== null) return;
      try {
        process.kill(-child.pid, 'SIGTERM');
        setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            // already gone
          }
        }, 3000).unref();
      } catch {
        child.kill('SIGTERM');
      }
    };
    if (opts.signal.aborted) kill();
    opts.signal.addEventListener('abort', kill, { once: true });
    if (opts.stdin !== undefined && child.stdin) {
      child.stdin.end(opts.stdin);
    }
    createInterface({ input: child.stdout! }).on('line', (line) => opts.onLine(line));
    child.stderr!.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
      opts.onStderr?.(s);
    });
    child.on('error', (err) => {
      opts.signal.removeEventListener('abort', kill);
      reject(err);
    });
    child.on('close', (code) => {
      opts.signal.removeEventListener('abort', kill);
      resolve({ code, stderr });
    });
  });
}

export function tail(text: string, max = 4000): string {
  return text.length > max ? `…\n${text.slice(-max)}` : text;
}
