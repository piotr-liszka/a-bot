import type { DeviceRow } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkerForm } from './WorkerForm';

/** Desktop and terminal need SSH access to the worker; ask for it in place. */
export function NeedsWorker({ db, device, view, onLinked }: { db: SupabaseClient; device: DeviceRow; view: 'desktop' | 'terminal'; onLinked: () => void }) {
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 680 }}>
          <div>
            <h1>{view === 'desktop' ? 'Pulpit' : 'Terminal'} na „{device.name}”</h1>
            <p className="page-lede">
              {view === 'desktop' ? 'Pulpit sandboxa' : 'Terminal w sandboxie'} otwieram przez SSH z tego komputera. Podaj dane dostępu do workera. Przy okazji zainstaluję
              aktualną wersję sandboxa; historia i logowania botów zostają.
            </p>
          </div>
          <WorkerForm db={db} device={device} onDone={() => onLinked()} />
        </div>
      </div>
    </main>
  );
}
