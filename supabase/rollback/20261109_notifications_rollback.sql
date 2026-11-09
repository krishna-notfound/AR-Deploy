-- Rollback of 20261109120125_notifications.sql (ADR-0056). Drops the notification rows, the saved phone subscriptions and the
-- per-person switches. Run only with the owner's go-ahead; deployed Edge Functions that call notify() must be rolled back first
-- (they log and skip when the tables are missing, but they would keep trying).

drop function if exists public.register_push_subscription(text, text, text, text);
drop table if exists public.notification_prefs;
drop table if exists public.push_subscriptions;
drop table if exists public.notifications;
