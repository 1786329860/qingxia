-- 在 Supabase SQL Editor 中执行。表无匿名读写权限；只由 Vercel 服务端 service_role 使用。
begin;
create table if not exists public.qingxia_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('pageview','tool_use')),
  visitor_hash text not null check (length(visitor_hash)=64),
  path text,
  tool_id text,
  outcome text check (outcome in ('success','error')),
  check ((event_type='pageview' and path is not null and tool_id is null and outcome is null) or (event_type='tool_use' and path is null and tool_id is not null and outcome is not null))
);
create index if not exists qingxia_events_created_at on public.qingxia_events(created_at);
create index if not exists qingxia_events_tool on public.qingxia_events(tool_id,created_at) where event_type='tool_use';
alter table public.qingxia_events enable row level security;
revoke all on public.qingxia_events from anon, authenticated;
grant select,insert,delete on public.qingxia_events to service_role;
grant usage,select on sequence public.qingxia_events_id_seq to service_role;
create table if not exists public.qingxia_rate_buckets (
  key text primary key,
  hits integer not null default 1,
  expires_at timestamptz not null
);
alter table public.qingxia_rate_buckets enable row level security;
revoke all on public.qingxia_rate_buckets from anon, authenticated;
grant all on public.qingxia_rate_buckets to service_role;
create or replace function public.qingxia_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_hits integer;
begin
  if p_limit < 1 or p_limit > 1000 or p_seconds < 1 or p_seconds > 86400 then return false; end if;
  insert into public.qingxia_rate_buckets(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set
    hits=case when qingxia_rate_buckets.expires_at <= now() then 1 else qingxia_rate_buckets.hits+1 end,
    expires_at=case when qingxia_rate_buckets.expires_at <= now() then now()+make_interval(secs=>p_seconds) else qingxia_rate_buckets.expires_at end
  returning hits into current_hits;
  return current_hits <= p_limit;
end $$;
revoke all on function public.qingxia_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.qingxia_rate_limit(text,integer,integer) to service_role;
create or replace function public.qingxia_stats(p_from timestamptz,p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
with filtered as (
  select *, (created_at at time zone 'Asia/Shanghai')::date as local_day from public.qingxia_events where created_at >= p_from and created_at < p_to
), days as (
  select local_day::text as day,count(*) filter(where event_type='pageview') as views,
    count(distinct visitor_hash) filter(where event_type='pageview') as visitors,
    count(*) filter(where event_type='tool_use') as uses from filtered group by local_day order by local_day
), hours as (
  select to_char(date_trunc('hour',created_at at time zone 'Asia/Shanghai'),'YYYY-MM-DD HH24:00') as hour,
    count(*) filter(where event_type='pageview') as views,count(distinct visitor_hash) filter(where event_type='pageview') as visitors,
    count(*) filter(where event_type='tool_use') as uses from filtered group by 1 order by 1
), tools as (
  select tool_id as id,count(*) as uses,count(*) filter(where outcome='success') as success,
    count(*) filter(where outcome='error') as errors from filtered where event_type='tool_use' group by tool_id order by uses desc
)
select jsonb_build_object(
  'summary',jsonb_build_object('views',(select count(*) from filtered where event_type='pageview'),
    'visitors',(select coalesce(sum(visitors),0) from days),'uses',(select count(*) from filtered where event_type='tool_use'),
    'success',(select count(*) from filtered where event_type='tool_use' and outcome='success')),
  'daily',coalesce((select jsonb_agg(to_jsonb(days)) from days),'[]'::jsonb),
  'hourly',coalesce((select jsonb_agg(to_jsonb(hours)) from hours),'[]'::jsonb),
  'tools',coalesce((select jsonb_agg(to_jsonb(tools)) from tools),'[]'::jsonb)
);
$$;
revoke all on function public.qingxia_stats(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.qingxia_stats(timestamptz,timestamptz) to service_role;
create or replace function public.qingxia_cleanup()
returns void language sql security invoker set search_path = public, pg_temp as $$
  delete from public.qingxia_events where created_at < now()-interval '90 days';
  delete from public.qingxia_rate_buckets where expires_at < now()-interval '1 day';
$$;
revoke all on function public.qingxia_cleanup() from public,anon,authenticated;
grant execute on function public.qingxia_cleanup() to service_role;
commit;
