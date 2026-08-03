import { useQuery } from "@tanstack/react-query"
import { fetchSalaryAudit, type SalaryAudit } from "../api/client"
import { Section, StatCard, Table, Badge, Alert, PageHeader } from "../design-system"
import { Loading, ErrorBox } from "../components/ui"
import { cn } from "../lib/cn"
import { friendlyError } from "../lib/errorMessage"

// 置信度配色：红(<red) / 黄(<yellow) / 绿(>=yellow)
function confTone(c: number, yellow: number, red: number): "danger" | "warning" | "success" {
  if (c < red) return "danger"
  if (c < yellow) return "warning"
  return "success"
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

// 薪校抽检页（原名「薪资校验」）：消费后端 /api/salary-audit。
// 目的：把 Boss 页面 PUA 加密原文(raw) 与算法解密值(decoded) 并排抽检，
// 让使用者逐条在页面核对字体解密算法是否准确——直接回应「薪资解码率 37%」的模糊地带。
export default function SalaryAuditPage() {
  const { data, isError, error, isLoading } = useQuery<SalaryAudit>({
    queryKey: ["salary-audit"],
    queryFn: fetchSalaryAudit,
  })

  if (isLoading) return <Loading msg="加载薪校…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return null

  const s = data.summary
  const y = data.thresholds.yellow
  const r = data.thresholds.red
  const warn = s.lowConfRedRate > 10 // 仅红区(<0.70)真实解码风险触发告警，与 /api/health 口径一致

  // 置信分布：已解密总数 = 高置信(绿) + 低置信黄 + 低置信红
  const total = s.decoded || 1
  const healthy = Math.max(0, s.decoded - s.lowConfYellow - s.lowConfRed)
  const segs = [
    { label: "高置信", value: healthy, cls: "bg-success" },
    { label: "低置信·黄", value: s.lowConfYellow, cls: "bg-warning" },
    { label: "低置信·红", value: s.lowConfRed, cls: "bg-danger" },
  ]

  const rows = data.sample.map((x) => ({
    title: x.title,
    company: x.company,
    decoded: <span className="font-medium text-text">{x.decoded}</span>,
    raw: <span className="font-mono text-muted">{x.raw}</span>,
    confidence: (
      <Badge tone={confTone(x.confidence, y, r)} dot>
        {pct(x.confidence)}
      </Badge>
    ),
  }))

  return (
    <div className="space-y-12">
      <PageHeader
        title="薪校"
        desc="抽检 Boss 页面薪资的 PUA 加密原文与算法解密值，逐条核对字体解密是否准确。置信越低越需要人工比对——这是验证「薪资解码率」可信度的唯一抓手。"
      />

      {/* 解密概览：KPI + 置信分布堆叠条 */}
      <Section
        title="解密概览"
        desc="本次样本的解密覆盖率与置信分布。绿色越多，算法越可靠；仅红区(<0.70)代表解码风险，占比≥10% 才需真机重跑核对字体；黄区(<0.85)是字形比对的正常打分区间（正确解码也常落在 0.80–0.84），无需处理。"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="已解密薪资" value={s.decoded} />
          <StatCard label="低置信(黄)" value={s.lowConfYellow} />
          <StatCard label="低置信(红)" value={s.lowConfRed} />
          <StatCard label="低置信(红)占比" value={`${s.lowConfRedRate}%`} />
          <StatCard label="中位置信" value={s.medianConfidence != null ? pct(s.medianConfidence) : "—"} />
        </div>

        <div className="mt-8 max-w-3xl space-y-3">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-border"
            role="img"
            aria-label={`置信分布：高置信 ${healthy} 条，低置信黄 ${s.lowConfYellow} 条，低置信红 ${s.lowConfRed} 条`}
          >
            {segs.map((g) => (
              <div key={g.label} style={{ width: `${(g.value / total) * 100}%` }} className={cn("h-full", g.cls)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            {segs.map((g) => (
              <span key={g.label} className="inline-flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", g.cls)} />
                {g.label}
                <span className="tabular-nums text-text">{g.value}</span>
              </span>
            ))}
          </div>
        </div>
      </Section>

      {warn ? (
        <Alert tone="warning" title="薪资解密存在风险">
          低置信(红)样本占比 <b>{s.lowConfRedRate}%</b>（≥10% 即建议真机重跑 crawl 核对字体解码算法）。
          下方为低置信样本抽检：<b>raw</b> 是 Boss 页面 PUA 加密原文，<b>decoded</b> 是算法解密值，请逐条对照页面确认。
        </Alert>
      ) : (
        <Alert tone="success" title="薪资解密置信正常">
          红区(&lt;0.70)占比 <b>{s.lowConfRedRate}%</b>，无解码风险。黄区(&lt;0.85)占比 {s.lowConfRate}% 为字形比对正常打分区间，不代表解错、无需重跑；下方抽检表仍可逐条人工复核。
        </Alert>
      )}

      <Section
        title={`低置信抽检（${data.sample.length} 条 · 按置信升序）`}
        desc="逐条比对 PUA 加密原文与解密值，确认字体解密算法是否准确。置信越低越需要人工核对。"
      >
        <Table
          columns={[
            { key: "title", title: "职位" },
            { key: "company", title: "公司" },
            { key: "decoded", title: "解密薪资" },
            { key: "raw", title: "PUA 加密原文" },
            { key: "confidence", title: "置信", align: "right" },
          ]}
          rows={rows}
          virtual={{ height: 480 }}
        />
      </Section>
    </div>
  )
}
