import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  fetchJobs,
  fetchSalaryAudit,
  type JobsList,
} from "../api/client"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { PageHeader, Section, Alert, Badge, Button } from "../design-system"
import { Loading, ErrorBox } from "../components/ui"
import { friendlyError } from "../lib/errorMessage"

const PAGE = 50

export default function MarketPage() {
  const scope = useScope()
  const analytics = useAnalytics(scope)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)

  const jobsQuery = useQuery<JobsList>({
    queryKey: ["jobs", scope, page],
    queryFn: () => fetchJobs(scope, { limit: PAGE, offset: page * PAGE }),
  })

  const salaryQuery = useQuery({
    queryKey: ["salary-audit"],
    queryFn: fetchSalaryAudit,
  })

  const total = jobsQuery.data?.total ?? 0
  const loading = jobsQuery.isLoading
  const error = jobsQuery.error ? friendlyError(jobsQuery.error) : null

  // 搜索时重置分页，基于 scope 重新拉取列表
  const filteredQuery = useQuery<JobsList>({
    enabled: !!q.trim(),
    queryKey: ["jobs", scope, q.trim(), 0],
    queryFn: () =>
      fetchJobs(scope, {
        limit: PAGE,
        offset: 0,
      }),
  })

  const source = q.trim() ? filteredQuery.data : jobsQuery.data
  const list = source?.jobs ?? []
  const currentTotal = source?.total ?? total
  const isLoadingMore = q.trim() ? filteredQuery.isFetching : jobsQuery.isFetching
  const isSearching = !!q.trim()
  const hasMore = list.length < currentTotal && !isLoadingMore

  const scopeLabel = [scope.city ? scope.city + " AI 岗" : "AI 岗", scope.role]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="space-y-10">
      <PageHeader
        title="岗位市场"
        desc={`${scopeLabel || "全部市场"} · 共 ${currentTotal} 个职位`}
      />

      {jobsQuery.isError && (
        <Alert tone="danger" title="加载失败">
          {error}
        </Alert>
      )}

      <Section title="搜索职位" desc="关键词命中标题/公司/方向，点击行查看详情。">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="搜索职位、公司、方向…"
            className="sm:w-72"
            aria-label="搜索职位"
          />
          <div className="text-sm text-muted">
            {list.length} / {currentTotal}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface text-left text-muted">
                <th className="px-4 py-3 font-medium">职位</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 font-medium">城市</th>
                <th className="px-4 py-3 font-medium">方向</th>
                <th className="px-4 py-3 font-medium text-right">薪资</th>
                <th className="px-4 py-3 font-medium">经验</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-border transition-colors hover:bg-surface"
                >
                  <td className="px-4 py-3 text-text">{j.title}</td>
                  <td className="px-4 py-3 text-muted">{j.company ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{j.location ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{j.role ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-text">
                    {j.salary ?? "面议"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {j.experience ?? "—"}
                  </td>
                </tr>
              ))}
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    没有匹配结果
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => {
                if (isSearching) {
                  setPage(0)
                  filteredQuery.refetch()
                } else {
                  setPage((p) => p + 1)
                }
              }}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "加载中…" : "加载更多"}
            </Button>
          </div>
        )}
      </Section>

      <Section title="市场分布" desc="当前作用域下的岗位方向分布。">
        {analytics.isLoading && <Loading msg="加载市场分布…" />}
        {analytics.isError && (
          <ErrorBox msg={friendlyError(analytics.error)} />
        )}
        <DistPanel analytics={analytics.data} />
      </Section>

      <Section title="薪资抽检" desc="薪资解码健康度摘要。">
        {salaryQuery.isLoading && <Loading msg="加载薪资抽检…" />}
        {salaryQuery.isError && (
          <ErrorBox msg={friendlyError(salaryQuery.error)} />
        )}
        <SalaryPanel summary={salaryQuery.data?.summary} />
      </Section>
    </div>
  )
}

function DistPanel({
  analytics,
}: {
  analytics?: {
    titleClusters?: { key: string; count: number }[]
  }
}) {
  if (!analytics) return null

  const clusters = analytics.titleClusters ?? []
  if (!clusters.length) return <p className="text-sm text-muted">暂无分布数据</p>

  const max = Math.max(...clusters.map((c) => c.count), 1)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clusters.slice(0, 12).map((c) => (
        <div
          key={c.key}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"
        >
          <span className="text-text">{c.key}</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.round(c.count / max * 100)}%` }}
              />
            </div>
            <Badge tone="neutral" dot>
              {c.count}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function SalaryPanel({
  summary,
}: {
  summary?: {
    decoded?: number
    lowConfYellow?: number
    lowConfRed?: number
    lowConfRedRate?: number
  }
}) {
  if (!summary)
    return (
      <p className="text-sm text-muted">暂无薪资摘要，等待后端 salaryStats 生成。</p>
    )

  const items = [
    { label: "已解密薪资", value: summary.decoded ?? 0 },
    { label: "低置信(黄)", value: summary.lowConfYellow ?? 0 },
    { label: "低置信(红)", value: summary.lowConfRed ?? 0 },
    {
      label: "红区占比",
      value: `${summary.lowConfRedRate ?? 0}%`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <div className="text-xs text-muted">{it.label}</div>
          <div className="font-display text-2xl font-semibold text-text">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  )
}
