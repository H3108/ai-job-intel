import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('合并多个类名', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
  it('tailwind-merge 去重冲突类（后者胜出）', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
  it('忽略 falsy 值', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})
