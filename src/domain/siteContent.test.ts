import { describe, expect, it } from 'vitest'
import {
  RESERVED_PAGE_SLUGS,
  SOCIAL_NETWORKS,
  emptySiteContent,
  isAllowedSocialUrl,
  normalizeSiteContent,
  normalizeSocialUrl,
  summarizeChanges,
  validateSiteContent,
  type CustomPage,
  type SiteContent,
} from './siteContent'
import { DEFAULT_APPLY_FORM, resolveApplyForm } from '../../supabase/functions/_shared/applyForm.ts'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const page = (over: Partial<CustomPage> = {}): CustomPage => ({
  id: crypto.randomUUID(),
  slug: 'about',
  title: { en: 'About us' },
  body: { en: 'Hello' },
  showInFooter: false,
  order: 0,
  ...over,
})
const doc = (over: Partial<SiteContent> = {}): SiteContent => ({ ...emptySiteContent(), ...over })

describe('emptySiteContent / normalizeSiteContent', () => {
  it('is valid and carries today’s form', () => {
    const c = emptySiteContent()
    expect(c.schema).toBe(1)
    expect(validateSiteContent(c)).toEqual({})
    expect(c.customPages).toEqual([])
    expect(c.applyForm).toEqual(DEFAULT_APPLY_FORM)
    expect(c.applyForm).not.toBe(DEFAULT_APPLY_FORM)
  })

  it('fills defaults from anything and drops unknown keys', () => {
    expect(normalizeSiteContent(null)).toEqual(emptySiteContent())
    expect(normalizeSiteContent({})).toEqual(emptySiteContent())
    const n = normalizeSiteContent({ schema: 1, extra: 1, social: { instagram: 'https://instagram.com/x', myspace: 'https://x', tiktok: 4 }, builtinPages: { terms: { en: 'T', fr: 'x' }, other: {} } })
    expect(n.social).toEqual({ instagram: 'https://instagram.com/x' })
    expect(n.builtinPages).toEqual({ terms: { en: 'T' } })
    expect('extra' in n).toBe(false)
  })

  it('round-trips a full document', () => {
    const c = doc({ customPages: [page({ showInFooter: true, order: 2, title: { en: 'A', pt: 'B' } })], social: { facebook: 'https://facebook.com/x' }, builtinPages: { privacy: { pt: 'P' } } })
    expect(normalizeSiteContent(clone(c))).toEqual(c)
  })
})

