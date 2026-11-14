// The real reader of a person's email switches for Edge Functions (ADR-0078): the service role reads their own
// notification_prefs row. Deno only: imported by index.ts files, never by a handler.
// @ts-ignore: resolved by Deno at deploy time
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { EMAIL_PREF_COLUMN, type EmailPrefReader } from './emailPrefs.ts'

/** True unless the person switched this type off. No row means everything is on. Throws on a read error. */
export function createEmailPrefReader(admin: SupabaseClient): EmailPrefReader {
  return async (userId, type) => {
    const column = EMAIL_PREF_COLUMN[type]
    const { data, error } = await admin.from('notification_prefs').select(column).eq('user_id', userId).maybeSingle()
    if (error) throw new Error(`email prefs lookup failed: ${error.code ?? 'unknown'}`)
    return (data as Record<string, unknown> | null)?.[column] !== false
  }
}
