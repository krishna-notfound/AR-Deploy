// The business owner's address and language, for the emails a platform-team action sends to them
// (notify-business-owner, review-model-request). Service-role client only; Deno only: imported by index.ts files,
// never by a handler.
// @ts-ignore: resolved by Deno at deploy time
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'

/** The business owner's address, the source application's language (else en) and the business name; null without an owner. */
export async function ownerRecipient(admin: SupabaseClient, businessId: string): Promise<{ email: string; language: 'en' | 'pt'; businessName: string } | null> {
  const [biz, member, app] = await Promise.all([
    admin.from('businesses').select('name').eq('id', businessId).maybeSingle(),
    admin.from('business_members').select('user_id').eq('business_id', businessId).limit(1).maybeSingle(),
    admin.from('business_applications').select('language').eq('business_id', businessId).limit(1).maybeSingle(),
  ])
  for (const r of [biz, member, app]) if (r.error) throw new Error(`recipient lookup failed: ${r.error.code ?? 'unknown'}`)
  if (!biz.data || !member.data) return null
  const u = await admin.auth.admin.getUserById(member.data.user_id)
  if (u.error) throw new Error(`recipient lookup failed: ${u.error.code ?? 'unknown'}`)
  const email = u.data.user?.email ?? ''
  if (!email) return null
  return { email, language: app.data?.language === 'pt' ? 'pt' : 'en', businessName: biz.data.name }
}
