import { SOCIAL_NETWORKS } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { SocialIcon } from './SocialIcon'
import { useSiteContent } from './SiteContentProvider'

/**
 * The client's social media links as icons, for the main site footer (spec 11): only the networks that are filled in, in the
 * order Instagram, Facebook, LinkedIn, YouTube, TikTok, Pinterest. Nothing renders when nothing is published, so the footer
 * is unchanged before the first publish. Not used in business catalogue footers.
 */
export function SocialLinks({ className }: { className?: string }) {
  const { t } = useI18n()
  const { chrome } = useSiteContent()
  // Published links are https URLs already (the database checks it); the scheme is checked again here before it becomes an href.
  const links = SOCIAL_NETWORKS.flatMap((n) => {
    const url = chrome?.social[n]
    return url && /^https:\/\//i.test(url) ? [{ network: n, url }] : []
  })
  if (links.length === 0) return null
  return (
    <ul aria-label={t('site.social.label')} className={cn('flex flex-wrap items-center gap-x-1', className)}>
      {links.map(({ network, url }) => (
        <li key={network}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('site.social.opens', { name: t(`site.social.${network}`) })}
            className="grid size-11 place-items-center text-ink-muted transition-colors hover:text-ink"
          >
            <SocialIcon network={network} />
          </a>
        </li>
      ))}
    </ul>
  )
}
