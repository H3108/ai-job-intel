import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchJobs, fetchScopes, type JobsList, type Scopes } from "../api/client"
import { Section, Badge, EmptyState, PageHeader, Input, Button, Select, Skeleton } from "../design-system"
import { Link } from "react-router-dom"

const PAGE = 20

export default function MarketPage() {
  const [query, setQuery] = useState("")
  const [city, setCity] = useState("")
  const [page, setPage] = useState(0)

  const scopes = useQuery<Scopes>({ queryKey: ["scopes"], queryFn: fetchScopes })
  const jobsQuery = useQuery<JobsList>({
    queryKey: ["jobs", "market", query, city, page],
    queryFn: () =>
      fetchJobs({
        q: query || undefined,
        city: city || undefined,
        limit: PAGE,
        offset: page * PAGE,
      }),
  })

  const jobs = jobsQuery.data?.jobs ?? []
  const total = jobsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE))

  const cities = scopes.data?.cities ?? []

  const hotCities = Array.from(
    jobs.reduce((map, job) => {
      const c = job.city || "未知"
      map.set(c, (map.get(c) || 0) + 1)
      return map
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <div className="animate-fade-in">
        <PageHeader title="岗位市场" desc="浏览最新公开岗位，支持关键词搜索与城市筛选。" />
      </div>

      <Section title="筛选">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              placeholder="搜索标题、公司或技能..."
              className="w-full pl-9 transition focus:border-accent"
            />
            <svg
              aria-hidden="true"
              focusable="false"
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <div className="sm:w-56">
            <Select value={city} onChange={(e) => { setCity(e.target.value); setPage(0) }} className="w-full transition focus:border-accent">
              <option value="">全部城市</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="text-text">热门城市：</span>
          {hotCities.length === 0 && <span>加载中...</span>}
          {hotCities.map(([c, count]) => (
            <Badge key={c} tone="secondary">
              {c} {count}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="岗位列表" desc={`共 ${total} 条，当前第 ${page + 1} 页。`}>
        {jobsQuery.isLoading ? (
          <div className="mt-4 grid gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState title="暂无结果" desc="请调整搜索词或城市筛选。" />
        ) : (
          <div className="mt-4 grid gap-3">
            {jobs.map((job, idx) => (
              <Link
                key={job.id}
                to={`/jobs/${encodeURIComponent(job.id)}`}
                className="block rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-accent/60 hover:shadow-md animate-slide-up"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-text">{job.title}</div>
                    <div className="text-xs text-muted">{job.company} · {job.city}</div>
                  </div>
                  <div className="text-xs text-muted">{job.posted_at ? new Date(job.posted_at).toLocaleDateString("zh-CN") : ""}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            loading={page === 0}
            onClick={() => setPage((p: number) => Math.max(0, p - 1))}
            className={page > 0 ? "transition hover:border-accent/60" : ""}
          >
            上一页
          </Button>
          <div className="text-xs text-muted">
            第 {page + 1} / {totalPages} 页
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={page + 1 >= totalPages}
            onClick={() => setPage((p: number) => Math.min(totalPages - 1, p + 1))}
            className={page + 1 < totalPages ? "transition hover:border-accent/60" : ""}
          >
            下一页
          </Button>
        </div>
      </Section>
    </div>
  )
}
