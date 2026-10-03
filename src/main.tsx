import { createRoot } from 'react-dom/client'
import { ChatWidget } from './ChatWidget'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><ChatWidget /></ErrorBoundary>,
)
