import { useQuery } from "@tanstack/react-query"
import { fetchIntelligenceLatest } from "../api/client"
import { Section, Badge, EmptyState } from "../design-system"

const TYPES = [
  { key: "market", label: "市场分析" },
  { key: "recommendations", label: "推荐岗位" },
  { key: "skill_gap", label: "技能差距" },
  { key: "roadmap", label: "学习路线" },
  { key: "report", label: "综合报告" },
] as const

export default function ReportsPage() {
  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const types = intel.data?.types || {}
  const keys = Object.keys(types)

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold text-text">智能分析</h1>
        <p className="text-sm text-muted">由 Hush AI OS 生成市场分析、求职建议、技能差距与学习路线。</p>
      </div>

      <Section title="AI 结果" desc="接入 Hush AI OS 后将自动生成结果。">
        {keys.length === 0 && (
          <EmptyState title="暂无分析结果" desc="接入 Hush AI OS 后会自动生成结果。" />
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((t) => {
            const item = (types as Record<string, { generated_at?: string; model?: string }>)[t.key]
            return (
              <div key={t.key} className="rounded-xl border border-border bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text">{t.label}</div>
                  <Badge tone={item ? "success" : "secondary"}>{item ? "已就绪" : "待生成"}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">{item?.generated_at ? `更新于 ${new Date(item.generated_at).toLocaleString("zh-CN")}` : "尚未生成"}</div>
                <div className="mt-1 text-xs text-muted">{item?.model || "模型：—"}</div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
