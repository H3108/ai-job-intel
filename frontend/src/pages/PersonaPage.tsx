import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchProfile, fetchUpdateProfile, fetchScopes, type Profile, type Scopes } from "../api/client"
import { Alert, Badge, Button, Field, PageHeader, Section, Select, Segmented, Textarea } from "../design-system"
import { buildRoleGroups } from "../lib/roleGroups"
import { friendlyError } from "../lib/errorMessage"

// 暴露度下拉候选；若画像里存了不在此列表的值，会自动补到首项。
const EXPOSURE_LEVELS = ["从零", "入门", "了解", "熟悉", "熟练", "专家"]

type FormState = {
  target_role: string
  current_skills: string
  exposureLevel: string
  exposureTools: string
  exposureNote: string
  engGap: string
  note: string
}

// GET 返回的是 JSON 字符串，转成多行文本填进 textarea。
function parseList(s: string | undefined): string {
  if (!s) return ""
  try {
    const arr = JSON.parse(s)
    if (Array.isArray(arr)) return arr.join("\n")
  } catch {
    /* 不是 JSON 就原样返回 */
  }
  return s
}

// textarea → 字符串数组：按换行/逗号拆分、去空白、去空行。后端还会再统一去重。
function toList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// 技能计数徽章（实时显示当前输入了多少项）
function SkillCountBadge({ text, label }: { text: string; label: string }) {
  const count = toList(text).length
  return (
    <Badge tone={count > 0 ? "primary" : "neutral"} dot>
      {label} {count} 项
    </Badge>
  )
}

