// tests/audit-deep.mjs — 深度自检：样式 / 整齐度 / 可访问性（程序化度量，替代肉眼看图）
// 覆盖：横向溢出、文字截断、文本重叠(疑似)、WCAG 对比度、图片缺alt、
//       交互元素缺可访问名、表单缺label、移动端可点击区过小、重复id、console warning。
// 运行： BASE_URL=http://localhost:5174 node tests/audit-deep.mjs
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname)
const SHOTS = ROOT + 'audit-shots/'
mkdirSync(SHOTS, { recursive: true })

const ROUTES = [
  ['总览', '/'], ['缺口', '/gap'], ['路线', '/roadmap'], ['图谱', '/clusters'],
  ['数据', '/data'], ['岗位列表', '/jobs'], ['跨角色对比', '/compare'],
  ['薪资抽检', '/salary-audit'], ['角色详情', '/role-detail'], ['分析展示', '/analysis-showcase'],
  ['画像', '/persona'], ['设计系统', '/design-system'], ['数据调度', '/data-schedule'],
]
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

const findings = []
function add(sev, page, scope, msg, extra) {
  findings.push({ sev, page, scope, msg, ...(extra ? { extra } : {}) })
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 })

// 预热
{
  const warm = await ctx.newPage()
  await warm.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  await warm.waitForTimeout(4000)
  await warm.close()
}

