import { useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { fetchJob } from "../api/client"
import { Section, Badge, Alert, PageHeader, Button, Skeleton } from "../design-system"
import { friendlyError } from "../lib/errorMessage"

function fmtTime(s?: string | null) {
  if (!s) return "—"
  try {
    return new Date(s.replace(" ", "T") + "Z").toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s || "—"
  }
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["job", id],
    queryFn: () => fetchJob(id as string),
    enabled: !!id,
  })
  const job: any = data
  const skills = useMemo(() => {
    const src = job?.skills || []
    return src.map((s: any) => (typeof s === "string" ? s : s.skill)).filter(Boolean)
  }, [job?.skills])

  return (
    <div className="space-y-8">
      <PageHeader
        title={job?.title || "岗位详情"}
        actions={
          <Link to="/market">
            <Button variant="secondary">返回市场</Button>
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {isError && <Alert tone="danger" title="加载失败">{friendlyError(error)}</Alert>}
      {job && (
        <>
          <Section title="基本信息">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">公司</div>
                <div className="mt-1 text-sm text-text">{job.company || "—"}</div>
              </div>
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">城市</div>
                <div className="mt-1 text-sm text-text">{job.city || job.location || "—"}</div>
              </div>
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">薪资</div>
                <div className="mt-1 text-sm text-text">{job.salary_raw || job.salary || "—"}</div>
              </div>
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">经验 / 学历</div>
                <div className="mt-1 text-sm text-text">{job.experience || "—"} {job.education ? `/ ${job.education}` : ""}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {skills.slice(0, 12).map((s: string) => (
                <Badge key={s} tone="primary">{s}</Badge>
              ))}
            </div>

            {job.description && (
              <div className="mt-4 whitespace-pre-wrap rounded-xl bg-surface-solid px-4 py-3 text-sm text-muted">{job.description}</div>
            )}
          </Section>

          <Section title="时效信息">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">发布</div>
                <div className="mt-1 text-sm text-text">{fmtTime(job.posted_at)}</div>
              </div>
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">采集</div>
                <div className="mt-1 text-sm text-text">{fmtTime(job.collected_at)}</div>
              </div>
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">更新</div>
                <div className="mt-1 text-sm text-text">{fmtTime(job.updated_at)}</div>
              </div>
              <div className="rounded-xl bg-surface-solid px-4 py-3">
                <div className="text-xs text-muted">状态</div>
                <div className="mt-1 text-sm text-text">{job.status || "—"}</div>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
