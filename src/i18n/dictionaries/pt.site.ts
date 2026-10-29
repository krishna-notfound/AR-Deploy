import type { TranslationKey } from './en'

// Portugal Portuguese (pt-PT) for the site area. Missing keys fall back to English.
export const ptSite: Partial<Record<TranslationKey, string>> = {
  'site.page.checkFailed': 'Não foi possível verificar se há uma versão mais recente desta página.',
  'site.page.loadError': 'Não foi possível carregar esta página.',

  'site.social.label': 'Redes sociais',
  'site.social.opens': '{name}, abre num novo separador',
  'site.social.instagram': 'Instagram',
  'site.social.facebook': 'Facebook',
  'site.social.linkedin': 'LinkedIn',
  'site.social.youtube': 'YouTube',
  'site.social.tiktok': 'TikTok',
  'site.social.pinterest': 'Pinterest',
}
