import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo, useCallback } from "react"
import { fetchProfile, fetchMastery, putMastery, type Profile, type MasteryItem, type MasteryStatus } from "../api/client"
import { useAnalytics, useScope } from "../api/useAnalytics"
import { Loading, ErrorBox } from "../components/ui"
import { categoryLabel } from "../lib/category"
import { Section, Meter, Badge, Alert, Button, PageHeader } from "../design-system"
import { friendlyError } from "../lib/errorMessage"

// 把"主标题（子项1 / 子项2）"或"A / B"格式拆成结构化数据
function parseTopic(raw: string): { title: string; subs: string[] } {
  // 1) "标题（子项1 / 子项2）"——括号内为子项列表
  const m = raw.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/)
  if (m) {
    return {
      title: m[1].trim(),
      subs: m[2].split("/").map((s) => s.trim()).filter(Boolean),
    }
  }
  // 2) "A / B / C"——首段为标题，其余为子项
  const parts = raw.split("/").map((s) => s.trim()).filter(Boolean)
  if (parts.length > 1) return { title: parts[0], subs: parts.slice(1) }
  return { title: raw.trim(), subs: [] }
}

// 容忍数据库里偶发的「双重 JSON 编码」（如 `[ "[\"…\"]" ]`）：解开外层包裹，返回字符串数组。
function parseStringArray(raw: unknown): string[] {
  let v: unknown = raw
  if (typeof v === "string") {
    try {
      v = JSON.parse(v.trim())
    } catch {
      return String(v).trim() ? [String(v).trim()] : []
    }
  }
  // 外层数组包着单个 JSON 字符串 → 取内层数组
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === "string") {
    try {
      const inner = JSON.parse((v[0] as string).trim())
      if (Array.isArray(inner)) v = inner
    } catch {
      /* 保持原值 */
    }
  }
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : []
}

