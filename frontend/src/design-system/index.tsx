// ============================================================================
// AI 求职情报系统 · 设计系统组件库 v2（UI Designer）
// 中性碳黑 · 无卡片化暗黑（borderless） · 单一黑绿强调 #34D399
// 基于 src/index.css 的设计 Token。无第三方依赖、可访问（键盘/读屏）、
// 44px 触控、WCAG AA 对比。扁平优先，去玻璃拟态与辉光。
// 用法：import { Button, Card, Badge, Meter, ... } from '../design-system'
// ============================================================================
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cloneElement, useId, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '../lib/cn'

/* ---------------------------------- Button --------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const btnBase =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-[background,transform,color] duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none active:translate-y-px'

// 黑绿强调 #34D399 亮度高，按键文字用近黑绿保证对比；整体扁平、无辉光。
const btnVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-[var(--on-accent)] font-semibold hover:bg-[var(--accent-hover)]',
  secondary: 'bg-surface-solid text-text border border-border hover:border-accent/60 hover:bg-surface',
  ghost: 'text-muted hover:text-text hover:bg-surface',
  danger: 'bg-danger text-white hover:bg-danger/90',
}

const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', className, children, loading, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function IconButton({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        btnBase,
        btnVariants[variant],
        size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-12 w-12' : 'h-11 w-11',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* ---------------------------------- Spinner -------------------------------- */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      aria-hidden="true"
    />
  )
}

/* ----------------------------------- Field --------------------------------- */
export interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: ReactElement
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, { id, 'aria-invalid': !!error })}
      {error ? (
        <p className="text-xs text-danger-fg">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

const fieldBase =
  'w-full rounded-lg bg-surface-solid border border-border px-3 py-2.5 text-sm text-text placeholder:text-muted/70 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50'

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(fieldBase, invalid && 'border-danger focus:border-danger focus:ring-danger/30', className)} {...props} />
}

export function Textarea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(fieldBase, 'min-h-[88px] resize-y', invalid && 'border-danger focus:border-danger focus:ring-danger/30', className)}
      {...props}
    />
  )
}

export function Select({
  className,
  invalid,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        fieldBase,
        'h-11 rounded-lg appearance-none bg-no-repeat pr-9',
        invalid && 'border-danger focus:border-danger focus:ring-danger/30',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23A1A1AA' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.75rem center',
      }}
      {...props}
    >
      {children}
    </select>
  )
}

/* ----------------------------------- Card ---------------------------------- */
// 无卡片化：默认无背景、仅在需要时加极细边框（bordered）。不套厚黑框。
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  bordered?: boolean
}

