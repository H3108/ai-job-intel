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

test('market page loads and shows jobs', async ({ page }) => {
  await page.goto('/market')
  await expect(page.getByRole('heading', { name: '岗位市场' })).toBeVisible()
  await expect(page.getByPlaceholder('搜索标题/公司/技能')).toBeVisible()
  await expect(page.getByText('岗位列表').first()).toBeVisible()
})

test('job detail page loads', async ({ page }) => {
  await page.goto('/jobs/jd_6568dbd91d')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: '高级/资深前端开发工程师（AI方向）' })).toBeVisible()
  await expect(page.getByText('基本信息')).toBeVisible()
})

test('profile page loads', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: '我的画像' })).toBeVisible()
  await expect(page.getByLabel('目标岗位')).toBeVisible()
})

test('roadmap page loads', async ({ page }) => {
  await page.goto('/roadmap')
  await expect(page.getByRole('heading', { name: '学习路线' })).toBeVisible()
})

test('reports page loads', async ({ page }) => {
  await page.goto('/reports')
  await page.waitForLoadState('networkidle')
  const main = page.getByRole('main')
  await expect(main.getByText('智能分析').first()).toBeVisible()
  await expect(main.getByText('市场分析', { exact: true })).toBeVisible()
  await expect(main.getByText('综合报告', { exact: true })).toBeVisible()
})
