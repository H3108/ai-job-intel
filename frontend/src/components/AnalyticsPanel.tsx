import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Analytics } from "../api/client"
import { Meter, Segmented, Badge, type BadgeTone } from "../design-system"
import { cn } from "../lib/cn"
import { weightOf, enrichSkill, type Enriched } from "../lib/skillRank"

// 无卡片化子块：仅小标题 + 内容，靠留白分隔（不套卡）。
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  )
}

function distToRows(dist: Record<string, number>, limit = 10) {
  return Object.entries(dist)
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit)
}

// 技能优先级：综合 / 按频次 / 按重要性 三视角切换 + 类别维度钻取（全部市场 / 前端框架 / AI工程化 / 工程化基建 / 工具链 / 软技能）。
// 数据源用 skillRank（全量 + 带 categories），前端从 levels 派生 score/topLevel，保证维度钻取能拿到该维度真实 Top 15。
// 每行行内显示频次与权重分项，让"为什么排这"在任一视角下都可见（综合视图不再是一笔糊涂账）。
// 软技能（category='soft'）无等级标注，选中时排序强制按频次，并在表头给出提示。
// 维度下拉：value 用数据库原始分类键（与 enrich() 的 primaryCat 口径一致，才能正确过滤），
// label 用人类化展示。软技能原始键为 'soft'，显示成「软技能」。
const CATEGORIES = ['前端框架/语言', 'AI工程化', '工程化/基建', '工具链', 'soft']
const CAT_LABEL: Record<string, string> = { soft: '软技能' }
// ⚠️ 权重/优先级规则已上移为单一可信源：LEVEL_WEIGHT → 后端 analyze.js 导出的 levelWeights，
// CAT_PRECEDENCE → 后端 categoryPrecedence，均经 /api/analytics 返回，前端（data.*）消费，不再硬编码（Issue 8）。
// 派生逻辑见 lib/skillRank.ts（weightOf / enrichSkill）。

// 等级 → 徽章色：必备(关键)用强调绿、稀缺用琥珀、常见中性、加分用信息蓝；不引入红，贴合黑绿主题。
function levelTone(lvl?: string): BadgeTone {
  if (lvl === '必备') return 'primary'
  if (lvl === '稀缺') return 'warning'
  if (lvl === '加分') return 'info'
  return 'neutral'
}