export function Card({ className, interactive, bordered, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl',
        bordered ? 'border border-border' : 'border border-transparent',
        interactive && 'transition-transform duration-200 hover:-translate-y-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, desc, action }: { title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

/* -------------------------------- Section --------------------------------- */
// 无卡片化分块：靠标题层级 + 留白分隔，绝不套厚黑框。
// divided：顶部加一条极细 hairline，用于「上一个板块与下一个板块」之间的弱分隔。
export interface SectionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode
  desc?: ReactNode
  divided?: boolean
  topSpace?: boolean
}
export function Section({ title, desc, divided, topSpace = false, className, children, ...props }: SectionProps) {
  return (
    <section
      className={cn('space-y-4', topSpace && 'mt-12 first:mt-0', divided && 'border-t border-border pt-8', className)}
      aria-label={typeof title === 'string' ? title : undefined}
      {...props}
    >
      {title && (
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold tracking-tight text-text">{title}</h2>
          {desc && <p className="text-sm text-muted">{desc}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-border', className)} />
}

/* ------------------------------- PageHeader ------------------------------ */
// 全站统一页头：h1（text-2xl / bold / tracking-tight）+ 副标题（text-sm / muted / max-w-2xl）。
// 所有页面共用同一套页头规格，杜绝各页散写不同字号/字重造成的视觉碎片化。
// actions：页头下方的操作区（如切换段控、导出按钮）；children：更自由的页头内容。
export function PageHeader({
  title,
  desc,
  actions,
  children,
}: {
  title: ReactNode
  desc?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-2xl font-bold tracking-tight text-text">{title}</h1>
      {desc && <p className="max-w-2xl text-sm text-muted">{desc}</p>}
      {actions && <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div>}
      {children}
    </header>
  )
}

/* ---------------------------------- Badge ---------------------------------- */
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-solid text-text border-border',
  primary: 'bg-accent/12 text-accent border-accent/30',
  success: 'bg-success-soft text-success-fg border-success-border',
  warning: 'bg-warning-soft text-warning-fg border-warning-border',
  danger: 'bg-danger-soft text-danger-fg border-danger-border',
  info: 'bg-info-soft text-info-fg border-info-border',
}
export function Badge({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', badgeTones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ----------------------------- Tabs / Segmented --------------------------- */
export interface TabItem {
  value: string
  label: ReactNode
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem[]
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div role="tablist" className={cn('inline-flex gap-1 rounded-xl border border-border bg-surface p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'h-9 rounded-full px-4 text-sm font-medium transition-colors',
            value === t.value ? 'bg-accent text-[var(--on-accent)] font-semibold' : 'text-muted hover:text-text',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented({
  tabs,
  value,
  onChange,
  className,
  wrap,
}: {
  tabs: TabItem[]
  value: string
  onChange: (v: string) => void
  className?: string
  /** 多选项（如职能大类）在窄屏换行，而非强制单行等比铺满。 */
  wrap?: boolean
}) {
  return (
    <div
      role="tablist"
      aria-label="分段选择"
      className={cn(
        'rounded-xl border border-border bg-surface p-1',
        wrap ? 'flex flex-wrap gap-1' : 'grid grid-flow-col auto-cols-fr gap-1',
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'h-9 rounded-full px-4 text-sm font-medium transition-colors',
            value === t.value ? 'bg-accent text-[var(--on-accent)] font-semibold' : 'text-muted hover:text-text',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------- Meter ---------------------------------- */
// 拒绝厚重块状：轨道 8px 圆角满、单色微渐变（强调色）。
type MeterTone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
const meterColor: Record<MeterTone, string> = {
  primary: 'bg-accent',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
}
const meterGradient = 'bg-gradient-to-r from-accent to-[#6EE7B7]'
export function Meter({
  value,
  max = 100,
  tone = 'accent',
  label,
  showValue,
  className,
}: {
  value: number
  max?: number
  tone?: MeterTone
  label?: ReactNode
  showValue?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {label && (
        <div className="w-32 shrink-0 truncate text-sm text-text" title={typeof label === 'string' ? label : undefined}>
          {label}
        </div>
      )}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', tone === 'accent' || tone === 'primary' ? meterGradient : meterColor[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && <div className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{Math.round(value)}</div>}
    </div>
  )
}

/* -------------------------------- StatCard -------------------------------- */
// 无卡片化 KPI：仅标签 + 大号 semibold 等宽数字，靠留白分隔，不套卡。
export function StatCard({
  label,
  value,
  delta,
  deltaTone,
  icon,
  className,
}: {
  label: ReactNode
  value: ReactNode
  delta?: ReactNode
  deltaTone?: 'up' | 'down' | 'flat'
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-muted">{label}</div>
        {icon && <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent">{icon}</div>}
      </div>
      <div className="font-display text-3xl font-semibold text-text tabular-nums">{value}</div>
      {delta && (
        <div
          className={cn(
            'mt-0.5 text-xs font-medium',
            deltaTone === 'up' ? 'text-success-fg' : deltaTone === 'down' ? 'text-danger-fg' : 'text-muted',
          )}
        >
          {delta}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------- Table --------------------------------- */
export interface Column<T extends string> {
  key: T
  title: ReactNode
  align?: 'left' | 'right' | 'center'
}
export function Table<T extends string>({
  columns,
  rows,
  className,
  virtual,
}: {
  columns: Column<T>[]
  rows: Record<T, ReactNode>[]
  className?: string
  /**
   * 虚拟滚动选项。传入则开启：仅渲染视口内行 + 前后 overscan，
   * 表头 sticky 固定、首列对齐等视觉与 Table 完全一致。
   * 不传则维持原全量渲染（默认行为，向后兼容）。
   */
  virtual?: { height: number; itemSize?: number; overscan?: number }
}) {
  if (virtual) {
    return (
      <VirtualTable
        columns={columns}
        rows={rows}
        className={className}
        height={virtual.height}
        itemSize={virtual.itemSize ?? 48}
        overscan={virtual.overscan ?? 8}
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className={cn('w-full border-collapse text-sm', className)}>
        <thead>
          <tr className="bg-surface text-left text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 py-3 font-medium whitespace-nowrap',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border transition-colors hover:bg-surface">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-3 text-text whitespace-nowrap',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 虚拟滚动版 Table：仅渲染视口内行 + overscan，
// thead 用 sticky 保持表头始终可见；tbody 用 transform: translateY 偏移实现滚动。
// 视觉与 Table 完全一致，向外是同一种视觉。
function VirtualTable<T extends string>({
  columns,
  rows,
  className,
  height,
  itemSize,
  overscan,
}: {
  columns: Column<T>[]
  rows: Record<T, ReactNode>[]
  className?: string
  height: number
  itemSize: number
  overscan: number
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemSize,
    overscan,
  })
  const totalSize = virtualizer.getTotalSize()
  const items = virtualizer.getVirtualItems()

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className={cn('w-full border-collapse text-sm', className)}>
        <thead>
          <tr className="bg-surface text-left text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'sticky top-0 z-10 bg-surface px-4 py-3 font-medium whitespace-nowrap',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
      </table>
      <div
        ref={parentRef}
        className="overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ height }}
        // 可滚动区域必须有键盘焦点；tabindex="0" 让 Tab 能进来，
        // 之后方向键/PageDown/PageUp/Home/End 浏览器原生处理滚动。
        tabIndex={0}
        role="region"
        aria-label={`${rows.length} 行可滚动表格`}
      >
        <table className={cn('w-full border-collapse text-sm', className)}>
          <tbody style={{ height: totalSize, position: 'relative', display: 'block' }}>
            {items.map((vi) => {
              const r = rows[vi.index]
              return (
                <tr
                  key={vi.key}
                  className="border-t border-border transition-colors hover:bg-surface"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                    display: 'table',
                    tableLayout: 'fixed',
                  }}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 text-text whitespace-nowrap',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                      )}
                    >
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------- EmptyState ------------------------------- */
export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full bg-surface text-lg text-muted">{icon}</div>}
      <div className="text-base font-semibold text-text">{title}</div>
      {desc && <p className="max-w-sm text-sm text-muted">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* -------------------------------- Skeleton -------------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-surface-solid', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

/* ---------------------------------- Alert --------------------------------- */
type AlertTone = 'info' | 'success' | 'warning' | 'danger'
const alertTones: Record<AlertTone, string> = {
  info: 'bg-info-soft text-info-fg border-info-border',
  success: 'bg-success-soft text-success-fg border-success-border',
  warning: 'bg-warning-soft text-warning-fg border-warning-border',
  danger: 'bg-danger-soft text-danger-fg border-danger-border',
}
export function Alert({
  tone = 'info',
  title,
  children,
  onClose,
  className,
}: {
  tone?: AlertTone
  title: ReactNode
  children?: ReactNode
  onClose?: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-xl border p-4', alertTones[tone], className)}>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      </div>
      {onClose && (
        <button aria-label="关闭" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-70 transition-opacity hover:bg-surface hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  )
}

/* --------------------------------- Switch --------------------------------- */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-surface-solid border border-border',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/* -------------------------------- Tooltip --------------------------------- */
export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-solid px-2.5 py-1.5 text-xs text-text opacity-0 shadow-elevation-2 ring-1 ring-border transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

/* ---------------------------------- Kbd ----------------------------------- */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-solid px-1.5 py-0.5 font-mono text-xs text-muted">{children}</kbd>
  )
}
