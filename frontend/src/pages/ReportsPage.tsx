import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchIntelligenceLatest, triggerIntelligence } from "../api/client"
import { Section, Badge, EmptyState, PageHeader, Button } from "../design-system"
import { Link } from "react-router-dom"
import React from "react"

const TYPES = [
  { key: "market", label: "市场分析", desc: "岗位总量、分布与趋势" },
  { key: "recommendations", label: "推荐岗位", desc: "基于画像的匹配岗位" },
  { key: "skill_gap", label: "技能差距", desc: "当前能力与目标岗位差距" },
  { key: "roadmap", label: "学习路线", desc: "分阶段提升计划" },
  { key: "report", label: "综合报告", desc: "汇总分析与下一步建议" },
] as const

function fmtDate(v?: string) {
  if (!v) return "尚未生成"
  const d = new Date(v)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return "刚刚"
  if (diffH < 24) return `${diffH} 小时前`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} 天前`
  return `更新于 ${d.toLocaleDateString("zh-CN")}`
}

function timeAgo(v?: string) {
  if (!v) return null
  const diffMs = Date.now() - new Date(v).getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 24) return "fresh"
  if (diffH < 168) return "recent"
  return "stale"
}

function confidenceTone(item: any) {
  const age = timeAgo(item?.generated_at)
  if (age === "fresh") return "success"
  if (age === "recent") return "warning"
  return "secondary"
}

function confidenceLabel(item: any) {
  const age = timeAgo(item?.generated_at)
  if (age === "fresh") return "新鲜"
  if (age === "recent") return "较新"
  if (!item) return "等待生成"
  return "可刷新"
}

function safeJson(raw?: string) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function useCopyText() {
  const [text, setText] = React.useState("")
  const [ok, setOk] = React.useState(false)
  const copy = (value: string) => {
    setText(value)
    setOk(false)
    setTimeout(async () => {
      try {
        await navigator.clipboard.writeText(value)
        setOk(true)
      } catch {}
    }, 0)
  }
  return { text, ok, copy }
}

function InsightCard({ label, desc, item, children }: { label: string; desc: string; item?: any; children?: React.ReactNode }) {
  const { copy, ok } = useCopyText()
  const ready = !!item
  const meta = item?.model ? `模型：${item.model}` : "模型：—"
  const exportable = item?.payload || item?.markdown

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface px-4 py-4 transition hover:border-accent/60 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text">{label}</div>
          <div className="text-xs text-muted">{desc}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={confidenceTone(item)}>{confidenceLabel(item)}</Badge>
          <Badge tone={ready ? "success" : "warning"}>{ready ? "已就绪" : "等待生成"}</Badge>
        </div>
      </div>

      <div className="mt-3 text-xs text-muted">
        <div>{fmtDate(item?.generated_at)}</div>
        <div>{meta}</div>
      </div>

      {!ready && (
        <div className="mt-4 text-xs text-muted">等待 collector-agent 写入或手动触发分析。</div>
      )}

      {ready && children}

      {exportable && (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => copy(typeof exportable === 'string' ? exportable : JSON.stringify(exportable, null, 2))}>
            {ok ? "已复制" : "复制结果"}
          </Button>
          {typeof exportable === 'string' && (
            <Button variant="ghost" size="sm" onClick={() => {
              const blob = new Blob([exportable], { type: 'text/plain;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${label}_${new Date(item?.generated_at || Date.now()).toISOString().slice(0,10)}.txt`
              a.click()
              URL.revokeObjectURL(url)
            }}>下载</Button>
          )}
        </div>
      )}
    </div>
  )
}

function MarketInsight({ payload }: { payload: any }) {
  if (!payload) return null
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-surface-solid px-3 py-2">
          <div className="text-xs text-muted">岗位总量</div>
          <div className="text-sm font-semibold text-text">{payload.jobs_total ?? "-"}</div>
        </div>
        <div className="rounded-xl bg-surface-solid px-3 py-2">
          <div className="text-xs text-muted">已分析</div>
          <div className="text-sm font-semibold text-text">{payload.jobs_analyzed ?? "-"}</div>
        </div>
        <div className="rounded-xl bg-surface-solid px-3 py-2">
          <div className="text-xs text-muted">城市覆盖</div>
          <div className="text-sm font-semibold text-text">{payload.cities ?? "-"}</div>
        </div>
        <div className="rounded-xl bg-surface-solid px-3 py-2">
          <div className="text-xs text-muted">岗位类型</div>
          <div className="text-sm font-semibold text-text">{payload.roles ?? "-"}</div>
        </div>
      </div>
      {payload.note && <div className="text-xs text-muted">{payload.note}</div>}
    </div>
  )
}

function RecommendationInsight({ payload }: { payload: any }) {
  if (!payload) return null
  const matches = (payload.matches ?? []).slice(0, 6)
  return (
    <div className="mt-3 space-y-2">
      {matches.map((m: any) => (
        <Link
          key={m.job_id}
          to={`/jobs/${encodeURIComponent(m.job_id)}`}
          className="flex items-center justify-between rounded-xl bg-surface-solid px-3 py-2 transition hover:border-accent/60 hover:bg-surface"
        >
          <div className="flex-1">
            <div className="text-sm text-text">{m.title}</div>
            <div className="text-xs text-muted">{m.company} · {m.city}</div>
          </div>
          <div className="text-xs text-accent">{m.score ?? "-"} 分</div>
        </Link>
      ))}
    </div>
  )
}

