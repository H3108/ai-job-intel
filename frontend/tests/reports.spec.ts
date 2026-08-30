import { test, expect } from '@playwright/test'

test('reports page shows live intelligence cards', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  const main = page.getByRole('main')

  await expect(main.getByText('智能分析').first()).toBeVisible()
  await expect(main.getByText('市场分析', { exact: true })).toBeVisible()
  await expect(main.getByText('推荐岗位', { exact: true })).toBeVisible()
  await expect(main.getByText('技能差距', { exact: true })).toBeVisible()
  await expect(main.getByText('学习路线', { exact: true })).toBeVisible()
})

test('reports page shows market details', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('岗位总量').first()).toBeVisible()
})

test('reports page shows recommendations list', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  const card = page.locator('text=/.*前端开发工程师.*/').first()
  await expect(card).toBeVisible()
})

test('reports page shows skill gap items', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('AI 工程能力').first()).toBeVisible()
})

test('reports page shows roadmap phases', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Phase 1').first()).toBeVisible()
})
