import { test, expect } from '@playwright/test'

test('debug market DOM', async ({ page }) => {
  await page.goto('/market')
  await page.waitForLoadState('networkidle')
  console.log('html', await page.content())
  console.log('links', await page.locator('a').all())
  console.log('first a', await page.locator('a').first().getAttribute('href'))
})
