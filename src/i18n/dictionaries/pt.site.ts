import type { TranslationKey } from './en'

// Portugal Portuguese (pt-PT) for the site area. Missing keys fall back to English.
export const ptSite: Partial<Record<TranslationKey, string>> = {
  'site.page.checkFailed': 'Não foi possível verificar se há uma versão mais recente desta página.',
  'site.page.loadError': 'Não foi possível carregar esta página.',

  'site.collection.eyebrow': 'Coleção',
  'site.collection.all': 'Todas as coleções',
  'site.collection.pieces': 'Peças em {name}',
  'site.collection.emptyTitle': 'Peças em breve',
  'site.collection.emptyBody': 'Estamos a escolher as primeiras peças desta coleção. Fabrica ou vende mobiliário? Mostre as suas peças em 3D e RA com a Sanctus.',
  'site.collection.loadError': 'Não foi possível carregar as peças desta coleção.',

  'site.social.label': 'Redes sociais',
  'site.social.opens': '{name}, abre num novo separador',
  'site.social.instagram': 'Instagram',
  'site.social.facebook': 'Facebook',
  'site.social.linkedin': 'LinkedIn',
  'site.social.youtube': 'YouTube',
  'site.social.tiktok': 'TikTok',
  'site.social.pinterest': 'Pinterest',

  'landing.show.viewLabel': 'Mostrar a peça como',
  'landing.show.image': 'Imagem',
  'landing.show.arLabel': 'Ver na sua sala',
  'landing.show.arHint': 'Abra no telemóvel para a ver na sua sala',
  'landing.show.by': 'Por {business}. Abra a peça para a ver na sua sala com Realidade Aumentada.',
}
