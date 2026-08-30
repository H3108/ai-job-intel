import { Link } from "react-router-dom"
import { Section, Button } from "../design-system"

export default function NotFoundPage() {
  return (
    <div className="grid place-items-center py-24">
      <Section className="text-center">
        <div className="text-5xl font-display font-bold text-text">404</div>
        <div className="mt-2 text-muted">页面未找到</div>
        <div className="mt-4">
          <Link to="/"><Button>返回首页</Button></Link>
        </div>
      </Section>
    </div>
  )
}
