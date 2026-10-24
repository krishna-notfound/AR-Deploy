/** The visitor asked the OS to reduce motion. JS-driven smooth scrolling must check this: the CSS override cannot. */
export const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** `smooth`, unless the visitor prefers reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth')
