import { describe, expect, it } from 'vitest'
import landing from '../../../landing.html?raw'
import { missingLegalSettings, withoutLegalLinks } from './legal-build'

describe('legal pages at build time', () => {
  it('a Railway build needs the operator and privacy contact unless the pages are off', () => {
    const railway = { RAILWAY_PROJECT_ID: 'p1' }

    expect(missingLegalSettings(railway)).toEqual([
      'VITE_OPERATOR_NAME',
      'VITE_PRIVACY_EMAIL',
    ])
    expect(
      missingLegalSettings({ ...railway, VITE_OPERATOR_NAME: 'Ana' })
    ).toEqual(['VITE_PRIVACY_EMAIL'])
    expect(
      missingLegalSettings({
        ...railway,
        VITE_OPERATOR_NAME: 'Ana',
        VITE_PRIVACY_EMAIL: 'privacy@example.com',
      })
    ).toEqual([])
    expect(
      missingLegalSettings({ ...railway, VITE_LEGAL_PAGES: 'off' })
    ).toEqual([])
    expect(missingLegalSettings({})).toEqual([])
  })

  it('the landing page loses every link to them and keeps the rest', () => {
    const page = withoutLegalLinks(landing)

    expect(landing).toContain('href="/privacy"')
    expect(page).not.toMatch(/\/privacy|\/terms/)
    expect(page).toContain('Your data is yours')
    expect(page).toContain('Send feedback')
  })
})
