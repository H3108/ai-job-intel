import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useQuery } from "@tanstack/react-query"
import {
  fetchJobs,
  fetchHealth,
  fetchSalaryAudit,
  type JobsList,
  type Health,
} from "../api/client"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { cn } from "../lib/cn"
import {
  Section,
  Alert,
  Input,
  Select,
  Skeleton,
  EmptyState,
  PageHeader,
  Badge,
  Button,
} from "../design-system"
import { Link } from "react-router-dom"
import { friendlyError } from "../lib/errorMessage"
import JobCard from "../components/JobCard"
import ImportPanel from "../components/ImportPanel"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "collected", label: "已采集" },
  { value: "analyzed", label: "已分析" },
  { value: "viewed", label: "已查看" },
  { value: "applied", label: "已投递" },
  { value: "archived", label: "已归档" },
  { value: "expired", label: "已过期" },
  { value: "rejected", label: "已拒绝" },
  { value: "ignored", label: "不投" },
]

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "recent", label: "最近采集" },
  { value: "oldest", label: "最早采集" },
  { value: "title", label: "标题 A→Z" },
  { value: "status", label: "按状态" },
]

function fmtTime(s: string) {
  try {
    return new Date(s.replace(" ", "T") + "Z").toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

function pct(n: number, total: number) {
  if (total <= 0) return "0%"
  return `${Math.round((n / total) * 100)}%`
}

export default function Dashboard() {
  const scope = useScope()
  const analyticsQuery = useAnalytics(scope)
  const jobsQuery = useQuery<JobsList>({ queryKey: ["jobs", scope], queryFn: () => fetchJobs(scope) })
  const healthQuery = useQuery<Health>({ queryKey: ["health"], queryFn: fetchHealth })
  const salaryQuery = useQuery({ queryKey: ["salary-audit"], queryFn: fetchSalaryAudit })

  const jobs = jobsQuery.data?.jobs ?? []
  const total = jobsQuery.data?.total ?? 0
  const loading = jobsQuery.isLoading
  const error = jobsQuery.error ? String(jobsQuery.error) : null
  const health = healthQuery.data ?? null
  const analytics = analyticsQuery.data ?? null

  const analyzed = jobs.filter((j) => j.status && j.status !== "collected").length

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [sortBy, setSortBy] = useState("recent")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = jobs.filter((j) => {
      const matchQ =
        !q ||
        j.title.toLowerCase().includes(q) ||
        (j.company || "").toLowerCase().includes(q)
      const matchS = status === "all" || (j.status || "collected") === status
      return matchQ && matchS
    })
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title, "zh-Hans-CN")
        case "status":
          return (a.status || "").localeCompare(b.status || "")
        case "oldest":
          return (a.first_seen || "").localeCompare(b.first_seen || "")
        case "recent":
        default:
          return (b.first_seen || "").localeCompare(a.first_seen || "")
      }
    })
  }, [jobs, query, status, sortBy])

  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 168,
    overscan: 6,
  })

  const salary = salaryQuery.data?.summary
  const marketLabel = scope.role || scope.city ? `/${scope.city ?? "全部"} · ${scope.role ?? "全部"}` : "/market"

  return (
    <div className="space-y-10">
      <PageHeader
        title={<span className="brand-shimmer">AI 求职情报系统</span>}
        desc={`${[scope.city ? scope.city + " AI 岗" : "AI 岗", scope.role].filter(Boolean).join(" · ")} · 能力模型 · 学习路线`}
      />

      {health && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-2 font-medium",
              health.status === "ok"
                ? "text-success-fg"
                : health.status === "warn"
                  ? "text-accent"
                  : "text-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                health.status === "ok"
                  ? "bg-success"
                  : health.status === "warn"
                    ? "bg-accent"
                    : "bg-muted",
              )}
            >
              {health.status === "warn" && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning ring-1 ring-bg"
                />
              )}
            </span>
            {health.status === "ok" ? "采集正常" : health.status === "warn" ? "采集有告警" : "暂无采集记录"}
          </span>
          <span className="text-muted">·</span>
          <span>
            样本 <b className="font-semibold text-text">{health.total}</b> 条
          </span>
          {health.lastRun && (
            <>
              <span className="text-muted">·</span>
              <span>
                本次告警 <b className="font-semibold text-text">{health.lastRun.alerts_count}</b> 条
              </span>
              <span className="text-muted">·</span>
              <span>最近采集 {fmtTime(health.lastRun.ran_at)}</span>
            </>
          )}
        </div>
      )}

      {analytics && (
        <Section title="能力总览" desc="技能优先级、岗位方向、经验与学历分布，全部基于已分析样本实时生成。">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted">总岗位</div>
                  <div className="font-display text-2xl font-semibold text-text">{total}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted">已分析</div>
                  <div className="font-display text-2xl font-semibold text-text">{analyzed}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted">分析覆盖率</div>
                  <div className="font-display text-2xl font-semibold text-text">{pct(analyzed, total || 1)}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted">已解密薪资</div>
                  <div className="font-display text-2xl font-semibold text-text">
                    {salary?.decoded ?? "—"}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <div className="text-sm font-semibold text-text">推荐下一步</div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted">
                  <Badge tone="neutral">补抓 detail 页生成 raw</Badge>
                  <Badge tone="neutral">跑一轮真实 LLM analyze</Badge>
                  <Badge tone="neutral">核对登录态与城市矩阵</Badge>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold text-text">当前薪资区间</div>
              <div className="mt-3 space-y-2 text-sm text-muted">
                <div>红区(低置信) <b className="text-text">{salary?.lowConfRed ?? 0}</b></div>
                <div>黄区(低置信) <b className="text-text">{salary?.lowConfYellow ?? 0}</b></div>
                <div>中位置信 <b className="text-text">{salary?.medianConfidence != null ? Math.round(salary.medianConfidence * 100) + "%" : "—"}</b></div>
              </div>
              <div className="mt-4">
                <Link to={marketLabel} className="mt-4 block">
                  <Button variant="secondary" className="w-full">
                    进入岗位市场
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Section>
      )}

      {error && (
        <Alert tone="danger" title="接口异常">
          {friendlyError(error)}
        </Alert>
      )}

      {analyticsQuery.isError && (
        <Alert tone="warning" title="分析数据加载失败">
          {friendlyError(analyticsQuery.error)}
        </Alert>
      )}

      <ImportPanel onImported={() => jobsQuery.refetch()} />

      <Section
        title="岗位列表"
        desc={
          <span aria-live="polite">
            {filtered.length} / {jobs.length} 条
            {jobsQuery.isFetching && !loading && <span className="ml-1 text-accent">· 更新中</span>}
          </span>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题 / 公司…"
            className="sm:w-64"
            aria-label="搜索岗位标题或公司"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-40" aria-label="按状态筛选">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sm:w-40" aria-label="排序方式">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {loading && (
          <>
            <p className="sr-only" role="status" aria-live="polite">
              加载中…
            </p>
            <ul className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <Skeleton className="h-28" />
                </li>
              ))}
            </ul>
          </>
        )}

        {!loading && !error && jobs.length === 0 && (
          <EmptyState title="暂无岗位数据" desc="用上方「手动导入」或采集器抓取。" />
        )}

        {!loading && jobs.length > 0 && filtered.length === 0 && (
          <EmptyState title="没有匹配结果" desc="调整搜索关键词或筛选条件。" />
        )}

        {!loading && filtered.length > 0 && (
          <div
            ref={parentRef}
            tabIndex={0}
            aria-label="岗位列表（可滚动，已虚拟化）"
            className="max-h-[70vh] overflow-auto border-t border-border"
          >
            <ul className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const j = filtered[vi.index]
                return (
                  <li
                    key={j.id}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <JobCard job={j} />
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Section>
    </div>
  )
}
