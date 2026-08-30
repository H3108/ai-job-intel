import { useQuery } from "@tanstack/react-query"
import { fetchIntelligenceLatest } from "../api/client"
import { Section, Alert, PageHeader, EmptyState, Badge } from "../design-system"

export default function RoadmapPage() {
  const intelQuery = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const intel = intelQuery.data
  const types = (intel?.types || {}) as Record<string, any>
  const roadmap = types["roadmap"] || types["learning_path"] || null

  return (
    <div className="space-y-6">
      <PageHeader title="学习路线" desc="基于 Hush AI OS 生成的技能差距与学习路线，优先补齐缺口技能。" />

      {intelQuery.isError && (
        <Alert tone="danger" title="加载失败">
          无法读取分析结果。
        </Alert>
      )}

      {!roadmap && (
        <EmptyState title="暂无路线" desc="Hush AI OS 接入后将自动生成学习路线。" />
      )}

      {roadmap && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Section title="路线摘要">
            <div className="text-sm text-muted">已接入：{roadmap.model || "—"}</div>
            <div className="mt-1 text-sm text-muted">生成时间：{roadmap.generated_at || "—"}</div>
            <div className="mt-2">
              <Badge tone="success">已就绪</Badge>
            </div>
          </Section>
          <Section title="阶段概览">
            <div className="text-sm text-muted">阶段数：{(roadmap.stages?.length || 0)}</div>
            <div className="mt-1 text-sm text-muted">预计周期：{roadmap.estimated_weeks ? `${roadmap.estimated_weeks} 周` : "—"}</div>
          </Section>
          <Section title="重点技能">
            <div className="flex flex-wrap gap-2">
              {(roadmap.skills || []).slice(0, 8).map((s: string) => (
                <Badge key={s} tone="secondary">{s}</Badge>
              ))}
              {!roadmap.skills?.length && <span className="text-sm text-muted">暂无技能列表</span>}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
