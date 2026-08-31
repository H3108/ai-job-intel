import { useQuery } from "@tanstack/react-query"
import { fetchIntelligenceLatest, fetchCareerIntelligence } from "../api/client"
import { Section, EmptyState, PageHeader } from "../design-system"

function safeJson(raw?: string) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default function CareerPage() {
  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const career = useQuery({ queryKey: ["careerIntelligence"], queryFn: fetchCareerIntelligence, enabled: !!intel.data?.types?.career })
  const payload = career.data ? safeJson(career.data.payload) : null
  const bestFit = payload?.best_fit ?? []
  const whyNot = payload?.why_not_others ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Career"
        desc="最适合你的职位方向、可行性、长期价值。"
      />

      <Section title="Best Fit" desc="按匹配度与可行性排序。">
        {career.isLoading ? (
          <EmptyState title="加载中" desc="正在读取职业方向分析…" />
        ) : bestFit.length === 0 ? (
          <EmptyState title="暂无分析" desc="等待 Hush AI OS 写入 career intelligence。" />
        ) : (
          <div className="mt-4 grid gap-4">
            {bestFit.map((item: any, idx: number) => (
              <div key={idx} className="rounded-2xl border border-border bg-surface px-4 py-4 transition hover:border-accent/60 hover:shadow-md">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-text">{item.role}</div>
                    <div className="text-xs text-muted">Fit: {item.fit ?? "-"} · Entry: {item.entry_difficulty ?? "-"} · Long term: {item.long_term_value ?? "-"}</div>
                  </div>
                  <div className="text-xs text-muted">Salary: {item.salary_range ?? "-"} · Jobs: {item.job_count ?? "-"}</div>
                </div>
                <div className="mt-2 text-xs text-muted">{(item.why ?? []).join(" · ") || "-"}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Why Not Others" desc="排除不适合方向的原因。">
        {whyNot.length === 0 ? (
          <div className="text-xs text-muted">暂无。</div>
        ) : (
          <div className="mt-4 grid gap-3">
            {whyNot.map((item: any, idx: number) => (
              <div key={idx} className="rounded-xl bg-surface-solid px-3 py-2">
                <div className="text-sm text-text">{item.role}</div>
                <div className="text-xs text-muted">{item.reason}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
