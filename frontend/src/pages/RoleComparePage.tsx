import { useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchCompare, fetchScopes, type CompareResult, type CompareRole, type Scopes } from "../api/client"
import { categoryLabel } from "../lib/category"
import { buildRoleGroups } from "../lib/roleGroups"
import { friendlyError } from "../lib/errorMessage"
import { cn } from "../lib/cn"
import { toPng } from "html-to-image"
import { Section, Meter, Alert, Button, Segmented, Select } from "../design-system"
import { CATEGORY_ORDER, TIER_COLORS, Chip, TierLine } from "../components/analysis"

// 角色底色走 CSS 变量（index.css 的 --role-bg-0..4），双主题各一套，保证 AA 对比。
const ROLE_COLORS = ['var(--role-bg-0)', 'var(--role-bg-1)', 'var(--role-bg-2)', 'var(--role-bg-3)', 'var(--role-bg-4)']
// 角色分组「文字色」专用：对比页「我的缺口」把数字按角色着色，亮色模式页底是白，
// 必须用深色变体（≥4.5:1）才能达标；暗色模式页底近黑，沿用亮色即可。背景/圆点仍用 ROLE_COLORS。
const ROLE_TEXT_VARS = ['var(--rc-text-0)', 'var(--rc-text-1)', 'var(--rc-text-2)', 'var(--rc-text-3)', 'var(--rc-text-4)']

// 角色选择 chip（跨角色模式复用）：彩色圆点 + 角色名 + 已分析样本量。
function RoleChip({
  role,
  analyzed,
  on,
  color,
  onClick,
}: {
  role: string
  analyzed: number
  on: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
        on
          ? "border-primary/50 bg-primary/15 text-text ring-1 ring-inset ring-primary/40"
          : "border-border text-muted hover:bg-surface hover:text-text"
      )}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{
          background: on ? color : 'transparent',
          border: on ? 'none' : '1px solid currentColor',
        }}
      />
      {role}
      <span className="text-xs text-muted">{analyzed}</span>
    </button>
  )
}

