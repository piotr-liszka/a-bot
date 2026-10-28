import { useCallback, useEffect, useState } from 'react';
import { bridge, type WorkerInfo } from './desktopApi';

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
