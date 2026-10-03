import { createRoot } from 'react-dom/client'
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
  const root = createRoot(mountPoint)
  mountPoint.dataset.conciergeMounted = 'true'
  root.render(<ErrorBoundary><ChatWidget /></ErrorBoundary>)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountWidget, { once: true })
} else {
  mountWidget()
}
