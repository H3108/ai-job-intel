import { Link } from "react-router-dom"
import { PageHeader, Button } from "../design-system"

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
      <div className="mb-4 text-6xl font-semibold text-primary">404</div>
      <PageHeader title="页面不存在" desc="你访问的地址没有对应的页面，可能已被移动或删除。" />
      <p className="mb-8 text-muted">返回首页继续浏览 AI 求职情报看板。</p>
      <Link to="/" data-no-print>
        <Button variant="primary">返回能力总览</Button>
      </Link>
    </div>
  )
}
