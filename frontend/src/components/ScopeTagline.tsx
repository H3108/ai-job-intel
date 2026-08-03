import { Fragment, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { fetchScopes } from "../api/client"
import { buildRoleGroups, type RoleGroup } from "../lib/roleGroups"
import { cn } from "../lib/cn"

// 作用域以「句子中的可变词」形式呈现——城市、角色直接嵌进
// "深圳 AI 岗 · 全部角色 · 能力模型 · 学习路线" 这句话里，作为行内下拉，
// 既保留原有文案韵律，又不再需要一条独立的筛选栏。

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-3.5 w-3.5 shrink-0 opacity-70 transition-transform", open && "rotate-180")}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: "var(--accent)" }}>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InlineScope({
  paramKey,
  value,
  options,
  placeholder,
  align = "left",
  groupedRoles,
}: {
  paramKey: "role" | "city"
  value: string
  options: string[]
  placeholder: string
  align?: "left" | "right"
  // role 维度传两级分组树（职能大类→岗族→角色）；city 维度不传，走扁平。
  groupedRoles?: RoleGroup[]
}) {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const select = (v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(paramKey, v)
    else next.delete(paramKey)
    setParams(next, { replace: true })
    setOpen(false)
  }

  const isPlaceholder = !value
  const current = value || placeholder

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-[28px] items-center gap-0.5 rounded px-1.5 py-1 font-medium transition-colors",
          "text-[var(--accent)] hover:bg-[rgb(var(--accent-rgb)/0.14)]",
          open && "bg-[rgb(var(--accent-rgb)/0.14)]"
        )}
      >
        <span>{current}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={placeholder}
          className={cn(
            "absolute z-50 mt-1 max-h-72 min-w-[10rem] overflow-auto rounded-xl border border-border bg-[var(--surface-solid)] p-1 shadow-lg shadow-black/40",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <li role="option" aria-selected={isPlaceholder}>
            <button
              type="button"
              onClick={() => select("")}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                isPlaceholder ? "text-[var(--accent)]" : "text-text hover:bg-[rgb(var(--accent-rgb)/0.12)]"
              )}
            >
              <span>{placeholder}</span>
              {isPlaceholder && <Check />}
            </button>
          </li>
          {groupedRoles && groupedRoles.length > 0
            ? groupedRoles.map((g) => (
                <Fragment key={g.func}>
                  <li
                    aria-hidden
                    className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted/70"
                  >
                    {g.func}
                  </li>
                  {g.families.map((fam) => (
                    <Fragment key={fam.family}>
                      <li aria-hidden className="px-4 py-0.5 text-[11px] text-muted/60">
                        {fam.family}
                      </li>
                      {fam.roles.map((r) => {
                        const active = r.role === value
                        return (
                          <li role="option" aria-selected={active} key={r.role}>
                            <button
                              type="button"
                              onClick={() => select(r.role)}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-lg py-1.5 pl-5 pr-3 text-left text-sm transition-colors",
                                active
                                  ? "text-[var(--accent)]"
                                  : "text-text hover:bg-[rgb(var(--accent-rgb)/0.12)]"
                              )}
                            >
                              <span className="truncate">{r.role}</span>
                              {active && <Check />}
                            </button>
                          </li>
                        )
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              ))
            : options.map((o) => {
                const active = o === value
                return (
                  <li role="option" aria-selected={active} key={o}>
                    <button
                      type="button"
                      onClick={() => select(o)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                        active ? "text-[var(--accent)]" : "text-text hover:bg-[rgb(var(--accent-rgb)/0.12)]"
                      )}
                    >
                      <span className="truncate">{o}</span>
                      {active && <Check />}
                    </button>
                  </li>
                )
              })}
        </ul>
      )}
    </span>
  )
}

export default function ScopeTagline({
  className,
  variant = "sidebar",
}: {
  className?: string
  // sidebar：窄侧栏（240px），两个下拉都 left-0 避免向左溢出视口；
  // header：移动端整行顶栏（满宽），角色用 right-0 避免向右溢出。
  variant?: "sidebar" | "header"
}) {
  const [params] = useSearchParams()
  const role = params.get("role") || ""
  const city = params.get("city") || ""
  const { data } = useQuery({ queryKey: ["scopes"], queryFn: fetchScopes })
  const roles = data?.roles ?? []
  // 角色两级分组（全站统一）：职能大类 → 岗族 → 角色，来自 scopes.roleStats。
  const roleGroups: RoleGroup[] = buildRoleGroups(data?.roleStats)
  // 城市选项 = 库内已有城市 ∪ 规划采集城市，去重后保持后端已排好的顺序。
  const cities = Array.from(new Set([...(data?.cities ?? []), ...(data?.plannedCities ?? [])]))

  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-relaxed", className)}>
      <InlineScope paramKey="city" value={city} options={cities} placeholder="全部城市" align="left" />
      <span className="text-muted">AI 岗 ·</span>
      <InlineScope
        paramKey="role"
        value={role}
        options={roles}
        groupedRoles={roleGroups}
        placeholder="全部角色"
        align={variant === "sidebar" ? "left" : "right"}
      />
      <span className="text-muted">· 能力模型 · 学习路线</span>
    </span>
  )
}
