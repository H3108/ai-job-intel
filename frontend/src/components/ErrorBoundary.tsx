import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "../design-system"

interface Props {
  children: ReactNode
  // 可选自定义降级 UI（参数为错误与重置回调）
  fallback?: (error: Error, reset: () => void) => ReactNode
}
interface State {
  error: Error | null
}

// 全局错误边界：捕获任意子组件渲染期抛错 / 懒加载 chunk 404（部署新包后哈希变更导致旧 chunk 取不到），
// 避免整页白屏且无法恢复。提供「重试」回到正常态，导航仍可用。
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 仅上终端日志，不落盘（与项目既有 console 风格一致）
    console.error("[ErrorBoundary] 捕获渲染错误:", error, info?.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="font-display text-2xl font-bold text-text">页面出错了</div>
        <p className="text-sm leading-relaxed text-muted">
          渲染时发生异常（可能是资源未加载完整）。已隔离错误，不影响其它页面；点击下方按钮可重试。
        </p>
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface-solid p-3 text-left text-xs text-muted">
          {error.message || String(error)}
        </pre>
        <div className="flex gap-3">
          <Button size="sm" variant="primary" onClick={this.reset}>
            重试
          </Button>
          <Button size="sm" variant="secondary" onClick={() => (window.location.href = "/")}>
            回到首页
          </Button>
        </div>
      </div>
    )
  }
}
