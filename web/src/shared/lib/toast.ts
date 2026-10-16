import type { ExternalToast } from 'sonner'

// sonner loads with the first toast, outside the first-visit bundle (D39); the lazy Toaster shares its chunk.
export const toast = {
  success: (message: string, data?: ExternalToast) =>
    void import('sonner').then((module) => module.toast.success(message, data)),
  error: (message: string, data?: ExternalToast) =>
    void import('sonner').then((module) => module.toast.error(message, data)),
}
