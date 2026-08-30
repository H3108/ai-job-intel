import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  fetchJobs,
  fetchSalaryAudit,
  fetchScopes,
  type JobsList,
} from "../api/client"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { PageHeader, Section, Alert, Badge, Button } from "../design-system"
import { Loading, ErrorBox } from "../components/ui"
import { friendlyError } from "../lib/errorMessage"

const PAGE = 50

export default function MarketPage() {
  const scope = useScope()
  const analytics = useAnalytics(scope)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const [filterOpen, setFilterOpen] = useState(false)

  const scopesQuery = useQuery({
    queryKey: ["scopes"],
    queryFn: fetchScopes,
  })

  const roleOptions = useMemo(() => scopesQuery.data?.roles ?? [], [scopesQuery.data?.roles])
  const cityOptions = useMemo(() => scopesQuery.data?.cities ?? [], [scopesQuery.data?.cities])

  const jobsQuery = useQuery<JobsList>({
    queryKey: ["jobs", scope, page],
    queryFn: () => fetchJobs(scope, { limit: PAGE, offset: page * PAGE }),
  })

  const salaryQuery = useQuery({
    queryKey: ["salary-audit"],
    queryFn: fetchSalaryAudit,
  })

  const total = jobsQuery.data?.total ?? 0
  const loading = jobsQuery.isLoading
  const error = jobsQuery.error ? friendlyError(jobsQuery.error) : null

  const filteredQuery = useQuery<JobsList>({
    enabled: !!q.trim(),
    queryKey: ["jobs", scope, q.trim(), 0],
    queryFn: () =>
      fetchJobs(scope, {
        limit: PAGE,
        offset: 0,
      }),
  })

  const source = q.trim() ? filteredQuery.data : jobsQuery.data
  const list = source?.jobs ?? []
  const currentTotal = source?.total ?? total
  const isLoadingMore = q.trim() ? filteredQuery.isFetching : jobsQuery.isFetching
  const isSearching = !!q.trim()
  const hasMore = list.length < currentTotal && !isLoadingMore

  const scopeLabel = [scope.city ? scope.city + " AI 岗" : "AI 岗", scope.role]
    .filter(Boolean)
    .join(" · ")


  const updateScope = useCallback((key: 'role' | 'city', value: string) => {
    const next = new URLSearchParams(window.location.search)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`)
  }, [])

  return (
    <div className="space-y-10">
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        role={scope.role}
        city={scope.city}
        onRole={(r) => updateScope('role', r)}
        onCity={(c) => updateScope('city', c)}
        roles={roleOptions}
        cities={cityOptions}
      />

      <PageHeader
        title="岗位市场"
        desc={`${scopeLabel || "全部市场"} · 共 ${currentTotal} 个职位`}
      />

      {jobsQuery.isError && (
        <Alert tone="danger" title="加载失败">
          {error}
        </Alert>
      )}

      <Section title="搜索职位" desc="关键词命中标题/公司/方向，点击行查看详情。">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="搜索职位、公司、方向…"
            className="sm:w-72"
            aria-label="搜索职位"
          />
          <div className="text-sm text-muted">
            {list.length} / {currentTotal}
          </div>
        </div>

        {/* 桌面端内联筛选器：角色/城市 + 搜索并排 */}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted">角色</label>
            <select
              value={scope.role ?? ""}
              onChange={(e) => {
                const next = new URLSearchParams(window.location.search)
                if (e.target.value) next.set("role", e.target.value)
                else next.delete("role")
                window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`)
              }}
              className="h-9 rounded-lg border border-border bg-bg px-3 text-sm"
            >
              <option value="">全部角色</option>
              {roleOptions.map((r: string) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <label className="text-xs text-muted">城市</label>
            <select
              value={scope.city ?? ""}
              onChange={(e) => {
                const next = new URLSearchParams(window.location.search)
                if (e.target.value) next.set("city", e.target.value)
                else next.delete("city")
                window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`)
              }}
              className="h-9 rounded-lg border border-border bg-bg px-3 text-sm"
            >
              <option value="">全部城市</option>
              {cityOptions.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-muted">
            {list.length} / {currentTotal}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface text-left text-muted">
                <th className="px-4 py-3 font-medium">职位</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 font-medium">城市</th>
                <th className="px-4 py-3 font-medium">方向</th>
                <th className="px-4 py-3 font-medium text-right">薪资</th>
                <th className="px-4 py-3 font-medium">经验</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-border transition-colors hover:bg-surface"
                >
                  <td className="px-4 py-3 text-text">{j.title}</td>
                  <td className="px-4 py-3 text-muted">{j.company ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{j.location ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{j.role ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-text">
                    {j.salary ?? "面议"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {j.experience ?? "—"}
                  </td>
                </tr>
              ))}
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    没有匹配结果
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => {
                if (isSearching) {
                  setPage(0)
                  filteredQuery.refetch()
                } else {
                  setPage((p) => p + 1)
                }
              }}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "加载中…" : "加载更多"}
            </Button>
          </div>
        )}
      </Section>

      <Section title="市场分布" desc="当前作用域下的岗位方向分布。">
        {analytics.isLoading && <Loading msg="加载市场分布…" />}
        {analytics.isError && (
          <ErrorBox msg={friendlyError(analytics.error)} />
        )}
        <DistPanel analytics={analytics.data} />
      </Section>

      <Section title="薪资抽检" desc="薪资解码健康度摘要。">
        {salaryQuery.isLoading && <Loading msg="加载薪资抽检…" />}
        {salaryQuery.isError && (
          <ErrorBox msg={friendlyError(salaryQuery.error)} />
        )}
        <SalaryPanel summary={salaryQuery.data?.summary} />
      </Section>
    </div>
  )
}

function FilterDrawer({open, onClose, role, city, onRole, onCity, roles, cities}: {
  open: boolean
  onClose: () => void
  role?: string
  city?: string
  onRole: (v: string) => void
  onCity: (v: string) => void
  roles: string[]
  cities: string[]
}) {
  if (!open) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="筛选">
      <div className="mx-auto max-w-6xl rounded-t-2xl border-t border-border bg-bg p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-text">筛选</div>
          <button type="button" onClick={onClose} className="text-muted" aria-label="关闭筛选">✕</button>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted">角色</label>
            <select value={role ?? ""} onChange={(e) => onRole(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="">全部角色</option>
              {roles.map((r: string) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted">城市</label>
            <select value={city ?? ""} onChange={(e) => onCity(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="">全部城市</option>
              {cities.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button className="w-full" onClick={onClose}>查看结果</Button>
        </div>
      </div>
    </div>
  )
}

function DistPanel({
  analytics,
}: {
  analytics?: {
    titleClusters?: { key: string; count: number }[]
  }
}) {
  if (!analytics) return null

  const clusters = analytics.titleClusters ?? []
  if (!clusters.length) return <p className="text-sm text-muted">暂无分布数据</p>

  const max = Math.max(...clusters.map((c) => c.count), 1)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clusters.slice(0, 12).map((c) => (
        <div
          key={c.key}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"
        >
          <span className="text-text">{c.key}</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.round(c.count / max * 100)}%` }}
              />
            </div>
            <Badge tone="neutral" dot>
              {c.count}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function SalaryPanel({
  summary,
}: {
  summary?: {
    decoded?: number
    lowConfYellow?: number
    lowConfRed?: number
    lowConfRedRate?: number
  }
}) {
  if (!summary)
    return (
      <p className="text-sm text-muted">暂无薪资摘要，等待后端 salaryStats 生成。</p>
    )
  const { decoded, lowConfYellow, lowConfRed, lowConfRedRate } = summary
  const rate = typeof lowConfRedRate === "number" ? `${(lowConfRedRate * 100).toFixed(1)}%` : "—"
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="text-xs text-muted">已解密样本</div>
        <div className="mt-1 text-lg font-semibold text-text">{decoded ?? 0}</div>
      </div>
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="text-xs text-muted">低置信黄</div>
        <div className="mt-1 text-lg font-semibold text-text">{lowConfYellow ?? 0}</div>
      </div>
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="text-xs text-muted">低置信红</div>
        <div className="mt-1 text-lg font-semibold text-text">{lowConfRed ?? 0}</div>
      </div>
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="text-xs text-muted">低置信红占比</div>
        <div className="mt-1 text-lg font-semibold text-text">{rate}</div>
      </div>
    </div>
  )
}
