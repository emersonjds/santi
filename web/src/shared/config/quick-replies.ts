/** SAN-136 Q3: the site admin's switch is the build flag, like `VITE_LEGAL_PAGES` (D45). */
export const quickRepliesOn = (env: { VITE_QUICK_REPLIES?: string }) =>
  env.VITE_QUICK_REPLIES !== 'off'
