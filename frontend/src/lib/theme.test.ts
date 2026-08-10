import { describe, it, expect } from 'vitest'
import { resolveTheme, type ThemeMode, type ResolvedTheme } from './theme'

// resolveTheme 是纯函数，覆盖三种用户意图 × 两种系统偏好的全部组合。
describe('resolveTheme', () => {
  const cases: Array<[ThemeMode, ResolvedTheme, ResolvedTheme]> = [
    ['light', 'dark', 'light'],
    ['light', 'light', 'light'],
    ['dark', 'dark', 'dark'],
    ['dark', 'light', 'dark'],
    ['auto', 'dark', 'dark'],
    ['auto', 'light', 'light'],
  ]
  for (const [mode, sys, want] of cases) {
    it(`${mode} + 系统${sys} => ${want}`, () => {
      expect(resolveTheme(mode, sys)).toBe(want)
    })
  }

  it('缺省系统偏好（dark）时 auto 回落到 dark', () => {
    expect(resolveTheme('auto')).toBe('dark')
  })
})
