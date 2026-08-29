// backend/src/search-templates.js — §6 关键词 + Boss 搜索 URL 模板（多角色/多城市版）
// 用途：提供给 Playwright 爬虫（crawler.js）和「手动导入」冷启动一起用的搜索入口。
// 注意：Boss 实际 URL 结构与城市编码可能随版本变化，这里给"结构模板"，
//       本地运行爬虫前请按当前 Boss 页面微调 query 参数 / 城市码。

// ── 城市码表（Boss 搜索 URL 用码不用名，写中文名会被踢/重定向） ──
// 来源：Boss 网页版切换城市时 URL 上的 city 参数（与天气网城市码同源，稳定）。
// 覆盖常用一线/新一线 + migrate.js 已识别的二线城市，便于「多城市采集」开箱即用。
export const CITIES = {
  // 聚焦 4 城：深圳 > 广州 > 惠州 > 东莞
  深圳: '101280600',
  广州: '101280100',
  惠州: '101280300',
  东莞: '101281600'
}

export const DEFAULT_CITY = '深圳'

// ── 角色模板：角色名 → 搜索关键词组 ──
// 每个角色对应一组在 Boss 搜索框直接可用的关键词。
// 新增角色只需在此追加一项，爬虫与选择器会自动识别。
// 注：原 "FDE" 角色已撤下 —— Boss 搜 "FDE" 实际返回现场部署/硬件测试工程师，
//     并非前端开发工程师。前端岗族改用 "前端/前端开发/前端工程师" 关键词覆盖（含 AI 前端）。
export const ROLE_TEMPLATES = {
  '前端工程师': {
    keywords: ['前端', '前端开发', '前端工程师', 'AI Agent前端', 'AI前端', '大模型前端', 'LLM前端', 'AIGC前端', '智能体前端', 'React前端', 'Vue前端', 'Next.js开发']
  },
  '算法工程师': {
    keywords: ['大模型算法', 'LLM算法工程师', '深度学习算法', 'AI算法工程师', '机器学习算法']
  },
  '产品经理': {
    keywords: ['AI产品经理', 'AI PM', '大模型产品', '生成式AI产品', 'AI产品设计']
  }
}

export const DEFAULT_ROLE = '前端工程师'

// 兼容旧导出（供仍引用 EXACT_KEYWORDS / CITY 的代码，避免破坏）。
export const EXACT_KEYWORDS = ROLE_TEMPLATES[DEFAULT_ROLE].keywords
export const CITY = DEFAULT_CITY
export const CITY_CODE = CITIES[DEFAULT_CITY]

// 解析城市：返回 { name, code }。
// - 命中 CITIES 表 → 用对应码；
// - 传入纯数字（疑似城市码）→ 原样当作 code，name 回退为 code；
// - 未识别 → 回退默认城市（打印告警，不中断）。
export function resolveCity(name = DEFAULT_CITY) {
  const key = String(name).trim()
  if (CITIES[key]) return { name: key, code: CITIES[key] }
  if (/^\d+$/.test(key)) return { name: key, code: key }
  console.warn(`[search-templates] 未识别城市「${key}」，回退默认城市 ${DEFAULT_CITY}（city 码 ${CITIES[DEFAULT_CITY]}）`)
  return { name: DEFAULT_CITY, code: CITIES[DEFAULT_CITY] }
}

// 解析角色：返回 { name, keywords }。
// - 命中 ROLE_TEMPLATES → 用模板关键词；
// - 未命中但传入了 keywordsOverride（逗号分隔）→ 以 name 为标签、用覆盖关键词；
// - 都无 → 回退默认角色。
export function resolveRole(name = DEFAULT_ROLE, keywordsOverride) {
  const key = String(name).trim()
  if (ROLE_TEMPLATES[key]) return { name: key, keywords: ROLE_TEMPLATES[key].keywords }
  if (keywordsOverride && String(keywordsOverride).trim()) {
    const kws = String(keywordsOverride)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (kws.length) return { name: key || '自定义', keywords: kws }
  }
  console.warn(`[search-templates] 未识别角色「${key}」，回退默认角色 ${DEFAULT_ROLE}`)
  return { name: DEFAULT_ROLE, keywords: ROLE_TEMPLATES[DEFAULT_ROLE].keywords }
}

// 构造单个关键词搜索 URL（web 端）。city 必须用城市码。
export function buildSearchUrl(keyword, cityCode = CITIES[DEFAULT_CITY]) {
  const params = new URLSearchParams({ query: keyword, city: cityCode, industry: '', position: '' })
  return `https://www.zhipin.com/web/geek/jobs?${params.toString()}`
}

// 构造「某角色 × 某城市」的全部关键词 URL 列表，供爬虫轮询。
export function buildSearchUrls(role = DEFAULT_ROLE, city = DEFAULT_CITY, keywordsOverride) {
  const r = resolveRole(role, keywordsOverride)
  const c = resolveCity(city)
  return r.keywords.map((keyword) => ({ keyword, role: r.name, city: c.name, url: buildSearchUrl(keyword, c.code) }))
}

// 兼容旧导出：默认角色 × 默认城市的全部关键词 URL。
export function allSearchUrls() {
  return buildSearchUrls(DEFAULT_ROLE, DEFAULT_CITY)
}

// 宽匹配判定（§6 宽匹配，兜底用）：title 含「前端」且含任一 AI 信号词。
export const BROAD_RULE = {
  mustInclude: ['前端'],
  anyOf: ['AI', '大模型', 'LLM', 'Agent', '智能体', 'AIGC', 'React', 'Vue', 'Next.js']
}

// 前端岗位 + AI 强相关岗位都保留
export function isCoreFrontend(title = '') {
  const t = title.toLowerCase()
  // 前端相关
  const isFrontend = /前端|react|vue|angular|electron|web|小程序|node\.?js|next\.js/i.test(t)
  // AI 强相关（与前端配合紧密）
  const isAIRelated = /ai|agent|智能体|大模型|llm|算法|机器学习|深度学习|aigc/i.test(t)
  return isFrontend || isAIRelated
}
export function matchesBroad(title = '') {
  const t = title.toLowerCase()
  const hasFrontend = BROAD_RULE.mustInclude.every((w) => t.includes(w.toLowerCase()))
  if (!hasFrontend) return false
  return BROAD_RULE.anyOf.some((w) => t.includes(w.toLowerCase()))
}
