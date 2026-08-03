// backend/src/migration-gate.js — 启动迁移单实例门控（审计 Issue 3 修复）
//
// 背景：P001 跑多个 backend 实例（3001 dev / 3002 preview）共连 data/jobs.db，
// 启动时都跑 ensureNormalizedSchema / backfillNormalized 等「写迁移」，同时启动会争用
// SQLite 锁 → database is locked 崩溃。
//
// 方案：用 data/.startup-migration.lock 原子锁文件做门控——
//   - 首个用 open(path,'wx') 抢到锁的实例 = primary，跑写迁移，跑完 release（删锁）；
//   - 其余实例抢锁失败 = secondary，轮询等 primary 释放锁后「跳过」写迁移（迁移已由 primary 完成）；
//   - 锁陈旧（持有进程已死 / 超过 staleMs）视为失效，移除后重新抢，避免崩溃遗留死锁。
//
// 幂等性兜底：即使 secondary 在 primary 释放后才启动、重新抢到锁变 primary 跑迁移，
// 迁移函数本身全幂等，不会重复写入或出错。本门控只消除「同时启动」的崩溃窗口。

import { openSync, writeSync, closeSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export function createMigrationGate(dataDir, { timeoutMs = 60000, staleMs = 120000 } = {}) {
  const lockPath = join(dataDir, '.startup-migration.lock')

  const readLock = () => {
    try {
      return JSON.parse(readFileSync(lockPath, 'utf-8'))
    } catch {
      return null
    }
  }

  const pidAlive = (pid) => {
    if (!pid) return false
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  const isStale = (lk) => !lk || !pidAlive(lk.pid) || Date.now() - (lk.startedAt || 0) > staleMs

  const tryAcquire = () => {
    try {
      const fd = openSync(lockPath, 'wx') // 原子独占创建，已存在则抛 EEXIST
      writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
      closeSync(fd)
      return true
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      return false
    }
  }

  const release = () => {
    try {
      unlinkSync(lockPath)
    } catch {
      /* 锁已不在（如被 stale 清理），忽略 */
    }
  }

  // 1) 启动时若遇陈旧锁，先清掉，给本实例一个公平的抢锁机会
  const staleAtStart = isStale(readLock())
  if (staleAtStart) release()

  // 2) 抢锁
  if (tryAcquire()) {
    return {
      isPrimary: true,
      release,
      waitForPrimary() {
        /* primary 自身无需等待 */
      },
    }
  }

  // 3) secondary：轮询等 primary 释放锁（迁移完成）。锁消失 / 变陈旧即放行并跳过迁移。
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const cur = readLock()
    if (!cur || isStale(cur)) {
      if (cur) release() // 陈旧锁顺手清，避免后续实例永久阻塞
      return { isPrimary: false, release: () => {}, waitForPrimary() {} }
    }
    // 200ms 轮询（Atomics.wait 零依赖睡眠）
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
    } catch {
      /* SharedArrayBuffer 不可用时退回极短忙等（不影响正确性） */
    }
  }

  // 4) 超时：primary 可能卡死未释放。清锁避免后续实例死等，本实例按 secondary 跳过迁移。
  release()
  return { isPrimary: false, release: () => {}, waitForPrimary() {} }
}
