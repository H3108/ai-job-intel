import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })

for (const route of ['/gap', '/roadmap']) {
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch((e) => errs.push('goto:' + e.message))
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const main = document.querySelector('main')
    return {
      mainText: (main?.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
      mainLen: (main?.innerText || '').length,
      bodyLen: document.body.innerText.length,
      h1: document.querySelector('h1')?.innerText || null,
    }
  })
  console.log(`\n=== ${route} ===`)
  console.log('pageErrors:', JSON.stringify(errs))
  console.log('mainLen:', info.mainLen, '| bodyLen:', info.bodyLen, '| h1:', info.h1)
  console.log('mainText:', info.mainText)
  await page.close()
}
await b.close()