// 通用 JSON 对象解析（容忍双重编码），失败回退空对象。
function parseObject(raw: unknown): Record<string, unknown> {
  let v: unknown = raw
  if (typeof v === "string") {
    try {
      v = JSON.parse(v.trim())
    } catch {
      return {}
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

// 可视化学习路径：左侧时间轴（绿圆序号 + 连接线）+ 右侧主标题与子项
function LearningPath({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">（画像未配置 ai_engineering_gap）</p>
  }
  return (
    <ol className="relative">
      {items.map((raw, i) => {
        const { title, subs } = parseTopic(raw)
        const isLast = i === items.length - 1
        return (
          <li key={i} className="relative pb-7 last:pb-0 pl-14 sm:pl-16">
            {/* 序号大圆 */}
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 grid h-11 w-11 sm:h-12 sm:w-12 place-items-center rounded-full bg-accent/12 font-mono text-sm font-bold text-accent ring-1 ring-accent/30 tabular-nums"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {/* 连接线（除末项） */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[21px] sm:left-[23px] top-12 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-accent/30 to-border"
              />
            )}
            {/* 步骤主体 */}
            <div className="pt-1.5">
              <h4 className="m-0 font-display text-lg font-semibold leading-snug text-text sm:text-xl">
                {title}
              </h4>
              {subs.length > 0 && (
                <ul className="mt-2.5 m-0 list-none space-y-1.5 p-0">
                  {subs.map((s, j) => (
                    <li
                      key={j}
                      className="flex items-baseline gap-2 text-sm leading-relaxed text-muted"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-accent/70"
                      />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// 三态掌握标记：点击在 未学 → 学习中 → 已掌握 → 未学 间循环。已掌握会从缺口移除（后端重算后）。
function MasteryBadge({ status, onCycle }: { status: MasteryStatus; onCycle: () => void }) {
  const tone: "success" | "info" | "neutral" =
    status === "已掌握" ? "success" : status === "学习中" ? "info" : "neutral"
  return (
    <button
      type="button"
      onClick={onCycle}
      title="点击切换：未学 → 学习中 → 已掌握 → 未学"
      className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Badge tone={tone} dot>
        {status}
      </Badge>
    </button>
  )
}

// 学习进度概览：已掌握 / 学习中 / 待学 三段比例条 + 数字标签。
function ProgressOverview({
  mastered,
  learning,
  todo,
  total,
}: {
  mastered: number
  learning: number
  todo: number
  total: number
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-text">学习进度</span>
        <Badge tone="success" dot>
          已掌握 {mastered}
        </Badge>
        <Badge tone="info" dot>
          学习中 {learning}
        </Badge>
        <Badge tone="neutral" dot>
          待学 {todo}
        </Badge>
        <span className="text-muted">共 {total} 项高频要求</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border">
        {mastered > 0 && (
          <div className="bg-emerald-500 transition-[width] duration-300" style={{ width: `${pct(mastered)}%` }} />
        )}
        {learning > 0 && (
          <div className="bg-sky-500 transition-[width] duration-300" style={{ width: `${pct(learning)}%` }} />
        )}
      </div>
    </div>
  )
}

// 缺口页：persona「前端扎实、AI 从零」vs 市场要求 → 真实能力缺口。
// 数据来源：/api/analytics(personalGap + categoryPriority) + /api/profile(persona 上下文)。
// v2：全部无卡片化、统一用 Section 标题层级；条形统一黑绿渐变 Meter；
// 「投资优先级」与「优先级明细」合并为一（明细作为每行副标题），消除重复文本列表的错落感。
export default function GapPage() {
  const navigate = useNavigate()
  // P2：画像走 TanStack Query（缓存 + 错误保留）。
  const { data: profile, isError, error } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  })
  const pErr = isError ? friendlyError(error) : null

  // P1-1：作用域（市场/角色/城市）需先于 mastery hooks（cycleStatus 依赖 scope 失效 analytics 缓存）。
  const scope = useScope()

  // 学习闭环（§21）：拉取掌握状态 + 本地乐观覆盖，供缺口技能三态标记与进度概览。
  const queryClient = useQueryClient()
  const { data: masteryList } = useQuery<MasteryItem[]>({ queryKey: ["mastery"], queryFn: fetchMastery })
  const [override, setOverride] = useState<Record<string, MasteryStatus>>({})
  const listMap = useMemo(() => {
    const m: Record<string, MasteryStatus> = {}
    for (const it of masteryList || []) m[it.skill] = it.status
    return m
  }, [masteryList])
  const statusOf = useCallback(
    (skill: string): MasteryStatus => override[skill] ?? listMap[skill] ?? "未学",
    [override, listMap],
  )
  // 标记状态切换：乐观更新本地 → PUT 后端 → 失效 analytics（后端重算缺口）/ mastery 缓存。
  const cycleStatus = useCallback(
    async (skill: string) => {
      const cur = statusOf(skill)
      const next: MasteryStatus = cur === "未学" ? "学习中" : cur === "学习中" ? "已掌握" : "未学"
      setOverride((prev) => ({ ...prev, [skill]: next }))
      try {
        await putMastery([{ skill, status: next }])
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["analytics", scope] }),
          queryClient.invalidateQueries({ queryKey: ["mastery"] }),
        ])
      } catch (e) {
        // 失败回滚本地覆盖，保留服务端真相
        setOverride((prev) => {
          const n = { ...prev }
          delete n[skill]
          return n
        })
        console.error("[GapPage] 更新掌握状态失败", e)
      }
    },
    [statusOf, scope, queryClient],
  )

  // P1-1：分析数据按 scope 自行取数（不再由 AppShell 全局 gate；无关页面不再被阻塞）。
  const { data, isLoading: aLoading, isError: aError, error: aErr } = useAnalytics(scope)
  // 角色 / 城市随作用域动态显示：未选择时不显示（不写死默认值）。
  const scopeBits = [scope.role, scope.city].filter(Boolean).join(' · ')
  if (aLoading) return <Loading msg="加载分析数据…" />
  if (aError) return <ErrorBox msg={friendlyError(aErr)} />
  if (!data) return null

  const gap = data.personalGap
  const maxGap = gap.gaps.length ? gap.gaps[0].score : 1
  const maxCat = data.categoryPriority.length ? Math.max(...data.categoryPriority.map((c) => c.weight)) : 1

  // 学习进度：后端 masteredCount(已掌握且属 topSlice) + 本地标记即时反映；
  // 学习中不影响缺口(仍待学)，仅作进度拆分；待学 = 总数 - 已掌握 - 学习中。
  const masteredLocal = gap.gaps.filter((g) => statusOf(g.skill) === "已掌握").length
  const learningLocal = gap.gaps.filter((g) => statusOf(g.skill) === "学习中").length
  const masteredCount = gap.masteredCount + masteredLocal
  const learningCount = learningLocal
  const todoCount = Math.max(0, gap.totalHigh - masteredCount - learningCount)

  // persona 上下文解析（容错双重编码）
  let knownSkills: string[] = []
  let aiExposure: { level?: string; tools?: string[]; note?: string } = {}
  let engGap: string[] = []
  let note = ""
  if (profile?.exists) {
    knownSkills = parseStringArray(profile.current_skills)
    aiExposure = parseObject(profile.ai_exposure) as { level?: string; tools?: string[]; note?: string }
    engGap = parseStringArray(profile.ai_engineering_gap)
    note = profile.note || ""
  }

  return (
    <div className="space-y-12">
      <PageHeader
        title="能力缺口"
        desc="对照市场要求与个人画像，定位你最该优先补的技能缺口与优先级。"
      />
      {/* persona 上下文 */}
      <Section title="我的基线（PRD Persona）" topSpace={false}>
        {!profile ? (
          <p className="text-sm text-muted">读取画像中…</p>
        ) : !profile.exists ? (
          <Alert tone="warning" title="画像未初始化">
            请后端运行 <code className="font-mono">node src/analyze.js --init-profile</code>。
          </Alert>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-text">
              目标岗：<b className="font-semibold">{profile.target_role}</b> ｜ 已知技能：<b className="font-semibold">{knownSkills.length}</b> 项
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary" dot>
                AI 接触度：{aiExposure.level || "—"}
              </Badge>
              {(aiExposure.tools || []).map((t) => (
                <Badge key={t} tone="neutral">
                  {t}
                </Badge>
              ))}
            </div>
            {aiExposure.note && <p className="text-sm text-muted">{aiExposure.note}</p>}
            {note && <p className="text-sm text-muted">{note}</p>}
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/persona")}>
                编辑画像
              </Button>
            </div>
          </div>
        )}
        {pErr && <Alert tone="danger" title="接口异常">{pErr}</Alert>}
      </Section>

      {/* 工资金额概览（KPI + 分布，分布用 2 列子网格降低纵向长度） */}
      <Section title={`工资金额概览（${scopeBits}${scopeBits ? ' · ' : ''}月薪）`} topSpace={false}>
        {data.salary.sampleSize === 0 ? (
          <p className="text-sm text-muted">
            暂无薪资样本。运行一次带薪资解密的采集（npm run crawl）后，这里会显示{scope.city ?? '全部'} AI 岗的月薪中位数与分布。
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="font-display text-3xl font-semibold text-text tabular-nums">
                {data.salary.medianMinK}–{data.salary.medianMaxK}K
                <span className="ml-2 text-sm font-normal text-muted">月薪中位数</span>
              </div>
              <div className="mt-1 text-sm text-muted">
                样本 {data.salary.sampleSize} 条 · 覆盖 {data.salary.count} 个岗位
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {data.salary.buckets
                .slice()
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
                .map((b) => (
                  <Meter
                    key={b.label}
                    label={b.label}
                    value={b.count}
                    max={Math.max(...data.salary.buckets.map((x) => x.count), 1)}
                    showValue
                  />
                ))}
            </div>
          </div>
        )}
      </Section>

      {/* 两组条形列表：左右等高、性质一致（都是 Meter），不再混入纯文本列表 */}
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
        <Section title={`市场缺口 Top（${scope.role ?? '全部'} 岗位高频要求 · 你尚不具备）`} topSpace={false}>
          {!gap.hasBaseline && <Alert tone="warning" title="无法计算缺口">{gap.message}</Alert>}
          {gap.hasBaseline && (
            <div className="mb-5">
              <ProgressOverview
                mastered={masteredCount}
                learning={learningCount}
                todo={todoCount}
                total={gap.totalHigh}
              />
              <p className="mt-2 text-xs text-muted">
                点击右侧状态标签可标记掌握进度；标记「已掌握」后该技能将从缺口移除并计入进度。
              </p>
            </div>
          )}
          {gap.hasBaseline && gap.gaps.length === 0 && <p className="text-sm text-muted">暂无缺口 🎉</p>}
          <div className="space-y-2">
            {gap.gaps.map((g) => (
              <div key={g.skill} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Meter label={g.skill} value={g.score} max={maxGap} showValue />
                </div>
                <MasteryBadge status={statusOf(g.skill)} onCycle={() => cycleStatus(g.skill)} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="能力类别投资优先级（按市场需求加权）" topSpace={false}>
          <div className="space-y-3">
            {data.categoryPriority.map((c) => (
              <div key={c.category} className="space-y-1">
                <Meter label={categoryLabel(c.category)} value={c.weight} max={maxCat} showValue />
                <p className="pl-3 text-xs text-muted sm:pl-[140px]">
                  {c.skillCount} 项 · 必备 {c.requiredCount} 次
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* AI 工程化重点（persona 从零痛点，人工策展） */}
      <Section
        title="AI 工程化学习路径（persona「从零」5 步核心痛点）"
        topSpace={false}
        desc={`上面「市场缺口」偏 AI+视觉工具（本样本多 AI/设计混合岗）；作为目标岗 ${profile?.target_role ?? '你的目标岗'}，以下工程能力是从零起步的真正短板，按顺序补完即可跨过门槛：`}
      >
        <LearningPath items={engGap} />
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">路径总览</span>
          <span aria-hidden="true">·</span>
          <span>共 {engGap.length} 步</span>
          <span aria-hidden="true">·</span>
          <span>建议按 01→05 顺序，每步搭配一个练手小项目</span>
        </div>
      </Section>
    </div>
  )
}
