const DEFAULT_LABELS = [
  'bug',
  'feature',
  'frontend',
  'backend',
  'mobile',
  'infra',
  'design',
  'docs',
  'tech-debt',
  'security',
  'performance',
  'blocked',
]

// Mirrors normalize_labels in issues/domain.rs; the server stays the authority.
const MAX_LENGTH = 50

export const hasLabel = (labels: string[], label: string) =>
  labels.some((each) => each.toLowerCase() === label.toLowerCase())

/** The issue's labels, then the project's A-Z, then the defaults not used yet; one entry per word whatever its case. */
export const orderedLabels = (selected: string[], project: string[]) =>
  [
    ...selected,
    ...[...project].sort((a, b) => a.localeCompare(b)),
    ...DEFAULT_LABELS,
  ].reduce<string[]>(
    (list, label) => (hasLabel(list, label) ? list : [...list, label]),
    []
  )

export const labelProblem = (text: string) => {
  if (/\s/.test(text)) return 'Labels are single words, no spaces.'
  if ([...text].length > MAX_LENGTH)
    return `Use at most ${MAX_LENGTH} characters.`
  return null
}
