import { test, expect } from '@playwright/test'

const SIZES = [
  { width: 375, height: 812, name: 'iphone' },
  { width: 768, height: 1024, name: 'ipad' },
]

const ROUTES = ['/', '/market', '/profile', '/roadmap', '/reports', '/jobs/jd_6568dbd91d']

for (const size of SIZES) {
  for (const route of ROUTES) {
    test(`mobile audit ${size.name} ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto(`http://job.hush7.online${route}`)
      await page.waitForLoadState('networkidle')

      const bodyWidth = (await page.evaluate('document.body.scrollWidth')) as number
      const clientWidth = (await page.evaluate('document.documentElement.clientWidth')) as number
      const overflow = bodyWidth - clientWidth

      const navVisible = await page.locator('nav').first().isVisible().catch(() => false)
      const mainVisible = await page.locator('main').first().isVisible().catch(() => false)

      await page.screenshot({
        path: `/tmp/mobile-${size.name}-${route.replace('/','_')}.png`,
        fullPage: true,
      })

      expect(overflow).toBeLessThanOrEqual(1)
      expect(navVisible).toBe(true)
      expect(mainVisible).toBe(true)
    })
  }
}
