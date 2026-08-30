import { Component, type ReactNode } from "react"

export default class ErrorBoundary extends Component<
  { fallback?: ReactNode; children?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error("UI render error", error)
  }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="grid place-items-center py-24">
          <div className="text-center text-sm text-muted">
            <div className="text-lg font-semibold text-text">页面渲染异常</div>
            <div className="mt-2">请刷新重试，或稍后再访问。</div>
            <button
              className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg"
              onClick={() => this.setState({ hasError: false })}
            >
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
