import { useQuery } from "@tanstack/react-query"
import { fetchIntelligenceLatest } from "../api/client"
import { Section, Badge, EmptyState, PageHeader } from "../design-system"
import { Link } from "react-router-dom"

function safeJson(raw?: string) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function MatchScore({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-surface">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted">{Math.round(pct)} / 100</div>
    </div>
  )
}

export default function MatchesPage() {
  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const types = intel.data?.types || {}
  const rec = types.recommendations ? safeJson(types.recommendations.payload) : null
  const matches = rec?.matches ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Matches"
        desc="基于你的画像与当前市场数据生成的推荐岗位。"
      />

      <Section title="Recommendations" desc="按匹配度排序，优先关注高匹配岗位。">
        {intel.isLoading ? (
          <EmptyState title="加载中" desc="正在读取推荐结果…" />
        ) : matches.length === 0 ? (
          <EmptyState title="暂无推荐" desc="请先完善 Profile，或等待 Hush AI OS 生成推荐。" />
        ) : (
          <div className="mt-4 grid gap-4">
            {matches.slice(0, 20).map((m: any) => (
              <div key={m.job_id} className="rounded-2xl border border-border bg-surface px-4 py-4 transition hover:border-accent/60 hover:shadow-md">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <Link to={`/jobs/${encodeURIComponent(m.job_id)}`} className="text-sm font-semibold text-text hover:underline">
                      {m.title}
                    </Link>
                    <div className="text-xs text-muted">{m.company} · {m.city}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={m.decision === "apply" ? "success" : m.decision === "learn_first" ? "warning" : "secondary"}>
                        {m.decision === "apply" ? "建议投递" : m.decision === "learn_first" ? "先学习" : "暂不推荐"}
                      </Badge>
                      {m.priority_gaps?.length ? <span className="text-xs text-muted">Priority gap: {m.priority_gaps[0]}</span> : null}
                    </div>
                    <div className="mt-2">
                      <MatchScore score={m.score ?? 0} />
                    </div>
                  </div>
                  <div className="text-xs text-muted">Match: {Math.round(m.score ?? 0)}</div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-surface-solid px-3 py-2">
                    <div className="text-xs text-muted">Strengths</div>
                    <div className="text-sm text-text">{(m.strengths ?? []).join(" · ") || "-"}</div>
                  </div>
                  <div className="rounded-xl bg-surface-solid px-3 py-2">
                    <div className="text-xs text-muted">Gaps</div>
                    <div className="text-sm text-text">{(m.gaps ?? []).join(" · ") || "-"}</div>
                  </div>
                </div>

                {m.recommended_actions?.length ? (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs text-muted">Recommended actions</div>
                    {m.recommended_actions.slice(0, 3).map((a: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                        <div className="text-sm text-text">{a.action}</div>
                        <div className="text-xs text-muted">{a.effort_weeks ?? "-"}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
