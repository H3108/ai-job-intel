import { describe, it, expect } from 'vitest'
import { weightOf, primaryCategory, enrichSkill } from './skillRank'
import type { Analytics } from '../api/client'

// 与后端 analyze.js 的 LEVEL_WEIGHT / CATEGORY_PRECEDENCE 口径一致（审计 Issue 8 单一可信源）。
const weights = { 必备: 3, 常见: 1, 稀缺: 2, 加分: 0.5, 加分项: 0.5 }
const precedence = ['前端框架/语言', '工程化/基建', 'AI工程化', '工具链', 'soft']

describe('weightOf', () => {
  it('返回已知等级权重', () => {
    expect(weightOf('必备', weights)).toBe(3)
    expect(weightOf('稀缺', weights)).toBe(2)
    expect(weightOf('常见', weights)).toBe(1)
    expect(weightOf('加分', weights)).toBe(0.5)
  })
  it('缺失/空等级回退 1', () => {
    expect(weightOf(undefined, weights)).toBe(1)
    expect(weightOf('未知等级', weights)).toBe(1)
  })
})

describe('primaryCategory', () => {
  it('按优先级返回首个命中分类', () => {
    expect(primaryCategory(['AI工程化', '工程化/基建'], precedence)).toBe('工程化/基建')
  })
  it('无命中返回 null', () => {
    expect(primaryCategory(['其他'], precedence)).toBe(null)
  })
})

describe('enrichSkill', () => {
  const sample: Analytics['skillRank'][number] = {
    skill: 'React',
    count: 10,
    categories: ['前端框架/语言', 'AI工程化'],
    levels: { 必备: 5, 常见: 5 },
  }
  it('取最高权重等级为 topLevel，score = count × 最高权重', () => {
    const e = enrichSkill(sample, weights, precedence)
    expect(e.topLevel).toBe('必备')
    expect(e.score).toBe(10 * 3)
  })
  it('主分类按优先级归并（前端框架/语言 先于 AI工程化）', () => {
    const e = enrichSkill(sample, weights, precedence)
    expect(e.primaryCat).toBe('前端框架/语言')
  })
})
