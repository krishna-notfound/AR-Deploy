# ADR-0029: Platform team roles (Owner, Admin, Team)
- **Status:** Accepted
- **Date:** 2026-10-25
- **Affects:** CLAUDE.md hard rules, PRD X-03, design/19-supabase.md, ADR-0024
- **Spec:** `docs/superpowers/specs/2026-10-25-platform-team-rbac-design.md`

## Context
Platform access was all or nothing: a user in `platform_admins` could do everything, and nobody else could do anything. The owner wants to invite staff with limited access. Earlier, "team roles" was out of scope (PRD X-03). This decision lifts that for **platform** roles only; business-side teams stay out of scope.

## Decision
- **Owner** = every user in `public.platform_admins`. The table and every existing rule that checks `is_platform_admin()` stay unchanged. The app can't grant, change or remove an Owner.
- **Admin** and **Team** members live in `public.platform_members`, with a status of `invited`, `active` or `deactivated`.
- **Permissions belong to the role, not the person.** There are 15 fixed keys, one per feature that exists today, stored in `public.platform_role_permissions`. The Owner edits one set for Admin and one for Team.
  - Defaults: Admin has all 15. Team has `businesses.view`, `applications.view`, `products.view`, `analytics.view` and `products.edit`.
- **Enforcement is additive (approach A).**
  - `public.platform_can(permission)` is true for an Owner, or for an *active* member whose role has the permission.
  - New permissive policies and function checks use it. No existing policy is rewritten.
  - The check reads the membership on every request, so a deactivation or a removed permission takes effect immediately.
  - `platform_can` lives in `public`, not `private`, because the API roles have no `USAGE` on the `private` schema.
- **Owner-only:** Team & Access, role permissions, Settings and resetting demo data. These can't be delegated.
- **Separation:** an email can't be both a platform member and a business owner. The database refuses it in both directions.
- **Audit:** every access change is written to `audit_events` with an `access_` prefix, by security definer functions only.

## Consequences
- Good: today's admins keep exactly the access they have, and new rules can only add access for active members.
- Good: there's one place to check (`platform_can`) and one table to read (`platform_role_permissions`).
- Trade-off: two layers of rules (Owner and members) now sit side by side. A later clean-up can fold them into one.
- Trade-off: a permission without a feature doesn't exist. New features add their key to the check constraint in a migration.

## Alternatives rejected
- **Rewrite every rule around permissions:** cleaner, but it changes every existing rule on the live database at once.
- **Route members' actions through privileged server functions only:** duplicates the data layer, and puts one more place where a mistake opens everything.
- **Permissions per person:** harder to reason about and to audit, and the owner chose permissions per role.
