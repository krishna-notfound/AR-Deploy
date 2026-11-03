// Strings of the public site that the Content Editor added (site.page.*, site.social.*). English master; pt-PT in pt.site.ts.
// The landing and footer copy stays in en.ts (the client's reference text).
export const enSite = {
  'site.page.checkFailed': 'We could not check for a newer version of this page.',
  'site.page.loadError': 'We could not load this page.',

  'site.social.label': 'Social media',
  'site.social.opens': '{name}, opens in a new tab',
  'site.social.instagram': 'Instagram',
  'site.social.facebook': 'Facebook',
  'site.social.linkedin': 'LinkedIn',
  'site.social.youtube': 'YouTube',
  'site.social.tiktok': 'TikTok',
  'site.social.pinterest': 'Pinterest',

  'landing.show.viewLabel': 'Show the piece as',
  'landing.show.image': 'Image',
  'landing.show.arLabel': 'View in your room',
  'landing.show.by': 'By {business}. Open the piece to see it in your room with AR.',
} as const