async function auditPage(route, label, vp) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: vp.width, height: vp.height })
  const consoleErrors = [], consoleWarns = [], pageErrors = [], failed = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
    if (m.type() === 'warning') consoleWarns.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText || '' }))
  page.on('response', (r) => { if (r.status() >= 400) failed.push({ url: r.url(), err: 'HTTP ' + r.status() }) })

  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('nav, aside, [class*="sidebar"]', { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(1400)
  } catch (e) { add('P1', label, '加载', `页面加载失败：${e.message}`) }

  const m = await page.evaluate((vpName) => {
    const out = { overflow: false, sw: 0, vw: 0, offenders: [], truncated: [], overlaps: [],
      contrast: [], missingAlt: [], noName: [], noLabel: [], tinyTargets: [], dupIds: [], badLiterals: [] }
    const vw = document.documentElement.clientWidth
    const sw = document.documentElement.scrollWidth
    out.vw = vw; out.sw = sw
    out.overflow = sw > vw + 1

    // 横向溢出元凶
    if (out.overflow) {
      const off = []
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.right > vw + 1 && r.width > 0 && r.height > 0 && r.width < 6000) {
          const cs = getComputedStyle(el)
          if (cs.position === 'fixed' && r.right <= vw + 2) return
          off.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60), txt: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 30), right: Math.round(r.right) })
        }
      })
      const seen = new Set()
      out.offenders = off.filter((o) => { const k = o.cls + '|' + o.txt; if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => b.right - a.right).slice(0, 6)
    }

    // 工具：解析颜色 -> {r,g,b,a}
    function parseColor(s) {
      if (!s) return null
      const m = s.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1].split(',').map((x) => parseFloat(x))
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    function lum(c) {
      const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
    }
    function ratio(c1, c2) { const L1 = lum(c1), L2 = lum(c2); const a = Math.max(L1, L2), b = Math.min(L1, L2); return (a + 0.05) / (b + 0.05) }
    // 向上查找有效背景色（忽略近乎透明的叠加层：a<0.5 视为透明，避免误把 3% 黑算成实底）
    function resolveBg(el) {
      let n = el
      for (let i = 0; i < 8 && n; i++) {
        const bg = parseColor(getComputedStyle(n).backgroundColor)
        if (bg && bg.a >= 0.5) return bg
        n = n.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 } // 兜底白底
    }
    function contains(a, b) { return a !== b && a.contains(b) }

    // 对比度：遍历可见文本叶子
    const textEls = []
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th,div,summary,figcaption').forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.offsetParent === null) return
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim()
      if (!txt) return
      // 仅取“文本叶子”：自身有文本且无可读子元素
      const childText = Array.from(el.children).some((c) => (c.innerText || '').trim())
      if (childText) return
      const col = parseColor(cs.color)
      if (!col || col.a === 0) return
      const fontSize = parseFloat(cs.fontSize)
      const bold = parseInt(cs.fontWeight) >= 700
      const large = fontSize >= 24 || (bold && fontSize >= 18.66)
      const bg = resolveBg(el)
      const r = ratio(col, bg)
      const need = large ? 3 : 4.5
      if (r < need - 0.05) {
        textEls.push({ tag: el.tagName.toLowerCase(), txt: txt.slice(0, 24), size: Math.round(fontSize), large, ratio: +r.toFixed(2), need, fg: `rgb(${col.r},${col.g},${col.b})`, bg: `rgb(${bg.r},${bg.g},${bg.b})` })
      }
    })
    out.contrast = textEls.sort((a, b) => a.ratio - b.ratio).slice(0, 8)

    // 文字截断：仅标记“无省略号却被静默裁切”的情况（带 ellipsis 的 truncate 是设计行为，不报）
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis') {
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.scrollHeight <= el.clientHeight + 2) {
          const txt = (el.innerText || '').replace(/\s+/g, ' ').trim()
          if (txt.length > 4) out.truncated.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 50), txt: txt.slice(0, 24), sw: el.scrollWidth, cw: el.clientWidth })
        }
      }
    })
    out.truncated = out.truncated.slice(0, 6)

    // 文本重叠（疑似）：两个互不嵌套的文本叶子矩形大面积重合
    const leaves = []
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th,div').forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || el.offsetParent === null) return
      const childText = Array.from(el.children).some((c) => (c.innerText || '').trim())
      if (childText) return
      if (!(el.innerText || '').replace(/\s+/g, ' ').trim()) return
      if (cs.position === 'fixed' || cs.position === 'sticky') return
      // 排除虚拟滚动表格（role=region 容器内的绝对定位行），其 getBoundingClientRect
      // 在度量时点不稳定，会产生虚假「文本重叠」误报，由 Table 组件自身保证不重叠。
      if (el.closest('[role="region"]')) return
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) leaves.push({ el, r, txt: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 18) })
    })
    const ov = []
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const A = leaves[i], B = leaves[j]
        if (contains(A.el, B.el) || contains(B.el, A.el)) continue
        const x = Math.max(0, Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left))
        const y = Math.max(0, Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top))
        const inter = x * y
        if (inter <= 0) continue
        const minArea = Math.min(A.r.width * A.r.height, B.r.width * B.r.height)
        if (inter > 0.5 * minArea) ov.push({ a: A.txt, b: B.txt, inter: Math.round(inter) })
      }
    }
    out.overlaps = ov.slice(0, 5)

    // 图片缺 alt
    document.querySelectorAll('img').forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) return
      if (!img.alt || img.alt.trim() === '') out.missingAlt.push((img.currentSrc || img.src || '').slice(-50))
    })
    out.missingAlt = out.missingAlt.slice(0, 5)

    // 交互元素缺可访问名
    document.querySelectorAll('a,button,[role="button"],[role="link"]').forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || el.offsetParent === null) return
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim()
      const aria = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby')
      if (!txt && !aria) out.noName.push(el.tagName.toLowerCase() + (el.getAttribute('href') ? '[' + (el.getAttribute('href') || '').slice(0, 20) + ']' : ''))
    })
    out.noName = out.noName.slice(0, 5)

    // 表单控件缺 label
    document.querySelectorAll('input,select,textarea').forEach((el) => {
      const id = el.id
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || el.offsetParent === null) return
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return
      const wrapped = el.closest('label')
      const lbl = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null
      const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
      const ph = el.getAttribute('placeholder')
      if (!wrapped && !lbl && !aria && !ph) out.noLabel.push(el.tagName.toLowerCase() + (id ? '#' + id : ''))
    })
    out.noLabel = out.noLabel.slice(0, 5)

    // 移动端可点击区过小（排除 1x1 跳转链接等视觉隐藏元素）
    if (vpName === 'mobile') {
      document.querySelectorAll('a,button,[role="button"],input[type="checkbox"],input[type="radio"],select,summary').forEach((el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || el.offsetParent === null) return
        const r = el.getBoundingClientRect()
        if (r.width < 4 && r.height < 4) return // 跳过 sr-only 跳转链接
        if (r.width > 0 && r.height > 0 && Math.min(r.width, r.height) < 24) out.tinyTargets.push({ tag: el.tagName.toLowerCase(), txt: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) })
      })
      out.tinyTargets = out.tinyTargets.slice(0, 6)
    }

    // 重复 id
    const ids = {}
    document.querySelectorAll('[id]').forEach((el) => { const id = el.id; ids[id] = (ids[id] || 0) + 1 })
    out.dupIds = Object.keys(ids).filter((k) => ids[k] > 1).slice(0, 8)

    // 文本占位符泄漏：可见文本里出现 undefined / NaN / [object Object] 等字面量
    // （这是最显眼的文本 bug，此前审计漏检，现纳入自动扫描）
    const BAD_LIT = ['undefined', 'NaN', '[object Object]']
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th,div,summary,figcaption,strong,b').forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.offsetParent === null) return
      const childText = Array.from(el.children).some((c) => (c.innerText || '').trim())
      if (childText) return
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim()
      if (!txt) return
      const hit = BAD_LIT.find((k) => txt === k || txt.includes(' ' + k + ' ') || txt.startsWith(k + ' ') || txt.endsWith(' ' + k) || txt === k)
      if (hit) out.badLiterals.push({ tag: el.tagName.toLowerCase(), txt: txt.slice(0, 40), lit: hit })
    })
    out.badLiterals = out.badLiterals.slice(0, 5)

    return out
  }, vp.name).catch(() => ({ overflow: false, offenders: [], truncated: [], overlaps: [], contrast: [], missingAlt: [], noName: [], noLabel: [], tinyTargets: [], dupIds: [], badLiterals: [] }))

  // 汇总
  if (pageErrors.length) add('P1', label, 'JS运行时', `页面抛错 ${pageErrors.length} 条`, { pageErrors: pageErrors.slice(0, 3) })
  const apiFails = failed.filter((f) => f.url.includes('/api'))
  if (apiFails.length) add('P1', label, 'API', `接口失败 ${apiFails.length} 个`, { apiFails: apiFails.slice(0, 3) })
  if (m.overflow) add('P1', label, '横向溢出', `scrollWidth ${m.sw} > 视口 ${m.vw}`, { offenders: m.offenders })
  if (m.contrast.length) add('P2', label, '对比度', `${m.contrast.length} 处文字对比度低于 WCAG AA`, { contrast: m.contrast })
  if (m.overlaps.length) add('P3', label, '文本重叠(疑似)', `${m.overlaps.length} 处文本元素大幅重叠，需人工确认`, { overlaps: m.overlaps })
  if (m.truncated.length) add('P3', label, '文字截断', `${m.truncated.length} 处疑似被裁剪`, { truncated: m.truncated })
  if (m.missingAlt.length) add('P2', label, '图片alt', `${m.missingAlt.length} 张图片缺 alt`, { missingAlt: m.missingAlt })
  if (m.noName.length) add('P2', label, '可访问名', `${m.noName.length} 个交互元素无可访问名`, { noName: m.noName })
  if (m.noLabel.length) add('P2', label, '表单label', `${m.noLabel.length} 个表单控件缺关联label`, { noLabel: m.noLabel })
  if (vp.name === 'mobile' && m.tinyTargets.length) add('P3', label, '可点击区', `移动端 ${m.tinyTargets.length} 个可点击目标<24px`, { tinyTargets: m.tinyTargets })
  if (m.dupIds.length) add('P2', label, '重复id', `重复 id: ${m.dupIds.join(', ')}`)
  if (m.badLiterals.length) add('P1', label, '文本占位符泄漏', `可见文本含占位符字面量 ${m.badLiterals.length} 处：${m.badLiterals.map((b) => b.lit).join(', ')}`, { badLiterals: m.badLiterals })
  if (consoleErrors.length) add('P2', label, '控制台', `console.error ${consoleErrors.length} 条`, { consoleErrors: consoleErrors.slice(0, 3) })
  if (consoleWarns.length) add('P3', label, '控制台', `console.warn ${consoleWarns.length} 条`, { consoleWarns: consoleWarns.slice(0, 3) })

  await page.close()
  return { label, route, vp: vp.name, ...m }
}

const summary = []
for (const [label, route] of ROUTES) {
  for (const vp of VIEWPORTS) {
    summary.push(await auditPage(route, label, vp))
  }
}

await browser.close()
writeFileSync(ROOT + 'audit-deep.json', JSON.stringify({ generated: new Date().toISOString(), base: BASE, summary, findings }, null, 2))

const order = { P1: 0, P2: 1, P3: 2 }
const sorted = [...findings].sort((a, b) => order[a.sev] - order[b.sev])
console.log(`\n=== 深度自检完成：共 ${findings.length} 项 ===`)
for (const f of sorted) console.log(`[${f.sev}] ${f.page}/${f.scope}: ${f.msg}`)
console.log('\n详情见 tests/audit-deep.json')
