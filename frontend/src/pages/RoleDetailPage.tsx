import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  fetchRoleDetail,
  fetchScopes,
  type RoleDetail,
  type RoleDetailSkillGroup,
  type Scopes,
} from "../api/client"
import { Section, StatCard, Table, Badge, Select, Segmented, PageHeader } from "../design-system"
import { Loading, ErrorBox } from "../components/ui"
import { cn } from "../lib/cn"
import { friendlyError } from "../lib/errorMessage"
import { buildRoleGroups } from "../lib/roleGroups"
import {
  ACCENT,
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  catColor,
  TierBlock,
  SkillChip,
  Advise,
} from "../components/analysis"

// 单条横向条形（纯 div，零图表库）：label + 比例 bar + value。
function BarRow({
  label,
  value,
  max,
  color = ACCENT,
  title,
}: {
  label: string
  value: number
  max: number
  color?: string
  title?: string
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 truncate text-sm text-text sm:w-32 lg:w-40" title={title ?? label}>
        {label}
      </div>
      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-solid">
        <div
          className="h-full rounded-md transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{value}</div>
    </div>
  )
}

// 角色细报表（对应后端 /api/role-detail）：消费 insights() + 分位数/置信/公司TOP/技能分组。
// 图表全部用 BarRow 纯 div 实现，保持项目「零第三方 viz」风格。
export default function RoleDetailPage() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const scopesQ = useQuery<Scopes>({ queryKey: ["scopes"], queryFn: fetchScopes })
  const roles = useMemo(() => scopesQ.data?.roles || [], [scopesQ.data])
  // 角色 → { func, family } 映射（来自 scopes.roleStats），驱动两级选择器。
  const roleInfo = useMemo(() => {
    const m = new Map<string, { func: string; family: string }>()
    for (const r of scopesQ.data?.roleStats || []) {
      m.set(r.role, { func: r.func || "其他", family: r.family || "其他" })
    }
    return m
  }, [scopesQ.data])

  const role =
    params.get("role") || scopesQ.data?.defaultRole || roles[0] || "AI Agent 前端"

  // 职能大类（L1）：直接由当前角色派生，无需额外 state / effect 同步，避免挂载瞬间闪错。
  const func = roleInfo.get(role)?.func || "技术"
  // 全站统一分组引擎：从 roleStats 派生 职能大类→岗族→角色。
  const roleGroupsAll = useMemo(() => buildRoleGroups(scopesQ.data?.roleStats), [scopesQ.data])
  const funcsPresent = roleGroupsAll.map((g) => g.func)
  // 当前职能大类下、按岗族(L2)分组的角色列表。
  const familiesInFunc = useMemo(() => {
    const g = roleGroupsAll.find((x) => x.func === func)
    return g ? g.families.map((f) => [f.family, f.roles.map((r) => r.role)] as [string, string[]]) : []
  }, [roleGroupsAll, func])

  const setRole = (r: string) => {
    const next = new URLSearchParams(params)
    next.set("role", r)
    setParams(next, { replace: true })
    qc.invalidateQueries({ queryKey: ["role-detail", r] })
  }

  // 切换职能大类：自动选中该大类下第一个角色。
  const handleFunc = (f: string) => {
    const first = roles.find((r) => (roleInfo.get(r)?.func || "其他") === f)
    if (first && first !== role) setRole(first)
  }

  const { data, isLoading, isError, error } = useQuery<RoleDetail>({
    queryKey: ["role-detail", role],
    queryFn: () => fetchRoleDetail(role),
    enabled: !!role,
  })

  if (isLoading) return <Loading msg="加载细报表…" />
  if (isError) return <ErrorBox msg={friendlyError(error)} />
  if (!data) return null

  const total = data.total || 1
  const decodeRate = data.salary.sampleSize ? Math.round((data.salary.sampleSize / total) * 100) : 0
  const buckets = data.salary.buckets || []
  const bucketMax = Math.max(1, ...buckets.map((b) => b.count))
  const topSkills = (data.skillRank || []).slice(0, 15)
  const topMax = Math.max(1, ...topSkills.map((s) => s.count))
  const conf = data.salaryConfidence
  const confTotal = conf.total || 1
  const confSegs = [
    { label: "高置信", value: conf.high, cls: "bg-success" },
    { label: "低置信·黄", value: conf.yellow, cls: "bg-warning" },
    { label: "低置信·红", value: conf.red, cls: "bg-danger" },
  ]
  const edu = Object.entries(data.eduDist || {})
    .map(([k, v]) => [k || "未标注", v] as [string, number])
    .sort((a, b) => b[1] - a[1])
  const exp = Object.entries(data.expDist || {})
    .map(([k, v]) => [k || "未标注", v] as [string, number])
    .sort((a, b) => b[1] - a[1])
  const eduMax = Math.max(1, ...edu.map(([, v]) => v))
  const expMax = Math.max(1, ...exp.map(([, v]) => v))

  // 能力分层（数据驱动，直接消费后端 skillTiers：必备底座 / 加分稀缺项 / AI 编码工具）
  const tiers = data.skillTiers || { base: [], premium: [], tools: [] }
  const tierBase = tiers.base
  const tierPremium = tiers.premium
  const tierTools = tiers.tools
  const advBase = tierBase.slice(0, 3).map((s) => s.skill).join(' / ')
  const advPremium = tierPremium.slice(0, 3).map((s) => s.skill).join(' / ')
  const advTools = tierTools.slice(0, 3).map((s) => s.skill).join(' / ')
  const topBucket = [...buckets].sort((a, b) => b.count - a.count)[0]

  return (
    <div className="space-y-12">
      <PageHeader
        title="角色细报表"
        desc="单角色的薪资分布 + 能力要求画像。先按职能大类筛选，再在岗族下选具体角色（与对比 / 分析页同口径），切换实时刷新。"
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
            {/* 职能大类（L1）分段控件 */}
            {funcsPresent.length === 0 ? (
              <span className="px-2 py-1 text-xs text-muted">—</span>
            ) : (
              <Segmented
                wrap
                tabs={funcsPresent.map((f) => ({ value: f, label: f }))}
                value={func}
                onChange={handleFunc}
              />
            )}
            {/* 岗族（L2）分组下拉 */}
            <Select
              aria-label="选择角色"
              className="sm:min-w-[14rem] sm:flex-1 sm:max-w-xs"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={roles.length === 0}
            >
              {roles.length === 0 && <option value={role}>{role}</option>}
              {familiesInFunc.map(([family, rs]) => (
                <optgroup key={family} label={family}>
                  {rs.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        }
      />

      {/* 概览 KPI */}
      <Section title="概览" desc="该角色的岗位规模、分析覆盖与薪资解码率。">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <StatCard label="岗位总数" value={data.total} />
          <StatCard label="已分析" value={data.analyzedCount} />
          <StatCard label="有薪资" value={data.salary.sampleSize} />
          <StatCard label="薪资解码率" value={`${decodeRate}%`} />
        </div>
      </Section>

      {/* 薪资分布 */}
      <Section
        title="薪资分布"
        desc="按月薪下限分桶（样本为已解密薪资）。条形越长代表该区间岗位越多；下方附分位数与解码置信分布。"
      >
        <div className="space-y-3">
          {buckets.map((b) => (
            <BarRow key={b.label} label={b.label} value={b.count} max={bucketMax} color={ACCENT} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5">
          <StatCard label="中位下限" value={data.salary.medianMinK ? `${data.salary.medianMinK}K` : "—"} />
          <StatCard label="中位上限" value={data.salary.medianMaxK ? `${data.salary.medianMaxK}K` : "—"} />
          <StatCard label="P25" value={data.salaryPercentiles.p25 != null ? `${data.salaryPercentiles.p25}K` : "—"} />
          <StatCard label="P75" value={data.salaryPercentiles.p75 != null ? `${data.salaryPercentiles.p75}K` : "—"} />
          <StatCard label="P90" value={data.salaryPercentiles.p90 != null ? `${data.salaryPercentiles.p90}K` : "—"} />
        </div>

        <div className="mt-8 max-w-2xl space-y-3">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-border"
            role="img"
            aria-label={`薪资解码置信：高置信 ${conf.high} 条，低置信黄 ${conf.yellow} 条，低置信红 ${conf.red} 条`}
          >
            {confSegs.map((g) => (
              <div key={g.label} style={{ width: `${(g.value / confTotal) * 100}%` }} className={cn("h-full", g.cls)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            {confSegs.map((g) => (
              <span key={g.label} className="inline-flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", g.cls)} />
                {g.label}
                <span className="tabular-nums text-text">{g.value}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-muted">
            黄区(&lt;0.85)为字形比对正常打分区间（正确解码也常落在 0.80–0.84），无需处理；仅红区(&lt;0.7)代表解码风险，占比≥10% 才建议真机重跑 crawl 核对字体（阈值同薪校页）。
          </p>
        </div>
      </Section>

      {/* 能力要求画像 */}
      <Section
        title="能力要求画像"
        desc="该角色市场需求的技能集合。Top 技能按类别着色；下方按能力类别与等级分层展开。"
      >
        <h3 className="text-sm font-semibold text-text">Top 15 技能（按出现频次）</h3>
        <div className="mt-3 space-y-2">
          {topSkills.map((s) => (
            <BarRow
              key={s.skill}
              label={s.skill}
              value={s.count}
              max={topMax}
              color={catColor(s.categories?.[0])}
              title={`${s.skill} · ${s.categories?.[0] ?? "其他"}`}
            />
          ))}
        </div>

        {/* 按类别分组 */}
        <div className="mt-8 space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const items = data.skillByCategory?.[cat] || []
            if (items.length === 0) return null
            const m = Math.max(1, ...items.map((i: RoleDetailSkillGroup) => i.count))
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: catColor(cat) }} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{cat}</span>
                  <span className="text-xs text-muted">（{items.length} 项）</span>
                </div>
                <div className="space-y-1.5">
                  {items.slice(0, 8).map((i) => (
                    <BarRow key={i.skill} label={i.skill} value={i.count} max={m} color={catColor(cat)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* 按等级分组 */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {Object.entries(data.skillByLevel || {}).map(([lvl, items]) => {
            if (!items || items.length === 0) return null
            const m = Math.max(1, ...items.map((i) => i.count))
            const tone =
              lvl === "必备" ? "text-success-fg" : lvl === "稀缺" ? "text-info-fg" : "text-muted"
            return (
              <div key={lvl} className="space-y-2">
                <div className={cn("text-xs font-semibold uppercase tracking-wide", tone)}>{lvl}</div>
                <div className="space-y-1.5">
                  {items.slice(0, 8).map((i) => (
                    <BarRow key={i.skill} label={i.skill} value={i.count} max={m} color={ACCENT} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 能力分层解读 */}
      <Section
        title="能力分层解读"
        desc="把该角色技能按「门槛 / 溢价 / 工具红利」三层拆开：直接看清哪些是入场券、哪些是抬薪资的稀缺点、哪些写进简历有红利。"
      >
        <div className="space-y-4">
          {tierBase.length > 0 && (
            <TierBlock
              color={CATEGORY_COLORS['前端框架/语言']}
              title="① 必备底座（硬门槛）"
              desc="出现率最高，是该岗位入场券；简历必须突出，缺一项容易初筛被刷。"
            >
              {tierBase.slice(0, 8).map((s) => (
                <SkillChip key={s.skill} skill={s.skill} count={s.count} />
              ))}
            </TierBlock>
          )}
          {tierPremium.length > 0 && (
            <TierBlock
              color={CATEGORY_COLORS['AI工程化']}
              title="② 加分稀缺项（溢价点）"
              desc="AI 工程化 / 基建类技能市场供给稀缺，是区别于普通岗的核心差异点；补一个落地项目可显著抬薪资区间。"
            >
              {tierPremium.slice(0, 8).map((s) => (
                <SkillChip key={s.skill} skill={s.skill} count={s.count} />
              ))}
            </TierBlock>
          )}
          {tierTools.length > 0 && (
            <TierBlock
              color={CATEGORY_COLORS['工具链']}
              title="③ AI 编码工具（渐成标配）"
              desc="Cursor / Claude / Copilot 等已写进 JD，默认你用 AI 提效；写进技能栏是低成本的匹配红利。"
            >
              {tierTools.slice(0, 8).map((s) => (
                <SkillChip key={s.skill} skill={s.skill} count={s.count} />
              ))}
            </TierBlock>
          )}
        </div>
      </Section>

      {/* 学历 / 经验 */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <Section title="学历分布" desc="已标注岗位的学历要求占比（含未标注）。">
          <div className="space-y-2">
            {edu.map(([k, v]) => (
              <BarRow key={k} label={k} value={v} max={eduMax} color={ACCENT} />
            ))}
          </div>
        </Section>
        <Section title="经验分布" desc="已标注岗位的经验要求占比（含未标注）。">
          <div className="space-y-2">
            {exp.map(([k, v]) => (
              <BarRow key={k} label={k} value={v} max={expMax} color={ACCENT} />
            ))}
          </div>
        </Section>
      </div>

      {/* 公司 TOP */}
      <Section title="公司 TOP" desc="该角色发布量最高的公司。若个别公司占比畸高（疑似代理/批量发布），建议人工甄别岗位真实性。">
        <Table
          columns={[
            { key: "company", title: "公司" },
            { key: "count", title: "岗位数", align: "right" },
          ]}
          rows={data.companyTop.map((c) => ({ company: c.company, count: c.count }))}
        />
      </Section>

      {/* 求职者行动建议 */}
      <Section
        title="求职者行动建议"
        desc="基于上面数据，给出可直接执行的补强动作——该突出什么、该补什么、薪资怎么预期。"
      >
        <div className="space-y-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
          <Advise
            n={1}
            title="硬技能入场券"
            body={
              advBase
                ? `${advBase} 是该角色硬门槛，务必在简历 / 作品集突出；缺一项容易初筛被刷。`
                : "该角色缺少明确的框架 / 语言门槛技能，可参考 Top 技能自行对齐。"
            }
          />
          <Advise
            n={2}
            title="差异化溢价"
            body={
              advPremium
                ? `补 ${advPremium} 任一落地项目，是区别于普通岗、抬升薪资区间最划算的动作。`
                : "暂无明显的稀缺 AI / 工程化技能信号，可关注跨角色对比寻找差异化方向。"
            }
          />
          <Advise
            n={3}
            title="工具红利"
            body={
              advTools
                ? `把 ${advTools} 写进技能栏，契合岗位默认预期，是低成本的匹配红利。`
                : "该角色尚未把 AI 编码工具写进 JD，可保持跟进。"
            }
          />
          <Advise
            n={4}
            title="薪资预期"
            body={
              data.salary.medianMinK
                ? `该岗薪资中位 ${data.salary.medianMinK}K（P90 ${
                    data.salaryPercentiles.p90 ?? "—"
                  }K），主流区间 ${topBucket?.label ?? "—"}；冲击更高需稀缺能力背书。`
                : "该角色薪资解码样本不足，薪资预期请以薪校页人工核对。"
            }
          />
        </div>
      </Section>

      {data.personalGap?.hasBaseline && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Badge tone="info">你的匹配</Badge>
          该角色与你的画像缺口 {data.personalGap.gaps.length} 项（详见缺口页）。
        </div>
      )}
    </div>
  )
}
