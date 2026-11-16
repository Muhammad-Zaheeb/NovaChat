import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button, EmptyState } from './ui'

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex h-full bg-bg">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong"
          className="flex-1"
          action={
            <Button icon={RotateCw} onClick={() => location.reload()}>
              Reload NovaChat
            </Button>
          }
        >
          An unexpected error stopped this screen. Reloading usually fixes it; your
          messages are safe.
        </EmptyState>
      </div>
    )
  }
}
