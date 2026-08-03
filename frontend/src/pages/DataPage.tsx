import type { ReactNode } from "react"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { Loading, ErrorBox } from "../components/ui"
import { Section, StatCard, Meter, Table, PageHeader } from "../design-system"
import { friendlyError } from "../lib/errorMessage"

function distRows(dist: Record<string, number>, limit = 12) {
  return Object.entries(dist)
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit)
}

// 无卡片化子块：仅小标题 + 内容，靠留白分隔（不套卡）。
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-3">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="flex flex-col justify-end">{children}</div>
    </div>
  )
}

// 数据页：完整技能排名表 + 薪资/经验/学历分布 + 样本统计。
// v2：KPI 无卡片（StatCard 直出），分布用黑绿 Meter，表格用 Table 组件。
export default function DataPage() {
  const scope = useScope()
  const { data, isLoading, isError, error } = useAnalytics(scope)
  if (isLoading) return <Loading msg="加载分析数据…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return null
  const expRows = distRows(data.expDist)
  const eduRows = distRows(data.eduDist)
  const sal = data.salary
  const salRows = sal?.buckets ?? []
  const maxExp = Math.max(1, ...expRows.map((r) => r.v))
  const maxEdu = Math.max(1, ...eduRows.map((r) => r.v))
  const maxSal = Math.max(1, ...salRows.map((r) => r.count))

  const tableRows = data.skillRank.map((s) => ({
    skill: s.skill,
    count: s.count,
    categories: s.categories.join(" / "),
    levels:
      Object.keys(s.levels).length > 0
        ? Object.entries(s.levels).map(([k, v]) => `${k}×${v}`).join(" ")
        : "—",
  }))

  return (
    <div className="space-y-12">
      <PageHeader
        title="数据明细"
        desc="全量技能排名、薪资/经验/学历分布与样本统计，可逐条下钻核对。"
      />
      {/* 统计（无卡片 KPI 直出） */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="样本岗位" value={data.total} />
        <StatCard label="已分析" value={data.analyzedCount} />
        <StatCard label="待分析" value={data.pendingCount} />
        <StatCard label="识别技能" value={data.skillRank.length} />
        <StatCard label="岗位方向" value={data.titleClusters.length} />
      </div>

      {/* 完整技能排名表（>1000 行时启用虚拟滚动，避免一次性渲染千行 DOM） */}
      <Section title={`技能排名（全量 ${data.skillRank.length} 项 · 出现频次）`}>
        <Table
          columns={[
            { key: "skill", title: "技能" },
            { key: "count", title: "频次", align: "right" },
            { key: "categories", title: "类别" },
            { key: "levels", title: "重要性" },
          ]}
          rows={tableRows}
          virtual={{ height: 480, itemSize: 48, overscan: 8 }}
        />
      </Section>

      {/* 分布：响应式网格，无卡分块 */}
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
        <Block title="薪资分布（解密后 · 单位 K）">
          {(!sal || sal.sampleSize === 0) && (
            <p className="text-sm text-muted">暂无（用 npm run crawl 抓卡片薪资后会自动解密填充）</p>
          )}
          {sal && sal.sampleSize > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <StatCard label="薪资样本" value={sal.sampleSize} />
                <StatCard label="中位数区间" value={`${sal.medianMinK}-${sal.medianMaxK}K`} />
                <StatCard label="中位中点" value={`${sal.medianMidK}K`} />
              </div>
              <div className="space-y-2">
                {salRows.map((r) => (
                  <Meter key={r.label} label={r.label} value={r.count} max={maxSal} showValue />
                ))}
              </div>
            </div>
          )}
        </Block>

        <Block title="经验要求分布">
          {expRows.length === 0 && <p className="text-sm text-muted">暂无数据</p>}
          <div className="space-y-2">
            {expRows.map((r) => (
              <Meter key={r.k} label={r.k} value={r.v} max={maxExp} showValue />
            ))}
          </div>
        </Block>

        <Block title="学历要求分布">
          {eduRows.length === 0 && <p className="text-sm text-muted">暂无数据</p>}
          <div className="space-y-2">
            {eduRows.map((r) => (
              <Meter key={r.k} label={r.k} value={r.v} max={maxEdu} showValue />
            ))}
          </div>
        </Block>
      </div>
    </div>
  )
}
