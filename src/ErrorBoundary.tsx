import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Concierge widget failed to render', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <div className="concierge-error" role="alert">The chat is temporarily unavailable. Please refresh and try again.</div>
    }
    return this.props.children
  }
}
