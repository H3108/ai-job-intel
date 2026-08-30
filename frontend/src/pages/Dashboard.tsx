import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchJobs, fetchIntelligenceLatest, type JobsList } from "../api/client"
import { Section, Badge, EmptyState, PageHeader, Input, Button } from "../design-system"
import { Link } from "react-router-dom"

const PAGE = 20

export default function Dashboard() {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)

  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const jobsQuery = useQuery<JobsList>({
    queryKey: ["jobs", query, page],
    queryFn: () =>
      fetchJobs({
        q: query || undefined,
        limit: PAGE,
        offset: page * PAGE,
      }),
  })

  const jobs = jobsQuery.data?.jobs ?? []
  const total = jobsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="space-y-8">
      <PageHeader
        title="市场概览"
        desc="自动采集公开岗位，并可由 Hush AI OS 生成市场与技能分析。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/market" className="no-underline">
              <span className="inline-flex cursor-pointer inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90">
                浏览岗位市场
              </span>
            </Link>
            <Link to="/reports" className="no-underline">
              <span className="inline-flex cursor-pointer inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm text-text transition hover:border-accent/60">
                查看智能分析
              </span>
            </Link>
          </div>
        }
      />

      <Section
        title="AI 分析"
        desc={
          intel.data?.status === "ready"
            ? `已就绪，更新于 ${new Date(intel.data.types?.market?.generated_at || "").toLocaleString("zh-CN")}`
            : "等待分析结果"
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Badge tone={intel.data?.status === "ready" ? "success" : "warning"}>
              {intel.data?.status === "ready" ? "已就绪" : "等待分析"}
            </Badge>
            <span className="text-xs text-muted">{intel.data?.types?.market?.model || "模型：—"}</span>
          </div>
        </div>
      </Section>

      <Section title="岗位列表" desc={`共 ${total} 条，当前第 ${page + 1} 页。`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              placeholder="搜索标题、公司或技能..."
              className="w-full pl-9"
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
        </div>

        {jobsQuery.isLoading ? (
          <EmptyState title="加载中" desc="正在读取岗位列表…" />
        ) : jobs.length === 0 ? (
          <EmptyState title="暂无结果" desc="请调整搜索词。" />
        ) : (
          <>
            <div className="mt-4 grid gap-3">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${encodeURIComponent(job.id)}`}
                  className="block rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-accent/60 hover:shadow-md"
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

            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" size="sm" loading={page === 0} onClick={() => setPage((p: number) => Math.max(0, p - 1))}>上一页</Button>
              <div className="text-xs text-muted">
                第 {page + 1} / {totalPages} 页
              </div>
              <Button variant="secondary" size="sm" loading={page + 1 >= totalPages} onClick={() => setPage((p: number) => Math.min(totalPages - 1, p + 1))}>下一页</Button>
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
