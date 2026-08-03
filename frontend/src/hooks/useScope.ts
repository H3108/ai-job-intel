import { useSearchParams } from "react-router-dom"
import type { Scope } from "../api/client"

// 与 AppShell / 各页面一致的单一真相源：从 URL（?role=&city=）读取作用域。
// 方案 C：看板"看哪个市场"由 URL 决定，避免各页各自解析、状态漂移。
export function useScope(): Scope {
  const [params] = useSearchParams()
  const scope: Scope = {}
  if (params.get("role")) scope.role = params.get("role")!
  if (params.get("city")) scope.city = params.get("city")!
  return scope
}
