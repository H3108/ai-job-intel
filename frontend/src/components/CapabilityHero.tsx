import { useEffect, useState } from "react"
import type { Analytics } from "../api/client"
import { categoryLabel } from "../lib/category"
import { useScope } from "../api/useAnalytics"

// P3 记忆点：总览英雄区「能力图谱」。
// 左侧动态数字（count-up），右侧径向能力图谱（纯 SVG，闭合多边形 area）。
// 零新依赖；尊重 prefers-reduced-motion。v2：无卡片化，KPI 仅标签 + 大号等宽数字。
// v2.3：图谱改闭合多边形（area 半透明绿 + 实线 stroke），网格改多边形 4 层，
//       标签完整不截断（按角度自动 textAnchor），放大到 320px，中心改成大号 KPI「X 项技能」。

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(m.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    m.addEventListener("change", handler)
    return () => m.removeEventListener("change", handler)
  }, [])
  return reduced
}

function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) {
      setDisplay(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(value * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced, duration])
  return <>{display}</>
}

// 闭合多边形面积图：4-8 个能力类别；网格用同心多边形，标签按角度自动对齐。
function RadialCapability({ categories }: { categories: Analytics["categoryPriority"] }) {
  const top = categories.slice(0, 8)
  const N = top.length || 1
  const size = 360
  const c = size / 2
  const maxR = 112
  const innerR = 44
  const labelR = maxR + 26
  const maxW = Math.max(1, ...top.map((x) => x.weight))
  const totalSkills = top.reduce((sum, x) => sum + x.skillCount, 0)

  // 极坐标 → 直角坐标（i 第几个类别，ratio 0~1）
  const pt = (i: number, ratio: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / N
    const r = innerR + (maxR - innerR) * ratio
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle), angle }
  }

  // 4 层网格多边形（25% / 50% / 75% / 100%）
  const gridLevels = [0.25, 0.5, 0.75, 1]
  const polygonPoints = (ratio: number) =>
    Array.from({ length: N }, (_, i) => {
      const p = pt(i, ratio)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    }).join(" ")

  // 数据闭合多边形路径
  const dataPath = top
    .map((cat, i) => {
      const p = pt(i, cat.weight / maxW)
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(" ") + " Z"

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center">
      <svg
        viewBox={`-32 -32 ${size + 64} ${size + 64}`}
        className="h-auto w-full"
        role="img"
        aria-label={`能力图谱：共 ${totalSkills} 项核心技能，按市场需求权重排布`}
      >
        {/* 同心多边形网格 */}
        {gridLevels.map((g) => (
          <polygon
            key={g}
            points={polygonPoints(g)}
            fill="none"
            stroke="var(--border)"
            strokeOpacity={0.55}
            strokeWidth={1}
          />
        ))}

        {/* 轴线（从中心到外圈） */}
        {top.map((_, i) => {
          const p = pt(i, 1)
          return (
            <line
              key={i}
              x1={c}
              y1={c}
              x2={p.x}
              y2={p.y}
              stroke="var(--border)"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          )
        })}

        {/* 数据多边形：半透明绿填充 + 实线 stroke */}
        <path
          d={dataPath}
          fill="var(--accent)"
          fillOpacity={0.18}
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {top.map((cat, i) => {
          const p = pt(i, cat.weight / maxW)
          return (
            <circle
              key={cat.category}
              cx={p.x}
              cy={p.y}
              r={4.5}
              fill="var(--accent)"
              stroke="var(--bg)"
              strokeWidth={2}
            />
          )
        })}

        {/* 标签：加大画布 + 多行（按 / 拆行）+ 自动对齐 + 垂直居中，确保完整不裁切 */}
        {top.map((cat, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / N
          const lx = c + labelR * Math.cos(angle)
          const ly = c + labelR * Math.sin(angle)
          const cosA = Math.cos(angle)
          const textAnchor = Math.abs(cosA) < 0.25 ? "middle" : cosA > 0 ? "start" : "end"
          const lines = categoryLabel(cat.category).split("/")
          const lineH = 13
          const startY = ly - ((lines.length - 1) * lineH) / 2
          return (
            <text
              key={`l-${cat.category}`}
              x={lx}
              y={startY}
              fontSize={11}
              fill="var(--text)"
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="font-medium"
            >
              {lines.map((ln, k) => (
                <tspan key={k} x={lx} dy={k === 0 ? 0 : lineH}>
                  {ln}
                </tspan>
              ))}
            </text>
          )
        })}

        {/* 中心 KPI 大圆 + 数字 */}
        <circle cx={c} cy={c} r={innerR - 2} fill="var(--surface-solid)" stroke="var(--border)" />
        <text
          x={c}
          y={c - 3}
          fontSize={26}
          fontWeight={700}
          fill="var(--accent)"
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-display"
        >
          {totalSkills}
        </text>
        <text
          x={c}
          y={c + 16}
          fontSize={9}
          fill="var(--muted)"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          项核心技能
        </text>
      </svg>
    </div>
  )
}

export default function CapabilityHero({
  analytics,
  jobCount,
  analyzedCount,
}: {
  analytics: Analytics
  jobCount: number
  analyzedCount: number
}) {
  const gap = analytics.personalGap
  const known = gap.knownCount
  const gapCount = gap.gaps.length
  const coverage = known + gapCount > 0 ? Math.round((known / (known + gapCount)) * 100) : 0
  const clusters = analytics.titleClusters.length
  // 角色 / 城市随作用域动态显示：未选择时不显示（不写死默认值）。
  const { role, city } = useScope()

  const stats = [
    { label: "样本岗位", value: jobCount },
    { label: "已分析", value: analyzedCount },
    { label: "细分方向", value: clusters },
    { label: "技能覆盖度", value: coverage, suffix: "%" },
  ]

  return (
    <section aria-label="能力图谱" className="grid grid-cols-1 gap-8 border-b border-border pb-10 md:grid-cols-2">
      <div className="flex flex-col justify-center">
        <h2 className="m-0 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">你的{role || 'AI'}能力图谱</h2>
        <p className="m-0 mt-1.5 text-sm text-muted">
          基于 {jobCount} 个{city} AI 岗实时画像 · 市场缺口 {gapCount} 项
        </p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <div className="font-display text-3xl font-semibold text-text tabular-nums sm:text-4xl">
                <CountUp value={s.value} />
                {s.suffix}
              </div>
              <div className="text-xs text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      {/* 图谱区域：去掉下方 2 列图例（标签已在图上画完），整体更干净 */}
      <div className="flex flex-col items-center justify-center">
        <RadialCapability categories={analytics.categoryPriority} />
      </div>
    </section>
  )
}
