-- Bot support (2026-10-01): simulator channel, supplier cover hash, public media bucket,
-- spend/usage helpers.

-- local test chats run through the same pipeline as Instagram ones
alter table public.conversations drop constraint conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('instagram','simulator'));

-- supplier photo id, used to mirror the photo into our storage on first use
alter table public.products add column supplier_cover text;

-- what the bot sent / will send as photos (product ids), stored with the outgoing message
alter table public.messages add column product_ids uuid[] not null default '{}';

-- public bucket for product photos and saved copies of customer media / stories
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- today's AI spend (Israel day) - used by the daily alert / stop caps
create or replace function public.spend_today_usd() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0)
  from public.agent_runs
  where created_at >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')
$$;
revoke execute on function public.spend_today_usd() from public, anon, authenticated;
grant execute on function public.spend_today_usd() to service_role;
