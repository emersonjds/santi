import { preloadOnce } from '@/shared/lib/preload-chunk'

/** D39: react-hook-form stays off the first visit; the route starts this chunk beside the page data. */
export const preloadAccountForms = preloadOnce(() => import('./account-forms'))
