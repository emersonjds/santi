/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SAN-136: `off` builds without the quick replies. */
  readonly VITE_QUICK_REPLIES?: string
}
