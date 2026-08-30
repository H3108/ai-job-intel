import { cloneElement } from "react"
import { type ReactElement, type HTMLAttributes } from "react"
import { cn } from "../lib/cn"
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"
export interface ButtonProps extends HTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; asChild?: boolean }
const btnBase = "inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
const btnVariants: Record<ButtonVariant, string> = { primary: "bg-accent text-on-accent hover:bg-accent-hover", secondary: "bg-surface-solid text-text border border-border", ghost: "text-text hover:bg-surface", danger: "bg-danger text-danger-fg" }
const btnSizes: Record<ButtonSize, string> = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm", lg: "px-5 py-2.5 text-base" }
export function Button({ variant = "primary", size = "md", className, children, loading, asChild, ...props }: ButtonProps) {
  const cls = cn(btnBase, btnVariants[variant], btnSizes[size], className)
  if (asChild && typeof children === "object" && children !== null && "type" in (children as any)) {
    const child = children as ReactElement<HTMLAttributes<HTMLElement> & { className?: string }>
    return cloneElement(child, { className: cn(cls, child.props.className), ...props })
  }
  return <button className={cls} disabled={!!loading} {...props}>{loading && <span className="opacity-80">···</span>}{children}</button>
}
export function Section({ title, desc, children, topSpace }: { title?: string; desc?: string; children?: React.ReactNode; topSpace?: boolean }) { return (<section className={`${topSpace?"":"pt-2"}`}>{(title||desc)&&(<div className="mb-3">{title&&<h2 className="font-display text-lg font-semibold text-text">{title}</h2>}{desc&&<p className="mt-1 text-sm text-muted">{desc}</p>}</div>)}<div className="rounded-2xl border border-border bg-surface px-4 py-4 shadow">{children}</div></section>) }
export function Badge({ tone = "primary", children }: { tone?: string; children?: React.ReactNode }) { const tones: Record<string,string> = { primary:"border-accent/40 bg-accent/10 text-accent", secondary:"border-border bg-surface text-muted", success:"border-success/40 bg-success/10 text-success", warning:"border-warning/40 bg-warning/10 text-warning", danger:"border-danger/40 bg-danger/10 text-danger", neutral:"border-border bg-surface text-muted" }; return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${tones[tone]||tones.secondary}`}>{children}</span> }
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${props.className||""}`} /> }
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${props.className||""}`} /> }
export function Skeleton({ className = "" }: { className?: string }) { return <div className={`animate-pulse rounded-xl bg-surface-solid ${className}`} /> }
export function EmptyState({ title, desc }: { title: string; desc?: string }) { return (<div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted"><div>{title}</div>{desc&&<div className="mt-1">{desc}</div>}</div>) }
export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: React.ReactNode }) { return (<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="font-display text-xl font-semibold text-text">{title}</h1>{desc&&<p className="mt-1 text-sm text-muted">{desc}</p>}</div>{actions&&<div className="flex flex-wrap gap-2">{actions}</div>}</div>) }
export function Alert({ tone = "primary", title, children }: { tone?: string; title?: string; children?: React.ReactNode }) { const tones: Record<string,string> = { primary:"border-accent/40 bg-accent/10 text-accent", secondary:"border-border bg-surface text-muted", success:"border-success/40 bg-success/10 text-success", warning:"border-warning/40 bg-warning/10 text-warning", danger:"border-danger/40 bg-danger/10 text-danger", neutral:"border-border bg-surface text-muted" }; return <div className={`rounded-xl border px-4 py-3 ${tones[tone]||tones.secondary}`}>{title&&<div className="text-sm font-medium">{title}</div>}<div className="text-sm">{children}</div></div> }
