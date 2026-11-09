// The words of each notification, in both languages (ADR-0056). Short: a phone shows about two lines. Web-standard only.
import type { Localized } from './notify.ts'

type Text = { title: Localized; body: Localized }
const L = (en: string, pt: string): Localized => ({ en, pt })
/** A Localized name in one language, English when the Portuguese is empty. */
const inLang = (n: Localized, lang: 'en' | 'pt') => (lang === 'pt' && n.pt?.trim() ? n.pt : n.en)
const both = (build: (lang: 'en' | 'pt') => { title: string; body: string }): Text => {
  const en = build('en')
  const pt = build('pt')
  return { title: L(en.title, pt.title), body: L(en.body, pt.body) }
}

/** A business applied to join (staff with applications.view). */
export const applicationNotice = (businessName: string): Text =>
  both((lang) =>
    lang === 'en'
      ? { title: 'New business application', body: businessName ? `${businessName} applied to join Sanctus.` : 'A business applied to join Sanctus.' }
      : { title: 'Nova candidatura', body: businessName ? `${businessName} candidatou-se à Sanctus.` : 'Uma empresa candidatou-se à Sanctus.' },
  )

/** A business asked for a 3D model (staff with models.manage). */
export const modelRequestNotice = (businessName: string, productName: Localized): Text =>
  both((lang) =>
    lang === 'en'
      ? { title: 'New 3D model request', body: `${businessName || 'A business'} asked for a 3D model of ${inLang(productName, 'en')}.` }
      : { title: 'Novo pedido de modelo 3D', body: `${businessName || 'Uma empresa'} pediu um modelo 3D de ${inLang(productName, 'pt')}.` },
  )

export type CompanyEvent = 'paused' | 'live' | 'product_unpublished' | 'product_deleted'

/** The platform team changed the owner's catalogue (business members). */
export const companyNotice = (event: CompanyEvent, d: { businessName: string; productName?: Localized }): Text => {
  const product = (lang: 'en' | 'pt') => (d.productName ? inLang(d.productName, lang) : '')
  return both((lang) => {
    if (lang === 'en') {
      switch (event) {
        case 'paused':
          return { title: 'Your catalog was paused', body: `The Sanctus team paused the public catalog of ${d.businessName}.` }
        case 'live':
          return { title: 'Your catalog is live', body: `The Sanctus team made the catalog of ${d.businessName} public.` }
        case 'product_unpublished':
          return { title: 'A product was unpublished', body: `The Sanctus team unpublished ${product('en')}. It is kept as a draft.` }
        case 'product_deleted':
          return { title: 'A product was removed', body: `The Sanctus team deleted ${product('en')}.` }
      }
    }
    switch (event) {
      case 'paused':
        return { title: 'O seu catálogo foi pausado', body: `A equipa Sanctus pausou o catálogo público de ${d.businessName}.` }
      case 'live':
        return { title: 'O seu catálogo está disponível', body: `A equipa Sanctus tornou público o catálogo de ${d.businessName}.` }
      case 'product_unpublished':
        return { title: 'Um produto foi retirado', body: `A equipa Sanctus retirou ${product('pt')} do catálogo. Fica como rascunho.` }
      case 'product_deleted':
        return { title: 'Um produto foi eliminado', body: `A equipa Sanctus eliminou ${product('pt')}.` }
    }
  })
}

/** A 3D model request was delivered or declined (business members). */
export const modelUpdateNotice = (event: 'delivered' | 'declined', productName: Localized): Text =>
  both((lang) =>
    lang === 'en'
      ? event === 'delivered'
        ? { title: 'Your 3D model is ready', body: `The Sanctus team finished the 3D model for ${inLang(productName, 'en')}.` }
        : { title: 'Your 3D model request was declined', body: `The Sanctus team could not make the 3D model for ${inLang(productName, 'en')}. Open the product to see why.` }
      : event === 'delivered'
        ? { title: 'O seu modelo 3D está pronto', body: `A equipa Sanctus terminou o modelo 3D de ${inLang(productName, 'pt')}.` }
        : { title: 'O seu pedido de modelo 3D foi recusado', body: `A equipa Sanctus não conseguiu criar o modelo 3D de ${inLang(productName, 'pt')}. Abra o produto para ver o motivo.` },
  )
