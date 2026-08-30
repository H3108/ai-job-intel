import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchIntelligenceLatest, triggerIntelligence } from "../api/client"
import { Section, Badge, EmptyState } from "../design-system"

const TYPES = [
  { key: "market", label: "市场分析" },
  { key: "recommendations", label: "推荐岗位" },
  { key: "skill_gap", label: "技能差距" },
  { key: "roadmap", label: "学习路线" },
  { key: "report", label: "综合报告" },
] as const

function fmtDate(v?: string) {
  if (!v) return "尚未生成"
  return `更新于 ${new Date(v).toLocaleString("zh-CN")}`
}
function safeJson(raw?: string) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

type ReportKey = typeof TYPES[number]["key"]
const CARD_META: Record<ReportKey, { tone: string; empty: string }> = {
  market: { tone: "分析中", empty: "等待市场分析结果。" },
  recommendations: { tone: "生成中", empty: "推荐岗位尚未生成。" },
  skill_gap: { tone: "计算中", empty: "技能差距分析尚未生成。" },
  roadmap: { tone: "规划中", empty: "学习路线尚未生成。" },
  report: { tone: "汇总中", empty: "综合报告尚未生成。" },
}

function MarketBlock({ payload, status }: { payload: any; status: string }) {
  if (!payload) return <div className="mt-3 text-xs text-muted">{status === "ready" ? "分析完成，暂无明细。" : "等待市场分析结果。"}</div>
  return (
    <div className="mt-3 space-y-1 text-xs text-muted">
      <div>岗位总量：{payload.jobs_total ?? "-"}</div>
      <div>已分析：{payload.jobs_analyzed ?? "-"}</div>
      <div>状态：{payload.status ?? "-"}</div>
      <div>{payload.note ?? ""}</div>
    </div>
  )
}

function RecommendationsBlock({ payload }: { payload: any }) {
  return (
    <div className="mt-3 space-y-2">
      {(payload.matches ?? []).slice(0, 5).map((m: any) => (
        <div key={m.job_id} className="rounded-lg bg-surface-solid px-3 py-2">
          <div className="text-sm text-text">{m.title}</div>
          <div className="text-xs text-muted">{m.company} · {m.city} · {m.score} 分</div>
        </div>
      ))}
    </div>
  )
}

function SkillGapBlock({ payload }: { payload: any }) {
  return (
    <div className="mt-3 space-y-2">
      {(payload.gaps ?? []).slice(0, 6).map((g: any) => (
        <div key={g.skill} className="flex items-center justify-between rounded-lg bg-surface-solid px-3 py-2">
          <div className="text-sm text-text">{g.skill}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{g.current_level} → {g.target_level}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs ${g.priority === 'high' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
              {g.priority === 'high' ? '高优' : '低优'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RoadmapBlock({ payload }: { payload: any }) {
  return (
    <div className="mt-3 space-y-2">
      {(payload.phases ?? []).slice(0, 3).map((p: any) => (
        <div key={p.phase} className="rounded-lg bg-surface-solid px-3 py-2">
          <div className="text-sm text-text">{p.phase}：{p.focus}</div>
          <div className="text-xs text-muted">{p.estimate_weeks} 周</div>
        </div>
      ))}
    </div>
  )
}

function ReportBlock({ payload }: { payload: any }) {
  return (
    <div className="mt-3 space-y-1 text-xs text-muted">
      <div>摘要：{payload.summary ?? "待生成"}</div>
      <div>建议：{payload.advice ?? "待生成"}</div>
    </div>
  )
}

export default function ReportsPage() {
  const qc = useQueryClient()
  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const trigger = useMutation({
    mutationFn: triggerIntelligence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intelligenceLatest"] }),
  })
  const types = intel.data?.types || {}
  const status = intel.data?.status || "pending_analysis"
  const keys = Object.keys(types)
  const statusLabel = status === "ready" ? "已就绪" : status === "pending_analysis" ? "等待分析" : status

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-text">智能分析</h1>
          <p className="text-sm text-muted">由 Hush AI OS 生成市场分析、求职建议、技能差距与学习路线。</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={status === "ready" ? "success" : "warning"}>{statusLabel}</Badge>
          <button
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:opacity-90 disabled:opacity-60"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate()}
          >
            {trigger.isPending ? '生成中...' : '手动触发分析'}
          </button>
        </div>
      </div>

      <Section title="AI 结果" desc="采集成功后自动生成；也可手动运行 Agent 脚本刷新。">
        {keys.length === 0 && (
          <EmptyState title="暂无分析结果" desc="等待 collector-agent 写入或手动触发分析。" />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((t) => {
            const item = types[t.key]
            const payload = item?.payload ? safeJson(item.payload) : null
            const meta = CARD_META[t.key]

            return (
              <div key={t.key} className="rounded-xl border border-border bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text">{t.label}</div>
                  <Badge tone={item ? "success" : "warning"}>{item ? "已就绪" : meta.tone}</Badge>
                </div>

                <div className="mt-2 text-xs text-muted">{fmtDate(item?.generated_at)}</div>
                <div className="mt-1 text-xs text-muted">{item?.model || "模型：—"}</div>

                {!item && (
                  <div className="mt-3 text-xs text-muted">{meta.empty}</div>
                )}

                {t.key === "market" && (
                  <MarketBlock payload={payload} status={status} />
                )}
                {t.key === "recommendations" && payload && (
                  <RecommendationsBlock payload={payload} />
                )}
                {t.key === "skill_gap" && payload && (
                  <SkillGapBlock payload={payload} />
                )}
                {t.key === "roadmap" && payload && (
                  <RoadmapBlock payload={payload} />
                )}
                {t.key === "report" && payload && (
                  <ReportBlock payload={payload} />
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
