import { useEffect, useRef, useState } from "react"
import { lazy, Suspense } from "react"
import { NavLink, Route, Routes, useLocation } from "react-router-dom"
import { cn } from "../lib/cn"
import { ThemeToggle } from "./ThemeToggle"
import { Loading } from "./ui"
import ScopeTagline from "./ScopeTagline"
import ErrorBoundary from "./ErrorBoundary"
import { Button } from "../design-system"

const Dashboard = lazy(() => import("../pages/Dashboard"))
const MarketPage = lazy(() => import("../pages/MarketPage"))
const JobsPage = lazy(() => import("../pages/JobsPage"))
const RoleComparePage = lazy(() => import("../pages/RoleComparePage"))
const RoleDetailPage = lazy(() => import("../pages/RoleDetailPage"))
const PersonaPage = lazy(() => import("../pages/PersonaPage"))
const AdminDataPage = lazy(() => import("../pages/DataPage"))
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"))

const NAV_GROUPS = [
  {
    label: "看板",
    items: [
      { to: "/", label: "能力总览", end: true },
      { to: "/roadmap", label: "学习路线" },
    ],
  },
  {
    label: "岗位",
    items: [
      { to: "/jobs", label: "职位列表" },
      { to: "/market", label: "岗位市场" },
      { to: "/compare", label: "角色对比" },
      { to: "/role-detail", label: "岗位细报" },
    ],
  },
  {
    label: "个人",
    items: [{ to: "/persona", label: "我的画像" }],
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

const ADMIN_SECRET = "hush-admin"

function AdminRoute({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false)
  const [input, setInput] = useState("")
  const [error, setError] = useState("")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input === ADMIN_SECRET) {
      setOk(true)
      sessionStorage.setItem("hush_admin", "1")
    } else {
      setError("访问码错误")
    }
  }

  useEffect(() => {
    if (sessionStorage.getItem("hush_admin") === "1") setOk(true)
  }, [])

  if (ok) return <>{children}</>

  return (
    <div className="mx-auto mt-20 max-w-sm rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text">管理员验证</h2>
      <p className="mt-1 text-sm text-muted">请输入访问码以查看数据后台。</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="访问码"
          className="w-full"
          aria-label="管理员访问码"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button className="w-full">验证</Button>
      </form>
    </div>
  )
}

function BottomNav() {
  const location = useLocation()
  const items = [
    { to: "/", label: "首页" },
    { to: "/market", label: "市场" },
    { to: "/roadmap", label: "路线" },
    { to: "/persona", label: "我的" },
  ]
  return (
    <nav
      aria-label="主导航底部栏"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-4 px-2">
        {items.map((it) => {
          const active = it.to === "/" ? location.pathname === "/" : location.pathname.startsWith(it.to)
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                active ? "text-text" : "text-muted"
              )}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {it.to === "/" ? "⌂" : it.to === "/market" ? "◫" : it.to === "/roadmap" ? "⟶" : "◉"}
              </span>
              {it.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function NavLinkItem({ item, search }: { item: { to: string; label: string; end?: boolean }; search?: string }) {
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
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const desktopNavRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) return
    const panel = panelRef.current
    const content = contentRef.current
    const desktopNav = desktopNavRef.current

    const focusables = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)
      : []
    ;(focusables[0] ?? panel)?.focus()

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

      <div ref={contentRef} className="flex min-w-0 flex-1 flex-col pb-14 lg:pb-0">
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
                  <Route path="/jobs" element={<JobsPage />} />
                  <Route path="/jobs/:id" element={<JobsPage />} />
                  <Route path="/market" element={<MarketPage />} />
                  <Route path="/compare" element={<RoleComparePage />} />
                  <Route path="/role-detail" element={<RoleDetailPage />} />
                  <Route path="/persona" element={<PersonaPage />} />
                  <Route path="/admin/data" element={<AdminRoute><AdminDataPage /></AdminRoute>} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </ErrorBoundary>
            </Suspense>
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  )
}
