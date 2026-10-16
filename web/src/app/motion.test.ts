import { expect, it } from 'vitest'

const rulesOf = (rules: CSSRuleList): CSSRule[] =>
  [...rules].flatMap((rule) =>
    rule instanceof CSSGroupingRule ? [rule, ...rulesOf(rule.cssRules)] : [rule]
  )

it('stops animations and transitions for people who ask for less motion', () => {
  const text = [...document.styleSheets]
    .flatMap((sheet) => rulesOf(sheet.cssRules))
    .filter(
      (rule) =>
        rule instanceof CSSMediaRule &&
        rule.conditionText.includes('prefers-reduced-motion: reduce')
    )
    .map((rule) => rule.cssText)
    .join('\n')
  expect(text).toMatch(/animation-duration: 0\.01ms !important/)
  expect(text).toMatch(/transition-duration: 0\.01ms !important/)
})
