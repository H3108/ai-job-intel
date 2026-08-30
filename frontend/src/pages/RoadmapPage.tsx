import { useQuery } from "@tanstack/react-query"
import { fetchIntelligenceLatest } from "../api/client"
import { Section, Alert, PageHeader, EmptyState, Badge } from "../design-system"

function safeJson(raw?: string) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default function RoadmapPage() {
  const intelQuery = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const intel = intelQuery.data
  const roadmapRaw = (intel?.types || {})["roadmap"] || (intel?.types || {})["learning_path"] || null
  const payload = roadmapRaw?.payload ? safeJson(roadmapRaw.payload) : null
  const phases = payload?.phases ?? payload?.stages ?? []
  const skills = payload?.skills ?? payload?.focus_skills ?? []
  const estimateWeeks = payload?.estimate_weeks ?? payload?.estimated_weeks

  return (
    <div className="space-y-6">
      <PageHeader
        title="学习路线"
        desc="基于 Hush AI OS 生成的技能差距与学习路线，优先补齐缺口技能。"
        actions={
          roadmapRaw ? (
            <Badge tone="success">已就绪</Badge>
          ) : (
            <Badge tone="warning">待生成</Badge>
          )
        }
      />

      {intelQuery.isError && (
        <Alert tone="danger" title="加载失败">无法读取分析结果。</Alert>
      )}

      {!roadmapRaw && (
        <EmptyState title="暂无路线" desc="Hush AI OS 接入后将自动生成学习路线。" />
      )}

      {roadmapRaw && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Section title="路线摘要">
            <div className="text-sm text-muted">模型：{roadmapRaw.model || "—"}</div>
            <div className="mt-1 text-sm text-muted">生成时间：{roadmapRaw.generated_at || "—"}</div>
            <div className="mt-2">
              <Badge tone="success">已就绪</Badge>
            </div>
          </Section>
          <Section title="阶段概览">
            <div className="text-sm text-muted">阶段数：{phases.length || 0}</div>
            <div className="mt-1 text-sm text-muted">预计周期：{estimateWeeks ? `${estimateWeeks} 周` : "—"}</div>
          </Section>
          <Section title="重点技能">
            <div className="flex flex-wrap gap-2">
              {(skills as string[]).slice(0, 8).map((s) => (
                <Badge key={s} tone="secondary">{s}</Badge>
              ))}
              {!skills.length && <span className="text-sm text-muted">暂无技能列表</span>}
            </div>
          </Section>
        </div>
      )}

      {phases.length > 0 && (
        <Section title="阶段明细">
          <div className="space-y-3">
            {phases.map((p: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text">{p.phase || `阶段 ${idx + 1}`}：{p.focus || p.title || "待补充"}</div>
                  <div className="text-xs text-muted">{p.estimate_weeks ? `${p.estimate_weeks} 周` : ""}</div>
                </div>
                <div className="mt-2 text-xs text-muted">
                  {p.goal ? `目标：${p.goal}` : ""}
                  {p.actions ? ` · 动作：${(Array.isArray(p.actions) ? p.actions.join("、") : p.actions)}` : ""}
                </div>
                {(p.skills || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(p.skills as string[]).map((s) => (
                      <Badge key={s} tone="secondary">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
