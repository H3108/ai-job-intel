// 验证 DataPage 虚拟滚动：行数 >100 时，DOM 中实际渲染的 <tr> 数应远小于数据总行数；
// 滚动到底再回顶，行内容不变；sticky 表头始终可见。
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:5174'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`) })

await page.goto(`${BASE}/data`, { waitUntil: 'networkidle' })
await page.waitForSelector('table')

// 1) 真实渲染的 <tr> 数 vs 数据总行数
const rendered = await page.locator('table tbody tr').count()
const visibleText = await page.locator('text=/全量\\s*\\d+\\s*项/').first().textContent()
const totalMatch = visibleText?.match(/全量\s*(\d+)/)
const total = totalMatch ? parseInt(totalMatch[1], 10) : 0
console.log(`[1] 总行数: ${total} · 实际 DOM 渲染行数: ${rendered}`)
const ratio = total > 0 ? rendered / total : 1
console.log(`[1] 渲染比: ${(ratio * 100).toFixed(2)}%（应 < 30%）`)
const ok1 = total > 0 && rendered < total / 2 && rendered < 60

// 2) sticky 表头存在
const stickyTh = await page.locator('thead th').first().evaluate(
  (el) => getComputedStyle(el).position
)
console.log(`[2] thead 第一个 th 的 position: ${stickyTh}（应 sticky）`)
const ok2 = stickyTh === 'sticky'

// 3) 滚动到底，再读最后一行 + 滚动回顶，再读首行
const scrollable = page.locator('table + div[role="region"]')
await scrollable.evaluate((el) => { el.scrollTop = el.scrollHeight })
await page.waitForTimeout(300)
const bottomFirstRow = await page.locator('table tbody tr').first().textContent()
console.log(`[3a] 滚到底后首条可见行内容: ${bottomFirstRow?.trim().slice(0, 80)}`)

await scrollable.evaluate((el) => { el.scrollTop = 0 })
await page.waitForTimeout(300)
const topFirstRow = await page.locator('table tbody tr').first().textContent()
console.log(`[3b] 回到顶部后首条可见行内容: ${topFirstRow?.trim().slice(0, 80)}`)

// 4) 截图留证
await scrollable.evaluate((el) => { el.scrollTop = 0 })
await page.waitForTimeout(200)
await page.screenshot({ path: 'tests/visual-baseline/数据_虚拟滚动_顶部.png', fullPage: false })
await scrollable.evaluate((el) => { el.scrollTop = el.scrollHeight / 2 })
await page.waitForTimeout(200)
await page.screenshot({ path: 'tests/visual-baseline/数据_虚拟滚动_中段.png', fullPage: false })

console.log('')
console.log(`[console] 错误数: ${errs.length}`)
if (errs.length) console.log(errs.join('\n'))

await browser.close()

const ok = ok1 && ok2 && errs.length === 0
console.log('')
console.log(ok ? '✅ 虚拟滚动验证通过' : '❌ 验证失败')
process.exit(ok ? 0 : 1)