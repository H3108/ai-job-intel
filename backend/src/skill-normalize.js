// backend/src/skill-normalize.js — 技能/学历归一化层（方案 B 配套）
// 纯函数、无副作用、单一真相源。供 saveExtraction / aggregate / personalGap / 迁移脚本复用。
//
// 设计原则：
//  - 拆 / ：复合技能（"PS/AI"、"Blender/C4D/AE"）拆成独立技能，避免信号被淹没。
//  - 同义词表：baseForm(去括号+小写+去分隔符) -> 规范名。null 表示保留原值不别名。
//  - AI 故意不别名：它是歧义词（Adobe Illustrator vs 人工智能），盲目合并会污染"AI 工程化"统计。
//    仅 "PS/AI"（整体 baseForm='psai'）这种已知组合映射为 Photoshop + Illustrator。
//  - 学历：取首个命中的学历关键词，忽略前后缀（"及以上/及以上学历/以上"）、专业前缀（"设计类专业"）。

// 同义词表（如需扩充，在此集中维护；这是人工维护的"规范词典"）
export const SKILL_ALIASES = {
  'ps': 'Photoshop', 'photoshop': 'Photoshop',
  'illustrator': 'Illustrator', // 无 "Adobe" 品牌前缀：Adobe 只是牌子名，规范名用具体工具
  'adobeillustrator': 'Illustrator', // 历史数据曾带品牌前缀 "Adobe Illustrator" → 同样归并
  'ai': null, // 故意不别名（见下）：裸 "AI" 视为人工智能，避免与 Adobe Illustrator 混淆
  'js': 'JavaScript', 'javascriptes6+': 'JavaScript', 'es6+': 'JavaScript',
  'ts': 'TypeScript', 'html': 'HTML5', 'css': 'CSS3',
  'nodejs': 'Node.js', 'node': 'Node.js', 'vue': 'Vue', 'react': 'React',
  'reactjs': 'React', 'react.js': 'React', 'vuejs': 'Vue', 'vue3': 'Vue',
  'nuxt': 'Nuxt', 'nuxtjs': 'Nuxt', 'threejs': 'Three.js', 'three.js': 'Three.js',
  'webpack': 'Webpack', 'vite': 'Vite', 'echarts': 'ECharts', 'echart': 'ECharts',
  'uniapp': 'uni-app', 'taro': 'Taro', 'python': 'Python', 'pytorch': 'PyTorch',
  'py': 'Python', 'go': 'Go', 'golang': 'Go',
  'mysql': 'MySQL', 'redis': 'Redis', 'linux': 'Linux', 'git': 'Git',
  'canvas': 'Canvas', 'comfyui': 'ComfyUI', 'keyshot': 'KeyShot', 'coreldraw': 'CorelDRAW',
  'aftereffects': 'After Effects', 'ae': 'After Effects', // AE / After Effects 归一（baseForm 去空格），避免同名分裂
  '鸿蒙': 'HarmonyOS', '鸿蒙os': 'HarmonyOS', 'harmonyos': 'HarmonyOS', 'tailwindcss': 'Tailwind CSS',
  'tailwind': 'Tailwind CSS', 'nestjs': 'NestJS', 'nextjs': 'Next.js', 'next': 'Next.js',
  // 语义近似（可选，按需扩充）
  '审美能力': '审美', 'aigc设计': 'AIGC',
  // ── 软技能归一（JD 里软技能写法最碎，集中归并高频近义）──
  // 沟通/协作族
  '沟通能力': '沟通协作', '沟通协作能力': '沟通协作', '良好的沟通协作能力': '沟通协作', '沟通表达能力': '沟通协作',
  '团队协作': '团队协作', '团队合作': '团队协作', '团队合作精神': '团队协作', '团队精神': '团队协作',
  '团队意识': '团队协作', '团队协作精神': '团队协作', '团队协作意识': '团队协作', '协作能力': '团队协作',
  // 学习/自驱族
  '学习能力强': '学习能力',
  // 审美族（"良好的审美能力" 等带修饰前缀的写法）
  '良好的审美能力': '审美',
  // 责任心族
  '责任感': '责任心', '责任心强': '责任心',
  // 问题解决族
  '解决问题能力': '问题解决能力',
  // ── 软技能长尾归并（同义多变体簇，降低碎片；不追 1 频次孤例以免过度合并）──
  // 沟通/表达族（续）
  '沟通表达': '沟通协作', '善于沟通': '沟通协作', '沟通能力强': '沟通协作', '沟通理解能力': '沟通协作',
  '沟通协调能力': '沟通协作', '表达协作': '沟通协作', '表达能力': '沟通协作', '设计沟通': '沟通协作',
  // 协作/协同族（续）：跨部门/跨团队/主动协作/Git 协作等
  '协作意识': '团队协作', '主动协作': '团队协作', '高效协同': '团队协作', '跨部门协作': '团队协作',
  '跨边界协作': '团队协作', '跨团队协作能力': '团队协作', '与设计师高效协同': '团队协作', '配合团队完成项目交付': '团队协作', 'git协作': '团队协作',
  // 学习/自驱族（续）
  '快速学习能力': '学习能力', '主动学习': '学习能力', '主动学习能力': '学习能力', '主动的学习能力': '学习能力',
  '自驱力与学习欲': '自驱力', '钻研精神': '自驱力', '探索热情和好奇心': '自驱力', '持续探索与应用': '自驱力', '主动跟进技术迭代': '自驱力', '主动性': '自驱力', '乐于探索新技术': '自驱力',
  // 执行/推进族（新规范名 执行力）
  '执行力强': '执行力', '项目推进': '执行力', '推动需求落地': '执行力', '主动推动技术方案落地': '执行力', '推动新技术落地': '执行力', '方案落地': '执行力', '独立推动项目落地能力': '执行力', '提出方案': '执行力',
  // 逻辑/分析族
  '逻辑清晰': '逻辑思维', '逻辑清楚': '逻辑思维', '逻辑理解与拆解能力': '逻辑思维', '逻辑分析能力': '逻辑思维',
  '分析总结能力': '分析能力', '数据分析能力': '分析能力',
  // 问题解决族（续）：问题定位/排查/分析解决 等变体
  '问题排查能力': '问题解决能力', '问题定位能力': '问题解决能力', '问题定位': '问题解决能力',
  '问题分析及解决能力': '问题解决能力', '问题分析和解决能力': '问题解决能力', '问题判定与解决能力': '问题解决能力', '较强的分析和解决问题的能力': '问题解决能力',
  // 用户体验族
  '用户体验优化': '用户体验意识', '用户体验设计': '用户体验意识', '用户体验敏感': '用户体验意识', '用户体验关注': '用户体验意识', '用户思维': '用户体验意识',
  // 责任心族（续）
  '技术责任心': '责任心', 'owner意识': '责任心',
  // 适应族
  '适应快节奏': '适应能力', '适应快节奏工作': '适应能力', '适应高强度交付节奏': '适应能力', '适应创业公司节奏': '适应能力',
  // 审美族（续）
  '设计审美': '审美', '设计审美和交互意识': '审美',
  // 创新/创意族（新规范名 创新思维）
  '创造力': '创新思维', '创意思维': '创新思维',
  // 方案设计族（新规范名 方案设计）
  '技术方案设计': '方案设计',
  // 产品思维族（新规范名 产品思维）
  '产品意识': '产品思维', '产品sense': '产品思维', '产品理解力': '产品思维',
  // 抽象族
  '搞抽象': '抽象能力',
}