describe('validateSiteContent', () => {
  it('refuses the reserved slugs, each one', () => {
    expect(RESERVED_PAGE_SLUGS).toEqual(['admin', 'api', 'apply', 'catalog', 'dashboard', 'demo', 'embed', 'login', 'pages', 'privacy', 'products', 'terms'])
    for (const slug of RESERVED_PAGE_SLUGS) expect(validateSiteContent(doc({ customPages: [page({ slug })] }))).toHaveProperty(['customPages.0.slug'], 'slug_reserved')
  })

  it('refuses a duplicate slug, a bad slug, a long slug and a missing title', () => {
    expect(validateSiteContent(doc({ customPages: [page(), page({ slug: 'about' })] }))).toHaveProperty(['customPages.1.slug'], 'slug_duplicate')
    expect(validateSiteContent(doc({ customPages: [page({ slug: 'Bad Slug' })] }))).toHaveProperty(['customPages.0.slug'], 'invalid_slug')
    expect(validateSiteContent(doc({ customPages: [page({ slug: 'a'.repeat(61) })] }))).toHaveProperty(['customPages.0.slug'], 'too_long')
    expect(validateSiteContent(doc({ customPages: [page({ title: { en: '' } })] }))).toHaveProperty(['customPages.0.title.en'], 'required')
    expect(validateSiteContent(doc({ customPages: [page({ title: { en: 'x'.repeat(81) } })] }))).toHaveProperty(['customPages.0.title.en'], 'too_long')
  })

  it('allows 20 custom pages and refuses 21', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => page({ slug: `page-${i}` }))
    expect(validateSiteContent(doc({ customPages: many(20) }))).toEqual({})
    expect(validateSiteContent(doc({ customPages: many(21) }))).toHaveProperty('customPages', 'too_many')
  })

  it('refuses javascript:, data: and other schemes in a link, in built-in and custom pages; allows https, mailto and site-relative', () => {
    const bad = validateSiteContent(doc({ customPages: [page({ body: { en: 'Click [here](javascript:alert(1))' } })] }))
    expect(bad).toHaveProperty(['customPages.0.body.en'], 'invalid_link')
    expect(validateSiteContent(doc({ builtinPages: { terms: { pt: '[x](data:text/html,hi)' } } }))).toHaveProperty(['builtinPages.terms.pt'], 'invalid_link')
    expect(validateSiteContent(doc({ builtinPages: { privacy: { en: '[x](  JavaScript:alert(1))' } } }))).toHaveProperty(['builtinPages.privacy.en'], 'invalid_link')
    expect(validateSiteContent(doc({ builtinPages: { privacy: { en: '[x](//evil.example)' } } }))).toHaveProperty(['builtinPages.privacy.en'], 'invalid_link')
    expect(validateSiteContent(doc({ builtinPages: { terms: { en: '[a](https://example.com) [b](mailto:a@b.pt) [c](/pages/about) [[PLACEHOLDER]]' } } }))).toEqual({})
  })

  it('refuses a body over 60,000 characters', () => {
    expect(validateSiteContent(doc({ customPages: [page({ body: { en: 'x'.repeat(60001) } })] }))).toHaveProperty(['customPages.0.body.en'], 'too_long')
    expect(validateSiteContent(doc({ builtinPages: { terms: { en: 'x'.repeat(60001) } } }))).toHaveProperty(['builtinPages.terms.en'], 'too_long')
  })

  it('refuses an application text with an extra {token}, and apply.done.reference without {ref}; the path is prefixed', () => {
    const c = doc()
    c.applyForm.texts = { 'apply.done.title': { en: 'Hi {name}' }, 'apply.done.reference': { en: 'Ref' } }
    const e = validateSiteContent(c)
    expect(e).toHaveProperty(['applyForm.texts.apply.done.title.en'], 'unknown_token')
    expect(e).toHaveProperty(['applyForm.texts.apply.done.reference.en'], 'missing_token')
  })

  it('refuses a social link that is not https on the network’s own domain', () => {
    expect(validateSiteContent(doc({ social: { instagram: 'https://instagram.com/sanctus' } }))).toEqual({})
    expect(validateSiteContent(doc({ social: { instagram: 'http://instagram.com/x' } }))).toHaveProperty(['social.instagram'])
    expect(validateSiteContent(doc({ social: { instagram: 'instagram.com/x' } }))).toHaveProperty(['social.instagram'])
    expect(validateSiteContent(doc({ social: { instagram: 'https://evil.example/instagram.com' } }))).toHaveProperty(['social.instagram'], 'wrong_host')
  })

  it('a wrong schema is refused', () => {
    expect(validateSiteContent({ ...doc(), schema: 2 as never })).toHaveProperty('schema')
  })
})

