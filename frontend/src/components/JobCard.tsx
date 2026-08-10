import { useState, type ReactNode } from "react"
import { type Job, fetchJob } from "../api/client"
import { Badge } from "../design-system"
import type { BadgeTone } from "../design-system"
import { cn } from "../lib/cn"

// 状态 → 标签 + 色调（v2：统一绿/中性语义，避免杂色刺眼；小圆点为装饰）
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  collected: { label: "已采集", tone: "neutral" },
  analyzed: { label: "已分析", tone: "primary" },
  viewed: { label: "已查看", tone: "primary" },
  applied: { label: "已投递", tone: "success" },
  archived: { label: "已归档", tone: "neutral" },
  expired: { label: "已过期", tone: "warning" },
  rejected: { label: "已拒绝", tone: "danger" },
  ignored: { label: "不投", tone: "neutral" },
}

// 能力要求区里「已经有冗余展示 / 不该出现」的字段：
// - salary 顶部右侧实时显；education / company / location / experience 顶部 meta 网格已显。
const REDUNDANT_KEYS = new Set(["salary", "company", "location", "experience", "education"])

// 占位符（不显示出来）—— 横线/问号/常见"未知"词都视作无信息
function isPlaceholder(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return true
    if (t === "—" || t === "-" || t === "?" || t === "？") return true
    if (/^(null|n\/a|na|none|unknown|unknown\.?|无|暂无|未注明|未知)$/i.test(t)) return true
  }
  if (Array.isArray(v) && v.every(isPlaceholder)) return true
  return false
}

// 把 camelCase / snake_case 键转成可读标题
function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^\w|\s\w/g, (c) => c.toUpperCase())
}

// 尝试把字符串解析为 JSON（后端 SQLite 存的 extracted 是 JSON 字符串）。
// 解析失败时返回原字符串，不抛错。
function tryParseJson(value: string): unknown {
  const t = value.trim()
  if (!t) return value
  // 必须是 JSON 形状才尝试（避免把普通文本当 JSON 误解析）
  if (!(t.startsWith("{") || t.startsWith("["))) return value
  try {
    return JSON.parse(t)
  } catch {
    return value
  }
}

