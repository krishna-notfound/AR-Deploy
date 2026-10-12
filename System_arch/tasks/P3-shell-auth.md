# P3 · App shell, accounts & routing
→ design/07-auth-routing.md, design/11-design-system.md (Layout), design/12-features-admin.md (Demo entry)

- [x] **P3-01** `AccountProvider` with a persisted session, `signInAs` and `logout`. The session is cleared if its business is deleted. — done 2026-10-12
- [x] **P3-02** `RequireRole allow=…` (redirects to `/?next=`; wrong role shows a message) with a "not a security boundary" comment. — done 2026-10-12: covered by E2E.
- [x] **P3-03** `nav.ts` + collapsible Sidebar + MobileNav drawer. — done 2026-10-12: covered by the mobile E2E.
- [x] **P3-04** Topbar: notifications (unread dot, mark as read) and profile menu (Switch account, Logout). — done 2026-10-12
- [x] **P3-05** DashboardShell + PublicShell. — done 2026-10-12
- [x] **P3-06** `app/router.tsx` with every route, lazy per surface, NotFoundPage, and the hostname-mode branch. — done 2026-10-12: hostname branch is unit-tested only (`resolveTenant`), not in a browser.
- [x] **P3-07** DemoEntryPage. — done 2026-10-12

## Discovered
