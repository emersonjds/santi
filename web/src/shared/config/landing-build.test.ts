import { describe, expect, it } from 'vitest'
import { inlineStylesheets, llmsTxt } from './landing-build'

describe('landing page at build time', () => {
  it('swaps each built stylesheet link for its rules and leaves the rest of the page alone', () => {
    const html =
      '<head><link rel="modulepreload" crossorigin href="/assets/polyfill-1.js">\n' +
      '<link rel="stylesheet" crossorigin href="/assets/landing-ab12.css">\n' +
      '<link rel="stylesheet" href="/assets/missing-9.css"></head>'
    const files: Record<string, string> = {
      'assets/landing-ab12.css': '.hero{color:red}',
    }

    expect(inlineStylesheets(html, (file) => files[file])).toBe(
      '<head><link rel="modulepreload" crossorigin href="/assets/polyfill-1.js">\n' +
        '<style>.hero{color:red}</style>\n' +
        '<link rel="stylesheet" href="/assets/missing-9.css"></head>'
    )
  })

  it('llms.txt names the product and links the site, the API and the source', () => {
    const text = llmsTxt('https://santi.example')

    expect(text.startsWith('# santi\n\n> ')).toBe(true)
    expect(text).toContain('(https://santi.example/)')
    expect(text).toContain('(https://santi.example/docs/)')
    expect(text).toContain('(https://santi.example/openapi.json)')
    expect(text).toContain('(https://github.com/emersonjds/santi)')
    expect(text.endsWith('\n')).toBe(true)
  })
})
