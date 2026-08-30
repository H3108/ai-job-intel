import { useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchJob, fetchJobs, type JobsList } from "../api/client"
import { fetchSaved, toggleSaved } from "../api/saved"
import { Section, Badge, Alert, PageHeader, Button, Skeleton, EmptyState } from "../design-system"
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

function SkillList({ skills }: { skills: string[] }) {
  if (!skills.length) return <div className="text-xs text-muted">暂无技能</div>
  return (
    <div className="flex flex-wrap gap-2">
      {skills.slice(0, 12).map((s) => (
        <Badge key={s} tone="primary">{s}</Badge>
      ))}
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["job", id],
    queryFn: () => fetchJob(id as string),
    enabled: !!id,
  })
  const saveQuery = useQuery({
    queryKey: ["saved"],
    queryFn: fetchSaved,
    enabled: !!id,
  })
  const saveMutation = useMutation({
    mutationFn: toggleSaved,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved"] }),
  })

  const job: any = data
  const saved = (saveQuery.data?.jobs ?? []).some((j: any) => j.id === id)
  const skills = useMemo(() => {
    const src = job?.skills || []
    return src.map((s: any) => (typeof s === "string" ? s : s.skill)).filter(Boolean)
  }, [job?.skills])

  const similarQuery = useQuery<JobsList>({
    queryKey: ["similar", id],
    queryFn: () =>
      fetchJobs({
        limit: 6,
      }),
    enabled: !!id,
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title={job?.title || "岗位详情"}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={saved ? "primary" : "secondary"}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate(id as string)}
            >
              {saved ? "已收藏" : "收藏岗位"}
            </Button>
            <Link to="/market">
              <Button variant="secondary">返回市场</Button>
            </Link>
          </div>
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

            <div className="mt-4">
              <div className="text-xs text-muted">技能</div>
              <div className="mt-2">
                <SkillList skills={skills} />
              </div>
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

          <Section title="相似岗位">
            {similarQuery.isLoading && <EmptyState title="加载中" desc="正在寻找相似岗位…" />}
            {similarQuery.isError && <div className="text-xs text-red-300">无法加载相似岗位。</div>}
            {similarQuery.data?.jobs?.length === 0 && <EmptyState title="暂无相似岗位" desc="换一个岗位试试。" />}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {similarQuery.data?.jobs?.filter((j: any) => j.id !== job.id).slice(0, 4).map((j: any) => (
                <Link key={j.id} to={`/jobs/${encodeURIComponent(j.id)}`} className="block rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-accent/60 hover:shadow-md">
                  <div className="text-sm text-text">{j.title}</div>
                  <div className="text-xs text-muted">{j.company} · {j.city}</div>
                </Link>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
