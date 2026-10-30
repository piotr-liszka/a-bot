import { nextRun, type RoutineRow } from '@a-bot/shared';
import type { Db } from './backend.js';
import { log } from './log.js';

/** Runs the device's due routines. Called every 30 s; the schedule lives in the database, so it survives restarts. */
export async function tickRoutines(db: Db, deviceId: string): Promise<void> {
  const { data, error } = await db.from('routines').select('*').eq('device_id', deviceId).eq('enabled', true);
  if (error) {
    if (!/routines/.test(error.message)) log.warn(`routines: ${error.message}`);
    return;
  }
  const now = new Date();
  for (const r of (data ?? []) as RoutineRow[]) {
    if (!r.next_run_at || Number.isNaN(Date.parse(r.next_run_at))) {
      await db.from('routines').update({ next_run_at: nextRun(r.schedule, r.timezone, now).toISOString() }).eq('id', r.id);
      continue;
    }
    if (Date.parse(r.next_run_at) > now.getTime()) continue;
    const { error: runError } = await db.rpc('run_routine', { p_routine: r.id });
    if (runError && /busy/.test(runError.message)) {
      // The bot is answering something else; try again in a minute.
      await db.from('routines').update({ next_run_at: new Date(now.getTime() + 60_000).toISOString(), last_status: 'waiting: bot busy' }).eq('id', r.id);
      continue;
    }
    log.info(`routine "${r.name}"${runError ? ` failed: ${runError.message}` : ' started'}`);
    await db
      .from('routines')
      .update({ last_run_at: now.toISOString(), last_status: runError ? `error: ${runError.message}` : 'started', next_run_at: nextRun(r.schedule, r.timezone, now).toISOString() })
      .eq('id', r.id);
  }
}
