// 把技术错误转换为终端用户友好文案。
// 设计原则：用户看到的是"发生了什么 + 能做什么"，而不是堆栈/接口细节；
// 技术细节保留到 console.error，便于排障。覆盖常见网络/状态码，未知错误兜底。
export function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    console.error('[app-error]', err)
    const msg = err.message || ''
    if (/fetch|network|econn|enotfound|timeout|abort|failed to fetch/i.test(msg)) {
      return '网络似乎不太通畅，请检查连接后重试。'
    }
    if (/404|not found/i.test(msg)) {
      return '请求的数据不存在，可能已被移除。'
    }
    if (/50[0-9]|server|internal|bad gateway|service unavailable/i.test(msg)) {
      return '服务暂时不可用，请稍后再试。'
    }
    if (/401|unauthorized|403|forbidden/i.test(msg)) {
      return '没有访问权限，请重新登录后重试。'
    }
    return msg.trim() || '数据加载出错，请稍后重试。'
  }
  if (typeof err === 'string') {
    console.error('[app-error]', err)
    return err.trim() || '数据加载出错，请稍后重试。'
  }
  console.error('[app-error]', err)
  return '数据加载出错，请稍后重试。'
}
