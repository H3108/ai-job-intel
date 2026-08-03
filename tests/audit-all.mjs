// tests/audit-all.mjs — 全页面审计（功能 + 样式 + 整齐度）
// 覆盖：控制台/页面错误、API 失败、横向溢出与其元凶、坏图、导航功能、桌面+移动截图。
// 运行： BASE_URL=http://localhost:5174 node tests/audit-all.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname)
const SHOTS = ROOT + 'audit-shots/'
mkdirSync(SHOTS, { recursive: true })

const ROUTES = [
  ['总览', '/'],
  ['缺口', '/gap'],
  ['路线', '/roadmap'],
  ['图谱', '/clusters'],
  ['数据', '/data'],
  ['岗位列表', '/jobs'],
  ['跨角色对比', '/compare'],
  ['薪资抽检', '/salary-audit'],
  ['角色详情', '/role-detail'],
  ['分析展示', '/analysis-showcase'],
  ['画像', '/persona'],
  ['设计系统', '/design-system'],
  ['数据调度', '/data-schedule'],
]
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

const findings = [] // 结构化问题清单
function add(sev, page, scope, msg, extra) {
  findings.push({ sev, page, scope, msg, ...(extra ? { extra } : {}) })
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 })

async function auditPage(route, label, vp) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: vp.width, height: vp.height })
  const consoleErrors = []
  const pageErrors = []
  const failed = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText || '' }))
  page.on('response', (r) => { if (r.status() >= 400) failed.push({ url: r.url(), err: 'HTTP ' + r.status() }) })

  let loadErr = null
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('nav, aside, [class*="sidebar"]', { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(1200)
  } catch (e) { loadErr = e.message }

  // 横向溢出 + 元凶
  const layout = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const sw = document.documentElement.scrollWidth
    const offenders = []
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 && r.width > 0 && r.height > 0 && r.width < 6000) {
        const cs = getComputedStyle(el)
        if (cs.position === 'fixed' && r.right <= vw + 2) return
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
          txt: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 36),
          right: Math.round(r.right),
          w: Math.round(r.width),
        })
      }
    })

    // 去重（按 cls+txture），按 right 排序取最宽 8 个
    const seen = new Set()
    const top = offenders
      .filter((o) => { const k = o.cls + '|' + o.txt; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => b.right - a.right).slice(0, 8)

    // 坏图
    const brokenImgs = []
    document.querySelectorAll('img').forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) brokenImgs.push(img.currentSrc || img.src || '(img)')
    })

    // 可见主标题数量（h1/h2）
    const headings = document.querySelectorAll('h1,h2').length
    // body 文本长度（判定空页）
    const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim().length
    return { vw, sw, overflow: sw > vw + 1, offenders: top, brokenImgs, headings, bodyText }
  }).catch(() => ({ vw: vp.width, sw: 0, overflow: false, offenders: [], brokenImgs: [], headings: 0, bodyText: 0 }))

  const shot = `${SHOTS}${label}-${vp.name}.png`
  await page.screenshot({ path: shot, fullPage: vp.name === 'desktop' }).catch(() => {})

  // 汇总
  if (loadErr) add('P1', label, '加载', `页面加载失败：${loadErr}`)
  if (pageErrors.length) add('P1', label, 'JS运行时', `页面抛错 ${pageErrors.length} 条`, { pageErrors })
  const apiFails = failed.filter((f) => f.url.includes('/api'))
  if (apiFails.length) add('P1', label, 'API', `接口请求失败 ${apiFails.length} 个`, { apiFails })
  const nonApiFails = failed.filter((f) => !f.url.includes('/api') && !f.url.includes('favicon'))
  if (nonApiFails.length) add('P3', label, '资源', `非API资源失败 ${nonApiFails.length} 个`, { nonApiFails })
  if (consoleErrors.length) add('P2', label, '控制台', `console.error ${consoleErrors.length} 条`, { consoleErrors: consoleErrors.slice(0, 5) })
  if (layout.overflow) add('P1', label, '横向溢出', `scrollWidth ${layout.sw} > 视口 ${layout.vw}`, { offenders: layout.offenders })
  if (layout.brokenImgs.length) add('P2', label, '坏图', `broken image ${layout.brokenImgs.length} 个`, { brokenImgs: layout.brokenImgs.slice(0, 5) })
  if (layout.bodyText < 30 && !loadErr) add('P2', label, '空内容', `页面可见文本仅 ${layout.bodyText} 字符，疑似未渲染`)
  if (layout.headings === 0) add('P3', label, '结构', '页面无 h1/h2 标题')

  await page.close()
  return { label, route, vp: vp.name, overflow: layout.overflow, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, apiFails: apiFails.length, broken: layout.brokenImgs.length, shot }
}

// ── 0) 预热：先加载首页并等待 vite 完成依赖预构建，避免快速连续加载触发依赖重优化导致的瞬时误报 ──
{
  const warm = await ctx.newPage()
  await warm.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  await warm.waitForTimeout(4000)
  await warm.close()
}

// ── 1) 逐页 × 双视口加载审计 ──
const summary = []
for (const [label, route] of ROUTES) {
  for (const vp of VIEWPORTS) {
    summary.push(await auditPage(route, label, vp))
  }
}

// ── 2) 导航功能（SPA 路由切换 + 主区渲染）──
const nav = await ctx.newPage()
await nav.setViewportSize({ width: 1440, height: 900 })
const navResults = []
try {
  await nav.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await nav.waitForSelector('nav a, aside a', { timeout: 10000 })
  const links = await nav.$$eval('nav a, aside a', (as) => as.map((a) => ({ href: a.getAttribute('href'), text: a.innerText.trim() })))
  let navErr = null
  for (const l of links) {
    if (!l.href || l.href.startsWith('http') || l.href.includes('://')) continue
    const targetPath = new URL(l.href, BASE).pathname
    if (targetPath === new URL(nav.url()).pathname) continue // 跳过当前页自身链接，避免误报
    const before = nav.url()
    try {
      await nav.click(`a[href="${l.href}"]`)
      await nav.waitForTimeout(700)
      const after = nav.url()
      const mainLen = await nav.evaluate(() => (document.querySelector('main')?.innerText || document.body.innerText || '').length)
      navResults.push({ text: l.text, href: l.href, changed: after !== before, ok: mainLen > 50 })
      if (after === before) add('P2', '导航', '路由', `点击「${l.text}」(${l.href}) 未发生路由切换`)
      if (mainLen <= 50) add('P2', '导航', '渲染', `点击「${l.text}」后主区域内容为空`)
    } catch (e) {
      navErr = e.message
      navResults.push({ text: l.text, href: l.href, changed: false, ok: false, err: e.message })
      add('P2', '导航', '交互', `点击「${l.text}」抛错：${e.message}`)
    }
  }
} catch (e) {
  add('P1', '导航', '加载', `侧栏导航初始化失败：${e.message}`)
}
await nav.close()

await browser.close()

import { writeFileSync } from 'node:fs'
const out = { generated: new Date().toISOString(), base: BASE, summary, navResults, findings }
writeFileSync(ROOT + 'audit-results.json', JSON.stringify(out, null, 2))

// 控制台摘要
const order = { P1: 0, P2: 1, P3: 2 }
const sorted = [...findings].sort((a, b) => order[a.sev] - order[b.sev])
console.log(`\n=== 审计完成：共 ${findings.length} 项问题 ===`)
for (const f of sorted) console.log(`[${f.sev}] ${f.page}/${f.scope}: ${f.msg}`)
console.log(`\n截图目录：${SHOTS}`)
console.log('导航测试结果：', navResults.length, '个链接')