export default function PersonaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: profile, isLoading, isError, error } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  })

  // 角色库（与全站两级分类一致）：驱动「目标岗位」分组下拉。
  const scopesQ = useQuery<Scopes>({ queryKey: ["scopes"], queryFn: fetchScopes })
  const roles = useMemo(() => scopesQ.data?.roles || [], [scopesQ.data])
  const roleInfo = useMemo(() => {
    const m = new Map<string, { func: string; family: string }>()
    for (const r of scopesQ.data?.roleStats || []) {
      m.set(r.role, { func: r.func || "其他", family: r.family || "其他" })
    }
    return m
  }, [scopesQ.data])
  const roleGroupsAll = useMemo(() => buildRoleGroups(scopesQ.data?.roleStats), [scopesQ.data])
  const funcsPresent = roleGroupsAll.map((g) => g.func)

  const [form, setForm] = useState<FormState>({
    target_role: "",
    current_skills: "",
    exposureLevel: "",
    exposureTools: "",
    exposureNote: "",
    engGap: "",
    note: "",
  })
  // 画像异步加载回来后只填充一次，避免保存后查询失效重取时覆盖用户正在编辑的内容。
  const initialized = useRef(false)

  useEffect(() => {
    if (!profile || initialized.current) return
    let exposure: { level?: string; tools?: string[]; note?: string } = {}
    try {
      exposure = profile.ai_exposure ? JSON.parse(profile.ai_exposure) : {}
    } catch {
      exposure = {}
    }
    setForm({
      target_role: profile.target_role || "AI Agent 前端",
      current_skills: parseList(profile.current_skills),
      exposureLevel: exposure.level || "",
      exposureTools: (exposure.tools || []).join("\n"),
      exposureNote: exposure.note || "",
      engGap: parseList(profile.ai_engineering_gap),
      note: profile.note || "",
    })
    initialized.current = true
  }, [profile])

  const mutation = useMutation({
    mutationFn: (f: FormState) =>
      fetchUpdateProfile({
        target_role: f.target_role.trim() || "AI Agent 前端",
        current_skills: toList(f.current_skills),
        ai_exposure: {
          level: f.exposureLevel.trim() || undefined,
          tools: toList(f.exposureTools),
          note: f.exposureNote.trim() || undefined,
        },
        ai_engineering_gap: toList(f.engGap),
        note: f.note.trim(),
      }),
    onSuccess: () => {
      // 写回后让缺口页相关查询失效重取：缺口重算、基线刷新。
      queryClient.invalidateQueries({ queryKey: ["profile"] })
      queryClient.invalidateQueries({ queryKey: ["analytics"] })
    },
  })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  // 目标岗位所属职能大类（L1）：直接由当前值派生，无需额外 state / 同步。
  const targetFunc = roleInfo.get(form.target_role)?.func || "技术"
  const familiesInFunc = useMemo(() => {
    const g = roleGroupsAll.find((x) => x.func === targetFunc)
    return g ? g.families.map((f) => [f.family, f.roles.map((r) => r.role)] as [string, string[]]) : []
  }, [roleGroupsAll, targetFunc])
  // 切换职能大类：自动选中该大类下第一个角色。
  const handleTargetFunc = (f: string) => {
    const first = roles.find((r) => (roleInfo.get(r)?.func || "其他") === f)
    if (first) set("target_role", first)
  }

  if (isLoading) {
    return <p className="text-sm text-muted">读取画像中…</p>
  }

  // 保证当前暴露度值一定在下拉里（兼容历史脏值）。
  const levelOptions = EXPOSURE_LEVELS.includes(form.exposureLevel)
    ? EXPOSURE_LEVELS
    : form.exposureLevel
      ? [form.exposureLevel, ...EXPOSURE_LEVELS]
      : EXPOSURE_LEVELS

  const skillCount = toList(form.current_skills).length
  const gapCount = toList(form.engGap).length

  return (
    <div className="space-y-12">
      <PageHeader
        title="我的画像"
        desc="维护目标岗位、已知技能与 AI 接触度——这是你与市场目标岗之间的真实差距基线。"
      />

      {/* 实时预览卡片 */}
      <div className="rounded-xl border border-border bg-surface-solid p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">当前画像预览</span>
          <Badge tone="primary" dot>{form.target_role || "未设置"}</Badge>
          <SkillCountBadge text={form.current_skills} label="已掌握技能" />
          <Badge tone={form.exposureLevel ? "success" : "neutral"} dot>
            AI {form.exposureLevel || "未设置"}
          </Badge>
          <SkillCountBadge text={form.engGap} label="待补短板" />
        </div>
      </div>

      {/* ── Section 1：目标定位 ── */}
      <Section title="目标岗位" desc="你想冲击的目标岗位，缺口页会对照这个角色的市场要求计算差距。" topSpace={false}>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(form)
          }}
        >
          <Field label="目标岗位" hint="从岗位库选择你想冲击的目标岗，缺口页会对照它的市场要求计算差距（先选职能大类，再在岗族下选具体角色）。">
            <div className="flex flex-col gap-2">
              {funcsPresent.length === 0 ? (
                <span className="text-xs text-muted">加载角色库中…</span>
              ) : (
                <Segmented
                  wrap
                  tabs={funcsPresent.map((f) => ({ value: f, label: f }))}
                  value={targetFunc}
                  onChange={handleTargetFunc}
                />
              )}
              <Select
                aria-label="选择目标岗位"
                value={form.target_role}
                onChange={(e) => set("target_role", e.target.value)}
                disabled={roles.length === 0}
              >
                {/* 历史脏值兜底：库内没有的旧目标岗自动挂首项，避免下拉空白。 */}
                {form.target_role && !roles.includes(form.target_role) && (
                  <option value={form.target_role}>{form.target_role}（不在库内，请重选）</option>
                )}
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
          </Field>

          <Field label="补充备注" hint="任意背景说明（可选，不影响缺口计算）">
            <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="可选，如：有 3 年 React 经验，想转 AI 方向" rows={2} />
          </Field>
        </form>
      </Section>

      {/* ── Section 2：技能清单 ── */}
      <Section title="已掌握技能" desc="你已经会的技能列表。每行一项，保存时自动去重。缺口页会用这个列表过滤市场高频要求，找出你的真实短板。" topSpace={false}>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }}>
          <Field label="技能列表" hint={`当前已填 ${skillCount} 项 · 每行一个技能名，或用英文逗号分隔`}>
            <Textarea
              value={form.current_skills}
              onChange={(e) => set("current_skills", e.target.value)}
              placeholder={"React\nTypeScript\nVue\nNode.js\nPython\nGit"}
              rows={8}
            />
          </Field>

          {/* 快捷填充提示 */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-text mb-2">💡 填写建议</p>
            <ul className="space-y-1 text-xs text-muted">
              <li>• 写具体技术名（<code className="font-mono">TypeScript</code> 而非 <code className="font-mono">前端</code>），匹配更精准</li>
              <li>• 包含框架 + 语言 + 工具（如 React/Vue/Python/Git）</li>
              <li>• 不确定的不用写——宁可少填不写错，缺口算法只标记「市场要但你没有」的</li>
            </ul>
          </div>
        </form>
      </Section>

      {/* ── Section 3：AI 能力画像 ── */}
      <Section title="AI 能力画像" desc="你对 AI 工具链的上手程度。这影响「AI 编码工具」类别的缺口判定——如果你已经熟练使用 AI 辅助编码，这类技能就不会被标为短板。" topSpace={false}>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="AI 接触度" hint="你目前的 AI 上手程度">
              <Select value={form.exposureLevel} onChange={(e) => set("exposureLevel", e.target.value)}>
                <option value="">（未填写）</option>
                {levelOptions.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="AI 工具" hint="你用过或正在用的 AI 工具">
              <Textarea
                value={form.exposureTools}
                onChange={(e) => set("exposureTools", e.target.value)}
                placeholder={"Cursor\nChatGPT\nGitHub Copilot\nClaude"}
                rows={4}
              />
            </Field>
          </div>

          <Field label="AI 接触备注" hint="补充描述（可选），如：日常用 ChatGPT 辅助写代码，但没用过 Agent 编排框架">
            <Textarea
              value={form.exposureNote}
              onChange={(e) => set("exposureNote", e.target.value)}
              placeholder="可选"
              rows={2}
            />
          </Field>
        </form>
      </Section>

      {/* ── Section 4：工程化短板 / 学习路径 ── */}
      <Section title="AI 工程化学习路径" desc={`你认为自己从零起步、需要重点补的工程能力（当前 ${gapCount} 项）。这些会展示在缺口页的「AI 工程化学习路径」时间轴中。`} topSpace={false}>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }}>
          <Field label="待补能力清单" hint="按优先级从高到低排列，每行一项。这是人工策展的学习路线，不会被自动覆盖。">
            <Textarea
              value={form.engGap}
              onChange={(e) => set("engGap", e.target.value)}
              placeholder={"RAG 与检索增强生成\n向量数据库（Pinecone/Milvus）\nAgent 编排框架（LangChain/CrewAI）\nPrompt Engineering\n模型微调基础"}
              rows={7}
            />
          </Field>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-text mb-2">📌 路径说明</p>
            <ul className="space-y-1 text-xs text-muted">
              <li>• 这里写的内容会以「01 → 02 → …」时间轴形式展示在缺口页底部</li>
              <li>• 支持子项格式：<code className="font-mono">主题（子项1 / 子项2）</code></li>
              <li>• 这是人工策展的路径，不受市场数据驱动——按你自己的判断排优先级</li>
            </ul>
          </div>
        </form>
      </Section>

      {/* ── 操作区 ── */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
        <Button type="submit" loading={mutation.isPending} onClick={() => mutation.mutate(form)}>
          保存画像
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate("/gap")}>
          查看缺口 →
        </Button>
        {mutation.isSuccess && (
          <span className="text-sm text-success">✓ 已保存，缺口已刷新</span>
        )}
      </div>

      {/* 错误提示（固定在底部，不干扰编辑） */}
      {isError && <Alert tone="danger" title="读取失败">{friendlyError(error)}</Alert>}
      {mutation.isError && <Alert tone="danger" title="保存失败">{friendlyError(mutation.error)}</Alert>}
    </div>
  )
}
