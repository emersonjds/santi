const MAX_LENGTH = 10
const SINGLE_WORD_LENGTH = 3

/** "Website" → WEB, "Mobile app redesign" → MAR: initials, or the first letters of a single word. */
export const suggestKey = (name: string) => {
  const words = name.toUpperCase().match(/[A-Z][A-Z0-9]*/g) ?? []
  const key =
    words.length > 1
      ? words.map((word) => word.charAt(0)).join('')
      : (words[0] ?? '').slice(0, SINGLE_WORD_LENGTH)
  return key.slice(0, MAX_LENGTH)
}