describe('isAllowedSocialUrl', () => {
  it('accepts the network’s domain and subdomains, with or without a scheme', () => {
    expect(isAllowedSocialUrl('instagram', 'instagram.com/sanctus')).toBe(true)
    expect(isAllowedSocialUrl('instagram', '  https://www.instagram.com/sanctus  ')).toBe(true)
    expect(isAllowedSocialUrl('facebook', 'https://fb.com/x')).toBe(true)
    expect(isAllowedSocialUrl('linkedin', 'https://pt.linkedin.com/company/x')).toBe(true)
    expect(isAllowedSocialUrl('youtube', 'https://youtu.be/abc')).toBe(true)
    expect(isAllowedSocialUrl('tiktok', 'https://www.tiktok.com/@sanctus')).toBe(true)
    expect(isAllowedSocialUrl('pinterest', 'https://www.pinterest.pt/sanctus')).toBe(true)
  })

  it('refuses http, look-alike hosts, other networks, user info, ports, spaces, other schemes and long input', () => {
    expect(isAllowedSocialUrl('instagram', 'http://instagram.com/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'instagram.com.evil.example')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://notinstagram.com/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://facebook.com/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://user@instagram.com/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://evil.example@instagram.com/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://instagram.com@evil.example/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://instagram.com:8080/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'https://instagram.com/a b')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'javascript:alert(1)')).toBe(false)
    expect(isAllowedSocialUrl('instagram', 'ftp://instagram.com/x')).toBe(false)
    expect(isAllowedSocialUrl('instagram', `https://instagram.com/${'a'.repeat(300)}`)).toBe(false)
    expect(isAllowedSocialUrl('instagram', '')).toBe(false)
  })

  it('normalizeSocialUrl adds https:// and trims; null when not allowed', () => {
    expect(normalizeSocialUrl('instagram', ' instagram.com/sanctus ')).toBe('https://instagram.com/sanctus')
    expect(normalizeSocialUrl('instagram', 'https://instagram.com/x')).toBe('https://instagram.com/x')
    expect(normalizeSocialUrl('instagram', 'http://instagram.com/x')).toBeNull()
    expect(SOCIAL_NETWORKS).toEqual(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'pinterest'])
  })
})

describe('summarizeChanges', () => {
  const zero = { pages: 0, footer: 0, applicationTexts: 0, applicationSteps: 0, applicationFields: 0, questions: 0, social: 0, total: 0 }

  it('no change is all zeros, and null counts as empty', () => {
    expect(summarizeChanges(emptySiteContent(), emptySiteContent())).toEqual(zero)
    expect(summarizeChanges(null, emptySiteContent())).toEqual(zero)
  })

  it('counts per group', () => {
    const before = emptySiteContent()
    const after = clone(before)
    after.builtinPages = { terms: { en: 'New terms', pt: 'Novos termos' }, privacy: { en: 'P' } } // 3 page bodies
    after.customPages = [page({ showInFooter: true })] // 1 new page + footer
    after.social = { instagram: 'https://instagram.com/x', facebook: 'https://facebook.com/y' } // 2
    after.applyForm.texts = { 'apply.done.title': { en: 'Thanks', pt: 'Obrigado' } } // 2
    after.applyForm.customQuestions = [{ id: 'q1', type: 'yes_no', label: { en: 'Ship?' } }] // 1 question
    after.applyForm.fields.push({ key: 'custom:q1', stepId: 'business' })
    after.applyForm.fields = after.applyForm.fields.map((f) => (f.key === 'applicantPhone' ? { ...f, hidden: true } : f.key === 'website' ? { ...f, required: true } : f)) // 2 fields
    after.applyForm.steps[1] = { ...after.applyForm.steps[1]!, title: { en: 'Where' } } // 1 step
    const s = summarizeChanges(before, after)
    expect(s).toMatchObject({ pages: 4, footer: 1, applicationTexts: 2, questions: 1, social: 2 })
    expect(s.applicationFields).toBe(2)
    expect(s.applicationSteps).toBe(1)
    expect(s.total).toBe(s.pages + s.footer + s.applicationTexts + s.applicationSteps + s.applicationFields + s.questions + s.social)
  })

  it('moving a field to another step counts once under steps; reordering a footer page counts under footer', () => {
    const base = doc({ customPages: [page({ id: 'a', slug: 'a', showInFooter: true, order: 0 }), page({ id: 'b', slug: 'b', showInFooter: true, order: 1 })] })
    const after = clone(base)
    after.customPages[0]!.order = 1
    after.customPages[1]!.order = 0
    after.applyForm.fields = after.applyForm.fields.map((f) => (f.key === 'city' ? { ...f, stepId: 'business' } : f))
    const s = summarizeChanges(base, after)
    expect(s.footer).toBe(2)
    expect(s.pages).toBe(0)
    expect(s.applicationSteps).toBe(1)
    expect(resolveApplyForm(after.applyForm).find((st) => st.id === 'business')!.fields.map((f) => f.key)).toContain('city')
  })

  it('removing a page counts as a page; a removed question counts', () => {
    const before = doc({ customPages: [page({ id: 'a', slug: 'a' })] })
    before.applyForm.customQuestions = [{ id: 'q1', type: 'yes_no', label: { en: 'Ship?' } }]
    before.applyForm.fields.push({ key: 'custom:q1', stepId: 'business' })
    const after = emptySiteContent()
    expect(summarizeChanges(before, after)).toMatchObject({ pages: 1, questions: 1 })
  })
})
