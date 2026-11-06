create table public.qingxia_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient text not null check (char_length(recipient) between 3 and 254),
  recipient_name text not null check (char_length(recipient_name) between 1 and 40),
  message text not null check (char_length(message) between 1 and 500),
  template text not null check (template in ('birthday','anniversary','letter')),
  due_at timestamptz not null,
  state text not null check (state in ('awaiting','queued','sending','sent','failed','uncertain','cancelled','expired')),
  confirmation_hash text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);
create index qingxia_reminders_owner on public.qingxia_reminders (owner_id, created_at desc);
create index qingxia_reminders_due on public.qingxia_reminders (due_at) where state in ('queued','awaiting');
create index qingxia_reminders_claims on public.qingxia_reminders (claimed_at) where claimed_at is not null;
create unique index qingxia_reminders_invite on public.qingxia_reminders (confirmation_hash) where confirmation_hash is not null;
alter table public.qingxia_reminders enable row level security;
revoke all on public.qingxia_reminders from public, anon, authenticated;
grant select, insert, update, delete on public.qingxia_reminders to service_role;

create function public.qingxia_create_reminder(
  p_owner uuid, p_recipient text, p_name text, p_message text, p_template text,
  p_due timestamptz, p_hash text
) returns uuid language plpgsql set search_path = '' as $$
declare result uuid;
begin
  if p_due < now() + interval '2 minutes' or p_due > now() + interval '365 days' then
    raise exception 'REMINDER_DATE';
  end if;
  perform pg_advisory_xact_lock(14857301);
  if (select count(*) from public.qingxia_reminders where owner_id = p_owner and created_at > now()-interval '1 day') >= 4
    or (select count(*) from public.qingxia_reminders where owner_id = p_owner and state in ('awaiting','queued','sending')) >= 12
    or (select count(*) from public.qingxia_reminders where state in ('awaiting','queued','sending')) >= 500
  then return null; end if;
  insert into public.qingxia_reminders(owner_id,recipient,recipient_name,message,template,due_at,state,confirmation_hash)
  values(p_owner,p_recipient,p_name,p_message,p_template,p_due,
    case when p_hash is null then 'queued' else 'awaiting' end, p_hash) returning id into result;
  return result;
end;
$$;

create function public.qingxia_claim_reminder()
returns setof public.qingxia_reminders language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(14857302);
  if (select count(*) from public.qingxia_reminders where claimed_at > now() - interval '1 hour') >= 6
  then return; end if;
  return query
    with candidate as (
      select id from public.qingxia_reminders
      where state = 'queued' and due_at <= now() and due_at > now() - interval '1 day'
      order by due_at, id limit 1 for update skip locked
    )
    update public.qingxia_reminders r set state = 'sending', claimed_at = now()
    from candidate c where r.id = c.id returning r.*;
end;
$$;

revoke all on function public.qingxia_create_reminder(uuid,text,text,text,text,timestamptz,text),
  public.qingxia_claim_reminder() from public, anon, authenticated;
grant execute on function public.qingxia_create_reminder(uuid,text,text,text,text,timestamptz,text),
  public.qingxia_claim_reminder() to service_role;
