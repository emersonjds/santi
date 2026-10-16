/** D45: what a Railway build of the legal pages cannot ship without (`VITE_LEGAL_PAGES=off` needs nothing). */
export const missingLegalSettings = (
  env: Record<string, string | undefined>
) =>
  env.RAILWAY_PROJECT_ID && env.VITE_LEGAL_PAGES !== 'off'
    ? ['VITE_OPERATOR_NAME', 'VITE_PRIVACY_EMAIL'].filter((name) => !env[name])
    : []

/** Drops every element marked `data-legal`; none may nest an element of its own tag. */
export const withoutLegalLinks = (html: string) =>
  html.replace(/<(\w+)\b[^>]*\bdata-legal\b[^>]*>[\s\S]*?<\/\1>/g, '')
