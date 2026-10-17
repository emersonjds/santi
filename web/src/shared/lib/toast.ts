import type { ExternalToast } from 'sonner'

let markMounted = () => {}
const mounted = new Promise<void>((resolve) => {
  markMounted = resolve
})

/** Sonner drops a toast sent while no Toaster listens; the lazy Toaster calls this once it does. */
export const toasterMounted = () => markMounted()

// sonner loads with the first toast, outside the first-visit bundle (D39); the lazy Toaster shares its chunk.
const sonner = async () => {
  const [module] = await Promise.all([import('sonner'), mounted])
  return module.toast
}

export const toast = {
  success: (message: string, data?: ExternalToast) =>
    void sonner().then((sonnerToast) => sonnerToast.success(message, data)),
  error: (message: string, data?: ExternalToast) =>
    void sonner().then((sonnerToast) => sonnerToast.error(message, data)),
}
