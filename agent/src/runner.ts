import { upsertStep, type BotRow, type ConversationRow, type MessageRow, type MessageStep, type MessageUsage } from '@a-bot/shared';
import type { Db } from './backend.js';
import { log } from './log.js';
import { ProviderError, type ChatTurn, type Provider } from './providers/index.js';

const FLUSH_MS = 350;

/** Executes pending assistant messages routed to this device, streaming progress back into the row. */
export class JobRunner {
  private running = new Map<string, AbortController>();
  private busyConversations = new Set<string>();
  private queue: MessageRow[] = [];

  constructor(
    private db: Db,
    private deviceId: string,
    private providers: () => Map<string, Provider>,
    private workspace: string,
    private maxParallel: number,
  ) {}

  get activeCount(): number {
    return this.running.size;
  }

  /** Messages left mid-run by a previous agent process can never finish; close them out. */
  async recoverInterrupted(): Promise<void> {
    const { data } = await this.db
      .from('messages')
      .update({ status: 'error', error: 'The agent restarted while answering.', finished_at: new Date().toISOString() })
      .eq('device_id', this.deviceId)
      .eq('status', 'streaming')
      .select('conversation_id');
    for (const row of data ?? []) {
      await this.updateConversation(row.conversation_id, { busy: false, activity: null });
    }
  }

  /** Updates a conversation; on a database without the newer `activity` column, retries without it. */
  private async updateConversation(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('conversations').update(patch).eq('id', id);
    if (error && 'activity' in patch && /activity/.test(error.message)) {
      const { activity: _activity, ...rest } = patch;
      if (Object.keys(rest).length) await this.db.from('conversations').update(rest).eq('id', id);
    }
  }

  async pickUpPending(): Promise<void> {
    const { data, error } = await this.db
      .from('messages')
      .select('*')
      .eq('device_id', this.deviceId)
      .eq('role', 'assistant')
      .eq('status', 'pending')
      .order('created_at');
    if (error) throw new Error(`Cannot fetch jobs: ${error.message}`);
    for (const m of (data ?? []) as MessageRow[]) this.enqueue(m);
  }

  enqueue(message: MessageRow): void {
    if (message.role !== 'assistant' || message.status !== 'pending') return;
    if (this.running.has(message.id) || this.queue.some((m) => m.id === message.id)) return;
    this.queue.push(message);
    this.drain();
  }

  cancel(messageId: string): void {
    const ctl = this.running.get(messageId);
    if (ctl) {
      log.info(`cancelling ${messageId}`);
      ctl.abort();
    } else {
      this.queue = this.queue.filter((m) => m.id !== messageId);
    }
  }

  cancelAll(): void {
    for (const ctl of this.running.values()) ctl.abort();
  }

  private drain(): void {
    while (this.running.size < this.maxParallel) {
      const idx = this.queue.findIndex((m) => !this.busyConversations.has(m.conversation_id));
      if (idx === -1) return;
      const [next] = this.queue.splice(idx, 1);
      const ctl = new AbortController();
      this.running.set(next.id, ctl);
      this.busyConversations.add(next.conversation_id);
      this.execute(next, ctl)
        .catch((err) => log.error(`job ${next.id}: ${String(err)}`))
        .finally(() => {
          this.running.delete(next.id);
          this.busyConversations.delete(next.conversation_id);
          this.drain();
        });
    }
  }

  private async execute(message: MessageRow, ctl: AbortController): Promise<void> {
    // Claim the message; another agent process for the same device loses the race.
    const { data: claimed } = await this.db
      .from('messages')
      .update({ status: 'streaming' })
      .eq('id', message.id)
      .eq('status', 'pending')
      .select('id');
    if (!claimed?.length) return;

    const { data: conv, error: convErr } = await this.db.from('conversations').select('*').eq('id', message.conversation_id).single<ConversationRow>();
    if (convErr || !conv) throw new Error(`brak rozmowy ${message.conversation_id}: ${convErr?.message}`);

    const { data: earlier } = await this.db
      .from('messages')
      .select('role,text,status,created_at')
      .eq('conversation_id', conv.id)
      .lt('created_at', message.created_at)
      .order('created_at');
    const turns = ((earlier ?? []) as Pick<MessageRow, 'role' | 'text' | 'status'>[]).filter((m) => m.role === 'user' || m.status === 'done');
    const lastUser = turns.length && turns[turns.length - 1].role === 'user' ? turns.pop()! : undefined;
    const history: ChatTurn[] = turns.map((t) => ({ role: t.role, text: t.text }));

    let text = '';
    let steps: MessageStep[] = [];
    let usage: MessageUsage | null = null;
    let sessionId = conv.provider_session_id ?? undefined;
    let dirty = false;
    let activity: string | null = null;
    let flushing: Promise<unknown> = Promise.resolve();
    const flush = () => {
      if (!dirty) return flushing;
      dirty = false;
      const patch = { text, steps };
      const current = [...steps].reverse().find((s) => s.status === 'running' && s.kind !== 'thinking')?.title ?? null;
      const activityChanged = current !== activity;
      activity = current;
      flushing = flushing.then(async () => {
        await this.db.from('messages').update(patch).eq('id', message.id);
        if (activityChanged) await this.updateConversation(conv.id, { activity: current });
      });
      return flushing;
    };
    const timer = setInterval(flush, FLUSH_MS);

    let bot: BotRow | null = null;
    if (conv.bot_id) {
      const { data } = await this.db.from('bots').select('*').eq('id', conv.bot_id).maybeSingle<BotRow>();
      bot = data;
    }
    const provider = this.providers().get(conv.provider_id);
    const model = message.model ?? conv.model ?? bot?.model ?? undefined;
    log.info(`→ ${conv.provider_id}${model ? `/${model}` : ''} in "${conv.title}"`);
    let status: MessageRow['status'] = 'done';
    let errorText: string | null = null;
    try {
      if (!provider) throw new ProviderError(`Engine "${conv.provider_id}" is not available on this device.`);
      if (!lastUser) throw new ProviderError('There is no message to answer.');
      await provider.run({
        prompt: lastUser.text,
        history,
        model,
        instructions: bot?.instructions ?? undefined,
        sessionId,
        cwd: this.workspace,
        signal: ctl.signal,
        emit: {
          text: (delta) => {
            text += delta;
            dirty = true;
          },
          step: (s) => {
            steps = upsertStep(steps, s);
            dirty = true;
          },
          session: (id) => {
            sessionId = id;
          },
          usage: (u) => {
            usage = { ...(usage ?? {}), ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)) };
          },
        },
      });
      if (ctl.signal.aborted) status = 'cancelled';
    } catch (err) {
      if (ctl.signal.aborted) {
        status = 'cancelled';
      } else {
        status = 'error';
        errorText = err instanceof Error ? err.message : String(err);
        log.warn(`error: ${errorText}`);
      }
    } finally {
      clearInterval(timer);
    }
    steps = steps.map((s) => (s.status === 'running' ? { ...s, status: status === 'done' ? 'done' : 'error' } : s));
    await flushing;
    await this.db
      .from('messages')
      .update({ text, steps, usage, status, error: errorText, finished_at: new Date().toISOString() })
      .eq('id', message.id);
    const preview = (text || errorText || '').replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '').replace(/`{3}\w*/g, '').replace(/[`*_#>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    await this.updateConversation(conv.id, {
      busy: false,
      activity: null,
      provider_session_id: sessionId ?? null,
      updated_at: new Date().toISOString(),
      ...(preview ? { last_message_preview: preview } : {}),
    });
    log.info(`✓ ${status} (${text.length} chars, ${steps.length} steps)`);
  }
}
