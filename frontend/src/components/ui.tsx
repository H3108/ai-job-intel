// 共享展示组件（仅保留 AppShell 仍在用的轻量提示）。
// 页面级视觉已统一迁移到 ../design-system（无卡片化暗黑 v2）。
export function Loading({ msg = "加载中…" }: { msg?: string }) {
  return <p style={{ color: "var(--muted)" }}>{msg}</p>
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-sm" style={{ color: "var(--danger-fg)" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--danger)" }} />
      {msg}
    </p>
  )
}
