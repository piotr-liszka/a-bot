import type { DeviceRow } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkerForm } from './WorkerForm';
import { t } from '../lib/i18n';

/** Desktop and terminal need SSH access to the worker; ask for it in place. */
export function NeedsWorker({ db, device, view, onLinked }: { db: SupabaseClient; device: DeviceRow; view: 'desktop' | 'terminal'; onLinked: () => void }) {
  return (
    <main className="chat">
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 680 }}>
          <div>
            <h1>{t(view === 'desktop' ? 'Desktop on “{device}”' : 'Terminal on “{device}”', { device: device.name })}</h1>
            <p className="page-lede">
              {t('The desktop and terminal open over SSH from this computer. Enter the worker’s access details. The current sandbox gets installed along the way; history and bot sign-ins stay.')}
            </p>
          </div>
          <WorkerForm db={db} device={device} onDone={() => onLinked()} />
        </div>
      </div>
    </main>
  );
}
