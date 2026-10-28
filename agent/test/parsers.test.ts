import type { MessageStep } from '@a-bot/shared';
import { upsertStep } from '@a-bot/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClaudeParser } from '../src/providers/claude.js';
import { createCodexParser } from '../src/providers/codex.js';
import type { RunEmitter } from '../src/providers/types.js';

function recorder() {
  const out = { text: '', steps: [] as MessageStep[], session: '', usage: {} as Record<string, unknown> };
  const emit: RunEmitter = {
    text: (d) => (out.text += d),
    step: (s) => (out.steps = upsertStep(out.steps, s)),
    session: (id) => (out.session = id),
    usage: (u) => Object.assign(out.usage, u),
  };
  return { out, emit };
}

test('claude stream-json: streamed text, tool call lifecycle, session and usage', () => {
  const { out, emit } = recorder();
  const p = createClaudeParser(emit);
  const lines = [
    { type: 'system', subtype: 'init', session_id: 'sess-1' },
    { type: 'stream_event', event: { type: 'message_start' } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Sprawdzam ' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pliki.' } } },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Sprawdzam pliki.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls -la', description: 'List files' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a.txt\nb.txt' }] } },
    { type: 'stream_event', event: { type: 'message_start' } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Są dwa pliki.' } } },
    { type: 'result', subtype: 'success', is_error: false, result: 'Są dwa pliki.', session_id: 'sess-1', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } },
  ];
  lines.forEach((l) => p.handle(JSON.stringify(l)));
  p.handle('not json');
  assert.equal(out.text, 'Sprawdzam pliki.\n\nSą dwa pliki.');
  assert.equal(out.session, 'sess-1');
  assert.deepEqual(out.steps, [{ id: 't1', kind: 'command', title: 'ls -la', detail: 'List files', output: 'a.txt\nb.txt', status: 'done' }]);
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
  assert.equal(p.state.error, undefined);
});

test('claude: falls back to the result text and reports errors', () => {
  const { out, emit } = recorder();
  const p = createClaudeParser(emit);
  p.handle(JSON.stringify({ type: 'result', is_error: true, subtype: 'error_during_execution', result: 'Limit wyczerpany' }));
  assert.equal(out.text, 'Limit wyczerpany');
  assert.equal(p.state.error, 'Limit wyczerpany');
});

test('codex exec --json: thread id, commands, messages, failures', () => {
  const { out, emit } = recorder();
  const p = createCodexParser(emit);
  const lines = [
    { type: 'thread.started', thread_id: 'th-9' },
    { type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'bash -lc ls', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'bash -lc ls', aggregated_output: 'x\n', exit_code: 0, status: 'completed' } },
    { type: 'item.completed', item: { id: 'i2', type: 'agent_message', text: 'Gotowe.' } },
    { type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 4 } },
  ];
  lines.forEach((l) => p.handle(JSON.stringify(l)));
  assert.equal(out.session, 'th-9');
  assert.equal(out.text, 'Gotowe.');
  assert.equal(out.steps[0].status, 'done');
  assert.equal(out.steps[0].output, 'x\n');
  p.handle(JSON.stringify({ type: 'turn.failed', error: { message: 'usage limit' } }));
  assert.equal(p.state.error, 'usage limit');
});
