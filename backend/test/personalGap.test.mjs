// backend/test/personalGap.test.mjs — 固化「学习闭环」核心逻辑单测（审计 Issue 2 修复）
//
// 纯函数测试，无需起服务：直接 import personalGap，验证
//   1) 无技能基线 → hasBaseline=false（不编造用户技能）
//   2) 有基线 → 已知技能从缺口移除
//   3) masteredSkills（已掌握集）→ 既从缺口移除、又计入 masteredCount
// 把此前 /tmp 临时单测固化为仓库资产，防未来回归。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personalGap } from '../src/analyze.js'

// 模拟「目标岗要求优先级」：4 个高频技能
const priority = [
  { skill: 'React', score: 0.9, count: 30 },
  { skill: 'TypeScript', score: 0.85, count: 28 },
  { skill: 'Vue', score: 0.7, count: 12 },
  { skill: 'Webpack', score: 0.5, count: 8 },
]

test('无基线：current_skills 为空 → hasBaseline=false，不编造缺口', () => {
  const r = personalGap(null, null, priority, 20, new Set())
  assert.equal(r.hasBaseline, false)
  assert.equal(r.totalHigh, priority.length)
  assert.equal(r.gaps.length, 0)
  assert.equal(r.masteredCount, 0)
})

test('有基线但无掌握：已知的 React/TypeScript 从缺口移除', () => {
  const up = { current_skills: ['React', 'TypeScript'] }
  const r = personalGap(up, null, priority, 20, new Set())
  assert.equal(r.hasBaseline, true)
  const skills = r.gaps.map((g) => g.skill)
  assert.ok(!skills.includes('React'), 'React 不应出现在缺口')
  assert.ok(!skills.includes('TypeScript'), 'TypeScript 不应出现在缺口')
  assert.ok(skills.includes('Vue'), 'Vue 应在缺口')
  assert.equal(r.masteredCount, 0)
})

test('学习闭环：masteredSkills 从缺口移除并计入 masteredCount', () => {
  const up = { current_skills: ['React', 'TypeScript'] }
  // 注意：masteredSkills 由 /api/mastery 落库后取出，统一小写（见 analyze.js:632）。
  // 契约与真实调用一致，故此处用小写。
  const r = personalGap(up, null, priority, 20, new Set(['vue', 'webpack']))
  const skills = r.gaps.map((g) => g.skill)
  assert.ok(!skills.includes('Vue'), '已掌握的 Vue 应从缺口移除')
  assert.ok(!skills.includes('Webpack'), '已掌握的 Webpack 应从缺口移除')
  assert.equal(r.masteredCount, 2, 'masteredCount 应为 2')
  assert.equal(r.totalHigh, priority.length)
  // 已掌握技能不应再出现在缺口列表里
  assert.equal(r.gaps.length, 0, 'React/TS/Vue/Webpack 全已知 → 缺口应为 0')
})
