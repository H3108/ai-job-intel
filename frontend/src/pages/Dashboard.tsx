import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useQuery } from "@tanstack/react-query"
import { fetchJobs, fetchHealth, type JobsList, type Health } from "../api/client"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { cn } from "../lib/cn"
import { Section, Alert, Input, Select, Skeleton, EmptyState, PageHeader } from "../design-system"
import { friendlyError } from "../lib/errorMessage"
import JobCard from "../components/JobCard"
import ImportPanel from "../components/ImportPanel"
import AnalyticsPanel from "../components/AnalyticsPanel"
import CapabilityHero from "../components/CapabilityHero"

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

export default function Dashboard() {
  // 方案 C：岗位列表按当前 URL 作用域（?role=&city=）过滤，和分析看板保持一致。
  const scope = useScope()
  // P1-1：分析数据自行按 scope 取数（无需等待 AppShell 全局 gate；无关页面不再被阻塞）。
  const { data: analytics, isError: analyticsError, error: analyticsErr } = useAnalytics(scope)
  const jobsQuery = useQuery<JobsList>({ queryKey: ["jobs", scope], queryFn: () => fetchJobs(scope) })

  const jobs = jobsQuery.data?.jobs ?? []
  const loading = jobsQuery.isLoading
  const error = jobsQuery.error ? String(jobsQuery.error) : null

  // 采集健康度（看板状态灯）：从 /api/health 派生风控/异常/薪资解密成功率。
  const healthQuery = useQuery<Health>({ queryKey: ["health"], queryFn: fetchHealth })
  const health = healthQuery.data ?? null
  const fmtTime = (s: string) => {
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

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [sortBy, setSortBy] = useState("recent")

  const analyzed = jobs.filter((j) => j.status && j.status !== "collected").length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = jobs.filter((j) => {
      const matchQ = !q || j.title.toLowerCase().includes(q) || (j.company || "").toLowerCase().includes(q)
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

  return (
    <div className="space-y-12">
      <PageHeader
        title={<span className="brand-shimmer">AI 求职情报系统</span>}
        desc={`${[scope.city ? scope.city + ' AI 岗' : 'AI 岗', scope.role].filter(Boolean).join(' · ')} · 能力模型 · 学习路线`}
      />

      {/* P3 记忆点：英雄区能力图谱 + 动态数字（替换原概览统计） */}
      {analytics && <CapabilityHero analytics={analytics} jobCount={jobs.length} analyzedCount={analyzed} />}

      {/* 采集健康度状态（v2.3：扁平内联状态行；warn 用 accent 绿主体 + 琥珀角标暗示警示，整体融入黑绿主题） */}
      {health && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-2 font-medium",
              health.status === "ok" ? "text-success-fg" : health.status === "warn" ? "text-accent" : "text-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                health.status === "ok" ? "bg-success" : health.status === "warn" ? "bg-accent" : "bg-muted",
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
          <span className="text-muted">·</span>
          <span>
            薪资解密 <b className="font-semibold text-text">{health.salaryRate}%</b>
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

      {/* 错误条：仅提示，不清空已有列表（react-query 保留上一次成功数据） */}
      {error && (
        <Alert tone="danger" title="接口异常">
          {friendlyError(error)}
        </Alert>
      )}

      {/* 分析数据错误（不影响岗位列表与采集健康度） */}
      {analyticsError && (
        <Alert tone="warning" title="分析数据加载失败">
          {String(analyticsErr)}
        </Alert>
      )}

      {/* 刷新态（非首屏加载，保留列表） */}
      {jobsQuery.isFetching && !loading && (
        <p className="sr-only" role="status" aria-live="polite">
          更新岗位数据中…
        </p>
      )}

      {analytics && (
        <Section title="能力分析" desc="技能优先级、岗位方向、经验与学历分布，全部基于已分析样本实时生成。">
          <AnalyticsPanel data={analytics} />
        </Section>
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
        {/* 搜索 / 筛选 / 排序 工具栏 */}
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
          <EmptyState title="暂无岗位数据" desc="用上方「手动导入」或 Phase 1 爬虫采集。" />
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
