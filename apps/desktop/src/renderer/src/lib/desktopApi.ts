// Bridge to the Electron main process (SSH workers, desktop tunnel, terminals). Absent in the web build.

export type AuthMethod = 'agent' | 'key' | 'password';

export interface WorkerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  keyPath?: string;
  secret?: string;
  workspaceDir: string;
}

export interface WorkerInfo extends Omit<WorkerInput, 'secret'> {
  id: string;
  deviceId?: string;
  hasSecret: boolean;
}

export type InstallStep = 'connect' | 'docker' | 'upload' | 'build' | 'start' | 'pair';

export interface InstallEvent {
  workerId: string;
  step: InstallStep;
  status: 'running' | 'done' | 'error';
  log?: string;
  error?: string;
}

interface DesktopBridge {
  platform: string;
  isDesktop: boolean;
  workers: {
    list(): Promise<WorkerInfo[]>;
    save(input: WorkerInput & { id?: string }): Promise<WorkerInfo>;
    remove(id: string): Promise<void>;
    link(id: string, deviceId: string): Promise<void>;
    test(input: WorkerInput): Promise<{ docker: string }>;
    install(id: string, opts: { backendUrl: string; anonKey: string }): Promise<{ pairingCode?: string; deviceId?: string }>;
    desktop(id: string): Promise<{ url: string; password: string }>;
    exec(id: string, command: 'browser' | 'restart'): Promise<void>;
    onProgress(listener: (e: InstallEvent) => void): () => void;
  };
  terminal: {
    open(id: string, cols: number, rows: number): Promise<string>;
    write(termId: string, data: string): void;
    resize(termId: string, cols: number, rows: number): void;
    close(termId: string): void;
    onData(listener: (e: { termId: string; data: string }) => void): () => void;
    onExit(listener: (e: { termId: string }) => void): () => void;
  };
}

declare global {
  interface Window {
    abot?: DesktopBridge;
  }
}

export function bridge(): DesktopBridge | undefined {
  return window.abot?.workers ? window.abot : undefined;
}

/** Electron prefixes errors thrown in the main process; show only our message. */
export function bridgeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
