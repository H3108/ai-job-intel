// 组件示例 / 快照页：把 components/analysis 里的可复用件摆出来，方便照抄。
// 纯展示，不依赖业务数据；「真实数据演示」段会用 /api/compare 实拉，展示 roleTiers 的落地写法。
import { useQuery } from "@tanstack/react-query"
import { fetchCompare, type CompareRole } from "../api/client"
import { Section, Badge, PageHeader, Alert } from "../design-system"
import { Loading, ErrorBox } from "../components/ui"
import {
  ACCENT,
  CATEGORY_COLORS,
  TIER_COLORS,
  TierBlock,
  TierLine,
  SkillChip,
  Advise,
} from "../components/analysis"

// 示例数据（与细报表页口径一致）：三档能力 + 计数。
const SAMPLE_TIERS = {
  base: [
    { skill: "React", count: 79 },
    { skill: "JavaScript", count: 67 },
    { skill: "TypeScript", count: 63 },
    { skill: "Vue", count: 56 },
  ],
  premium: [
    { skill: "RAG", count: 9 },
    { skill: "AI Agent", count: 8 },
    { skill: "Prompt Engineering", count: 6 },
    { skill: "向量检索", count: 5 },
  ],
  tools: [
    { skill: "Cursor", count: 7 },
    { skill: "Claude", count: 5 },
    { skill: "Copilot", count: 4 },
  ],
}

const SAMPLE_ADVISE = [
  { n: 1, title: "硬技能是入场券", body: "React/Vue + TypeScript 三件套出现率 40–60%，缺一项易被初筛刷掉。" },
  { n: 2, title: "差异化靠 AI 工程化", body: "补一个 RAG / AI Agent / 流式响应的落地项目，是突破 20K 的关键溢价点。" },
  { n: 3, title: "工具红利别漏", body: "Cursor / Claude / Copilot 写进简历技能栏，契合岗位默认预期，零成本低风险。" },
]

// 用法说明小卡：标题 + 代码片段。
function Usage({ importLine, snippet }: { importLine: string; snippet: string }) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-solid p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">用法</div>
      <pre className="mt-1 overflow-x-auto whitespace-pre text-xs leading-relaxed text-text">
        <code>{`import { ${importLine} } from "../components/analysis"`}</code>
      </pre>
      <pre className="mt-2 overflow-x-auto whitespace-pre text-xs leading-relaxed text-muted">
        <code>{snippet}</code>
      </pre>
    </div>
  )
}

