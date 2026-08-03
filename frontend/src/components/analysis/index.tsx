// 跨页面复用的「分析 / 分层解读 / 行动建议」组件与配色常量。
// 统一黑绿主题，不引入红；保持项目「零第三方 viz」风格。
// 三个页面（细报表 / 角色对比 / 学习路线）共用同一套分层与建议范式，避免重复定义。
import { type ReactNode } from "react"

// ── 配色常量（细报表页与对比页共用，保持一致）──────────────────────────
// 配色全部走 CSS 变量（index.css 的 --cat-* / --tier-*），双主题各一套，避免写死 hex。
export const ACCENT = "var(--cat-soft)"

export const CATEGORY_COLORS: Record<string, string> = {
  "前端框架/语言": "var(--cat-frontend)",
  AI工程化: "var(--cat-ai)",
  "工程化/基建": "var(--cat-eng)",
  工具链: "var(--cat-tools)",
  soft: "var(--cat-soft)",
  其他: "var(--cat-other)",
}

// 固定类别顺序，保证跨页面 / 跨角色对比时行对齐（与 categoryPriority 内部排序无关）。
export const CATEGORY_ORDER = ["前端框架/语言", "AI工程化", "工程化/基建", "工具链", "soft"]

// 能力分层三档配色（与细报表页一致）：必备底座=蓝 / 加分稀缺=紫 / AI 工具=青。
export const TIER_COLORS = { base: "var(--tier-base)", premium: "var(--tier-premium)", tools: "var(--tier-tools)" }

export function catColor(cat: string | null | undefined): string {
  if (!cat) return CATEGORY_COLORS["其他"]
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["其他"]
}

// ── 通用小组件 ─────────────────────────────────────────────
// 轻量技能 chip（对比页用，不显示计数；可按档着色描边）。
export function Chip({ label, tone }: { label: string; tone?: keyof typeof TIER_COLORS }) {
  const color = tone ? TIER_COLORS[tone] : undefined
  return (
    <span
      className="inline-flex items-center rounded-full bg-surface-solid px-2.5 py-1 text-xs text-text"
      style={color ? { boxShadow: `inset 0 0 0 1px ${color}66` } : undefined}
    >
      {label}
    </span>
  )
}

// 能力分层卡片（必备底座 / 加分稀缺项 / AI 编码工具）。
export function TierBlock({
  color,
  title,
  desc,
  children,
}: {
  color: string
  title: string
  desc: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <h4 className="text-sm font-semibold text-text">{title}</h4>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{desc}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

// 带计数的技能 chip（细报表页用）。
export function SkillChip({ skill, count }: { skill: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-solid px-2.5 py-1 text-xs text-text">
      <span>{skill}</span>
      <span className="tabular-nums text-muted">{count}</span>
    </span>
  )
}

// 单档技能行：彩色圆点 + 标题 + chips。
export function TierLine({ title, color, skills }: { title: string; color: string; skills: string[] }) {
  if (!skills.length) return null
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold text-text">{title}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <Chip key={s} label={s} />
        ))}
      </div>
    </div>
  )
}

// 行动建议条目（细报表页 / 学习路线页共用）。
export function Advise({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-[var(--on-accent)]">
        {n}
      </span>
      <div>
        <div className="text-sm font-semibold text-text">{title}</div>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  )
}
