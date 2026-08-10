import type { Analytics } from "../api/client"

// 技能评分/主分类派生（纯函数，数据驱动）。
// 权重表与分类优先级均来自后端 /api/analytics（data.levelWeights / data.categoryPrecedence），
// 不再在前端硬编码（审计 Issue 8）：改后端 analyze.js 即全局生效，前后端数字天然一致。

export type Weights = Record<string, number>

/** 取某等级权重，缺失等级回退 1。 */
export function weightOf(level: string | undefined, weights: Weights): number {
  return weights[level || ''] ?? 1
}

/** 按优先级表归并主分类（出现 job 数最多者；并列按 precedence）。 */
export function primaryCategory(categories: string[], precedence: string[]): string | null {
  return precedence.find((c) => categories.includes(c)) || null
}

export type Enriched = {
  skill: string
  count: number
  topLevel?: string
  score: number
  categories: string[]
  primaryCat: string | null
}

/** 派生单条技能的综合评分（频次 × 最高等级权重）与主分类。 */
export function enrichSkill(
  s: Analytics['skillRank'][number],
  weights: Weights,
  precedence: string[]
): Enriched {
  let w = 1
  let topLevel: string | undefined
  for (const lvl of Object.keys(s.levels || {})) {
    const ww = weights[lvl] || 1
    if (ww > w) {
      w = ww
      topLevel = lvl
    }
  }
  const cats = s.categories || []
  const primaryCat = primaryCategory(cats, precedence)
  return { skill: s.skill, count: s.count, topLevel, score: s.count * w, categories: cats, primaryCat }
}
