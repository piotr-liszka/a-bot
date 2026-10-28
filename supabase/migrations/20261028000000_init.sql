-- a-bot schema
--
-- People sign in to the desktop app and own their devices, conversations and messages.
-- A device agent signs in anonymously; its auth uid becomes the device id. After pairing
-- it may read and update its own device row and the conversations and messages routed to it.

create extension if not exists pgcrypto;

-- Devices -------------------------------------------------------------------

create table public.devices (
  id uuid primary key references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'offline' check (status in ('online', 'offline')),
  last_seen timestamptz,
  hostname text,
  platform text,
  agent_version text,
  workspace text,
  providers jsonb not null default '[]'::jsonb,
  refresh_requested_at timestamptz,
  created_at timestamptz not null default now()
);

create index devices_owner_idx on public.devices (owner_id);

-- Pairing handshake: the agent publishes a short code, the person types it in the app.
create table public.pairings (
  code text primary key,
  agent_id uuid not null unique references auth.users (id) on delete cascade,
  device_name text not null,
  hostname text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

-- Conversations and messages --------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  provider_id text not null,
  model text,
  title text not null default 'Nowa rozmowa',
  provider_session_id text,
  busy boolean not null default false,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_owner_updated_idx on public.conversations (owner_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null default '',
  status text not null default 'done' check (status in ('pending', 'streaming', 'done', 'error', 'cancelled')),
  provider_id text not null,
  model text,
  steps jsonb not null default '[]'::jsonb,
  error text,
  cancel_requested boolean not null default false,
  usage jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_device_pending_idx on public.messages (device_id) where status in ('pending', 'streaming');

-- Row level security ----------------------------------------------------------

alter table public.devices enable row level security;
alter table public.pairings enable row level security; -- no policies: only reachable through functions
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "owner or device reads device" on public.devices
  for select using (owner_id = auth.uid() or id = auth.uid());
create policy "owner or device updates device" on public.devices
  for update using (owner_id = auth.uid() or id = auth.uid());
create policy "owner deletes device" on public.devices
  for delete using (owner_id = auth.uid());

create policy "owner manages conversations" on public.conversations
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid())
  );
create policy "device reads routed conversations" on public.conversations
  for select using (device_id = auth.uid());
create policy "device updates routed conversations" on public.conversations
  for update using (device_id = auth.uid());

create policy "owner manages messages" on public.messages
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = auth.uid() and c.device_id = device_id
    )
  );
create policy "device reads routed messages" on public.messages
  for select using (device_id = auth.uid());
create policy "device updates assistant messages" on public.messages
  for update using (device_id = auth.uid() and role = 'assistant');

-- Devices may only touch runtime fields; ownership and routing stay fixed.
create function public.guard_device_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.owner_id then
    if tg_table_name = 'devices' then
      if new.owner_id <> old.owner_id or new.name <> old.name or new.id <> old.id then
        raise exception 'device cannot change ownership or name';
      end if;
    elsif tg_table_name = 'conversations' then
      if new.owner_id <> old.owner_id or new.device_id <> old.device_id or new.provider_id <> old.provider_id then
        raise exception 'device cannot reroute a conversation';
      end if;
    elsif tg_table_name = 'messages' then
      if new.owner_id <> old.owner_id or new.device_id <> old.device_id
         or new.conversation_id <> old.conversation_id or new.role <> old.role then
        raise exception 'device cannot reroute a message';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger devices_guard before update on public.devices
  for each row execute function public.guard_device_update();
create trigger conversations_guard before update on public.conversations
  for each row execute function public.guard_device_update();
create trigger messages_guard before update on public.messages
  for each row execute function public.guard_device_update();

-- Functions -------------------------------------------------------------------

create function public.is_anonymous() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- Called by the agent. Returns a fresh 6-character code, replacing any earlier one.
create function public.create_pairing(p_device_name text, p_hostname text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from pairings where agent_id = auth.uid() or expires_at < now();
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from pairings where code = v_code);
  end loop;
  insert into pairings (code, agent_id, device_name, hostname)
  values (v_code, auth.uid(), left(coalesce(nullif(trim(p_device_name), ''), 'Urządzenie'), 80), p_hostname);
  return v_code;
end;
$$;

-- Called by the app with the code shown by the agent. Creates the device row.
create function public.claim_pairing(p_code text)
returns public.devices
language plpgsql security definer set search_path = public as $$
declare
  v_pairing pairings;
  v_device devices;
begin
  if auth.uid() is null or public.is_anonymous() then
    raise exception 'sign in to pair a device';
  end if;
  select * into v_pairing from pairings
   where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) and expires_at > now()
   for update;
  if not found then
    raise exception 'Kod jest nieprawidłowy albo wygasł.' using errcode = 'P0002';
  end if;
  insert into devices (id, owner_id, name, hostname)
  values (v_pairing.agent_id, auth.uid(), v_pairing.device_name, v_pairing.hostname)
  on conflict (id) do update set owner_id = excluded.owner_id
  returning * into v_device;
  delete from pairings where code = v_pairing.code;
  return v_device;
end;
$$;

-- Called by the app. Inserts the user message and the pending assistant reply in one go.
create function public.send_message(p_conversation_id uuid, p_text text, p_model text default null)
returns public.messages
language plpgsql security invoker set search_path = public as $$
declare
  v_conv conversations;
  v_reply messages;
begin
  select * into v_conv from conversations where id = p_conversation_id and owner_id = auth.uid();
  if not found then
    raise exception 'conversation not found';
  end if;
  if exists (select 1 from messages where conversation_id = v_conv.id and status in ('pending', 'streaming')) then
    raise exception 'Bot jeszcze odpowiada na poprzednią wiadomość.';
  end if;
  update conversations set
    model = coalesce(p_model, model),
    updated_at = now(),
    busy = true,
    last_message_preview = left(regexp_replace(p_text, '\s+', ' ', 'g'), 120),
    title = case when title = 'Nowa rozmowa' then left(regexp_replace(p_text, '\s+', ' ', 'g'), 60) else title end
  where id = v_conv.id
  returning * into v_conv;
  insert into messages (conversation_id, device_id, role, text, status, provider_id, model)
  values (v_conv.id, v_conv.device_id, 'user', p_text, 'done', v_conv.provider_id, v_conv.model);
  -- clock_timestamp() keeps the reply ordered after the prompt within one transaction.
  insert into messages (conversation_id, device_id, role, text, status, provider_id, model, created_at)
  values (v_conv.id, v_conv.device_id, 'assistant', '', 'pending', v_conv.provider_id, v_conv.model, clock_timestamp())
  returning * into v_reply;
  return v_reply;
end;
$$;

revoke all on function public.create_pairing(text, text) from public, anon;
revoke all on function public.claim_pairing(text) from public, anon;
revoke all on function public.send_message(uuid, text, text) from public, anon;
grant execute on function public.create_pairing(text, text) to authenticated;
grant execute on function public.claim_pairing(text) to authenticated;
grant execute on function public.send_message(uuid, text, text) to authenticated;

-- Realtime ---------------------------------------------------------------------

alter publication supabase_realtime add table public.devices, public.conversations, public.messages;