// 绿主题自绘下拉（与 Segmented 同级质感）：按钮 + 弹层 listbox，键盘/Esc/外部点击关闭。
function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="text-muted">{label}</span>
        <span>{current?.label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn('text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-20 mt-1.5 max-h-64 w-44 overflow-auto rounded-lg border border-border bg-surface-solid p-1 shadow-elevation-2"
        >
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  o.value === value ? 'font-medium text-accent' : 'text-text hover:bg-surface',
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 8.5l3.5 3.5L13 4.5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 单条技能行：排名序号 + 技能名(截断+tooltip) + 等级徽章 + 对齐渐变条形 + 数值 + 互补指标。
function SkillRow({
  rank,
  s,
  barValue,
  barMax,
  meta,
}: {
  rank: number
  s: Enriched
  barValue: number
  barMax: number
  meta: string
}) {
  const pct = Math.max(0, Math.min(100, (barValue / barMax) * 100))
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">{rank}</span>
      <div className="flex min-w-0 flex-[1.6] items-baseline gap-2">
        <span className="truncate text-sm font-medium text-text" title={s.skill}>
          {s.skill}
        </span>
        {s.topLevel && (
          <Badge tone={levelTone(s.topLevel)} className="shrink-0 px-2 py-0 text-[10px] leading-5">
            {s.topLevel}
          </Badge>
        )}
      </div>
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-[var(--accent-hover)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-text">{Math.round(barValue)}</span>
      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted">{meta}</span>
    </div>
  )
}

function SkillPriorityBlock({
  skillRank,
  levelWeights,
  categoryPrecedence,
}: {
  skillRank: Analytics['skillRank']
  levelWeights: Record<string, number>
  categoryPrecedence: string[]
}) {
  const [mode, setMode] = useState<'composite' | 'frequency' | 'importance'>('composite')
  const [cat, setCat] = useState('全部')

  // 软技能无等级标注：选中软技能维度时，排序强制按频次（综合/重要性在此维度无意义）。
  const isSoft = cat === 'soft'
  const effectiveMode = isSoft ? 'frequency' : mode

  const sorted = useMemo(() => {
    const enriched = skillRank.map((s) => enrichSkill(s, levelWeights, categoryPrecedence))
    const src = cat === '全部' ? enriched : enriched.filter((s) => s.primaryCat === cat)
    const arr = src.slice()
    if (effectiveMode === 'frequency') arr.sort((a, b) => b.count - a.count)
    else if (effectiveMode === 'importance') arr.sort((a, b) => weightOf(b.topLevel, levelWeights) - weightOf(a.topLevel, levelWeights) || b.count - a.count)
    else arr.sort((a, b) => b.score - a.score)
    return arr.slice(0, 15)
  }, [skillRank, cat, effectiveMode, levelWeights, categoryPrecedence])

  const maxScore = Math.max(1, ...sorted.map((s) => s.score))
  const maxCount = Math.max(1, ...sorted.map((s) => s.count))
  const barValue = (s: Enriched) =>
    effectiveMode === 'frequency' ? s.count : effectiveMode === 'importance' ? weightOf(s.topLevel, levelWeights) : s.score
  const barMax = effectiveMode === 'frequency' ? maxCount : effectiveMode === 'importance' ? 3 : maxScore
  const metaOf = (s: Enriched) =>
    effectiveMode === 'frequency' ? `权重 ×${weightOf(s.topLevel, levelWeights)}` : `频次 ${s.count}`

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          技能优先级 Top 15
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            tabs={
              isSoft
                ? [{ value: 'frequency', label: '按频次' }]
                : [
                    { value: 'composite', label: '综合' },
                    { value: 'frequency', label: '按频次' },
                    { value: 'importance', label: '按重要性' },
                  ]
            }
            value={effectiveMode}
            onChange={(v) => setMode(v as typeof mode)}
          />
          <Dropdown
            label="维度"
            value={cat}
            onChange={(v) => {
              setCat(v)
              // 切到软技能维度时，排序态归位到「按频次」（避免停留在综合/重要性造成误导）
              if (v === 'soft') setMode('frequency')
            }}
            options={[{ value: '全部', label: '全部市场' }, ...CATEGORIES.map((c) => ({ value: c, label: CAT_LABEL[c] || c }))]}
          />
        </div>
      </div>

      {isSoft && (
        <p className="text-xs text-muted">
          软技能无等级标注，已按出现频次排序（综合 / 重要性视角在此维度不适用）。
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">该维度暂无技能数据</p>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((s, i) => (
            <li key={s.skill} className="py-2.5">
              <SkillRow rank={i + 1} s={s} barValue={barValue(s)} barMax={barMax} meta={metaOf(s)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 无卡片化，四块分布以 2 列网格 + 留白分块；条形统一黑绿渐变 Meter。
// 技能优先级（新功能）通栏置顶，下方 4 个分布块用 2 列栅格，消除原 5 块混排造成的空白失衡。
export default function AnalyticsPanel({ data }: { data: Analytics }) {
  const expRows = distToRows(data.expDist, 10)
  const eduRows = distToRows(data.eduDist, 10)
  const maxExp = Math.max(1, ...expRows.map((r) => r.v))
  const maxEdu = Math.max(1, ...eduRows.map((r) => r.v))
  const maxCluster = Math.max(1, ...data.titleClusters.map((x) => x.count))
  const maxRole = Math.max(1, ...data.roleDist.map((x) => x.count))

  return (
    <div className="space-y-10">
      <SkillPriorityBlock
        skillRank={data.skillRank}
        levelWeights={data.levelWeights}
        categoryPrecedence={data.categoryPrecedence}
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
        <Block title="岗位细分方向（按标题聚类）">
          {data.titleClusters.length === 0 && <p className="text-sm text-muted">暂无数据</p>}
          {data.titleClusters.map((c) => (
            <div key={c.key} className="space-y-1">
              <Meter label={c.key} value={c.count} max={maxCluster} showValue />
              <p className="truncate pl-3 text-xs text-muted sm:pl-[8.75rem]">{c.samples.slice(0, 2).join(" · ")}</p>
            </div>
          ))}
        </Block>

        <Block title="规范岗位排名（合并同义标题）">
          {data.roleDist.length === 0 && <p className="text-sm text-muted">暂无数据</p>}
          {data.roleDist.slice(0, 12).map((r) => (
            <Meter key={r.role} label={r.role} value={r.count} max={maxRole} showValue />
          ))}
        </Block>

        <Block title="经验要求分布">
          {expRows.length === 0 && <p className="text-sm text-muted">暂无数据（多数 JD 正文未写经验）</p>}
          {expRows.map((r) => (
            <Meter key={r.k} label={r.k} value={r.v} max={maxExp} showValue />
          ))}
        </Block>

        <Block title="学历要求分布">
          {eduRows.length === 0 && <p className="text-sm text-muted">暂无数据</p>}
          {eduRows.map((r) => (
            <Meter key={r.k} label={r.k} value={r.v} max={maxEdu} showValue />
          ))}
        </Block>
      </div>
    </div>
  )
}
