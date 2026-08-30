import { useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { fetchJob } from "../api/client"
import { Section, Badge, Alert, PageHeader, Button } from "../design-system"
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
    <div className="space-y-6">
      <PageHeader
        title={job?.title || "岗位详情"}
        actions={
          <Link to="/market">
            <Button variant="secondary">返回市场</Button>
          </Link>
        }
      />
      {isLoading && <div className="text-sm text-muted">加载中…</div>}
      {isError && <Alert tone="danger" title="加载失败">{friendlyError(error)}</Alert>}
      {job && (
        <>
          <Section title="基本信息">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm text-text">公司：{job.company || "—"}</div>
              <div className="text-sm text-text">城市：{job.city || job.location || "—"}</div>
              <div className="text-sm text-text">薪资：{job.salary_raw || job.salary || "—"}</div>
              <div className="text-sm text-text">经验：{job.experience || "—"}</div>
              <div className="text-sm text-text">学历：{job.education || "—"}</div>
              <div className="text-sm text-text">来源：{job.source || "—"}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {skills.slice(0, 10).map((s: string) => (
                <Badge key={s} tone="primary">{s}</Badge>
              ))}
            </div>
            {job.description && (
              <div className="mt-3 whitespace-pre-wrap text-sm text-muted">{job.description}</div>
            )}
          </Section>

          <Section title="时效信息">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm text-muted">发布：{fmtTime(job.posted_at)}</div>
              <div className="text-sm text-muted">采集：{fmtTime(job.collected_at)}</div>
              <div className="text-sm text-muted">更新：{fmtTime(job.updated_at)}</div>
              <div className="text-sm text-muted">状态：{job.status || "—"}</div>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
