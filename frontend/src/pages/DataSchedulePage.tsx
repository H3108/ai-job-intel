import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { fetchCrawlStatus, triggerCrawl, stopCrawl } from "../api/client"
import { Loading, ErrorBox } from "../components/ui"
import { Section, StatCard, Badge, Button, Alert, PageHeader } from "../design-system"
import { friendlyError } from "../lib/errorMessage"

function fmt(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function DataSchedulePage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["crawl-status"],
    queryFn: fetchCrawlStatus,
    // 运行中每 3 秒轮询一次；空闲不轮询。
    refetchInterval: (q) => (q.state.data?.isRunning ? 3000 : false),
  })

  const trigger = useMutation({
    mutationFn: triggerCrawl,
    onSuccess: () => {
      // 触发后立即刷新状态，并进入轮询。
      qc.invalidateQueries({ queryKey: ["crawl-status"] })
    },
  })

  const stop = useMutation({
    mutationFn: stopCrawl,
    onSuccess: () => {
      // 停止后立即刷新状态；isRunning 会在脚本退出后变 false。
      qc.invalidateQueries({ queryKey: ["crawl-status"] })
    },
  })

  if (isLoading) return <Loading msg="加载调度状态…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return null

  const running = data.isRunning

  return (
    <div className="space-y-12">
      <PageHeader
        title="数据调度"
        desc="查看自动采集计划、上次抓取结果，并可手动触发一次全量采集（抓取 → 分析 → 重建技能表 → 生成报告）。"
      />

      {/* 状态概览 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="当前状态"
          value={running ? "采集中" : "空闲"}
          delta={running ? "后台运行中" : "可手动触发"}
          deltaTone={running ? "up" : "flat"}
        />
        <StatCard label="上次抓取" value={fmt(data.lastRun)} delta={data.lastRun ? "已完成" : "尚无记录"} />
        <StatCard label="下次自动计划" value={fmt(data.nextRun)} delta={data.schedule} />
      </div>

      {/* 操作区 */}
      <Section title="手动触发" desc="立即跑一次全量采集（抓取 → 分析 → 重建技能表 → 生成报告）。若抓取导致本机卡顿，可随时点「停止抓取」释放资源。脚本自带原子锁，定时任务与手动触发不会并发。" topSpace={false}>
        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <Button
              variant="danger"
              onClick={() => stop.mutate()}
              loading={stop.isPending}
              disabled={stop.isPending}
            >
              停止抓取 · 释放资源
            </Button>
          ) : (
            <Button onClick={() => trigger.mutate()} loading={trigger.isPending} disabled={trigger.isPending}>
              立即抓取一次
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => refetch()}>
            刷新状态
          </Button>
          {running && <Badge tone="success" dot>后台采集中</Badge>}
        </div>

        {/* 抓取进度：轮询模式下展示「已抓 X/Y」，让用户在停止前知道还要等多久 */}
        {running && data.progress && (
          <div className="mt-4 rounded-xl border border-border bg-surface-solid p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {data.progress.percent >= 100 ? '抓取完成，正在生成报告…' : '抓取进度'}
              </span>
              <span className="text-muted">
                已抓 {data.progress.done}/{data.progress.total} 个搜索（{data.progress.percent}%）
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--border)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${data.progress.percent}%`, backgroundColor: 'var(--accent)' }}
              />
            </div>
          </div>
        )}

        {trigger.isError && (
          <Alert tone="danger" title="触发失败" className="mt-4">
            {friendlyError(trigger.error)}
          </Alert>
        )}
        {trigger.isSuccess && !trigger.data?.ok && (
          <Alert tone="warning" title="未能触发" className="mt-4">
            {trigger.data?.error || "未知原因"}
          </Alert>
        )}
        {trigger.isSuccess && trigger.data?.ok && (
          <Alert tone="success" title="已触发" className="mt-4">
            {trigger.data.message}
          </Alert>
        )}
        {stop.isPending && (
          <Alert tone="info" title="正在停止…" className="mt-4">
            已向抓取进程发送停止信号，稍候状态将变为「空闲」。
          </Alert>
        )}
        {stop.isSuccess && stop.data?.killed && (
          <Alert tone="info" title="已发送停止信号" className="mt-4">
            {stop.data.message || '抓取任务正在退出，资源将自动释放。'} 状态变为「空闲」后即可再次触发。
          </Alert>
        )}
        {stop.isSuccess && !stop.data?.killed && (
          <Alert tone="warning" title="无运行中的任务" className="mt-4">
            {stop.data?.message || '当前没有抓取任务在运行。'}
          </Alert>
        )}
        {stop.isError && (
          <Alert tone="danger" title="停止失败" className="mt-4">
            {friendlyError(stop.error)}
          </Alert>
        )}
      </Section>

      {/* 抓取日志 */}
      <Section
        title="抓取日志"
        desc="最近一次采集的运行日志（尾部 80 行）。采集中会自动刷新。"
        topSpace={false}
      >
        {running && (
          <div className="mb-3">
            <Badge tone="success" dot>实时刷新中</Badge>
          </div>
        )}
        {data.log ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-solid p-4 font-mono text-xs leading-relaxed text-muted">
            {data.log}
          </pre>
        ) : (
          <p className="text-sm text-muted">暂无日志。触发一次抓取后即可查看运行记录。</p>
        )}
      </Section>
    </div>
  )
}
