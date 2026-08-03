import type { ReactNode } from "react"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { Loading, ErrorBox } from "../components/ui"
import { Section, Meter, Badge, PageHeader } from "../design-system"
import { friendlyError } from "../lib/errorMessage"

// 无卡片化子块：仅小标题 + 内容，靠留白分隔（不套卡）。
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  )
}

// 图谱页：按标题聚类的岗位细分方向（titleClusters）+ 样本标题。
// v2：无卡片化，网格靠留白分块；岗位数用黑绿 Meter，样本标题用 Badge。
export default function ClustersPage() {
  const scope = useScope()
  const { data, isLoading, isError, error } = useAnalytics(scope)
  if (isLoading) return <Loading msg="加载分析数据…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return null
  const clusters = data.titleClusters || []
  const roleDist = data.roleDist || []
  const max = clusters.length ? Math.max(...clusters.map((c) => c.count)) : 1
  const maxRole = roleDist.length ? Math.max(...roleDist.map((r) => r.count)) : 1

  return (
    <div className="space-y-12">
      <PageHeader
        title="能力图谱"
        desc={`按岗位标题聚类，看清${([scope.city, scope.role].filter(Boolean).join(' ')) || ''} 岗位的细分方向与样本分布。`}
      />
      <Section title="岗位细分方向（按标题规则聚类）" desc={`样本 ${data.total} 个岗位，归入 ${clusters.length} 个方向；颜色深浅代表该方向占比。`} />

      {clusters.length === 0 && <p className="text-sm text-muted">暂无聚类数据。</p>}

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((c) => (
          <Block key={c.key} title={c.key}>
            <Meter label="岗位数" value={c.count} max={max} showValue />
            <div>
              <div className="mb-2 text-xs text-muted">样本标题：</div>
              <div className="flex flex-wrap gap-2">
                {c.samples.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </Block>
        ))}
      </div>

      <Section
        title="规范岗位排名（合并同义标题）"
        desc={`把「前端开发工程师 / 前端工程师 / web前端」等几十种写法归并为规范岗位名，共 ${roleDist.length} 类。`}
      />
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
        {roleDist.slice(0, 18).map((r) => (
          <Block key={r.role} title={r.role}>
            <Meter label="岗位数" value={r.count} max={maxRole} showValue />
          </Block>
        ))}
      </div>
    </div>
  )
}