export default function AnalysisShowcasePage() {
  // 真实数据演示：拉两个角色，渲染 roleTiers 派生结果（与角色对比页同一写法）。
  const { data, isLoading, error } = useQuery({
    queryKey: ["showcase-compare"],
    queryFn: () => fetchCompare({ mode: 'role', roles: ["AI Agent 前端", "算法工程师"] }),
  })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="分析组件示例"
        desc="细报表 / 角色对比 / 学习路线三页共用的「分层解读 + 行动建议」组件快照。复制代码即可复用，零新依赖。"
      />

      <Alert tone="info" title="本页为组件示例">
        第 2–4 节使用<strong className="text-text">虚构示例数据</strong>（如 React 79、突破 20K
        等），仅用于演示组件外观，<strong className="text-text">非真实市场统计</strong>；第 5 节拉取真实接口
        /api/compare 数据，可作对照。
      </Alert>

      {/* 1. 配色速查 */}
      <Section title="配色常量" desc="统一黑绿主题，可按类别着色。catColor(cat) 自动回退到「其他」。">
        <div className="flex flex-wrap gap-3">
          {Object.entries(CATEGORY_COLORS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="h-3 w-3 rounded-full" style={{ background: v }} />
              <span className="text-xs text-text">{k}</span>
              <span className="font-mono text-[11px] text-muted">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {Object.entries(TIER_COLORS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="h-3 w-3 rounded-full" style={{ background: v }} />
              <span className="text-xs text-text">{k}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <span className="h-3 w-3 rounded-full" style={{ background: ACCENT }} />
            <span className="text-xs text-text">ACCENT（建议序号底色）</span>
          </div>
        </div>
        <Usage
          importLine="CATEGORY_COLORS, TIER_COLORS, ACCENT, catColor"
          snippet={`catColor("AI工程化")  // → "var(--cat-ai)"`}
        />
      </Section>

      {/* 2. TierBlock（三档能力卡片） */}
      <Section title="TierBlock · 能力分层卡片" desc="必备底座 / 加分稀缺 / AI 工具 三档，每档带一句解释 + 技能 chip。">
        <div className="grid gap-4 md:grid-cols-3">
          <TierBlock color={TIER_COLORS.base} title="必备底座（硬门槛）" desc="前端框架/语言类，出现率最高，缺一项易初筛被刷。">
            {SAMPLE_TIERS.base.map((s) => (
              <SkillChip key={s.skill} skill={s.skill} count={s.count} />
            ))}
          </TierBlock>
          <TierBlock color={TIER_COLORS.premium} title="加分稀缺项（溢价点）" desc="AI 工程化类，市场稀缺，是抬薪资到 20K+ 的关键背书。">
            {SAMPLE_TIERS.premium.map((s) => (
              <SkillChip key={s.skill} skill={s.skill} count={s.count} />
            ))}
          </TierBlock>
          <TierBlock color={TIER_COLORS.tools} title="AI 编码工具（标配）" desc="工具链类，写进简历有低成本匹配红利。">
            {SAMPLE_TIERS.tools.map((s) => (
              <SkillChip key={s.skill} skill={s.skill} count={s.count} />
            ))}
          </TierBlock>
        </div>
        <Usage
          importLine="TierBlock, SkillChip, TIER_COLORS"
          snippet={`<TierBlock color={TIER_COLORS.base} title="必备底座" desc="...">
  {tiers.base.map((s) => <SkillChip skill={s.skill} count={s.count} />)}
</TierBlock>`}
        />
      </Section>

      {/* 3. TierLine + Chip（单档技能行） */}
      <Section title="TierLine · 单档技能行" desc="对比页用：彩色圆点 + 标题 + 轻量 chip（不显示计数）。">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <TierLine title="必备底座" color={TIER_COLORS.base} skills={SAMPLE_TIERS.base.map((s) => s.skill)} />
          <TierLine title="加分稀缺" color={TIER_COLORS.premium} skills={SAMPLE_TIERS.premium.map((s) => s.skill)} />
          <TierLine title="AI 工具" color={TIER_COLORS.tools} skills={SAMPLE_TIERS.tools.map((s) => s.skill)} />
        </div>
        <Usage
          importLine="TierLine, Chip, TIER_COLORS"
          snippet={`<TierLine title="必备底座" color={TIER_COLORS.base} skills={["React","Vue","TS"]} />`}
        />
      </Section>

      {/* 4. Advise（行动建议条目） */}
      <Section title="Advise · 行动建议条目" desc="编号圆点 + 标题 + 一句可执行说明。多个并列即构成「行动建议」区块。">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
          {SAMPLE_ADVISE.map((a) => (
            <Advise key={a.n} n={a.n} title={a.title} body={a.body} />
          ))}
        </div>
        <Usage
          importLine="Advise"
          snippet={`<Advise n={1} title="硬技能是入场券" body="React/Vue + TS 三件套…" />`}
        />
      </Section>

      {/* 5. skillTiers（接口直接返回的三档） */}
      <Section
        title="skillTiers · 接口直接返回的三档"
        desc="/api/compare 与 /api/role-detail 已统一由后端 insights() 派生 skillTiers，前端直接用，无需在页面里现算。"
      >
        {isLoading && <Loading msg="拉取真实数据…" />}
        {error && <ErrorBox msg="获取对比数据失败" />}
        {data?.roles.map((r: CompareRole) => {
          const t = r.skillTiers || { base: [], premium: [], tools: [] }
          return (
            <div key={r.role} className="mb-4 rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge tone="primary">{r.role}</Badge>
                <span className="text-xs text-muted">中位上限 {r.salary.medianMaxK}K · 样本 {r.salary.sampleSize}</span>
              </div>
              <div className="flex flex-col gap-3">
                <TierLine title="必备底座" color={TIER_COLORS.base} skills={t.base.map((s) => s.skill)} />
                <TierLine title="加分稀缺" color={TIER_COLORS.premium} skills={t.premium.map((s) => s.skill)} />
                <TierLine title="AI 工具" color={TIER_COLORS.tools} skills={t.tools.map((s) => s.skill)} />
              </div>
            </div>
          )
        })}
        <Usage
          importLine="TIER_COLORS, TierLine"
          snippet={`const { data } = useQuery({ queryKey:["compare"], queryFn: () => fetchCompare({ mode: 'role', roles }) })
data.roles.map((r) => {
  const t = r.skillTiers  // { base, premium, tools } 各为 { skill, count }[]
  // <TierLine title="必备底座" color={TIER_COLORS.base} skills={t.base.map(s => s.skill)} />
})`}
        />
        <p className="mt-3 text-xs text-muted">
          注：<code>BarRow</code>（横向比例条）是细报表页本地组件，未纳入共享模块——如需复用请自行拷贝。
        </p>
      </Section>
    </div>
  )
}
