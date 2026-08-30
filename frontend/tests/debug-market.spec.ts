import { test, expect } from '@playwright/test'

test('debug market selectors', async ({ page }) => {
  await page.goto('/market')
  await page.waitForLoadState('networkidle')
  const links = await page.locator('a[href*="/jobs/"]').all()
  console.log('job links count', links.length)
  if (links.length) {
    console.log('first href', await links[0].getAttribute('href'))
    await links[0].click()
    await page.waitForLoadState('networkidle')
    console.log('url', page.url())
  }
})
