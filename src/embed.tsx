import { createRoot } from 'react-dom/client'
import { ChatWidget } from './ChatWidget'
import { ErrorBoundary } from './ErrorBoundary'
import styles from './styles.css?inline'

function mountWidget() {
  let rootElement = document.getElementById('ai-chat-root')
  if (!rootElement) {
    rootElement = document.createElement('div')
    rootElement.id = 'ai-chat-root'
    document.body.appendChild(rootElement)
  }
  if (rootElement.dataset.conciergeMounted) return
  if (!document.querySelector('[data-concierge-styles]')) {
    const style = document.createElement('style')
    style.dataset.conciergeStyles = 'true'
    style.textContent = styles
    document.head.appendChild(style)
  }
  rootElement.dataset.conciergeMounted = 'true'
  createRoot(rootElement).render(<ErrorBoundary><ChatWidget /></ErrorBoundary>)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountWidget, { once: true })
} else {
  mountWidget()
}
