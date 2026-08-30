import { useQuery } from "@tanstack/react-query"
import { fetchSaved, type SavedJobsResponse } from "../api/saved"
import { Badge, EmptyState, PageHeader } from "../design-system"
import { Link } from "react-router-dom"

export default function SavedJobsPage() {
  const q = useQuery<SavedJobsResponse>({ queryKey: ["saved"], queryFn: fetchSaved })

  const jobs = q.data?.jobs ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="已收藏岗位"
        desc="你标记过的岗位会集中显示在这里，方便后续对比与投递跟踪。"
        actions={
          <Badge tone={jobs.length ? "success" : "warning"}>
            {jobs.length ? `已收藏 ${jobs.length}` : "暂无收藏"}
          </Badge>
        }
      />

      {q.isError && (
        <div className="text-sm text-red-300">无法读取收藏列表。</div>
      )}

      {!jobs.length && (
        <EmptyState title="暂无收藏" desc="去岗位市场或岗位详情页收藏感兴趣的岗位。" />
      )}

      <div className="grid gap-3">
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
    </div>
  )
}
