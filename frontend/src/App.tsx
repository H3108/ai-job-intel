import { lazy, Suspense } from "react"
import { Routes, Route, useNavigate, useLocation } from "react-router-dom"
import ErrorBoundary from "./components/ErrorBoundary"

const OverviewPage = lazy(() => import("./pages/OverviewPage"))
const MarketPage = lazy(() => import("./pages/MarketPage"))
const MatchesPage = lazy(() => import("./pages/MatchesPage"))
const CareerPage = lazy(() => import("./pages/CareerPage"))
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"))
const ProfilePage = lazy(() => import("./pages/ProfilePage"))
const ReportsPage = lazy(() => import("./pages/ReportsPage"))
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"))
const SavedJobsPage = lazy(() => import("./pages/SavedJobsPage"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))

function IconOverview(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  )
}
function IconMarket(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}
function IconMatches(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
function IconCareer(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
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
function IconProfile(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" focusable="false" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
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
  { to: "/", label: "Overview", end: true, icon: IconOverview },
  { to: "/market", label: "Market", icon: IconMarket },
  { to: "/matches", label: "Matches", icon: IconMatches },
  { to: "/career", label: "Career", icon: IconCareer },
  { to: "/roadmap", label: "Roadmap", icon: IconRoadmap },
  { to: "/profile", label: "Profile", icon: IconProfile },
  { to: "/reports", label: "Reports", icon: IconReport },
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
              <div className="text-xs text-muted">AI Career Intelligence</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = current === item.to
              return (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:px-3 ${
                    active ? "text-text" : "text-muted"
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
            <div className="animate-fade-in">
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/matches" element={<MatchesPage />} />
                <Route path="/career" element={<CareerPage />} />
                <Route path="/roadmap" element={<RoadmapPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/jobs/:id" element={<JobDetailPage />} />
                <Route path="/saved" element={<SavedJobsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </div>
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
