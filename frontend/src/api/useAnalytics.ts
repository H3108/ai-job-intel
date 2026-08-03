import { useQuery } from "@tanstack/react-query"
import { fetchAnalytics, type Analytics, type Scope } from "./client"
import { useScope } from "../hooks/useScope"

// P1-1：把分析数据查询从 AppShell 全局门控下沉到真正需要的页面，
// 让 /persona、/compare、/salary-audit、/jobs 不再等待 204KB analytics + 服务端聚合。
// 复用同一 queryKey(['analytics', scope])，跨页跳转命中缓存（staleTime 在 client 默认）。
export function useAnalytics(scope: Scope) {
  return useQuery<Analytics>({
    queryKey: ["analytics", scope],
    queryFn: () => fetchAnalytics(scope),
  })
}

export { useScope }
