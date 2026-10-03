/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCHEDULING_URL?: string
}

interface Window {
  dataLayer?: Record<string, unknown>[]
}
