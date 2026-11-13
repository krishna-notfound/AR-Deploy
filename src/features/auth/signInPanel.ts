// The sign-in pages' left panel (ADR-0067): which picture and which texts it shows. Pure choices, so the layout, the Website
// Editor and the tests agree: a page's own picture from the Website Editor, else that page's built-in photograph; a text the
// Website Editor gives in the current language, else the dictionary's.
import type { Lang, SignInPage, SignInPanel, SignInTextKey } from '@/domain/siteContent'
import { siteAssetUrl } from '@/services'

/** The built-in photographs of the sign-in pages (owner-generated, public/images/sanctus/v2), as each page had them before. */
const VILLA = { src: '/images/sanctus/v2/interior-villa.webp', position: '40% 50%' }
const SOFA = { src: '/images/sanctus/v2/sofa-travertine.webp', position: '50% 60%' }
const LOUNGE = { src: '/images/sanctus/v2/lounge-chair.webp', position: '50% 50%' }
export const SIGN_IN_PHOTOS: Record<SignInPage, { src: string; position: string }> = {
  login: VILLA,
  apply: SOFA,
  join: LOUNGE,
  resetPassword: VILLA,
  acceptInvite: VILLA,
  demo: LOUNGE,
}

export interface SignInPicture {
  source: 'own' | 'builtin'
  src: string
  /** object-position of the picture: the built-in photographs keep their anchor; an own picture was cropped for the panel and is centred. */
  position: string
}

/**
 * The panel's picture for `page`: its own (once its address is known), else its built-in photograph. Null while the published site
 * content is still loading, so the panel stays plain dark for a moment instead of flashing the built-in photograph (as the
 * catalogue banner does, ADR-0065). The form beside it never waits.
 */
export function chooseSignInPicture(page: SignInPage, site: { loading: boolean; pictures: SignInPanel['pictures'] }): SignInPicture | null {
  if (site.loading) return null
  const own = site.pictures?.[page]
  const url = own ? siteAssetUrl(own) : ''
  return url ? { source: 'own', src: url, position: '50% 50%' } : { source: 'builtin', ...SIGN_IN_PHOTOS[page] }
}

/** The Website Editor's text for `key` in `lang`, or undefined (none, or blank): the dictionary's text then shows. */
export function signInText(texts: SignInPanel['texts'], key: SignInTextKey, lang: Lang): string | undefined {
  const own = texts?.[key]?.[lang]
  return typeof own === 'string' && own.trim() ? own : undefined
}
