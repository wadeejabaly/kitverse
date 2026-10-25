-- AI calls outside a bot turn (supplier photo checks, matching posts to shirts). Bot turns stay in
-- agent_runs. Both count toward "AI cost today" and the daily spend cap.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('photo_check', 'post_match')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_time on public.ai_usage (created_at);
alter table public.ai_usage enable row level security;
create policy staff_all on public.ai_usage for all to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.spend_today_usd() returns numeric
language sql stable security definer set search_path = public as $$
  with day as (select date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem' as start)
  select coalesce((select sum(cost_usd) from public.agent_runs, day where created_at >= day.start), 0)
       + coalesce((select sum(cost_usd) from public.ai_usage, day where created_at >= day.start), 0)
$$;
revoke execute on function public.spend_today_usd() from public, anon, authenticated;
grant execute on function public.spend_today_usd() to service_role;
