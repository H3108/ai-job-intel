import type { Scopes } from "../api/client"

// 职能大类固定顺序（与后端 role-normalize.js FAMILY_FUNC 对齐）。
// 全站唯一真相源——任何页面都从这里取，禁止在别处再写一份，否则两级视图会漂移。
export const FUNC_ORDER = ["技术", "产品", "设计", "管理", "其他"]

export type RoleStat = NonNullable<Scopes["roleStats"]>[number]

export type RoleGroup = {
  func: string
  families: { family: string; roles: RoleStat[] }[]
}

// 把 roleStats 聚成「职能大类(L1) → 岗族(L2) → 角色」两级树。
// 输入可以是全量 roleStats（全局选择器 ScopeTagline），
// 也可以是已筛选子集（跨角色页只显示 analyzed>0）。
export function buildRoleGroups(stats: RoleStat[] | undefined): RoleGroup[] {
  const src = stats || []
  const byFunc = new Map<string, Map<string, RoleStat[]>>()
  for (const r of src) {
    const func = r.func || "其他"
    const family = r.family || "其他"
    if (!byFunc.has(func)) byFunc.set(func, new Map())
    const fm = byFunc.get(func)!
    if (!fm.has(family)) fm.set(family, [])
    fm.get(family)!.push(r)
  }
  return FUNC_ORDER.filter((f) => byFunc.has(f)).map((f) => ({
    func: f,
    families: [...byFunc.get(f)!.entries()].map(([family, roles]) => ({ family, roles })),
  }))
}
