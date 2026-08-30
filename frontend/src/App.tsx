import { lazy } from "react"
import { Routes, Route, NavLink, useLocation } from "react-router-dom"
import { cn } from "./lib/cn"

const Dashboard = lazy(() => import("./pages/Dashboard"))
const MarketPage = lazy(() => import("./pages/MarketPage"))
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"))
const PersonaPage = lazy(() => import("./pages/PersonaPage"))
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))

const NAV = [
  { to: "/", label: "市场概览", end: true },
  { to: "/market", label: "岗位市场" },
  { to: "/profile", label: "我的画像" },
  { to: "/roadmap", label: "学习路线" },
]

export default function App() {
  const location = useLocation()
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent/20 text-accent">JI</div>
            <div>
              <div className="font-display text-sm font-semibold leading-tight">JobIntel</div>
              <div className="text-xs text-muted">AI 求职情报</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    isActive ? "bg-surface-solid text-text" : "text-muted hover:text-text",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/profile" element={<PersonaPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted">
          JobIntel · 数据来自公开岗位采集 · 分析由 Hush AI OS 提供
        </div>
      </footer>
    </div>
  )
}
