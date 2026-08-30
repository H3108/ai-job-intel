import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchJobs, fetchJobsStats, fetchCrawlStatus, fetchIntelligenceLatest, fetchProfile, type JobsList } from "../api/client"
import { Section, Alert, Input, Select, Skeleton, EmptyState, PageHeader, Badge, Button } from "../design-system"
import { Link } from "react-router-dom"
import { friendlyError } from "../lib/errorMessage"
import JobCard from "../components/JobCard"

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "collected", label: "已采集" },
  { value: "active", label: "有效" },
  { value: "archived", label: "已归档" },
  { value: "expired", label: "已过期" },
]
const SORT_OPTIONS = [
  { value: "recent", label: "最近采集" },
  { value: "oldest", label: "最早采集" },
  { value: "title", label: "标题 A→Z" },
]
const PAGE = 20

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

export default function Dashboard() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [sortBy, setSortBy] = useState("recent")
  const [page, setPage] = useState(0)

  const statsQuery = useQuery({ queryKey: ["jobsStats"], queryFn: fetchJobsStats })
  const crawlQuery = useQuery({ queryKey: ["crawlStatus"], queryFn: fetchCrawlStatus })
  const intelQuery = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile })

  const jobsQuery = useQuery<JobsList>({
    queryKey: ["jobs", query, status, sortBy, page],
    queryFn: () =>
      fetchJobs({
        q: query || undefined,
        limit: PAGE,
        offset: page * PAGE,
      }),
  })

  const sorted = useMemo(() => {
    const src = (jobsQuery.data?.jobs ?? []).slice()
    if (sortBy === "title") {
      src.sort((a, b) => (a.title || "").localeCompare(b.title || ""))
    } else if (sortBy === "oldest") {
      src.sort((a, b) => (a.posted_at || "").localeCompare(b.posted_at || ""))
    } else {
      src.sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""))
    }
    return src
  }, [jobsQuery.data?.jobs, sortBy])

  const filtered = useMemo(() => {
    if (status === "all") return sorted
    return sorted.filter((j) => j.status === status)
  }, [sorted, status])

  const total = jobsQuery.data?.total ?? 0
  const loading = jobsQuery.isLoading
  const error = jobsQuery.error ? friendlyError(jobsQuery.error) : null
  const stats = statsQuery.data
  const crawl = crawlQuery.data
  const intel = intelQuery.data
  const profile = profileQuery.data
  const intelTypes = intel?.types || {}
  const intelKeys = Object.keys(intelTypes)
  const crawlStatusLabel = crawl?.isRunning ? "采集中" : "空闲"
  const crawlStatusTone = crawl?.isRunning ? "success" : "neutral"
  const cities = useMemo(() => (stats?.cities ?? []).slice(0, 6), [stats?.cities])
  const roles = useMemo(() => (stats?.roles ?? []).slice(0, 12), [stats?.roles])

  return (
    <div className="space-y-10">
      <PageHeader
        title="市场概览"
        desc="岗位市场、采集状态与 AI 分析结果总览。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/market">浏览岗位</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/profile">我的画像</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/reports">智能分析</Link>
            </Button>
          </div>
        }
      />

      {jobsQuery.isError && (
        <Alert tone="danger" title="加载失败">
          无法读取岗位数据：{error}
        </Alert>
      )}
      {statsQuery.isError && (
        <Alert tone="danger" title="统计异常">
          无法读取岗位统计。
        </Alert>
      )}
      {crawlQuery.isError && (
        <Alert tone="danger" title="采集状态异常">
          无法读取采集状态。
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Section title="岗位总量" topSpace>
          <div className="font-display text-3xl font-semibold text-text tabular-nums">
            {stats?.total ?? 0}
          </div>
          <div className="mt-1 text-sm text-muted">
            近 7 日：{stats?.recent_7d ?? 0} / 近 30 日：{stats?.recent_30d ?? 0}
          </div>
        </Section>

        <Section title="热门城市" topSpace>
          <div className="flex flex-wrap gap-2">
            {cities.map((c: { city: string; n: number }) => (
              <Badge key={c.city} tone="primary">
                {c.city} {c.n}
              </Badge>
            ))}
            {!cities.length && <span className="text-sm text-muted">暂无城市数据</span>}
          </div>
          <div className="mt-2 text-sm text-muted">
            共 {stats?.cities?.length ?? 0} 个城市
          </div>
        </Section>

        <Section title="采集状态" topSpace>
          <div className="flex flex-col gap-2">
            <div>
              <Badge tone={crawlStatusTone}>{crawlStatusLabel}</Badge>
            </div>
            <div className="text-sm text-muted">
              上次运行：{crawl?.lastRun ? fmtTime(crawl.lastRun) : "—"}
            </div>
            <div className="text-sm text-muted">
              下次计划：{crawl?.nextRun ? fmtTime(crawl.nextRun) : "—"}
            </div>
          </div>
        </Section>

        <Section title="我的画像" topSpace>
          <div className="flex flex-col gap-1">
            <div className="text-sm text-text">
              {profile?.target_role ? `目标岗位：${profile.target_role}` : "目标岗位：未设置"}
            </div>
            <div className="text-sm text-text">
              {profile?.target_city ? `目标城市：${profile.target_city}` : "目标城市：未设置"}
            </div>
            <div className="text-sm text-muted">
              更新于：{profile?.updated_at ? new Date(profile.updated_at).toLocaleString("zh-CN") : "从未"}
            </div>
          </div>
          <div className="mt-3">
            <Button asChild variant="secondary">
              <Link to="/profile">更新画像</Link>
            </Button>
          </div>
        </Section>
      </div>

      <Section title="职能分布" desc="基于当前岗位列表的职能 Top。">
        <div className="flex flex-wrap gap-2">
          {roles.map((r: { role: string; n: number }) => (
            <Badge key={r.role} tone="secondary">
              {r.role} {r.n}
            </Badge>
          ))}
          {!roles.length && <span className="text-sm text-muted">暂无职能数据</span>}
        </div>
      </Section>

      <Section title="AI 分析结果" desc="由 Hush AI OS 生成；暂无结果时会自动降级。">
        {intelKeys.length === 0 && (
          <EmptyState
            title="暂无分析结果"
            desc="Hush AI OS 接入后将自动展示市场、推荐、技能差距与学习路线。"
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {intelKeys.map((key) => {
            const item = intelTypes[key]
            const label: Record<string, string> = {
              market: "市场分析",
              recommendations: "推荐岗位",
              skill_gap: "技能差距",
              roadmap: "学习路线",
              report: "报告",
            }
            return (
              <div
                key={String(key)}
                className="rounded-xl border border-border bg-surface px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text">
                    {label[String(key)] || String(key)}
                  </div>
                  <Badge tone="primary">已就绪</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">
                  更新于：{String((item as any)?.generated_at || intel?.generated_at)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  模型：{(item as any)?.model || "—"}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="岗位列表" desc={`共 ${total} 个职位，当前展示 ${filtered.length} 条`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="搜索标题 / 公司…"
            className="sm:w-64"
            aria-label="搜索岗位"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(0)
            }}
            className="sm:w-40"
            aria-label="按状态筛选"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value)
              setPage(0)
            }}
            className="sm:w-40"
            aria-label="排序方式"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loading && error && <Alert tone="danger" title="加载失败">{error}</Alert>}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState title="暂无岗位" desc="当前筛选条件下没有岗位数据。" />
        )}

        <ul className="mt-4 space-y-3">
          {filtered.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>

        {total > (page + 1) * PAGE && (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
              加载更多
            </Button>
          </div>
        )}
      </Section>
    </div>
  )
}
