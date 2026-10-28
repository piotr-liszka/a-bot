import type { MessageStep, ProviderInfo, ProviderKind } from '@a-bot/shared';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface RunEmitter {
  /** Append streamed assistant text. */
  text(delta: string): void;
  /** Insert or update a step (tool call, command, …) by id. */
  step(step: MessageStep): void;
  /** Provider-side session id, stored on the conversation so the next turn can resume it. */
  session(id: string): void;
  usage(usage: { inputTokens?: number; outputTokens?: number; costUsd?: number }): void;
}

export interface RunContext {
  prompt: string;
  /** Earlier turns of the conversation, oldest first, without the current prompt. */
  history: ChatTurn[];
  model?: string;
  /** Standing instructions from the bot definition. */
  instructions?: string;
  sessionId?: string;
  cwd: string;
  signal: AbortSignal;
  emit: RunEmitter;
}

export interface Provider {
  id: string;
  kind: ProviderKind;
  detect(): Promise<ProviderInfo>;
  run(ctx: RunContext): Promise<void>;
}

export class ProviderError extends Error {}
