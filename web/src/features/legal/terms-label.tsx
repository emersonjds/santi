const LINK = 'text-primary underline'

/** Opens in a new tab so a half-filled form is not lost. */
export const TermsLabel = () => (
  <>
    I agree to the{' '}
    <a href='/terms' target='_blank' rel='noreferrer' className={LINK}>
      Terms of Use
    </a>{' '}
    and{' '}
    <a href='/privacy' target='_blank' rel='noreferrer' className={LINK}>
      Privacy Policy
    </a>
  </>
)

export const TERMS_REQUIRED = 'Accept the Terms of Use and the Privacy Policy.'
export const AGE_REQUIRED = 'Confirm you are 18 or older.'