function SkillGapInsight({ payload }: { payload: any }) {
  if (!payload) return null
  const gaps = (payload.gaps ?? []).slice(0, 8)
  return (
    <div className="mt-3 space-y-2">
      {gaps.map((g: any) => (
        <div key={g.skill} className="flex items-center justify-between rounded-xl bg-surface-solid px-3 py-2">
          <div>
            <div className="text-sm text-text">{g.skill}</div>
            <div className="text-xs text-muted">{g.current_level} → {g.target_level}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={g.priority === 'high' ? 'danger' : 'secondary'}>{g.priority === 'high' ? '高优' : '低优'}</Badge>
            {g.estimated_weeks && <span className="text-xs text-muted">{g.estimated_weeks} 周</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function RoadmapInsight({ payload }: { payload: any }) {
  if (!payload) return null
  const phases = (payload.phases ?? []).slice(0, 4)
  return (
    <div className="mt-3 space-y-2">
      {phases.map((p: any, idx: number) => (
        <div key={p.phase || idx} className="flex items-start gap-3 rounded-xl bg-surface-solid px-3 py-2">
          <div className="mt-0.5 text-xs font-semibold text-accent">P{idx + 1}</div>
          <div className="flex-1">
            <div className="text-sm text-text">{p.phase}: {p.focus}</div>
            <div className="text-xs text-muted">{p.estimate_weeks ?? "-"} 周 · {p.deliverable ?? "里程碑待定"}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportInsight({ payload }: { payload: any }) {
  if (!payload) return null
  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-xl bg-surface-solid px-3 py-2">
        <div className="text-xs text-muted">摘要</div>
        <div className="text-sm text-text">{payload.summary ?? "待生成"}</div>
      </div>
      <div className="rounded-xl bg-surface-solid px-3 py-2">
        <div className="text-xs text-muted">建议</div>
        <div className="text-sm text-text">{payload.advice ?? "待生成"}</div>
      </div>
      {payload.action_items?.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted">行动项</div>
          {payload.action_items.slice(0, 5).map((a: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
              <div className="text-sm text-text">{a.task}</div>
              <div className="text-xs text-muted">{a.deadline ?? "无期限"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const qc = useQueryClient()
  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest, refetchInterval: 60_000 })
  const trigger = useMutation({
    mutationFn: triggerIntelligence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intelligenceLatest"] }),
  })

  const types = intel.data?.types || {}
  const status = intel.data?.status || "pending_analysis"
  const readyCount = TYPES.filter(t => !!types[t.key]).length
  const totalCount = TYPES.length
  const lastGenerated = intel.data?.generated_at

  let summaryText = "尚无完整分析。点击“手动触发分析”生成综合结论。"
  if (readyCount === totalCount && types.report?.payload) {
    const report = safeJson(types.report.payload)
    summaryText = report?.summary || "分析已完成，请查看综合报告。"
  } else if (readyCount > 0) {
    summaryText = `已生成 ${readyCount}/${totalCount} 项分析，综合报告尚未完成。`
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="智能分析"
        desc="由 Hush AI OS 生成市场分析、求职建议、技能差距与学习路线。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "ready" ? "success" : "warning"}>{status === "ready" ? "已就绪" : "等待分析"}</Badge>
            {lastGenerated && (
              <Badge tone="secondary">{fmtDate(lastGenerated)}</Badge>
            )}
            <Button variant="secondary" loading={trigger.isPending} onClick={() => trigger.mutate()}>
              {trigger.isPending ? '生成中...' : '手动触发分析'}
            </Button>
          </div>
        }
      />

      <Section title="综合结论" desc="基于全部分析结果的一句话结论与下一步。">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-text">{summaryText}</div>
          <div className="flex flex-wrap gap-3">
            {types.recommendations?.payload && (
              <Link to="/market" className="text-xs text-accent hover:underline">查看推荐岗位 →</Link>
            )}
            {types.roadmap?.payload && (
              <Link to="/roadmap" className="text-xs text-accent hover:underline">查看学习路线 →</Link>
            )}
            <button className="text-xs text-muted hover:text-text" onClick={() => window.dispatchEvent(new CustomEvent('reports-refresh'))}>刷新结果</button>
          </div>
        </div>
      </Section>

      {intel.isLoading ? (
        <Section title="分析结果" desc="正在读取最新分析结果…">
          <EmptyState title="加载中" desc="稍后刷新页面即可查看。" />
        </Section>
      ) : (
        <Section title="分析结果" desc="采集成功后自动生成；也可手动运行 Agent 脚本刷新。">
          {readyCount === 0 && (
            <EmptyState title="暂无分析结果" desc="等待 collector-agent 写入或手动触发分析。" />
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TYPES.map((t) => {
              const item = types[t.key]
              const payload = item?.payload ? safeJson(item.payload) : null

              return (
                <InsightCard key={t.key} label={t.label} desc={t.desc} item={item}>
                  {t.key === "market" && <MarketInsight payload={payload} />}
                  {t.key === "recommendations" && <RecommendationInsight payload={payload} />}
                  {t.key === "skill_gap" && <SkillGapInsight payload={payload} />}
                  {t.key === "roadmap" && <RoadmapInsight payload={payload} />}
                  {t.key === "report" && <ReportInsight payload={payload} />}
                </InsightCard>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}
