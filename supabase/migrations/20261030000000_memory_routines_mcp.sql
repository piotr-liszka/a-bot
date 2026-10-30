-- Bot memory, MCP servers, routines and bot-to-bot messages.

-- Memory: the bot keeps MEMORY.md in the sandbox; the agent mirrors it here so the app can show and edit it.
alter table public.bots add column memory text not null default '' check (char_length(memory) <= 100000);
alter table public.bots add column memory_updated_at timestamptz;
-- MCP servers the bot gets on top of the built-in ones: [{ name, command, args, env } | { name, url, headers }].
alter table public.bots add column mcp jsonb not null default '[]'::jsonb;

create policy "device updates its bots' memory" on public.bots
  for update using (device_id = auth.uid());

create function public.guard_bot_device_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.owner_id then
    if (new.owner_id, new.device_id, new.name, new.engine, new.model, new.instructions, new.color, new.mcp)
       is distinct from (old.owner_id, old.device_id, old.name, old.engine, old.model, old.instructions, old.color, old.mcp) then
      raise exception 'a device may only update bot memory';
    end if;
  end if;
  return new;
end;
$$;
create trigger bots_guard before update on public.bots
  for each row execute function public.guard_bot_device_update();

-- Routines: "every day at 8:00, check my mail". The agent on the device runs them, so they work with the app closed.
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bot_id uuid not null references public.bots (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prompt text not null check (char_length(prompt) between 1 and 8000),
  -- { "kind": "interval", "minutes": 60 } | { "kind": "daily", "time": "08:00", "days": [1,2,3,4,5] } (0 = Sunday)
  schedule jsonb not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_device_idx on public.routines (device_id) where enabled;
create index routines_bot_idx on public.routines (bot_id);

alter table public.routines enable row level security;
create policy "owner manages routines" on public.routines
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid() and b.device_id = routines.device_id)
  );
create policy "device reads its routines" on public.routines
  for select using (device_id = auth.uid());
create policy "device updates its routines' runs" on public.routines
  for update using (device_id = auth.uid());

create function public.guard_routine_device_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.owner_id then
    if (new.owner_id, new.bot_id, new.device_id, new.name, new.prompt, new.schedule, new.timezone, new.enabled)
       is distinct from (old.owner_id, old.bot_id, old.device_id, old.name, old.prompt, old.schedule, old.timezone, old.enabled) then
      raise exception 'a device may only record routine runs';
    end if;
  end if;
  return new;
end;
$$;
create trigger routines_guard before update on public.routines
  for each row execute function public.guard_routine_device_update();

alter publication supabase_realtime add table public.routines;

-- Puts a message into a bot's chat (its newest conversation, or a new one) and queues the reply.
-- Internal: callers check who may do this.
create function public.enqueue_bot_message(p_bot public.bots, p_text text)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_conv conversations;
  v_reply messages;
begin
  select * into v_conv from conversations where bot_id = p_bot.id order by updated_at desc limit 1 for update;
  if not found then
    insert into conversations (owner_id, device_id, bot_id, provider_id, title)
    values (p_bot.owner_id, p_bot.device_id, p_bot.id, p_bot.engine, left(regexp_replace(p_text, '\s+', ' ', 'g'), 60))
    returning * into v_conv;
  end if;
  if exists (select 1 from messages where conversation_id = v_conv.id and status in ('pending', 'streaming')) then
    raise exception 'bot % is busy', p_bot.name using errcode = 'P0001', hint = 'busy';
  end if;
  update conversations set
    updated_at = now(),
    busy = true,
    last_message_preview = left(regexp_replace(p_text, '\s+', ' ', 'g'), 120)
  where id = v_conv.id
  returning * into v_conv;
  insert into messages (conversation_id, owner_id, device_id, role, text, status, provider_id, model)
  values (v_conv.id, v_conv.owner_id, v_conv.device_id, 'user', p_text, 'done', v_conv.provider_id, v_conv.model);
  insert into messages (conversation_id, owner_id, device_id, role, text, status, provider_id, model, created_at)
  values (v_conv.id, v_conv.owner_id, v_conv.device_id, 'assistant', '', 'pending', v_conv.provider_id, v_conv.model, clock_timestamp())
  returning * into v_reply;
  return v_reply;
end;
$$;
revoke all on function public.enqueue_bot_message(public.bots, text) from public, anon, authenticated;

-- Called by the agent when a routine is due.
create function public.run_routine(p_routine uuid)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_routine routines;
  v_bot bots;
begin
  select * into v_routine from routines where id = p_routine and device_id = auth.uid() and enabled;
  if not found then
    raise exception 'routine not found';
  end if;
  select * into v_bot from bots where id = v_routine.bot_id;
  return enqueue_bot_message(v_bot, '⏰ ' || v_routine.name || E'\n\n' || v_routine.prompt);
end;
$$;

-- Called by a bot (through the agent's MCP tools) to message another bot of the same person on the same device.
create function public.bot_send(p_from uuid, p_to uuid, p_text text)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_from bots;
  v_to bots;
begin
  select * into v_from from bots where id = p_from and device_id = auth.uid();
  if not found then
    raise exception 'sender bot not found';
  end if;
  select * into v_to from bots where id = p_to and owner_id = v_from.owner_id and device_id = v_from.device_id;
  if not found then
    raise exception 'recipient bot not found on this device';
  end if;
  if v_to.id = v_from.id then
    raise exception 'a bot cannot message itself';
  end if;
  return enqueue_bot_message(v_to, '💬 ' || v_from.name || E':\n\n' || p_text);
end;
$$;

revoke all on function public.run_routine(uuid) from public, anon;
revoke all on function public.bot_send(uuid, uuid, text) from public, anon;
grant execute on function public.run_routine(uuid) to authenticated;
grant execute on function public.bot_send(uuid, uuid, text) to authenticated;
