-- What a bot is doing right now ("ls -la /workspace", "Reading notes.md"), shown under its name while it works.
alter table public.conversations add column activity text;
