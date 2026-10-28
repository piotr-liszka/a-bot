import { useCallback, useEffect, useRef, useState } from 'react';
import { activeBackend } from './backend';
import { bridge, bridgeError, type WorkerInfo } from './desktopApi';

/** SSH workers saved on this computer. Empty in the web build. */
export function useWorkers() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const reload = useCallback(async () => {
    const b = bridge();
    if (b) setWorkers(await b.workers.list());
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { workers, reload };
}

export type WorkerUpdate = { state: 'updating' } | { state: 'error'; message: string };

/**
 * Keeps every worker on the sandbox bundled with this app: once per app start, a worker that runs an older
 * version (or whose container is gone) is reinstalled in the background. Waits while its bots are working.
 */
export function useAutoUpdate(workers: WorkerInfo[], busyDevices: Set<string>): Map<string, WorkerUpdate> {
  const [updates, setUpdates] = useState<Map<string, WorkerUpdate>>(new Map());
  const started = useRef(new Set<string>());

  useEffect(() => {
    const api = bridge();
    const backend = activeBackend();
    if (!api || !backend) return;
    for (const w of workers) {
      if (!w.deviceId || busyDevices.has(w.deviceId) || started.current.has(w.id)) continue;
      started.current.add(w.id);
      const set = (u: WorkerUpdate | undefined) =>
        setUpdates((prev) => {
          const next = new Map(prev);
          if (u) next.set(w.deviceId!, u);
          else next.delete(w.deviceId!);
          return next;
        });
      (async () => {
        if (!(await api.workers.outdated(w.id))) return;
        set({ state: 'updating' });
        try {
          await api.workers.install(w.id, { backendUrl: backend.url, anonKey: backend.anonKey });
          set(undefined);
        } catch (err) {
          set({ state: 'error', message: bridgeError(err) });
        }
      })();
    }
  }, [workers, busyDevices]);

  return updates;
}
