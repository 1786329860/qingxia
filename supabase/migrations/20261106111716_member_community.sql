create table public.qingxia_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  content text not null check (char_length(content) between 1 and 500),
  reply text check (char_length(reply) between 1 and 500),
  created_at timestamptz not null default now()
);
create index qingxia_notes_recent on public.qingxia_notes (created_at desc, id desc);
create index qingxia_notes_author on public.qingxia_notes (author_id);

create table public.qingxia_gifs (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 60),
  created_at timestamptz not null default now(),
  published boolean not null default false
);

create table public.qingxia_member_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default ((now() at time zone 'Asia/Shanghai')::date),
  primary key (user_id, day)
);
create index qingxia_member_days_day on public.qingxia_member_days (day);

alter table public.qingxia_notes enable row level security;
alter table public.qingxia_gifs enable row level security;
alter table public.qingxia_member_days enable row level security;
revoke all on public.qingxia_notes, public.qingxia_gifs, public.qingxia_member_days
  from public, anon, authenticated;
grant select, insert, update, delete on public.qingxia_notes, public.qingxia_gifs,
  public.qingxia_member_days to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qingxia-gifs', 'qingxia-gifs', false, 2097152, array['image/gif']);

create function public.qingxia_reserve_gif(p_id uuid, p_title text)
returns boolean language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(56271717);
  if (select count(*) from public.qingxia_gifs) >= 100 then
    return false;
  end if;
  insert into public.qingxia_gifs (id, title) values (p_id, p_title);
  return true;
end;
$$;

create function public.qingxia_member_activity(p_user uuid)
returns void language sql set search_path = '' as $$
  insert into public.qingxia_member_days (user_id) values (p_user)
  on conflict do nothing;
$$;

create function public.qingxia_member_stats(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'registered', (select count(*) from auth.users
                   where email_confirmed_at is not null and not is_anonymous),
    'newRegistrations', (select count(*) from auth.users
                         where email_confirmed_at >= p_from and email_confirmed_at < p_to
                         and not is_anonymous),
    'logins', (select count(*) from auth.audit_log_entries a
               where a.created_at >= p_from and a.created_at < p_to
                 and a.payload ->> 'action' = 'login'),
    'active', (select count(distinct user_id) from public.qingxia_member_days
               where day >= (p_from at time zone 'Asia/Shanghai')::date
                 and day < (p_to at time zone 'Asia/Shanghai')::date)
  );
$$;

revoke all on function public.qingxia_reserve_gif(uuid, text),
  public.qingxia_member_activity(uuid), public.qingxia_member_stats(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.qingxia_reserve_gif(uuid, text),
  public.qingxia_member_activity(uuid), public.qingxia_member_stats(timestamptz, timestamptz)
  to service_role;

-- Preserve the existing daily schedule and previous cleanup rules.
create or replace function public.qingxia_cleanup()
returns void language sql security invoker set search_path = '' as $$
  delete from public.qingxia_events where created_at < now() - interval '90 days';
  delete from public.qingxia_rate_buckets where expires_at < now() - interval '1 day';
  delete from public.qingxia_member_days
  where day < (now() at time zone 'Asia/Shanghai')::date - 92;
$$;
