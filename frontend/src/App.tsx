import { lazy, Suspense } from "react"
import { Routes, Route, useNavigate, useLocation } from "react-router-dom"
import ErrorBoundary from "./components/ErrorBoundary"

const Dashboard = lazy(() => import("./pages/Dashboard"))
const MarketPage = lazy(() => import("./pages/MarketPage"))
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"))
const PersonaPage = lazy(() => import("./pages/PersonaPage"))
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"))
const ReportsPage = lazy(() => import("./pages/ReportsPage"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))

function IconChart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  )
}
function IconSearch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}
function IconUser(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    </svg>
  )
}
function IconRoadmap(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
function IconReport(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a5 5 0 0 1 5 5c0 2.5-1.5 4.5-3 6s-3 3.5-3 6a5 5 0 0 1-5-5c0-2.5 1.5-4.5 3-6s3-3.5 3-6z" />
      <path d="M12 12v10" />
    </svg>
  )
}

const NAV = [
  { to: "/", label: "市场概览", end: true, icon: IconChart },
  { to: "/market", label: "岗位市场", icon: IconSearch },
  { to: "/profile", label: "我的画像", icon: IconUser },
  { to: "/roadmap", label: "学习路线", icon: IconRoadmap },
  { to: "/reports", label: "智能分析", icon: IconReport },
]

function AppShell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const current = loc.pathname

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center font-display font-bold text-sm">JI</div>
            <div>
              <div className="font-display text-sm font-semibold leading-tight">JobIntel</div>
              <div className="text-xs text-muted">AI 求职情报</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:px-3 ${
                    current === item.to ? "text-text" : "text-muted"
                  }`}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <ErrorBoundary>
          <Suspense fallback={<div className="text-sm text-muted">加载中…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/profile" element={<PersonaPage />} />
              <Route path="/roadmap" element={<RoadmapPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted">
          JobIntel · 数据来自公开岗位采集 · 分析由 Hush AI OS 提供
        </div>
      </footer>
    </div>
  )
}

export default AppShell
