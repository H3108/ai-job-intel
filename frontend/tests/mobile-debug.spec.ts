import { test, expect } from '@playwright/test'

test('debug mobile nav', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const navText = await page.evaluate(() => document.querySelector('nav')?.innerText || 'NO_NAV')
  console.log('NAV_TEXT', navText)
  const mobileNav = await page.locator('.lg\\:hidden').count()
  console.log('MOBILE_NAV_COUNT', mobileNav)
  await page.screenshot({ path: 'tests/mobile-home.png', fullPage: true })
})
