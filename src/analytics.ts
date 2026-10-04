export interface AnalyticsEvent {
  event: string
  [key: string]: unknown
}

export type AnalyticsTracker = (event: AnalyticsEvent) => void

// GTM dataLayer tracker for the WordPress embed. A Lovable project can pass a
// Supabase insert, a console logger, or noopTracker instead.
export const gtmTracker: AnalyticsTracker = (event) => {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(event)
}

export const noopTracker: AnalyticsTracker = () => {}
