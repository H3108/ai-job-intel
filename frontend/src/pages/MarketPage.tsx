import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchJobs, fetchScopes, type JobsList, type Scopes } from "../api/client"
import { Section, Alert, Input, Select, Skeleton, EmptyState, PageHeader, Badge, Button } from "../design-system"
import { Link } from "react-router-dom"
import { friendlyError } from "../lib/errorMessage"

const PAGE = 20

export default function MarketPage() {
  const [q, setQ] = useState("")
  const [role, setRole] = useState("all")
  const [page, setPage] = useState(0)
  const scopesQuery = useQuery<Scopes>({ queryKey: ["scopes"], queryFn: fetchScopes })
  const jobsQuery = useQuery<JobsList>({
    queryKey: ["marketJobs", q, role, page],
    queryFn: () => fetchJobs({ q: q || undefined, limit: PAGE, offset: page * PAGE }),
  })
  const total = jobsQuery.data?.total ?? 0
  const jobs = jobsQuery.data?.jobs ?? []
  const loading = jobsQuery.isLoading
  const cities = useMemo(() => {
    const m = new Map<string, number>()
    for (const j of jobs) {
      const c = j.city || j.location || "未知"
      m.set(c, (m.get(c) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [jobs])

  return (
    <div className="space-y-8">
      <PageHeader title="岗位市场" desc="搜索并浏览目标岗位。" />

      {jobsQuery.isError && (
        <Alert tone="danger" title="加载失败">
          {friendlyError(jobsQuery.error)}
        </Alert>
      )}

      <Section>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="搜索标题/公司/技能"
            className="sm:w-64"
          />
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setPage(0)
            }}
            className="sm:w-48"
          >
            <option value="all">全部职能</option>
            {(scopesQuery.data?.roles ?? []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Button asChild variant="secondary">
            <Link to="/">返回概览</Link>
          </Button>
        </div>
      </Section>

      <Section title="热门城市">
        <div className="flex flex-wrap gap-2">
          {cities.slice(0, 10).map(([c, n]) => (
            <Badge key={c} tone="primary">
              {c} {n}
            </Badge>
          ))}
          {cities.length === 0 && <span className="text-sm text-muted">暂无数据</span>}
        </div>
      </Section>

      <Section title={`岗位列表 · ${total} 条`}>
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <EmptyState title="暂无岗位" desc="尝试更换关键词。" />
        )}

        <div className="grid gap-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${encodeURIComponent(job.id)}`}
              className="block rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-accent"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-medium text-text">{job.title || "未命名岗位"}</div>
                <div className="text-sm text-muted">{job.salary_raw || job.salary || "—"}</div>
              </div>
              <div className="mt-1 text-sm text-muted">
                {job.company || ""}
                {job.company && job.city ? " · " : ""}
                {job.city || ""}
              </div>
            </Link>
          ))}
        </div>

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
