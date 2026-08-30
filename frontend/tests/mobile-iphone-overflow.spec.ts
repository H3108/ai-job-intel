import { test, expect } from '@playwright/test'

test('iphone overflow debug', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('http://job.hush7.online/')
  await page.waitForLoadState('networkidle')

  const overflowers = await page.evaluate(() => {
    const els = []
    const body = document.body
    const root = document.getElementById('root')
    const scrollW = body.scrollWidth
    const clientW = document.documentElement.clientWidth
    const over = scrollW - clientW
    if (over > 0) {
      els.push(`over=${over}`)
      const candidates = Array.from(document.querySelectorAll('*'))
      for (const el of candidates) {
        const rect = el.getBoundingClientRect()
        if (rect.right > clientW + 1) {
          const cs = getComputedStyle(el)
          els.push(`${cs.display} ${rect.width}px ${rect.right}px :: ${el.className || el.tagName}`)
        }
      }
    }
    return els.slice(0, 20)
  })

  for (const line of overflowers) console.log('OVER', line)
  await page.screenshot({ path: '/tmp/mobile-iphone-overflow-home.png', fullPage: true })
})
