import { createRoot } from 'react-dom/client'
import { gtmTracker } from './analytics'
import { ChatWidget } from './ChatWidget'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'

function mountWidget() {
  let mountPoint = document.getElementById('ai-chat-root')
  if (!mountPoint) {
    mountPoint = document.createElement('div')
    mountPoint.id = 'ai-chat-root'
    document.body.appendChild(mountPoint)
  }
  if (mountPoint.dataset.conciergeMounted) return
  mountPoint.dataset.conciergeMounted = 'true'
  createRoot(mountPoint).render(
    <ErrorBoundary><ChatWidget trackEvent={gtmTracker} /></ErrorBoundary>,
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountWidget, { once: true })
} else {
  mountWidget()
}
