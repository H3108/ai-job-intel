import { test, expect } from '@playwright/test'

const FIRST_JOB_ID = 'jd_6568dbd91d'

test('home page has nav and dashboard sections', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/AI 求职情报/)
  await expect(page.getByRole('navigation').getByText('市场概览')).toBeVisible()
  await expect(page.getByRole('navigation').getByText('岗位市场')).toBeVisible()
  await expect(page.getByText('岗位总量').first()).toBeVisible()
  await expect(page.getByText('采集状态').first()).toBeVisible()
  await expect(page.getByText('岗位列表').first()).toBeVisible()
})

test('market page loads directly', async ({ page }) => {
  await page.goto('/market')
  await expect(page).toHaveURL(/\/market/)
  await expect(page.getByRole('heading', { name: '岗位市场' })).toBeVisible()
  await expect(page.getByText('热门城市').first()).toBeVisible()
})

test('job detail page loads directly', async ({ page }) => {
  await page.goto(`/jobs/${FIRST_JOB_ID}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: '高级/资深前端开发工程师（AI方向）' })).toBeVisible()
})

test('profile page loads directly', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/profile/)
  await expect(page.getByRole('heading', { name: '我的画像' })).toBeVisible()
})

test('roadmap page loads directly', async ({ page }) => {
  await page.goto('/roadmap')
  await expect(page).toHaveURL(/\/roadmap/)
  await expect(page.getByRole('heading', { name: '学习路线' })).toBeVisible()
})

test('reports page loads directly', async ({ page }) => {
  await page.goto('/reports')
  await expect(page).toHaveURL(/\/reports/)
  await expect(page.getByRole('main').getByText('智能分析').first()).toBeVisible()
})