// 角色/城市标识：彩色圆点 + 名称 + 可选副信息，作为各区块统一表头。
function RoleTag({ role, color, sub }: { role: string; color: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 0 3px ${color}33` }}
      />
      <span className="font-display font-semibold text-text">{role}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

// 解码率：已解薪样本 / 总样本（城市模式用于「数据待刷新」角标）
function decodedRate(g: CompareRole) {
  return g.total ? Math.round(((g.salary.sampleSize || 0) / g.total) * 100) : 0
}

// 分组表头副信息：城市模式带解码率，角色模式带薪资或样本量。
function subFor(g: CompareRole, mode: 'role' | 'city') {
  if (mode === 'city') {
    const pct = decodedRate(g)
    const sal = g.salary.sampleSize ? `${g.salary.medianMinK}–${g.salary.medianMaxK}K` : '无薪资'
    return `${sal} · 解码${pct}%${pct < 80 ? ' ⚠待刷新' : ''}`
  }
  return g.salary.sampleSize ? `${g.salary.medianMinK}–${g.salary.medianMaxK}K` : `${g.analyzedCount} 样本`
}

// 跨角色 / 跨城市对比（方案 D 扩展）：并排比较技能需求、薪资与个人匹配度。
// 数据来源：/api/compare（后端对每个角色/城市复用 insights()）。
// 维度：跨角色（多角色同城）/ 跨城市（单角色多城）。两模式复用同一套分组卡片。
export default function RoleComparePage() {
  const scopesQ = useQuery<Scopes>({ queryKey: ['scopes-compare'], queryFn: fetchScopes })
  const roleStats = scopesQ.data?.roleStats || []
  const availableRoles = useMemo(() => roleStats.filter((r) => r.analyzed > 0), [roleStats])
  const allRoles = scopesQ.data?.roles || []
  const allCities = scopesQ.data?.cities || []
  const defaultRole = scopesQ.data?.defaultRole || allRoles[0] || ''

  const [dimension, setDimension] = useState<'role' | 'city'>('role')

  // —— 跨角色模式：多选角色 ——
  const [selected, setSelected] = useState<string[]>([])
  const activeRoles = selected.length ? selected : availableRoles.slice(0, 3).map((r) => r.role)

  // —— 跨城市模式：单角色（可下拉切换，默认取全局默认角色）+ 多城市（东莞默认不勾选） ——
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [cityRole, setCityRole] = useState<string>('')
  const activeRole = cityRole || defaultRole
  const activeCities = selectedCities.length
    ? selectedCities
    : allCities.filter((c) => c !== '东莞')

  // —— 跨角色两级视图：职能大类筛选 + func→family 分组（全站统一 helper）——
  const [funcFilter, setFuncFilter] = useState<string>('全部')
  const roleGroups = useMemo(() => buildRoleGroups(availableRoles), [availableRoles])
  const presentFuncs = roleGroups.map((g) => g.func)
  // 跨城市模式的下拉选项（按岗族 optgroup 分组；与细报表页同口径）。
  const cityRoleOptions = useMemo(
    () => roleGroups.flatMap((g) => g.families.flatMap((f) => f.roles.map((r) => r.role))),
    [roleGroups],
  )

  const queryEnabled =
    dimension === 'role' ? activeRoles.length > 0 : !!activeRole && activeCities.length > 0

  const { data, isLoading, isError, error } = useQuery<CompareResult>({
    queryKey:
      dimension === 'role'
        ? ['compare', 'role', activeRoles]
        : ['compare', 'city', activeRole, activeCities],
    queryFn: () =>
      dimension === 'role'
        ? fetchCompare({ mode: 'role', roles: activeRoles })
        : fetchCompare({ mode: 'city', role: activeRole, cities: activeCities }),
    enabled: queryEnabled,
  })

  // 颜色索引：优先按已返回的分组（role 字段匹配），未加载时回退到当前选择列表。
  const colorOf = (key: string) => {
    const list = data?.roles || []
    let idx = list.findIndex((r) => r.role === key)
    if (idx < 0) idx = (dimension === 'role' ? activeRoles : activeCities).indexOf(key)
    return ROLE_COLORS[Math.max(0, idx) % ROLE_COLORS.length]
  }

  // —— 跨角色通用逻辑（仅角色模式用） ——
  const toggleRole = (role: string) => {
    setSelected((prev) => {
      if (prev.includes(role)) return prev.filter((r) => r !== role)
      if (prev.length >= 5) return prev
      return [...prev, role]
    })
  }
  const toggleCity = (c: string) => {
    setSelectedCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  // 跨角色通用硬技能（出现在 ≥2 个分组高频表中的技能）
  const sharedSkills = useMemo(() => {
    if (!data) return []
    const roleCount = new Map<string, number>()
    const maxCount = new Map<string, number>()
    data.roles.forEach((r) => {
      const seen = new Set<string>()
      r.skillRankTop.forEach((s) => {
        if (seen.has(s.skill)) return
        seen.add(s.skill)
        roleCount.set(s.skill, (roleCount.get(s.skill) || 0) + 1)
        maxCount.set(s.skill, Math.max(maxCount.get(s.skill) || 0, s.count))
      })
    })
    return [...roleCount.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => (maxCount.get(b[0]) || 0) - (maxCount.get(a[0]) || 0))
      .slice(0, 6)
      .map(([s]) => s)
  }, [data])

  // 角色模式：推荐角色（薪资上限 - 缺口惩罚）
  const scored = useMemo(() => {
    if (!data) return []
    return data.roles
      .filter((r) => r.salary.sampleSize > 0)
      .map((r) => {
        const ceiling = r.salary.medianMaxK || 0
        const gap = r.personalGap.hasBaseline ? r.personalGap.gaps.length : 0
        return { r, score: ceiling - gap * 1.0, ceiling, gap }
      })
      .sort((a, b) => b.score - a.score)
  }, [data])
  const recommended = scored[0]?.r
  const recoReason = useMemo(() => {
    if (!recommended) return ''
    const others = scored.slice(1, 3).map((s) => `${s.r.role}(上限${s.ceiling}K)`)
    const gapTxt = recommended.personalGap.hasBaseline
      ? `缺口仅 ${recommended.personalGap.gaps.length} 项`
      : '暂无你的画像基线'
    return `该角色薪资上限 ${recommended.salary.medianMaxK}K 在对比组里最高，且${gapTxt}，入场性价比最优。优先补齐下方蓝色「必备底座」，再补任一紫色「加分稀缺」落地项目即可抬薪资区间。${others.length ? `次选可看 ${others.join('、')}。` : ''}`
  }, [recommended, scored])

  // 城市模式：推荐城市（薪资下限中位最高，且有一定样本）
  const cityRecommended = useMemo(() => {
    if (!data || data.dimension !== 'city') return null
    const withSalary = data.roles.filter((r) => (r.salary.sampleSize || 0) > 0)
    if (!withSalary.length) return null
    return withSalary.slice().sort((a, b) => (b.salary.medianMinK || 0) - (a.salary.medianMinK || 0))[0]
  }, [data])

  const dongguanIncluded = dimension === 'city' && activeCities.includes('东莞')
  const exportRef = useRef<HTMLDivElement>(null)

  // 薪资溢价基线：对比组内「薪资下限中位」最低且样本 >0 的分组（角色模式=最低薪资角色，城市模式=最低薪资城市）。
  const baseline = useMemo(() => {
    if (!data) return null
    const mins = data.roles
      .filter((r) => (r.salary.sampleSize || 0) > 0)
      .map((r) => r.salary.medianMinK)
      .filter((v): v is number => typeof v === 'number' && v > 0)
    return mins.length ? Math.min(...mins) : null
  }, [data])

  const premiumOf = (r: CompareRole): number | null => {
    if (baseline == null || !(r.salary.sampleSize > 0) || typeof r.salary.medianMinK !== 'number')
      return null
    return Math.round(((r.salary.medianMinK - baseline) / baseline) * 100)
  }

  const handleExportPng = async () => {
    const node = exportRef.current
    if (!node) return
    try {
      const dataUrl = await toPng(node, { backgroundColor: '#09090B', pixelRatio: 2, cacheBust: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `compare-${dimension}-${Date.now()}.png`
      a.click()
    } catch (e) {
      console.error('导出 PNG 失败', e)
    }
  }
  return (
    <div className="space-y-16">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text">角色 / 城市对比</h1>
            <p className="max-w-2xl text-sm text-muted">
              {dimension === 'role'
                ? '并排比较不同岗位的技能需求、薪资与个人匹配度。'
                : '同一岗位在不同城市的薪资与技能要求差异，帮你决定去哪。'}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={handleExportPng}>导出 PNG</Button>
          </div>
        </div>
        <Segmented
          tabs={[
            { value: 'role', label: '跨角色' },
            { value: 'city', label: '跨城市' },
          ]}
          value={dimension}
          onChange={(v) => setDimension(v as 'role' | 'city')}
        />
      </header>

      <div ref={exportRef} id="compare-export">
      <Section
        title={dimension === 'role' ? '选择角色' : '选择城市'}
        topSpace={false}
        desc={
          dimension === 'role'
            ? '先按职能大类筛选，再在展开岗族下勾选岗位（最多 5 个），下方分块实时刷新对比结果。'
            : `勾选要纳入对比的城市（默认全选除东莞）。东莞样本均为现场部署 / 测试岗，不具前端 / AI 研发参考价值。对比岗位：${activeRole || '—'}。`
        }
      >
        {dimension === 'role' ? (
          <div className="space-y-4">
            {availableRoles.length === 0 ? (
              <p className="text-sm text-muted">暂无已分析角色。</p>
            ) : (
              <>
                {/* 职能大类分段筛选：先切大类，再下钻岗族 */}
                <Segmented
                  wrap
                  tabs={['全部', ...presentFuncs].map((f) => ({ value: f, label: f }))}
                  value={funcFilter}
                  onChange={(v) => setFuncFilter(v)}
                />
                {/* func → family → roles 分组 */}
                <div className="space-y-5">
                  {roleGroups
                    .filter((g) => funcFilter === '全部' || g.func === funcFilter)
                    .map((g) => (
                      <div key={g.func} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text">{g.func}</span>
                          <span className="text-xs text-muted">
                            {g.families.reduce((a, f) => a + f.roles.length, 0)} 个角色
                          </span>
                        </div>
                        {g.families.map((fam) => (
                          <div key={fam.family} className="space-y-2 pl-3">
                            <div className="text-xs font-medium text-muted">{fam.family}</div>
                            <div className="flex flex-wrap gap-2">
                              {fam.roles.map((r) => (
                                <RoleChip
                                  key={r.role}
                                  role={r.role}
                                  analyzed={r.analyzed}
                                  on={activeRoles.includes(r.role)}
                                  color={colorOf(r.role)}
                                  onClick={() => toggleRole(r.role)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">对比岗位</span>
              <Select
                aria-label="选择对比岗位"
                value={activeRole}
                onChange={(e) => setCityRole(e.target.value)}
                className="w-56"
              >
                {!cityRoleOptions.includes(activeRole) && activeRole && (
                  <option value={activeRole}>{activeRole}</option>
                )}
                {roleGroups.flatMap((g) =>
                  g.families.map((fam) => (
                    <optgroup key={fam.family} label={fam.family}>
                      {fam.roles.map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.role}
                        </option>
                      ))}
                    </optgroup>
                  )),
                )}
              </Select>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-muted">城市（多选）</div>
              <div className="flex flex-wrap gap-2">
                {allCities.length === 0 && <p className="text-sm text-muted">暂无城市。</p>}
                {allCities.map((c) => {
                  const on = activeCities.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCity(c)}
                      aria-pressed={on}
                      className={cn(
                        "flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                        on
                          ? "border-primary/50 bg-primary/15 text-text ring-1 ring-inset ring-primary/40"
                          : "border-border text-muted hover:bg-surface hover:text-text"
                      )}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{ background: on ? colorOf(c) : 'transparent', border: on ? 'none' : '1px solid currentColor' }}
                      />
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {dimension === 'role' && selected.length >= 5 && (
          <p className="mt-2 text-xs text-muted">最多对比 5 个角色。</p>
        )}
      </Section>

      {dongguanIncluded && (
        <Alert tone="warning" title="东莞样本离群">
          东莞岗位均为现场部署 / 硬件测试（FDE），与前端 / AI 研发不在同一赛道，纳入对比会拉低均值。建议取消勾选或仅作参考。
        </Alert>
      )}

      {isError && <Alert tone="danger" title="接口异常">{friendlyError(error)}</Alert>}
      {isLoading && <p className="text-sm text-muted">加载对比数据…</p>}

      {data && (
        <div className="mt-12 space-y-12">
          {/* 行动建议：角色模式推荐「冲哪个角色」；城市模式推荐「去哪个城市」 */}
          {dimension === 'role' ? (
            <Section
              title="跨角色行动建议"
              topSpace={false}
              desc="综合薪资上限与你的技能缺口，直接告诉你优先冲哪个角色、补哪块最划算。"
            >
              {recommended ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-[var(--on-accent)]">推荐冲</span>
                      <span className="font-display text-lg font-bold text-text">{recommended.role}</span>
                      <span className="text-sm text-muted">
                        薪资中位 {recommended.salary.medianMinK}–{recommended.salary.medianMaxK}K · 你的缺口{' '}
                        {recommended.personalGap.hasBaseline ? `${recommended.personalGap.gaps.length} 项` : '—'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{recoReason}</p>
                    {(() => {
                      const t = recommended.skillTiers || { base: [], premium: [], tools: [] }
                      return (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {t.base.map((s) => (<Chip key={`b-${s.skill}`} label={s.skill} />))}
                          {t.premium.map((s) => (<Chip key={`p-${s.skill}`} label={s.skill} tone="premium" />))}
                          {t.tools.map((s) => (<Chip key={`t-${s.skill}`} label={s.skill} tone="tools" />))}
                        </div>
                      )
                    })()}
                    <p className="mt-2 text-xs text-muted">
                      蓝=必备底座（硬门槛）· 紫=加分稀缺（溢价点）· 青=AI 编码工具（标配红利）
                    </p>
                  </div>
                  {sharedSkills.length > 0 && (
                    <div className="rounded-xl border border-border bg-surface p-4">
                      <div className="text-xs font-semibold text-text">跨角色通用硬技能（无论选哪个都先补）</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sharedSkills.map((s) => (<Chip key={s} label={s} />))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.roles.map((r) => {
                      const t = r.skillTiers || { base: [], premium: [], tools: [] }
                      return (
                        <div key={r.role} className="space-y-3 rounded-xl border border-border bg-surface p-4">
                          <RoleTag role={r.role} color={colorOf(r.role)} sub={subFor(r, dimension)} />
                          <TierLine title="必备底座" color={TIER_COLORS.base} skills={t.base.map((s) => s.skill)} />
                          <TierLine title="加分稀缺" color={TIER_COLORS.premium} skills={t.premium.map((s) => s.skill)} />
                          <TierLine title="AI 工具" color={TIER_COLORS.tools} skills={t.tools.map((s) => s.skill)} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">所选角色暂无足够薪资样本，无法生成建议。</p>
              )}
            </Section>
          ) : (
            <Section
              title="城市行动建议"
              topSpace={false}
              desc="综合薪资下限中位与样本量，告诉你当前岗位去哪个城市性价比最高。"
            >
              {cityRecommended ? (
                <div className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-[var(--on-accent)]">推荐去</span>
                    <span className="font-display text-lg font-bold text-text">{cityRecommended.role}</span>
                    <span className="text-sm text-muted">
                      薪资中位 {cityRecommended.salary.medianMinK}–{cityRecommended.salary.medianMaxK}K · 样本 {cityRecommended.salary.sampleSize} · 解码 {decodedRate(cityRecommended)}%
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">
                    该城市在当前岗位上的薪资下限中位最高，对「前端扎实、AI 从零」的画像性价比最优。其余城市可在上方切换查看技能要求差异；解码率偏低（{decodedRate(cityRecommended)}%）的城市结论仅供参考。
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">所选城市暂无足够薪资样本，无法生成建议。</p>
              )}
            </Section>
          )}

          {/* 概览对比表：分组为列，指标为行 */}
          <Section
            title="概览对比"
            topSpace={false}
            desc={dimension === 'role' ? '同屏横向比较各角色的已分析样本、薪资中位与你的技能缺口。' : '同屏横向比较各城市的样本、薪资中位与你的技能缺口。'}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-32 py-3 pr-4 text-left font-medium text-muted">指标</th>
                    {data.roles.map((r) => (
                      <th key={r.role} className="px-4 py-3 text-left align-bottom">
                        <RoleTag role={r.role} color={colorOf(r.role)} sub={`${r.analyzedCount} 样本`} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: '薪资中位',
                      render: (r: CompareRole) =>
                        r.salary.sampleSize ? `${r.salary.medianMinK}–${r.salary.medianMaxK}K` : '—',
                    },
                    {
                      label: '薪资溢价',
                      render: (r: CompareRole) => {
                        const p = premiumOf(r)
                        return p == null ? '—' : p === 0 ? '基准' : `+${p}%`
                      },
                    },
                    {
                      label: '我的缺口',
                      accent: true,
                      render: (r: CompareRole) =>
                        r.personalGap.hasBaseline ? `${r.personalGap.gaps.length} 项` : '—',
                    },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-border/60">
                      <td className="py-3.5 pr-4 text-muted">{row.label}</td>
                      {data.roles.map((r) => {
                        const emphasized = row.accent && r.personalGap.hasBaseline
                        return (
                          <td
                            key={r.role}
                            className={cn('px-4 py-3.5 tabular-nums', emphasized ? 'font-semibold' : 'text-text')}
                            style={emphasized ? { color: ROLE_TEXT_VARS[Math.max(0, (data?.roles.findIndex((x) => x.role === r.role)) % ROLE_TEXT_VARS.length)] } : undefined}
                          >
                            {row.render(r)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted">
              <p>
                「我的缺口」越少 = 你与该分组（角色/城市）的技能匹配度越高（基于画像 persona「前端扎实、AI 从零」）。
              </p>
              {baseline != null && (
                <p>
                  薪资溢价 = 该分组薪资下限中位相对对比组内最低{dimension === 'city' ? '城市' : '角色'}的增幅；「基准」即最低项。样本量过小或解码率偏低的分组溢价仅供参考。
                </p>
              )}
            </div>
          </Section>

          {/* 技能类别需求对比 */}
          <Section
            title="技能类别需求对比"
            topSpace={false}
            desc="按市场需求加权的类别强度（必备技能额外加权）。同一行内越长表示该分组越偏重此类。"
          >
            <div className="space-y-6">
              {CATEGORY_ORDER.map((cat) => {
                const rows = data.roles.filter((r) => (r.categoryPriority.find((c) => c.category === cat)?.weight || 0) > 0)
                if (rows.length === 0) return null
                const max = Math.max(...rows.map((r) => r.categoryPriority.find((c) => c.category === cat)!.weight), 1)
                return (
                  <div key={cat} className="space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">{categoryLabel(cat)}</div>
                    {rows.map((r) => {
                      const c = r.categoryPriority.find((x) => x.category === cat)!
                      return (
                        <Meter
                          key={r.role}
                          label={<RoleTag role={r.role} color={colorOf(r.role)} sub={subFor(r, dimension)} />}
                          value={c.weight}
                          max={max}
                          showValue
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* 我的技能缺口对比 */}
          <Section
            title="技能缺口对比"
            topSpace={false}
            desc="针对每个分组，persona 尚不具备的高频要求技能。数值越低越匹配。"
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.roles.map((r) => (
                <div key={r.role} className="space-y-2">
                  <RoleTag
                    role={r.role}
                    color={colorOf(r.role)}
                    sub={r.personalGap.hasBaseline ? `${r.personalGap.gaps.length} 项缺口` : '无基线'}
                  />
                  {!r.personalGap.hasBaseline && <p className="text-sm text-muted">{r.personalGap.message}</p>}
                  <div className="space-y-1">
                    {r.personalGap.gaps.slice(0, 6).map((g) => (
                      <div key={g.skill} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-text">{g.skill}</span>
                        <span className="text-xs text-muted tabular-nums">{g.count} 岗</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Top 技能对比：分组为列、频次排名为行 */}
          <Section
            title="Top 技能对比"
            topSpace={false}
            desc="分组为列、频次排名为行，每列是该分组出现频次最高的 15 项技能。同一行出现相同技能即跨分组通用能力，已用绿色高亮标注。"
          >
            {(() => {
              const topLen = Math.max(1, ...data.roles.map((r) => r.skillRankTop.length))
              const roleCountBySkill = new Map<string, number>()
              data.roles.forEach((r) => {
                const seen = new Set<string>()
                r.skillRankTop.forEach((s) => {
                  if (seen.has(s.skill)) return
                  seen.add(s.skill)
                  roleCountBySkill.set(s.skill, (roleCountBySkill.get(s.skill) || 0) + 1)
                })
              })
              const isShared = (skill: string) => (roleCountBySkill.get(skill) || 0) >= 2
              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="w-10 py-2 pr-4 text-left font-medium text-muted">#</th>
                        {data.roles.map((r) => (
                          <th key={r.role} className="px-3 py-2 text-left align-bottom">
                            <RoleTag role={r.role} color={colorOf(r.role)} sub={`${r.skillRankTop.length} 项`} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: topLen }).map((_, i) => (
                        <tr key={i} className="border-b border-border/60 align-top">
                          <td className="py-2 pr-4 pt-2.5 text-xs tabular-nums text-muted">{i + 1}</td>
                          {data.roles.map((r) => {
                            const s = r.skillRankTop[i]
                            const shared = s ? isShared(s.skill) : false
                            return (
                              <td key={r.role} className="px-3 py-1.5">
                                {s ? (
                                  <div
                                    className={cn(
                                      'flex items-center justify-between gap-2 rounded-md px-2 py-1.5',
                                      shared && 'bg-accent/10 ring-1 ring-inset ring-accent/30'
                                    )}
                                  >
                                    <span className={cn('truncate', shared ? 'font-medium text-text' : 'text-text')} title={s.skill}>
                                      {s.skill}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1.5">
                                      {shared && (
                                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-[var(--on-accent)]">通用</span>
                                      )}
                                      <span className="text-xs tabular-nums text-muted">{s.count}</span>
                                    </span>
                                  </div>
                                ) : (
                                  <span className="block px-2 py-1.5 text-muted/40">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </Section>
        </div>
      )}
      </div>
    </div>
  )
}