// 类别覆盖：已知设计/工具类软件强制归入「工具链」，无视 LLM 抽取时的归类漂移
// （如 GLM 把 Photoshop / Illustrator 误挂到 AI工程化）。仅用于落库校正，不改 LLM 输出。
// 范围：仅 Adobe 设计三件套（用户明确点名）；ComfyUI/C4D 等歧义边界工具不在此列。
export const SKILL_CATEGORY_OVERRIDE = {
  'Photoshop': '工具链',
  'Illustrator': '工具链',
  'After Effects': '工具链',
}

// 整体组合别名（在拆 / 之前整串匹配）：key=baseForm(整串)
const COMBINED_ALIASES = {
  'psai': ['Photoshop', 'Illustrator'], // "PS/AI"、"PS AI" → Photoshop + Illustrator
  'psae': ['Photoshop', 'After Effects'], // "PS/AE" → Photoshop + After Effects
  'psaiae': ['Photoshop', 'Illustrator', 'After Effects'], // "PS/AI/AE" → 三者
}

// 学历关键词（按粒度降序，命中即取）。
// 注：不单列"统招本科/全日制本科"，让其落到"本科"（用户要求合并去重）。
const EDU_KEYWORDS = ['博士', '研究生', '硕士', '本科', '大专', '专科', '中专', '中技', '高中', '初中']

