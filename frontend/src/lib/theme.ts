// 主题三态：深 / 浅 / 跟随系统。
// 设计：把「用户选择」与「实际生效主题」解耦——
//   - ThemeMode：用户意图（light/dark/auto），持久化到 localStorage
//   - ResolvedTheme：真正渲染用的深/浅，由 mode 解析得到（auto → 跟随系统）
// CSS 只认 <html data-theme="light|dark"> 一个属性（暗色为 :root 默认），
// 不再依赖 @media prefers-color-scheme，从而避免「手动选择」与「系统偏好」打架。

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'ai-job-theme'
const VALID: ThemeMode[] = ['light', 'dark', 'auto']

export function getStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'auto'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && (VALID as string[]).includes(v) ? (v as ThemeMode) : 'auto'
  } catch {
    return 'auto'
  }
}

export function getSystemPref(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// 纯函数：把用户意图解析为实际生效主题（便于单测，不碰 DOM）
export function resolveTheme(mode: ThemeMode, systemPref: ResolvedTheme = 'dark'): ResolvedTheme {
  return mode === 'auto' ? systemPref : mode
}

// 当前实际生效主题（供导出 / 打印读取，避免组件里再直接读 matchMedia）
export function getResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme') as ResolvedTheme | null
  if (attr === 'light' || attr === 'dark') return attr
  return getSystemPref()
}

// 把模式应用到 <html data-theme>；auto 解析为系统偏好并显式写入属性，
// 这样 CSS 只需一份 light 定义，且系统偏好实时变化时（mode=auto）也能跟随。
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(mode, getSystemPref())
  document.documentElement.setAttribute('data-theme', resolved)
}

export function setStoredTheme(mode: ThemeMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* localStorage 不可用时静默忽略，不影响主题切换 */
  }
}
