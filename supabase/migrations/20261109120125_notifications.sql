-- Client requests round 2, workstream W5 (ADR-0056): in-app notifications and phone push.
-- Rollback: supabase/rollback/20261109_notifications_rollback.sql
--
--   1. notifications: one row per person per event. Written only by Edge Functions (service role); each person reads and
--      marks read their own rows. dedupe_key makes a retried event insert once, so a retry never pushes twice.
--   2. push_subscriptions: one row per browser/phone that turned phone notifications on. register_push_subscription
--      moves a device to the signed-in user (a shared browser changes hands), so the unique endpoint never blocks a sign-in.
--   3. notification_prefs: per-person switches for each kind, the phone push master switch and the language the
--      notification text is written in. No row means everything on and the English default.
-- Notifications never carry secrets; the link is an in-app path.

-- ---------------------------------------------------------------------------
-- 1. notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient   uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('new_application', 'new_model_request', 'company_update')),
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 500),
  -- An in-app path such as /admin/applications/<id>; never an absolute URL.
  link        text check (link ~ '^/[^/\\]' and char_length(link) <= 300),
  dedupe_key  text check (char_length(dedupe_key) <= 200),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (recipient, dedupe_key)
);

create index notifications_recipient_created_idx on public.notifications (recipient, created_at desc);
create index notifications_unread_idx on public.notifications (recipient) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated, service_role;
grant select on public.notifications to authenticated;
-- A person can only change read_at (mark read / unread); the text, link and recipient never change.
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

create policy "Users read their own notifications" on public.notifications
  for select to authenticated using (recipient = (select auth.uid()));
create policy "Users mark their own notifications read" on public.notifications
  for update to authenticated
  using (recipient = (select auth.uid()))
  with check (recipient = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. push_subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 1 and 200),
  auth        text not null check (char_length(auth) between 1 and 100),
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated, service_role;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create policy "Users read their own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users add their own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users remove their own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Saves this device for the signed-in user. The endpoint is unique, so a device another user registered earlier is moved
-- to the caller (their browser, their notifications from now on). At most 10 devices per user: the oldest are dropped.
create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent,
        created_at = now();
  delete from public.push_subscriptions s
   where s.user_id = v_uid
     and s.id in (select id from public.push_subscriptions where user_id = v_uid order by created_at desc, id offset 10);
end;
$$;
revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. notification_prefs
-- ---------------------------------------------------------------------------

create table public.notification_prefs (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  new_application    boolean not null default true,
  new_model_request  boolean not null default true,
  company_updates    boolean not null default true,
  -- Master switch for phone push; the in-app list is not affected by it.
  push_enabled       boolean not null default true,
  -- The language notification text is written in (the app saves the language the person uses); null means English.
  language           text check (language in ('en', 'pt')),
  updated_at         timestamptz not null default now()
);

create trigger notification_prefs_set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from public, anon, authenticated, service_role;
grant select, insert, update on public.notification_prefs to authenticated;
grant select, insert, update, delete on public.notification_prefs to service_role;

create policy "Users read their own notification prefs" on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create their own notification prefs" on public.notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update their own notification prefs" on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