// 标题归一（去空白/小写），供 crawler 回填、saveExtraction、聚合复用，避免多份实现漂移。
export function normalizeTitle(title) {
  return (title || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')
}

// 薪资形态合法性（同 crawler.looksLikeSalary，抽出为纯函数供迁移复用）：
// 含真实数字 + 含单位(K/万/元) + 无残留 PUA（解密失败）。
export function looksLikeSalary(s) {
  if (!s) return false
  if (/[\uE000-\uF8FF]/.test(s)) return false // 残留 PUA 私有区 → 解密失败
  if (!/\d/.test(s)) return false // 必须含真实数字
  if (!/[Kk万¥元￥]/.test(s)) return false // 必须含单位
  return true
}

// ── 经验归一（同 education 范式）──
// 从自由文本抽取规范层级 + 数值区间（年）。**规范档按"最低年限"归并为互斥 5 档**，
// 消除 "3年+ / 3年 / 3-5年" 这类重叠桶（招聘语境下"3年经验"即"3年以上"，无需单列）。
// 档位（互斥、按资历升序）：应届/在校 · 经验不限 · 1-3年 · 3-5年 · 5年以上
// 例：
//   "1-3年"        → { level:'1-3年', min:1, max:3 }
//   "3年以上"       → { level:'3-5年', min:3, max:null }（开区间按 min 落入 3-5 年档）
//   "应届或1-3年"   → { level:'1-3年', min:1, max:3 }（以明确区间优先）
//   "至少2年以上"   → { level:'1-3年', min:2, max:null }
//   "3-5年视觉设计经验" → { level:'3-5年', min:3, max:5 }（忽略后缀）
//   "5年以上"       → { level:'5年以上', min:5, max:null }
//   "1年经验"       → { level:'1-3年', min:1, max:1 }（精确年限并入下限档）
const EXP_TIERS = ['应届/在校', '经验不限', '1-3年', '3-5年', '5年以上']
function deriveExpLevel(min, max, open, isFresh) {
  if (isFresh) return '应届/在校'
  if (min == null || min < 1) return '经验不限' // 经验不限 / 实习生 / 1年以下 等无门槛
  if (min >= 5) return '5年以上'
  if (min >= 3) return '3-5年'
  return '1-3年' // 1 <= min < 3
}

// 把任意经验档位（含历史旧档 "3年+ / 1年 / 不限 / 应届" 等）归并为当前互斥 5 档。
// 用于聚合层对存量 experience_level 兜底，避免旧数据仍以零散桶呈现。
export function bucketExperience(level) {
  if (!level) return null // 无经验信号 → 不入分布（与原聚合语义一致，避免把"解析不到"误并入"经验不限"）
  const s = String(level)
  if (/应届|在校|毕业生/.test(s)) return '应届/在校'
  if (/不限|无经验|经验不/.test(s)) return '经验不限'
  let min = null
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*\d+/)
  if (range) min = parseFloat(range[1])
  else {
    const num = s.match(/(\d+(?:\.\d+)?)\s*年/)
    if (num) min = parseFloat(num[1])
  }
  if (min == null) return null // 非数字且非"不限/应届"的异常旧串 → 排除，不误标
  if (min >= 5) return '5年以上'
  if (min >= 3) return '3-5年'
  if (min >= 1) return '1-3年'
  return null
}

