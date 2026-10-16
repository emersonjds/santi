/** "Bob Stone" → "BS": at most two letters, for avatars without a picture. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
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

/** D36 amendment: one of six avatar tones, fixed per name, so people tell apart at a glance. */
export const avatarTone = (name: string) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return TONES[hash % TONES.length]
}
