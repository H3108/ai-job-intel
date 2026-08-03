import { useMemo } from "react"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { Loading, ErrorBox } from "../components/ui"
import { Section, Badge, PageHeader } from "../design-system"
import { friendlyError } from "../lib/errorMessage"
import { Advise } from "../components/analysis"

// 路线页：learningPath 三阶段（基础前端 → AI 工程化 → 视觉/工具链专精）。
// v3：在原有阶段列表基础上，新增「学习路线行动建议」(结论先行) 与每阶段「分层说明 + 动手建议」，
//     数据驱动——切角色 / 有画像缺口时自动拼出"该从哪下手、补哪块最划算"。
export default function RoadmapPage() {
  const scope = useScope()
  const { data, isLoading, isError, error } = useAnalytics(scope)
  // 所有 hook 必须无条件在条件返回之前调用（遵守 Rules of Hooks）
  const path = data?.learningPath || []
  const hasBaseline = !!data?.personalGap?.hasBaseline
  const gapSkills = useMemo(
    () => new Set((data?.personalGap?.gaps || []).map((g) => g.skill)),
    [data?.personalGap],
  )

  // 三阶段引用（learningPath 阶段 key 固定）
  const baseStage = path.find((s) => s.stage === "基础前端")
  const aiStage = path.find((s) => s.stage === "AI 工程化")
  const toolStage = path.find((s) => s.stage === "视觉/工具链专精")

  // 每个阶段的缺失项（与你的画像缺口求交集）
  const missingOf = (stageKey?: string) =>
    (path.find((s) => s.stage === stageKey)?.items || []).filter((it) =>
      gapSkills.has(it.skill),
    )

  // 缺口最集中的阶段 → 建议优先补这块
  const focusStageKey = useMemo(() => {
    if (!hasBaseline) return null
    let best: string | null = null
    let bestN = 0
    for (const s of path) {
      const n = s.items.filter((it) => gapSkills.has(it.skill)).length
      if (n > bestN) {
        bestN = n
        best = s.stage
      }
    }
    return best
  }, [path, gapSkills, hasBaseline])

  if (isLoading) return <Loading msg="加载分析数据…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return null

  if (path.length === 0) {
    return (
    <div className="space-y-12">
      <PageHeader
        title="学习路线"
        desc="学习路线由市场数据生成：每个技能标注「在 N 个岗位出现 / 其中 M 个标为必备」，按优先级从高到低排。"
      />
      <p className="text-sm text-muted">暂无学习路线数据（请先确保岗位已 analyzed）。</p>
      </div>
    )
  }

  const baseRequired = (baseStage?.items || [])
    .filter((i) => i.required > 0)
    .sort((a, b) => b.required - a.required)
  const baseTop = baseRequired[0]

  return (
    <div className="space-y-12">
      <PageHeader
        title="学习路线"
        desc="学习路线由市场数据生成：每个技能标注「在 N 个岗位出现 / 其中 M 个标为必备」，按优先级从高到低排。"
      />

      {/* 学习路线行动建议（结论先行） */}
      <Section
        title="学习路线行动建议"
        desc="路线按市场价值递进分三阶段。下面直接告诉你该从哪下手、补哪块最划算——不是甩一张清单，而是讲清楚为什么这样排。"
      >
        <div className="space-y-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
          <Advise
            n={1}
            title="① 先打「基础前端」——这是入场券"
            body={
              baseStage
                ? `该阶段 ${baseStage.items.length} 项技能，其中 ${baseRequired.length} 项被市场标为必备（如 ${
                    baseTop ? `${baseTop.skill} ×${baseTop.required}` : "React/JS"
                  }）。这是求职硬门槛，没打牢连面试都进不去，务必优先级最高。`
                : "基础前端阶段暂无数据，可参考下方技能列表自行对齐主流框架/语言。"
            }
          />
          <Advise
            n={2}
            title="② 冲「AI 工程化」——这是溢价点"
            body={
              aiStage
                ? `AI 工程化是区别于普通前端的核心差异点（${aiStage.items
                    .slice(0, 3)
                    .map((i) => i.skill)
                    .join(" / ")} 等）。补一个 RAG / AI Agent / 流式响应的落地项目，是抬薪资到 20K+ 最划算的动作。`
                : "暂无 AI 工程化信号，可关注角色对比页寻找差异化方向。"
            }
          />
          <Advise
            n={3}
            title="③ 收尾「视觉/工具链」——拉开竞争力"
            body={
              toolStage
                ? `视觉与工具链阶段帮你和同岗拉开差距（设计审美 + Cursor / Copilot 等 AI 工具红利），可在前两阶段稳了之后再补。`
                : "视觉/工具链阶段暂无数据。"
            }
          />
          {hasBaseline && focusStageKey ? (
            <Advise
              n={4}
              title={`你的当前缺口集中在「${focusStageKey}」`}
              body={
                missingOf(focusStageKey).length > 0
                  ? `结合你的画像，缺口最多的是「${focusStageKey}」阶段（缺 ${missingOf(focusStageKey)
                      .map((i) => i.skill)
                      .join("、")}）。建议优先补这块，再回头巩固其他阶段。`
                  : `你与该阶段技能已基本匹配，可优先推进其他阶段。`
              }
            />
          ) : (
            <Advise
              n={4}
              title="想更个性化？去填一下你的技能画像"
              body="缺口页（Gap）填好你的已知技能后，这里会自动标出你在每个阶段缺什么、该优先补哪块。"
            />
          )}
        </div>

        {/* 三阶段速览：一眼看出每阶段规模与必备门槛 */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {path.map((s) => {
            const req = s.items.filter((i) => i.required > 0).length
            const tone =
              s.stage === "基础前端" ? "text-success-fg" : s.stage === "AI 工程化" ? "text-info-fg" : "text-muted"
            return (
              <div key={s.stage} className="rounded-xl border border-border bg-surface p-4">
                <div className={`text-sm font-semibold ${tone}`}>{s.stage}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-text">{s.items.length}</div>
                <div className="text-xs text-muted">技能项 · 其中 {req} 项标为必备</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 三阶段明细（原有列表，每段加分层说明 + 动手建议） */}
      {path.map((stage, i) => {
        const items = [...stage.items].sort((a, b) => b.required - a.required || b.count - a.count)
        const topRequired = items.find((it) => it.required > 0) || items[0]
        const missing = items.filter((it) => gapSkills.has(it.skill))
        return (
          <Section
            key={stage.stage}
            title={
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 place-items-center rounded-full bg-accent/12 text-sm font-bold text-accent"
                >
                  {i + 1}
                </span>
                {stage.stage}
              </span>
            }
            desc={stage.desc}
          >
            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li
                  key={it.skill}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 pl-3 pr-3 -mx-3 rounded-lg transition-colors first:pt-0 hover:bg-accent/5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-text">{it.skill}</span>
                    {it.required > 0 && (
                      <Badge tone="primary" dot>
                        必备 ×{it.required}
                      </Badge>
                    )}
                    {missing.some((m) => m.skill === it.skill) && (
                      <Badge tone="danger" dot>
                        你的缺口
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted">{it.reason}</span>
                </li>
              ))}
            </ul>

            {/* 分层说明 + 动手建议（每个阶段一段，数据驱动） */}
            <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface-solid p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">这阶段定位</span>
                <span className="text-sm text-text">{stage.desc}</span>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                <span className="font-semibold text-text">怎么动手：</span>
                优先学 <span className="font-semibold text-text">{topRequired?.skill}</span>
                {topRequired?.required ? `（必备 ×${topRequired.required}）` : ""}，再补其余{" "}
                {Math.max(0, items.length - 1)} 项；按出现频次从高到低逐个击破最稳。
              </p>
              {missing.length > 0 && (
                <p className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-muted">
                  <Badge tone="danger" dot>你的缺口</Badge>
                  结合画像，你在该阶段还缺{" "}
                  <span className="font-semibold text-text">
                    {missing.map((m) => m.skill).join("、")}
                  </span>
                  —— 优先补这些，性价比最高。
                </p>
              )}
            </div>
          </Section>
        )
      })}
    </div>
  )
}
