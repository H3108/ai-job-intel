import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import {
  applyTheme,
  getResolvedTheme,
  getStoredTheme,
  setStoredTheme,
  type ThemeMode,
} from '../lib/theme'

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: string; title: string }> = [
  { value: 'light', label: '浅色', icon: '☀', title: '浅色' },
  { value: 'dark', label: '深色', icon: '🌙', title: '深色' },
  { value: 'auto', label: '跟随', icon: '🖥', title: '跟随系统' },
]

// 主题状态 hook：初始化读 localStorage，变化即写回并应用到 <html data-theme>。
// mode=auto 时监听系统偏好变化，实时跟随。
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [mode])

  const setMode = (next: ThemeMode) => {
    setModeState(next)
    setStoredTheme(next)
    applyTheme(next)
  }

  return { mode, setMode, resolved: getResolvedTheme() }
}

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme()
  return (
    <div
      role="group"
      aria-label="主题切换"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5',
        className
      )}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.title}
            onClick={() => setMode(o.value)}
            className={cn(
              'flex h-7 min-w-[2.25rem] items-center justify-center gap-1 rounded-full px-2 text-xs font-medium transition-colors',
              active
                ? 'bg-primary/20 text-text ring-1 ring-inset ring-primary/40'
                : 'text-muted hover:text-text'
            )}
          >
            <span aria-hidden="true">{o.icon}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
