import { pickByName } from '@/shared/lib/by-name'

// Whole class names, so Tailwind finds them in the source. Reordering recolours every label (D51).
export const LABEL_TONES = [
  'bg-label-red-bg text-label-red',
  'bg-label-orange-bg text-label-orange',
  'bg-label-amber-bg text-label-amber',
  'bg-label-lime-bg text-label-lime',
  'bg-label-sky-bg text-label-sky',
  'bg-label-blue-bg text-label-blue',
  'bg-label-fuchsia-bg text-label-fuchsia',
  'bg-label-pink-bg text-label-pink',
]

/** D51: the only source of a label's colour. */
export const labelTone = (name: string) =>
  pickByName(name.toLowerCase(), LABEL_TONES)
