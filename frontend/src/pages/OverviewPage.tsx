import { useQuery } from "@tanstack/react-query"
import { fetchJobsStats, fetchIntelligenceLatest, fetchProfile } from "../api/client"
import { Section, PageHeader, Skeleton } from "../design-system"
import { Link } from "react-router-dom"

function safeJson(raw?: string) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default function OverviewPage() {
  const stats = useQuery({ queryKey: ["jobsStats"], queryFn: fetchJobsStats })
  const intel = useQuery({ queryKey: ["intelligenceLatest"], queryFn: fetchIntelligenceLatest })
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile })

  const types = intel.data?.types || {}
  const report = types.report ? safeJson(types.report.payload) : null

  const targetRole = profile.data?.target_role || "AI / Agent / AI Product Engineering"
  const targetCity = profile.data?.target_city || "深圳 / 广州"
  const total = stats.data?.total ?? 0
  const recent7d = stats.data?.recent_7d ?? 0
  const recent30d = stats.data?.recent_30d ?? 0
  const topSkills = stats.data?.skill_demand?.slice(0, 5).map((s: any) => s.skill) || []

  let focusCount = 0
  let biggestGap = "尚未生成"
  try {
    const rec = types.recommendations ? safeJson(types.recommendations.payload) : null
    const matches = rec?.matches ?? []
    focusCount = matches.filter((m: any) => (m.score || 0) >= 80).length
    const gaps = rec?.priority_gaps ?? []
    biggestGap = gaps[0] || "Agent / RAG / Evaluation"
  } catch {}

  const summaryText = report?.summary || "尚无完整分析。点击 Reports 查看详情。"

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        desc="你的 AI Career Position、市场变化与下一步建议。"
      />

      <Section title="Your Career Position" desc="目标角色、目标城市与当前市场匹配概况。">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">Target Role</div>
            <div className="text-sm font-semibold text-text">{targetRole}</div>
          </div>
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">Target Cities</div>
            <div className="text-sm font-semibold text-text">{targetCity}</div>
          </div>
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">Market Jobs</div>
            <div className="text-sm font-semibold text-text">{stats.isLoading ? <Skeleton className="h-4 w-16" /> : total}</div>
          </div>
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">High Match</div>
            <div className="text-sm font-semibold text-text">{focusCount || "-"}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">Focus Jobs</div>
            <div className="text-sm font-semibold text-text">{focusCount || "-"}</div>
          </div>
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">Biggest Gap</div>
            <div className="text-sm font-semibold text-text">{biggestGap}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/market" className="no-underline">
            <span className="inline-flex cursor-pointer inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90 active:scale-[0.98]">浏览岗位市场</span>
          </Link>
          <Link to="/matches" className="no-underline">
            <span className="inline-flex cursor-pointer inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm text-text transition hover:border-accent/60 active:scale-[0.98]">查看推荐岗位</span>
          </Link>
          <Link to="/reports" className="no-underline">
            <span className="inline-flex cursor-pointer inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm text-text transition hover:border-accent/60 active:scale-[0.98]">查看智能分析</span>
          </Link>
        </div>
      </Section>

      <Section title="Market Changes" desc={`最近 7 天新增 ${recent7d} 个岗位，最近 30 天新增 ${recent30d} 个岗位。`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">New (7d)</div>
            <div className="text-sm font-semibold text-text">{stats.isLoading ? <Skeleton className="h-4 w-12" /> : recent7d}</div>
          </div>
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">New (30d)</div>
            <div className="text-sm font-semibold text-text">{stats.isLoading ? <Skeleton className="h-4 w-12" /> : recent30d}</div>
          </div>
          <div className="rounded-xl bg-surface-solid px-4 py-3">
            <div className="text-xs text-muted">Top Skills</div>
            <div className="text-sm font-semibold text-text">{stats.isLoading ? <Skeleton className="h-4 w-full" /> : (topSkills.length ? topSkills.join(" · ") : "-")}</div>
          </div>
        </div>
      </Section>

      <Section title="AI Briefing" desc="基于市场数据与个人画像的结论。">
        <div className="space-y-2">
          <div className="text-sm text-text">{intel.isLoading ? <Skeleton className="h-4 w-full" /> : summaryText}</div>
          {types.roadmap?.payload && (
            <Link to="/roadmap" className="text-xs text-accent hover:underline">查看学习路线 →</Link>
          )}
          {types.career?.payload && (
            <Link to="/career" className="text-xs text-accent hover:underline">查看职业方向 →</Link>
          )}
        </div>
      </Section>
    </div>
  )
}
