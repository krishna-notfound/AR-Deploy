# QA business: records and manual cleanup

These records exist on purpose, for manual review. **Do not delete them automatically.** Remove them only when the review is finished, by following this procedure. They live in the client project `zggylkbgajamhriebdrg`, which the live site uses (checked 2026-10-27). The old dev project `pmnjchhrgvajtjpadpqo` (not used) holds none of them.

## 1. QA records (created 2026-10-20)

### Business, owner and application

| Record | Identifier |
|---|---|
| Business | **QA — Sanctus Demo Atelier — DO NOT DELETE AUTOMATICALLY**, id `e5a40e29-c022-41ea-9a63-e06222581b85`, slug `qa-sanctus-demo-atelier-do-not-delete-automatically`, status **active** |
| Owner (Auth user) | `delivered+qa-demo-atelier@resend.dev`, user id `92f47dc4-1680-4026-acf8-64a0f130c1ab`. Invited by the admin, accepted on `/accept-invite`. The password is in the git-ignored `.env.qa` as `QA_ATELIER_OWNER_PASSWORD`. |
| Application | Reference **059B9C06**, applicant `delivered+qa-demo-atelier@resend.dev`, status approved |

Because email delivery isn't configured, the owner opened the invitation link through the Supabase Auth admin API instead of an inbox. Everything after that went through the real `/accept-invite` page.

### Products

| Product | id | slug | Status |
|---|---|---|---|
| QA Sheen Chair | `1268c143-8f7f-483f-9916-0602420f3692` | `qa-sheen-chair` | published |
| QA Glam Velvet Sofa | `755ae419-8c15-46a2-ab61-f93c8589a7d7` | `qa-glam-velvet-sofa` | published |
| QA Lounge Chair — two finishes (variants: Sheen `6aaa5a51-50ce-4fda-9b02-5b218199e4b5`, Damask `60be4f49-c82f-41d8-8b1d-5e0785735017`) | `0de0088f-d816-422f-9acc-e153ef2d7750` | `qa-lounge-chair-two-finishes` | published |
| QA Barn Lamp — photos only | `10149abf-8817-49a9-ba02-8e3346c01f60` | `qa-barn-lamp-photos-only` | published |
| QA Draft Side Table — not published | `d5a55eb9-4f06-4e19-b7df-fa291c787c8e` | `qa-draft-side-table-not-published` | draft |
| QA Invalid Model Test | `832e53a8-e7f5-4558-a041-7df7da59c6fd` | `qa-invalid-model-test` | draft (no model: the invalid GLB was rejected) |

### Storage objects

Bucket `product-media`, 11 objects, all under the business folder `e5a40e29-c022-41ea-9a63-e06222581b85/`:

| Product | Objects |
|---|---|
| QA Sheen Chair | `8861686f-c73a-4dc8-9683-3da9bae8a708.webp`, `8d913734-3ab5-4cdd-9898-2759946591dd.glb` |
| QA Glam Velvet Sofa | `bcd32489-3acd-4cb2-9a71-a57c92846a62.webp`, `4f36bc4f-3958-4ddd-833b-9e13df69edd7.glb` |
| QA Lounge Chair | product photo `7a54bb12-5026-4dd6-a24d-374a69f12b4b.webp`; Sheen `b3adfcb7-f06e-4f85-b4c5-334a794fe8cd.webp`, `8d88610b-0dfe-4c94-8286-f9edd554076d.glb`; Damask `e18cd2ea-2de1-405d-bd94-8d69ab944426.webp`, `c0a6d92d-7b59-4d6e-8f3f-632342407920.glb` |
| QA Barn Lamp | `404576a6-d1c7-4554-8158-3ff3fed72acf.webp` |
| QA Draft Side Table | `6aa64822-35ec-4802-b92d-b174c13be233.webp` |

The business has no logo in `business-logos`, unless one is added later.

### Other rows

