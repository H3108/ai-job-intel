// role-normalize.js v2 — 两级职能树 + 关键词引擎
// 把 normalizeRole() 产出的标准 role（如「前端工程师」「大模型应用开发工程师」）
// 归并为可对比的「岗族 family」（L2）+「职能大类 func」（L1），并附带语言标签 language。
//
// 设计要点：
//  - family 是岗族（如「前端/AI前端」「AI应用开发」），func 是它归属的职能大类（技术/产品/设计/管理/其他）。
//  - 归类优先级：精确覆盖表 OVERRIDE（已知 title 式 role，消除歧义）→ 关键词兜底 KEYWORD（未知新角色）。
//  - 语言标签 language 仅对有意义的技术栈打标（Python/Java/PHP/JavaScript/Flutter/Android/数据），
//    其余留 null；按决策 X：Python 等后端语言不单开家族，落在「后端/数据」带 language 标签。
//  - 新 Boss 标题若未命中覆盖表，经关键词兜底归类；仍无法归类的进「其他」（预期 <1%）。
//
// 用法：
//   import { classifyRole } from './role-normalize.js'
//   const { family, func, language } = classifyRole('大模型应用开发工程师')
//   // => { family:'AI应用开发', func:'技术', language:null }
//
// 日后新增 role：优先在 OVERRIDE 追加精确映射；通用新词可在 KEYWORD 补关键词。

// L2 岗族 → L1 职能大类
export const FAMILY_FUNC = {
  '前端/AI前端': '技术',
  '后端/数据': '技术',
  '算法/AI': '技术',
  'AI应用开发': '技术',
  '全栈': '技术',
  '游戏客户端': '技术',
  '移动端': '技术',
  '测试/部署': '技术',
  'AI产品': '产品',
  '产品通用': '产品',
  '视觉/AIGC': '设计',
  '管理/负责人': '管理',
  '其他': '其他'
}

// 精确覆盖表：已知 title 式 role → { family, language? }
// 键必须与 normalizeRole() 的输出逐字一致（含空格/大小写）。
const OVERRIDE = new Map([
  // 前端
  ['前端工程师', { family: '前端/AI前端' }],
  ['前端工程师', { family: '前端/AI前端' }],
  ['Next.js开发', { family: '前端/AI前端', language: 'JavaScript' }],
  ['JavaScript', { family: '前端/AI前端', language: 'JavaScript' }],
  // 后端/数据（决策 X：语言落标签，不单开家族）
  ['Python后端工程师- 26届', { family: '后端/数据', language: 'Python' }],
  ['Java开发', { family: '后端/数据', language: 'Java' }],
  ['PHP开发', { family: '后端/数据', language: 'PHP' }],
  ['大数据开发', { family: '后端/数据', language: '数据' }],
  ['sdk', { family: '后端/数据', language: '通用' }],
  ['开发', { family: '后端/数据', language: '通用' }],
  ['应届软件开发', { family: '后端/数据', language: '通用' }],
  // 算法/AI
  ['AI 算法工程师', { family: '算法/AI' }],
  ['机器学习', { family: '算法/AI' }],
  ['机器学习 深度学习', { family: '算法/AI' }],
  ['机器学习工程师', { family: '算法/AI' }],
  ['机器学习训练平台', { family: '算法/AI' }],
  ['深度学习', { family: '算法/AI' }],
  ['人工智能', { family: '算法/AI' }],
  ['兼职机器学习', { family: '算法/AI' }],
  ['兼职机器学习技术员', { family: '算法/AI' }],
  ['兼职深度学习分析师', { family: '算法/AI' }],
  ['具身机器人训练师', { family: '算法/AI' }],
  ['机器人应用', { family: '算法/AI' }],
  // AI应用开发（决策 A：独立家族，区别于算法做模型、后端做服务）
  ['大模型应用开发工程师', { family: 'AI应用开发' }],
  ['AI开发工程师', { family: 'AI应用开发' }],
  ['LLM 应用', { family: 'AI应用开发' }],
  // 全栈（仅真·全栈，不塞 AI 开发）
  ['全栈工程师', { family: '全栈' }],
  // 游戏客户端
  ['Laya高级游戏客户端', { family: '游戏客户端' }],
  ['laya主程', { family: '游戏客户端' }],
  ['高级游戏客户端', { family: '游戏客户端' }],
  // 移动端
  ['flutter开发', { family: '移动端', language: 'Flutter' }],
  ['安卓', { family: '移动端', language: 'Android' }],
  ['跨平台App', { family: '移动端' }],
  // 测试/部署（FDE 已删除，仅留真实测试工程师）
  ['测试工程师', { family: '测试/部署' }],
  // 产品
  ['AI 产品经理', { family: 'AI产品' }],
  ['产品设计师', { family: '产品通用' }],
  // 设计
  ['AIGC设计师', { family: '视觉/AIGC' }],
  ['视觉设计师', { family: '视觉/AIGC' }],
  ['电商设计师', { family: '视觉/AIGC' }],
  // 管理
  ['管理/负责人', { family: '管理/负责人' }]
])

// 关键词兜底（未知新 title 式 role 用，有序：前者优先）
const KEYWORD = [
  { family: '前端/AI前端', kw: ['前端', 'react', 'vue', 'next.js', 'javascript', 'agent', '智能体', 'aigc', '大模型前端', 'llm前端'] },
  { family: '游戏客户端', kw: ['游戏', 'laya', '客户端'] },
  { family: '移动端', kw: ['flutter', '安卓', 'android', '跨平台', 'ios', '移动'] },
  { family: '测试/部署', kw: ['测试', 'fde', 'qa'] },
  { family: '算法/AI', kw: ['算法', '机器学习', '深度学习', '人工智能', '具身', '机器人'] },
  { family: 'AI应用开发', kw: ['大模型应用', 'ai应用', 'llm应用'] },
  { family: '后端/数据', kw: ['后端', 'java', 'python', 'php', 'go', '大数据', '开发', 'sdk'] },
  { family: '产品', kw: ['产品'] },
  { family: '视觉/AIGC', kw: ['设计', '视觉', 'aigc', 'ui'] },
  { family: '管理/负责人', kw: ['管理', '负责人', '主管', '总监'] }
]

// 核心：role → { family, func, language }
export function classifyRole(role) {
  if (!role) return { family: '其他', func: '其他', language: null }
  const ov = OVERRIDE.get(role)
  if (ov) {
    return { family: ov.family, func: FAMILY_FUNC[ov.family], language: ov.language || null }
  }
  const t = String(role).toLowerCase()
  for (const r of KEYWORD) {
    if (r.kw.some((k) => t.includes(k.toLowerCase()))) {
      return { family: r.family, func: FAMILY_FUNC[r.family], language: null }
    }
  }
  return { family: '其他', func: '其他', language: null }
}

// 兼容旧导出（仅返回岗族字符串）
export function familyOf(role) {
  return classifyRole(role).family
}

// 业务最关注的岗族顺序（报表/对比默认排前）
export const CORE_FAMILIES = ['前端/AI前端', '算法/AI', 'AI产品', '视觉/AIGC']
