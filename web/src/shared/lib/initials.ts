import { pickByName } from './by-name'

const words = (name: string) => name.split(/\s+/).filter(Boolean)

/** SAN-100: title case only when the whole name is in capitals; the stored name never changes. */
export const fullName = (name: string) => {
  const tidy = words(name).join(' ')
  if (tidy !== tidy.toUpperCase() || tidy === tidy.toLowerCase()) return tidy
  return tidy
    .toLowerCase()
    .replace(/(^|[\s'’-])\p{L}/gu, (start) => start.toUpperCase())
}

/** "Emerson Junior Daniel Silva" → "Emerson Silva": first and last word. */
export const shortName = (name: string) => {
  const parts = words(fullName(name))
  return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : parts.join(' ')
}

/** "Bob Stone" → "BS", for avatars without a picture. */
export const initials = (name: string) =>
  words(shortName(name))
    .map((word) => word.charAt(0).toUpperCase())
    .join('')

// Whole class names, so Tailwind finds them in the source.
const TONES = [
  'bg-avatar-1 text-avatar-1-foreground',
  'bg-avatar-2 text-avatar-2-foreground',
  'bg-avatar-3 text-avatar-3-foreground',
  'bg-avatar-4 text-avatar-4-foreground',
  'bg-avatar-5 text-avatar-5-foreground',
  'bg-avatar-6 text-avatar-6-foreground',
]

/** D36 amendment: one of six avatar tones, fixed per name. */
export const avatarTone = (name: string) => pickByName(name, TONES)
