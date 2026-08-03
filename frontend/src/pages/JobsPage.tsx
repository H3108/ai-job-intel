import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState, useMemo } from "react"
import {
  fetchJobs,
  fetchJob,
  type Scope,
  type Job,
  type JobDetail,
  type JobSkill,
  type JobsList,
} from "../api/client"
import { Badge, Button, Section, EmptyState, PageHeader } from "../design-system"
import { Loading, ErrorBox } from "../components/ui"
import { friendlyError } from "../lib/errorMessage"

// 与 AppShell 一致：从 URL（?role=&city=）读取作用域。
function useScope(): Scope {
  const [params] = useSearchParams()
  const scope: Scope = {}
  if (params.get("role")) scope.role = params.get("role")!
  if (params.get("city")) scope.city = params.get("city")!
  return scope
}

type Extracted = {
  salary?: string | null
  experience?: string | null
  education?: string | null
  hard_skills?: Record<string, string[]>
  soft_skills?: string[]
  requirements?: string[]
  bonuses?: string[]
  skill_levels?: Record<string, string>
}

function parseExtracted(e: unknown): Extracted | null {
  if (!e) return null
  if (typeof e === "object") return e as Extracted
  if (typeof e === "string") {
    try {
      return JSON.parse(e) as Extracted
    } catch {
      return null
    }
  }
  return null
}

export default function JobsPage() {
  const { id } = useParams()
  return id ? <JobDetailView id={id} /> : <JobListView />
}

/* ------------------------------- 列表 ------------------------------- */
// P0-2：职位市场浏览器改为分页加载——首屏拉第一页（PAGE 条），
// 「加载更多」增量拉取后续页，避免一次传输全部职位 JSON。
const PAGE = 50

function JobListView() {
  const scope = useScope()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const { data, isLoading, isError, error } = useQuery<JobsList>({
    queryKey: ["jobs", scope],
    queryFn: () => fetchJobs(scope, { limit: PAGE, offset: 0 }),
  })

  // 首屏数据到达 / 切换 scope 时，重置已加载列表与游标。
  useEffect(() => {
    if (data) {
      setJobs(data.jobs)
      setTotal(data.total)
      setOffset(data.jobs.length)
    }
  }, [data])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const d = await fetchJobs(scope, { limit: PAGE, offset })
      setJobs((prev) => [...prev, ...d.jobs])
      setOffset((o) => o + d.jobs.length)
    } catch {
      /* 加载更多失败：保留已有列表，不阻断 */
    } finally {
      setLoadingMore(false)
    }
  }

  const rows = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company ?? "—",
    location: j.location ?? "—",
    role: j.role ?? "—",
    salary: j.salary ?? "面议",
    experience: j.experience ?? "—",
  }))

  return (
    <div className="space-y-8">
      <PageHeader
        title="职位列表"
        desc={`当前市场（${scope.city || "全部城市"} · ${scope.role || "全部方向"}）共 ${total} 个职位，点击任意行查看完整 JD 与技能要求。`}
      />

      {isLoading && <Loading msg="加载职位列表…" />}
      {isError && <ErrorBox msg={friendlyError(error)} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState title="暂无职位" desc="先用 npm run crawl 抓一批职位卡片，列表会自动填充。" />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <Section title={`职位（${rows.length} / ${total}）`}>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface text-left text-muted">
                  <th className="px-4 py-3 font-medium">职位</th>
                  <th className="px-4 py-3 font-medium">公司</th>
                  <th className="px-4 py-3 font-medium">城市</th>
                  <th className="px-4 py-3 font-medium">方向</th>
                  <th className="px-4 py-3 font-medium text-right">薪资</th>
                  <th className="px-4 py-3 font-medium">经验</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`查看职位详情：${r.title} @ ${r.company}`}
                    onClick={() => navigate(`/jobs/${encodeURIComponent(r.id)}`)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault()
                        navigate(`/jobs/${encodeURIComponent(r.id)}`)
                      }
                    }}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3 text-text">{r.title}</td>
                    <td className="px-4 py-3 text-muted">{r.company}</td>
                    <td className="px-4 py-3 text-muted">{r.location}</td>
                    <td className="px-4 py-3 text-muted">{r.role}</td>
                    <td className="px-4 py-3 text-right font-medium text-text">{r.salary}</td>
                    <td className="px-4 py-3 text-muted">{r.experience}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "加载中…" : `加载更多（剩 ${total - rows.length} 条）`}
              </Button>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

