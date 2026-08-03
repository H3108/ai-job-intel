// backend/src/rate-limiter.js — 采集限速器（§16 合规：严格限速 + 随机抖动）
// Boss 反爬极强（§3.1），必须限速 5–10s + 抖动，避免触发风控/封号。
// 爬虫每次请求前 await limiter.wait()。

export class RateLimiter {
  constructor({ min = 5000, max = 10000, backoffBase = 20000 } = {}) {
    this.min = min
    this.max = max
    this.backoffBase = backoffBase
  }

  // 正常限速：随机 [min, max] 毫秒。
  async wait() {
    const delay = this.min + Math.random() * (this.max - this.min)
    await new Promise((r) => setTimeout(r, delay))
    return Math.round(delay)
  }

  // 风控退避：指数退避，round 从 0 开始。用于 §9.5 风控触发后的等待。
  async backoff(round = 0) {
    const delay = this.backoffBase * Math.pow(2, Math.min(round, 5))
    await new Promise((r) => setTimeout(r, delay))
    return delay
  }
}
