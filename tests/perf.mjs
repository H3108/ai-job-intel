// tests/perf.mjs — 前端性能采集（Playwright，真实 Core Web Vitals + 资源分布）
// 运行：BASE_URL=http://localhost:5174 node tests/perf.mjs
// 注：当前前端为 vite dev 模式（未打包），数值偏慢；生产 build 后复测会更优。
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const PAGES = [
  { name: '总览', path: '/' },
  { name: '缺口', path: '/gap' },
  { name: '路线', path: '/roadmap' },
  { name: '图谱', path: '/clusters' },
  { name: '数据', path: '/data' },
  { name: '画像', path: '/persona' }
]

async function collectVitals(page) {
  return await page.evaluate(() => new Promise((resolve) => {
    const v = { fcp: null, lcp: null, cls: 0, ttfb: null, dcl: null, load: null }
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === 'first-contentful-paint') v.fcp = Math.round(e.startTime)
          if (e.entryType === 'largest-contentful-paint') v.lcp = Math.round(e.startTime)
          if (e.entryType === 'layout-shift' && !e.hadRecentInput) v.cls += e.value
        }
      })
      po.observe({ type: 'paint', buffered: true })
      po.observe({ type: 'largest-contentful-paint', buffered: true })
      po.observe({ type: 'layout-shift', buffered: true })
    } catch (e) {}
    const nav = performance.getEntriesByType('navigation')[0]
    if (nav) {
      v.ttfb = Math.round(nav.responseStart)
      v.dcl = Math.round(nav.domContentLoadedEventEnd)
      v.load = Math.round(nav.loadEventEnd)
    }
    setTimeout(() => { v.cls = Math.round(v.cls * 1000) / 1000; resolve(v) }, 2500)
  }))
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
console.log(`\n⚡ 性能采集 → ${BASE}（vite dev 模式基线）\n`)
for (const p of PAGES) {
  const page = await browser.newPage()
  const responses = []
  page.on('response', (r) => responses.push(r))
  await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 30000 })
  const v = await collectVitals(page)
  let bytes = 0, js = 0, css = 0
  for (const r of responses) {
    const ct = (r.headers()['content-length'] ? Number(r.headers()['content-length']) : 0)
    bytes += ct
    const type = (r.headers()['content-type'] || '')
    if (type.includes('javascript')) js += ct
    else if (type.includes('css')) css += ct
  }
  console.log(`[${p.name} ${p.path}]`)
  console.log(`  FCP=${v.fcp}ms  LCP=${v.lcp}ms  CLS=${v.cls}  TTFB=${v.ttfb}ms  DCL=${v.dcl}ms  Load=${v.load}ms`)
  console.log(`  请求数=${responses.length}  传输≈${(bytes / 1024).toFixed(1)}KB  (JS≈${(js / 1024).toFixed(1)}KB CSS≈${(css / 1024).toFixed(1)}KB)`)
  await page.close()
}
await browser.close()
console.log('\n（指标说明：FCP/LCP 越小越好；CLS<0.1 优秀；TTFB<800ms 良好）')