/* ------------------------------- 详情 ------------------------------- */
function JobDetailView({ id }: { id: string }) {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery<JobDetail>({
    queryKey: ["job", id],
    queryFn: () => fetchJob(id),
  })

  if (isLoading) return <Loading msg="加载职位详情…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return <EmptyState title="职位不存在" desc="该 id 在数据库中未找到。" />

  const ext = parseExtracted(data.extracted)
  const skillsByCat = groupSkills(data.skills)

  return (
    <div className="space-y-12">
      <PageHeader
        title={data.title}
        desc={`${data.company ?? "—"} · ${data.location ?? "—"} · ${data.role ?? "—"}`}
        actions={
          <Button variant="secondary" onClick={() => navigate("/jobs")}>
            返回列表
          </Button>
        }
      />

      {/* 关键元信息 */}
      <div className="flex flex-wrap gap-2">
        <SalaryCard salary={data.salary} parsed={data.salaryParsed ?? null} confidence={data.salary_confidence} />
        {data.experience && <Badge>经验 {data.experience}</Badge>}
        {data.education && <Badge>学历 {data.education}</Badge>}
        {data.status && <Badge tone="neutral">{data.status}</Badge>}
      </div>

      {/* 关联技能（归一化，job_skills） */}
      {data.skills.length > 0 && (
        <Section title={`要求技能（${data.skills.length}）`}>
          <div className="space-y-4">
            {skillsByCat.map((g) => (
              <div key={g.category} className="space-y-2">
                <div className="text-sm font-semibold text-text">{g.category}</div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((s) => (
                    <Badge key={s.skill} tone={s.level === "必备" ? "primary" : "neutral"}>
                      {s.skill}
                      {s.level ? ` · ${s.level}` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 抽取的结构化需求（extracted） */}
      {ext && (
        <Section title="岗位结构化要求">
          <div className="space-y-6">
            {ext.hard_skills && Object.keys(ext.hard_skills).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-text">硬性技能</h3>
                <div className="space-y-3">
                  {Object.entries(ext.hard_skills).map(([cat, list]) => (
                    <div key={cat} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-28 shrink-0 text-xs text-muted">{cat}</span>
                      <div className="flex flex-wrap gap-2">
                        {list.map((s) => (
                          <Badge key={s} tone="neutral">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ext.soft_skills && ext.soft_skills.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-text">软技能</h3>
                <div className="flex flex-wrap gap-2">
                  {ext.soft_skills.map((s) => (
                    <Badge key={s} tone="info">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {ext.requirements && ext.requirements.length > 0 && (
              <CollapsibleList title="岗位职责" items={ext.requirements} />
            )}
            {ext.bonuses && ext.bonuses.length > 0 && (
              <CollapsibleList title="加分项" items={ext.bonuses} />
            )}
          </div>
        </Section>
      )}

      {/* 原始 JD */}
      {data.raw && (
        <Section title="原始职位描述（JD）">
          <div className="max-h-96 overflow-auto rounded-xl border border-border bg-surface-solid p-4 text-sm leading-relaxed text-text">
            <pre className="whitespace-pre-wrap font-sans">{data.raw}</pre>
          </div>
        </Section>
      )}
    </div>
  )
}

// 薪资结构化高亮：区间大字 + 迷你区间条 + 解码置信度分级（红/黄/绿）。
// parseSalary 已将 "15-25K"/"1-2万" 折算为 { minK, maxK }（月薪 K），故统一按 K 展示，避免单位误读。
function fmtK(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1)
}
function SalaryCard({
  salary,
  parsed,
  confidence,
}: {
  salary?: string | null
  parsed: { minK: number; maxK: number; unit: string } | null
  confidence?: string | number | null
}) {
  const conf = confidence != null ? Number(confidence) : null
  const confTone: 'neutral' | 'success' | 'warning' | 'danger' =
    conf == null ? 'neutral' : conf < 0.7 ? 'danger' : conf < 0.85 ? 'warning' : 'success'
  const confText = conf == null ? '' : `解码置信 ${Math.round(conf * 100)}%`

  if (!parsed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">薪资 {salary ?? '面议'}</Badge>
        {conf != null && <Badge tone={confTone} dot>{confText}</Badge>}
      </div>
    )
  }
  const { minK, maxK } = parsed
  const leftPct = maxK > 0 ? (minK / maxK) * 100 : 0
  const widthPct = maxK > 0 ? ((maxK - minK) / maxK) * 100 : 100
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-text tabular-nums">
          {fmtK(minK)}–{fmtK(maxK)}
          <span className="ml-1 text-base font-normal text-muted">K</span>
        </span>
        {conf != null && <Badge tone={confTone} dot>{confText}</Badge>}
      </div>
      {/* 迷你区间条：整条代表 [0, maxK]，高亮段 [minK, maxK] */}
      <div className="relative h-2.5 w-full max-w-xs overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div
          className="absolute top-0 h-full rounded-full bg-accent/70"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </div>
      {conf != null && conf < 0.7 && (
        <p className="text-xs text-danger-fg">⚠ 低置信解码，薪资仅供参考</p>
      )}
    </div>
  )
}

// 容忍单行多职责脏数据：按换行 / 中文分号(；) / 英文分号(;) 切分；过滤空行。
function splitDirtyLines(raw: string): string[] {
  return String(raw)
    .split(/[\n；;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// 长列表折叠 + 脏数据切分：超过 7 条默认收起，点"查看全部"展开；每项先经 splitDirtyLines 拆开。
function CollapsibleList({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false)
  const flat = useMemo(() => items.flatMap((it) => splitDirtyLines(it)), [items])
  const SHOW_MAX = 7
  const visible = open || flat.length <= SHOW_MAX ? flat : flat.slice(0, SHOW_MAX)
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text">
        {visible.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
      {flat.length > SHOW_MAX && (
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : `查看全部（共 ${flat.length} 条）`}
        </Button>
      )}
    </div>
  )
}

function groupSkills(skills: JobSkill[]): { category: string; items: JobSkill[] }[] {
  const map = new Map<string, JobSkill[]>()
  for (const s of skills) {
    const arr = map.get(s.category) ?? []
    arr.push(s)
    map.set(s.category, arr)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
}
