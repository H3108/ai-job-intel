import { useMemo, useState } from "react"
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
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)

  const jobsQuery = useQuery<JobsList>({
    queryKey: ["jobs", scope, page],
    queryFn: () => fetchJobs(scope, { limit: PAGE, offset: page * PAGE }),
  })

  const analyticsQuery = useAnalytics(scope)
  const salaryQuery = useQuery({
    queryKey: ["salary-audit"],
    queryFn: fetchSalaryAudit,
  })

  const jobs = jobsQuery.data?.jobs ?? []
  const total = jobsQuery.data?.total ?? 0
  const loading = jobsQuery.isLoading
  const error = jobsQuery.error ? friendlyError(jobsQuery.error) : null

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return jobs
    return jobs.filter((j) => {
      const text = `${j.title} ${j.company ?? ""} ${j.role ?? ""}`.toLowerCase()
      return text.includes(qq)
    })
  }, [jobs, q])

  const hasMore = jobs.length < total && !jobsQuery.isFetching

  return (
    <div className="space-y-10">
      <PageHeader
        title="岗位市场"
        desc={`${scope.city ?? "全部城市"} · ${scope.role ?? "全部方向"} · 共 ${total} 个职位`}
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
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索职位、公司、方向…"
            className="sm:w-72"
            aria-label="搜索职位"
          />
          <div className="text-sm text-muted">
            {filtered.length} / {total}
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
              {filtered.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-border transition-colors hover:bg-surface"
                >
                  <td className="px-4 py-3 text-text">{j.title}</td>
                  <td className="px-4 py-3 text-muted">{j.company ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{j.location ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{j.role ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-text">{j.salary ?? "面议"}</td>
                  <td className="px-4 py-3 text-muted">{j.experience ?? "—"}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
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
              onClick={() => setPage((p) => p + 1)}
              disabled={jobsQuery.isFetching}
            >
              {jobsQuery.isFetching ? "加载中…" : "加载更多"}
            </Button>
          </div>
        )}
      </Section>

      <Section title="市场分布" desc="当前作用域下的岗位方向分布。">
        {analyticsQuery.isLoading && <Loading msg="加载市场分布…" />}
        {analyticsQuery.isError && (
          <ErrorBox msg={friendlyError(analyticsQuery.error)} />
        )}
        {analyticsQuery.data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(analyticsQuery.data.titleClusters ?? []).slice(0, 12).map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <span className="text-text">{c.key}</span>
                <Badge tone="neutral" dot>
                  {c.count}
                </Badge>
              </div>
            ))}
            {!(analyticsQuery.data.titleClusters ?? []).length && (
              <div className="text-sm text-muted">暂无分布数据</div>
            )}
          </div>
        )}
      </Section>

      <Section title="薪资抽检" desc="薪资解码健康度摘要。">
        {salaryQuery.isLoading && <Loading msg="加载薪资抽检…" />}
        {salaryQuery.isError && (
          <ErrorBox msg={friendlyError(salaryQuery.error)} />
        )}
        {salaryQuery.data && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted">已解密薪资</div>
              <div className="font-display text-2xl font-semibold text-text">
                {salaryQuery.data.summary.decoded}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted">低置信(黄)</div>
              <div className="font-display text-2xl font-semibold text-text">
                {salaryQuery.data.summary.lowConfYellow}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted">低置信(红)</div>
              <div className="font-display text-2xl font-semibold text-text">
                {salaryQuery.data.summary.lowConfRed}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted">红区占比</div>
              <div className="font-display text-2xl font-semibold text-text">
                {salaryQuery.data.summary.lowConfRedRate}%
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