// 递归渲染 extracted：跳过无信息字段，把数组改为「内联文本」一段而不是独立 Badge 行。
function renderExtracted(value: unknown): ReactNode {
  if (isPlaceholder(value)) return null
  if (typeof value === "string") {
    const parsed = tryParseJson(value)
    if (parsed !== value) return renderExtracted(parsed)
    return <p className="m-0 text-sm leading-relaxed text-text">{value}</p>
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-sm text-text">{String(value)}</span>
  }
  if (Array.isArray(value)) {
    const filtered = value.filter((v) => !isPlaceholder(v))
    if (filtered.length === 0) return null
    const primitives = filtered.every(
      (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
    )
    if (primitives) {
      // 同类技能合并为一段：Item · Item · Item —— 自动 wrap 但视觉密度紧凑，不再每个都是 Badge 胶囊。
      return (
        <p className="m-0 text-sm leading-relaxed text-text">
          {filtered.map((v, i) => (
            <span key={i} className={i > 0 ? "" : ""}>
              {i > 0 && <span className="mx-1.5 text-muted">·</span>}
              <span className="font-medium">{String(v)}</span>
            </span>
          ))}
        </p>
      )
    }
    return (
      <ul className="m-0 list-none space-y-3 p-0">
        {filtered.map((v, i) => (
          <li key={i}>{renderExtracted(v)}</li>
        ))}
      </ul>
    )
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    // 简化形态：所有 entry 的 value 都是 primitive（如 {Node: "必备", React: "常见"}）
    // → 合并为内联 "Key · 等级 · Key · 等级"，不按小标题拆分
    const entries = Object.entries(obj)
    const allPrimitives =
      entries.length > 1 &&
      entries.every(
        ([, lv]) => typeof lv === "string" || typeof lv === "number" || typeof lv === "boolean",
      )
    if (allPrimitives) {
      return (
        <p className="m-0 text-sm leading-relaxed text-text">
          {entries.map(([k, lv], i) => (
            <span key={k}>
              {i > 0 && <span className="mx-1.5 text-muted">·</span>}
              <span className="font-medium">{k}</span>
              {typeof lv === "string" && lv.trim() && !isPlaceholder(lv) && (
                <span className="ml-1.5 text-xs text-muted">{lv}</span>
              )}
            </span>
          ))}
        </p>
      )
    }
    return (
      <div className="space-y-3.5">
        {entries
          .filter(([k, v]) => !REDUNDANT_KEYS.has(k.toLowerCase()) && !isPlaceholder(v))
          .map(([k, v]) => {
            const content = renderExtracted(v)
            if (content === null) return null
            return (
              <div key={k}>
                <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  {humanize(k)}
                </div>
                {content}
              </div>
            )
          })}
      </div>
    )
  }
  return <span className="text-sm text-text">{String(value)}</span>
}

// v2：无卡片化列表行。靠上下 hairline 分隔，不套厚黑框。
// v2.3：改 2 列布局——左 title + 2x2 meta grid（每格独立 padding，告别·拼接），右 stack(状态 + 薪资)。
export default function JobCard({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)
  // P0-2：列表接口不再返回 extracted；已分析的职位在展开时按需从 /api/jobs/:id 拉取。
  const [extracted, setExtracted] = useState<unknown | undefined>(job.extracted)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const s = STATUS[job.status || "collected"] ?? STATUS.collected
  const canShowReq = job.status === "analyzed" || job.extracted != null

  async function onToggle() {
    const next = !open
    setOpen(next)
    // 列表无 extracted 且尚未拉取 → 展开时按需取详情
    if (next && job.extracted == null && !loadingDetail) {
      setLoadingDetail(true)
      try {
        const d = await fetchJob(job.id)
        setExtracted(d.extracted ?? null)
      } catch {
        /* 静默：详情拉取失败时仅不展示能力要求 */
      } finally {
        setLoadingDetail(false)
      }
    }
  }

  const hasReq =
    extracted !== null &&
    extracted !== undefined &&
    !(typeof extracted === "string" && extracted.trim() === "")

  return (
    <article className="w-full rounded-xl border-b border-border px-4 py-6 transition-colors hover:bg-accent/5 sm:px-6">
      <div className="flex items-start gap-6">
        {/* 左：标题 + 2x2 meta 网格 */}
        <div className="min-w-0 flex-1 space-y-4">
          <h3 className="m-0 font-display text-lg font-semibold leading-snug text-text sm:text-xl">{job.title}</h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            {(
              [
                { k: "公司", v: job.company },
                { k: "城市", v: job.location },
                { k: "经验", v: job.experience },
                { k: "学历", v: job.education },
              ] as const
            ).map((f) => (
              <div key={f.k} className="flex min-w-0 flex-col gap-1.5">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{f.k}</dt>
                <dd className={cn("m-0 truncate text-sm font-medium", f.v?.trim() ? "text-text" : "text-muted")}>
                  {f.v?.trim() || "未注明"}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 右：状态 + 薪资 stack */}
        <div className="flex shrink-0 flex-col items-end gap-3 pt-1">
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted">薪资</div>
            <div className="font-display text-base font-semibold text-text tabular-nums">
              {job.salary || "面议"}
            </div>
          </div>
        </div>
      </div>

      {canShowReq && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 -mx-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
          >
            {open ? "收起能力要求" : "查看能力要求"}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {open && loadingDetail && (
            <div className="mt-3 text-sm text-muted">加载能力要求…</div>
          )}
          {open && !loadingDetail && hasReq && (
            <div className="mt-3 rounded-xl border border-border bg-surface-solid p-4">
              {renderExtracted(extracted)}
            </div>
          )}
          {open && !loadingDetail && !hasReq && (
            <div className="mt-3 text-sm text-muted">该职位无提取的结构化能力要求。</div>
          )}
        </div>
      )}
    </article>
  )
}
