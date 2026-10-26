// The legal drafts (docs/legal/drafts/*.md) are the single source of the /privacy and /terms text. Pure TypeScript
// with no imports: scripts/legal-content.mjs runs it under Node to generate content.generated.ts.

/** Draft files per page and language. pt shows the pt-PT text. */
export const LEGAL_DRAFT_FILES = {
  privacy: { en: 'docs/legal/drafts/privacy-policy.en.md', pt: 'docs/legal/drafts/privacy-policy.pt-PT.md' },
  terms: { en: 'docs/legal/drafts/terms.en.md', pt: 'docs/legal/drafts/terms.pt-PT.md' },
} as const

/**
 * Removes the italic "Drafting note for counsel" / "Nota de redação para o advogado" blockquotes. They are addressed
 * to the client's lawyer, must not reach the public page (or the bundle), and stay listed in
 * docs/legal/drafts/README.md and in the drafts themselves. At the time of writing there are two per language:
 * privacy policy §5 (consent banner, README open questions 1–2) and Terms B7 (complaint system if not a small
 * enterprise, [[ENTERPRISE_SIZE]]).
 */
export function stripDraftingNotes(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^>\s*\*(Drafting note|Nota de redação)/i.test(lines[i]!)) {
      // Skip the whole quote, then the blank line after it so no double gap is left.
      while (i < lines.length && lines[i]!.startsWith('>')) i++
      if (lines[i] === '' && out[out.length - 1] === '') continue
      i--
      continue
    }
    out.push(lines[i]!)
  }
  return out.join('\n')
}