- **Analytics** (`product_analytics`): controlled views, 3D interactions and AR launch attempts on these products from Journey F, plus page visits during the other journeys. They are tied to the products above.
- **Audit log** (`audit_events`): `application_submitted`, the status changes, `business_created`, `invitation_requested`, onboarding and the product events, all for this business and application.
- **Email log** (`email_log`): applicant confirmation, admin notification and owner invitation, all `blocked: email_not_configured`. No email was sent.

**Email test records (2026-10-24):**
- Application **ABE43EC0**, "QA Email Test Atelier", applicant `delivered+qa-email-test@resend.dev`, status submitted.
- Its `email_log` rows: confirmation and admin notification, both delivered.
- A delivered `invitation_resend` email-log row for "QA Preview Atelier 10201001".

To remove the application, run the same SQL as in step 4 below, with reference `ABE43EC0` and its applicant email.

**Older QA records, not covered here:** "QA Preview Atelier 10201001", "QA Muse Studio", "QA Muse Atelier" and "idk". They predate this procedure; leave them alone unless the owner says otherwise.

## 2. Safe manual deletion sequence

Do this as the **platform admin**, through the app on the Preview, which uses the client dev project. The app's own delete flows remove both the database rows and the storage files.

1. **Check scope first:** open `/admin/businesses`, search "QA — Sanctus Demo Atelier" and confirm the id in the URL is `e5a40e29-c022-41ea-9a63-e06222581b85`.
2. **Delete the business:** on its page, choose Delete and confirm. What this does:
   - **Database:** the business row is deleted. Products, images, models, variants, variant images and models, `business_members` and `product_analytics` rows cascade.
   - **Storage:** the app removes the `product-media/e5a40e29-…/` and `business-logos/e5a40e29-…/` folders.
   - **Kept:** `audit_events` and `email_log` rows remain with `business_id` set to null, as the history. The application row also remains, with `business_id` null.
3. **Delete the owner's Auth account**, which needs Administrator access in Supabase: Dashboard → Authentication → Users → search `delivered+qa-demo-atelier@resend.dev` → confirm the id is `92f47dc4-1680-4026-acf8-64a0f130c1ab` → Delete user. The app never deletes Auth accounts.
4. **Optional: remove the application and its history.** Only if the owner wants no trace, and only in the SQL editor with Administrator access:

   ```sql
   -- Check first: must return exactly one row, reference 059B9C06.
   select id, reference, business_name from public.business_applications where reference = '059B9C06';
   -- Then (audit events and email-log rows linked to the application cascade or are set null by the foreign keys):
   delete from public.business_applications where reference = '059B9C06' and applicant_email = 'delivered+qa-demo-atelier@resend.dev';
   ```

5. **Remove the local credentials:** delete the `QA_ATELIER_OWNER_EMAIL` and `QA_ATELIER_OWNER_PASSWORD` lines from `.env.qa`.

## 3. Verification that only QA records go

Before step 2, as admin in the SQL editor (read-only):

```sql
select count(*) as products, bool_and(name->>'en' like 'QA %') as all_named_qa
from public.products where business_id = 'e5a40e29-c022-41ea-9a63-e06222581b85';
-- Expect: products = 6, all_named_qa = true.
```

After step 2:

```sql
select (select count(*) from public.businesses where id = 'e5a40e29-c022-41ea-9a63-e06222581b85') as business,
       (select count(*) from public.products where business_id = 'e5a40e29-c022-41ea-9a63-e06222581b85') as products,
       (select count(*) from storage.objects where bucket_id = 'product-media' and name like 'e5a40e29-c022-41ea-9a63-e06222581b85/%') as files;
-- Expect: 0, 0, 0. The other businesses' product counts must be unchanged (compare with a count taken before).
```

## 4. Dependencies and who can do what

| Step | Who |
|---|---|
| Delete the business (rows and files) | Platform admin in the app |
| Delete the Auth user | Supabase **Administrator** (the Developer role can't) |
| SQL in steps 3 and 4 | Supabase dashboard SQL editor (Administrator). There is no app UI for it. |
