import { useEffect, useRef, useState } from "react"
import { lazy, Suspense } from "react"
import { NavLink, Route, Routes, useLocation } from "react-router-dom"
import { cn } from "../lib/cn"
import { ThemeToggle } from "./ThemeToggle"
import { Loading } from "./ui"
import ScopeTagline from "./ScopeTagline"
import ErrorBoundary from "./ErrorBoundary"

// P2：五页改为动态导入 → 自动代码分割（每页独立 chunk，首屏只加载外壳 + 当前路由）。
const Dashboard = lazy(() => import("../pages/Dashboard"))
const GapPage = lazy(() => import("../pages/GapPage"))
const RoadmapPage = lazy(() => import("../pages/RoadmapPage"))
const ClustersPage = lazy(() => import("../pages/ClustersPage"))
const DataPage = lazy(() => import("../pages/DataPage"))
const DataSchedulePage = lazy(() => import("../pages/DataSchedulePage"))
const PersonaPage = lazy(() => import("../pages/PersonaPage"))
const RoleComparePage = lazy(() => import("../pages/RoleComparePage"))
const SalaryAuditPage = lazy(() => import("../pages/SalaryAuditPage"))
const RoleDetailPage = lazy(() => import("../pages/RoleDetailPage"))
const JobsPage = lazy(() => import("../pages/JobsPage"))
const AnalysisShowcasePage = lazy(() => import("../pages/AnalysisShowcasePage"))
const DesignSystemShowcase = lazy(() => import("../design-system/Showcase"))
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"))

const NAV_GROUPS = [
  {
    label: "看板",
    items: [
      { to: "/", label: "能力总览", end: true },
      { to: "/gap", label: "能力缺口" },
      { to: "/roadmap", label: "学习路线" },
      { to: "/clusters", label: "岗位图谱" },
      { to: "/data", label: "数据洞察" },
      { to: "/data-schedule", label: "数据调度" },
    ],
  },
  {
    label: "岗位",
    items: [
      { to: "/jobs", label: "职位列表" },
      { to: "/compare", label: "角色对比" },
      { to: "/salary-audit", label: "薪校解密" },
      { to: "/role-detail", label: "岗位细报" },
    ],
  },
  {
    label: "个人",
    items: [{ to: "/persona", label: "我的画像" }],
  },
  {
    label: "系统",
    items: [
      { to: "/analysis-showcase", label: "分析组件" },
      { to: "/design-system", label: "设计规范" },
    ],
  },
]

function BrandBlock() {
  return (
    <div className="px-3 pb-3 pt-1">
      <div className="brand-shimmer font-display text-lg font-bold">AI 求职情报</div>
      <div className="mt-1.5">
        <ScopeTagline className="text-xs" />
      </div>
    </div>
  )
}

function NavLinkItem({ item, search }: { item: { to: string; label: string; end?: boolean }; search?: string }) {
  // 保留当前 URL 的 ?role=&city= 等作用域参数，跨页面切换不丢失角色/城市选择。
  const to = search ? { pathname: item.to, search } : item.to
  return (
    <NavLink
      to={to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/15 text-text ring-1 ring-inset ring-primary/40"
            : "text-muted hover:bg-surface hover:text-text"
        )
      }
    >
      {item.label}
    </NavLink>
  )
}

function NavGroups({ search }: { search?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
            {g.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <NavLinkItem key={it.to} item={it} search={search} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AppShell() {
  // 方案 C：作用域从 URL（?role=&city=）读取，是各页面看"哪个市场"的单一真相源
  // （各页通过 useScope() 自行读取；作用域筛选已折叠进侧边栏品牌区的 ScopeTagline）。

  // P1-1：分析数据不再在 AppShell 全局阻塞。各页面（Dashboard/Gap/Roadmap/Clusters/Data）
  // 通过 useAnalytics(scope) 自行取数，无关页面（persona/compare/salary-audit/jobs）
  // 不再等待 204KB analytics。外壳只负责导航与路由渲染。
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const desktopNavRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // 路由切换时自动收起移动端抽屉
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  // A1：移动端抽屉无障碍——Esc 关闭 + 焦点移入/返回 + 背景 inert + Tab 焦点陷阱
  useEffect(() => {
    if (!navOpen) return
    const panel = panelRef.current
    const content = contentRef.current
    const desktopNav = desktopNavRef.current

    // 焦点移入抽屉（优先首个可聚焦元素，即关闭按钮）
    const focusables = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)
      : []
    ;(focusables[0] ?? panel)?.focus()

    // 背景内容设为 inert，避免 Tab 逃逸到抽屉背后
    if (content) (content as HTMLElement & { inert: boolean }).inert = true
    if (desktopNav) (desktopNav as HTMLElement & { inert: boolean }).inert = true

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setNavOpen(false)
        return
      }
      if (e.key === "Tab" && panel) {
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      if (content) (content as HTMLElement & { inert: boolean }).inert = false
      if (desktopNav) (desktopNav as HTMLElement & { inert: boolean }).inert = false
      // 关闭后焦点返回触发按钮（汉堡键）
      triggerRef.current?.focus()
    }
  }, [navOpen])

  return (
    <div className="relative z-10 flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        跳到主内容
      </a>

      {/* 桌面端常驻侧边栏：sticky 全高，品牌固定顶部、导航区可滚、作用域固定底部 */}
      <aside
        ref={desktopNavRef}
        className="hidden w-60 shrink-0 flex-col border-r border-border lg:sticky lg:top-0 lg:flex lg:h-screen"
      >
        <div className="shrink-0 border-b border-border px-3 py-4">
          <BrandBlock />
          <div className="mt-3 flex justify-start">
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="主导航" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <NavGroups search={location.search} />
        </nav>
      </aside>

      {/* 移动端抽屉 */}
      {navOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden="true"
            onClick={() => setNavOpen(false)}
          />
          <aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-bg p-2"
          >
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label="关闭导航"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted transition-colors hover:text-text"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ✕
                </span>
              </button>
            </div>
            <nav aria-label="主导航" className="flex flex-col gap-1 p-3">
              <BrandBlock />
              <NavGroups search={location.search} />
            </nav>
          </aside>
        </div>
      )}

      <div ref={contentRef} className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏（含汉堡 + 行内作用域标签） */}
        <header className="flex flex-col gap-2 border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="打开导航"
              aria-expanded={navOpen}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border text-text"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ≡
              </span>
            </button>
            <span className="font-display text-base font-semibold text-text">AI 求职情报</span>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
          <ScopeTagline className="text-sm" variant="header" />
        </header>

        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
            <Suspense fallback={<Loading msg="加载页面…" />}>
              <ErrorBoundary>
                <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/gap" element={<GapPage />} />
                <Route path="/roadmap" element={<RoadmapPage />} />
                <Route path="/clusters" element={<ClustersPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/data-schedule" element={<DataSchedulePage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:id" element={<JobsPage />} />
                <Route path="/compare" element={<RoleComparePage />} />
                <Route path="/salary-audit" element={<SalaryAuditPage />} />
                <Route path="/role-detail" element={<RoleDetailPage />} />
                <Route path="/analysis-showcase" element={<AnalysisShowcasePage />} />
                <Route path="/persona" element={<PersonaPage />} />
                <Route path="/design-system" element={<DesignSystemShowcase />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              </ErrorBoundary>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
