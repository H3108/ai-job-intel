// tests/visual.mjs — 视觉回归基线（Playwright 截图，桌面 1280x900）
// 运行：BASE_URL=http://localhost:5174 node tests/visual.mjs
// 产出：tests/visual-baseline/<页面>.png（本轮实测基线）
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const ROOT = process.cwd()
const OUT = ROOT + '/tests/visual-baseline'
mkdirSync(OUT, { recursive: true })

const PAGES = [
  { name: '总览', path: '/' },
  { name: '缺口', path: '/gap' },
  { name: '路线', path: '/roadmap' },
  { name: '图谱', path: '/clusters' },
  { name: '数据', path: '/data' },
  { name: '画像', path: '/persona' }
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
console.log(`\n🖼 视觉回归基线 → ${BASE} (${OUT})\n`)
for (const p of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
  const file = `${OUT}/${p.name}.png`
  await page.screenshot({ path: file, fullPage: false })
  const h = await page.evaluate(() => document.body.scrollHeight)
  const errMark = errors.length ? ` ⚠JS错误${errors.length}` : ''
  console.log(`  截图 ${p.name}(${p.path}) -> ${file} [scrollHeight=${h}px]${errMark}`)
  await page.close()
}
await browser.close()
console.log('\n基线截图已生成。后续回归：对比同页面新截图与基线差异。')
