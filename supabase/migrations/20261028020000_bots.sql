-- Bots are created by the person: a name, an engine detected on the device (claude, codex, ollama, …),
-- an optional model and optional standing instructions. Conversations belong to a bot.

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  engine text not null,
  model text,
  instructions text check (instructions is null or char_length(instructions) <= 8000),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bots_owner_idx on public.bots (owner_id, created_at);

alter table public.bots enable row level security;

create policy "owner manages bots" on public.bots
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid())
  );
create policy "device reads its bots" on public.bots
  for select using (device_id = auth.uid());

alter table public.conversations add column bot_id uuid references public.bots (id) on delete cascade;
create index conversations_bot_idx on public.conversations (bot_id, updated_at desc);

alter publication supabase_realtime add table public.bots;