export function normalizeExperience(raw) {
  if (!raw) return { level: null, min: null, max: null }
  const s = String(raw)
  const isFresh = /应届|在校|毕业生/.test(s)
  const hasOpen = /年以上|年\+|及以上|或/.test(s)
  // 区间「a-b年」
  const ranges = []
  const re = /(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*年/g
  let m
  while ((m = re.exec(s))) ranges.push([parseFloat(m[1]), parseFloat(m[2])])
  // 单值「N年」
  const singles = []
  const sre = /(\d+(?:\.\d+)?)\s*年/g
  let sm
  while ((sm = sre.exec(s))) singles.push(parseFloat(sm[1]))
  if (ranges.length) {
    const min = Math.min(...ranges.map((r) => r[0]))
    const max = Math.max(...ranges.map((r) => r[1]))
    return { level: deriveExpLevel(min, max, false, isFresh), min, max }
  }
  if (singles.length) {
    const min = Math.min(...singles)
    const max = hasOpen ? null : min
    return { level: deriveExpLevel(min, max, hasOpen, isFresh), min, max }
  }
  if (isFresh) return { level: '应届', min: 0, max: 0 }
  return { level: '不限', min: null, max: null }
}

export function normalizeEducation(raw) {
  if (!raw) return null
  const s = String(raw)
  for (const k of EDU_KEYWORDS) {
    if (s.includes(k)) {
      if (k === '研究生') return '硕士'
      if (k === '专科') return '大专' // 专科 == 大专
      return k
    }
  }
  return null
}

// ── 角色/标题归一（与技能/学历同范式）──
// 把「前端开发工程师（AI方向）」「前端工程师」「web前端」「react前端工程师」等几十种写法
// 归并为规范岗位名，供 analytics「规范岗位排名」与 /api/jobs 展示复用。
// 证据：库内 165 种去重标题中，前端家族占 80+ 条散成几十个写法，视觉/设计也散成多写法。
const ROLE_CITY_PREFIX = /^(深圳|北京|上海|广州|杭州|成都|南京|武汉|西安|苏州|重庆|天津|长沙|东莞|宁波|佛山|合肥|青岛|无锡|珠海|厦门|郑州|福州|济南|沈阳|大连|昆明|哈尔滨|南昌|南宁)\s*/
// 尾随噪音：岗位名后缀/修饰词，去掉不影响角色识别（注意：不含「设计师」，避免误删设计岗核心词）
const ROLE_TAIL_NOISE = /(招聘|校招|社招|实习生?|管培生|应届生?|急招|专场|五险一金|导师带教|线上面试|双休|远程办公|外派\S*|外包|toc|tobic|英语读写|偏美工|有审美意识|主react接触过node|云原生|native|aiagent方向|ai方向|ai经验|ai应用方向|全栈基建|专家|研发|应用开发|工程师|开发|岗)\s*$/gi
// 关键词族（有序：前面的优先命中）。家族内写法归并为同一规范岗位名。
const ROLE_FAMILIES = [
  { re: /总监|经理|lead|主管|负责人|组长|tl\b/i, role: '管理/负责人' },
  { re: /前端|react|vue|angular|electron|web|小程序|node\.?js|全栈偏前端/i, role: '前端工程师' },
  { re: /全栈/i, role: '全栈工程师' },
  { re: /大模型|算法|模型/i, role: '大模型应用开发工程师' },
  { re: /aigc/i, role: 'AIGC设计师' },
  { re: /ai|agent|智能体|gpt/i, role: 'AI开发工程师' },
  { re: /电商|etsy|独立站|跨境/i, role: '电商设计师' },
  { re: /视觉|美工|ui|界面/i, role: '视觉设计师' },
  { re: /平面/i, role: '平面设计师' },
  { re: /品牌/i, role: '品牌设计师' },
  { re: /产品/i, role: '产品设计师' },
  { re: /测试/i, role: '测试工程师' },
  { re: /设计/i, role: '设计师(其他)' },
]

export function normalizeRole(raw) {
  if (!raw) return null
  const t0 = String(raw).trim()
  // ── 优先：前端 + AI Agent 复合岗 → 「AI Agent 前端」 ──
  // 必须在去括号前判定：下方去括号步骤会删掉「（AI Agent）」括号内容，
  // 使 AI 信号丢失，导致误归「前端工程师」（实测 21 条真·目标岗被漏，且 6 条历史正确值会被 --rebuild-role 刷错）。
  // 覆盖：AI Agent 前端开发 / 前端开发（AI Agent）/ 前端工程师（AI方向）/
  //       Agent前端开发工程师 / 智能体前端负责人 等。
  if (
    /(前端|react|vue|angular|electron|web|小程序|node\.?js)/i.test(t0) &&
    /(ai\s*agent|agent\s*方向|agent\s*前端|智能体|ai\s*方向|ai\s*应用\s*方向|ai\s*agent\s*方向|ai\s*智能体\s*方向|ai\s*[-_]?\s*前端|前端\s*[-_]?\s*ai|大模型前端|llm前端|aigc前端)/i.test(t0)
  ) {
    return 'AI Agent 前端'  // 主分类：AI Agent 前端
  }
  let t = t0
  t = t.replace(ROLE_CITY_PREFIX, '')
  t = t.replace(/[（(][^)）]*[)）]/g, '') // 去括号内容（如「（AI方向）」「（React Native）」）
  t = t.replace(/[【\[][^】\]]*[】\]]/g, '') // 去方括号（如「【26春招】」）
  t = t.replace(/[|｜]/g, ' ')
  t = t.replace(/\//g, ' ') // 去斜杠（如「视觉设计师/五险一金」）
  t = t.replace(/[（）()]/g, '') // 去残留括号（含未闭合的，如「（硬核渠道 IAA方向」）
  t = t.replace(ROLE_TAIL_NOISE, '')
  t = t.replace(/\s+/g, ' ').trim()
  if (!t) return null
  for (const f of ROLE_FAMILIES) if (f.re.test(t)) return f.role
  return t // 兜底：保留清洗后的标题（如「跨平台App开发」「程序员」等无家族匹配者）
}

// 基础形态：去括号内容 + 去分隔符 + 小写（用于同义词查表与匹配）
export function baseForm(s) {
  return String(s)
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[ \t/·•\-_、,，]/g, '')
    .toLowerCase()
}

// 拆 / 、、, 并归一为规范技能名数组（去重，保序）。
// 返回数组：一条原始技能可能展开成多条（如 "Blender/C4D/AE" → 3 条）。
export function splitAndNormalizeSkill(raw) {
  const whole = baseForm(raw)
  if (COMBINED_ALIASES[whole]) return [...COMBINED_ALIASES[whole]] // 整串已知组合优先
  const parts = String(raw).split(/[/、,，·•]+/).map((x) => x.trim()).filter(Boolean)
  const out = []
  for (let p of parts) {
    p = p.replace(/[（(].*?[)）]/g, '').trim() // 去括号
    const b = baseForm(p)
    const alias = SKILL_ALIASES[b]
    if (alias === null) { if (p) out.push(p) }       // 显式保留原值
    else if (alias) out.push(alias)
    else out.push(p || b)
  }
  return [...new Set(out)]
}
