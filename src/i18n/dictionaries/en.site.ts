// Strings of the public site that the Content Editor added (site.page.*, site.social.*). English master; pt-PT in pt.site.ts.
// The landing and footer copy stays in en.ts (the client's reference text).
export const enSite = {
  'site.page.checkFailed': 'We could not check for a newer version of this page.',
  'site.page.loadError': 'We could not load this page.',

  'site.collection.eyebrow': 'Collection',
  'site.collection.all': 'All collections',
  'site.collection.pieces': 'Pieces in {name}',
  'site.collection.emptyTitle': 'Pieces coming soon',
  'site.collection.emptyBody': 'We are choosing the first pieces for this collection. Do you make or sell furniture? Show your pieces in 3D and AR with Sanctus.',
  'site.collection.pageError': 'We could not load this collection.',
  'site.collection.loadError': 'We could not load the pieces of this collection.',

  // The showcase product page /showcase/:slug (ADR-0047)
  'showcase.arButton': 'View in your room',
  'showcase.moreTitle': 'More pieces',
  'showcase.moreList': 'More pieces from the showcase',
  'showcase.bannerTitle': 'This is how your customers will see your pieces.',
  'showcase.bannerBody': 'Photos, 3D and AR on every piece, on a page of your own. Tell us about your business and we will set it up with you.',
  'showcase.loadError': 'We could not load this piece.',

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
  'landing.show.arHint': 'Open on your phone to see it in your room',
  'landing.show.by': 'By {business}. Open the piece to see it in your room with AR.',
} as const
