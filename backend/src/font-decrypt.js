// backend/src/font-decrypt.js — Boss 直聘薪资字体解密（§9.x 反爬）
//
// Boss 把搜索卡片上的薪资数字用自定义字体（font-family: kanzhun-mix / kanzhun-Regular）
// 渲染：数字被替换成「私有区(PUA, U+E000–U+F8FF)」码点，肉眼看到的是数字，DOM 文本里
// 拿到的是 PUA 乱码。要还原，必须下载该字体并解析「PUA 码点 → 真实数字」的映射。
//
// 解密策略（两套，自动择优）：
//   A) 轮廓对比法（主用，最稳）：把每个加密字形栅格化成小位图，与参考字体(Arial 等)的
//      0–9 位图逐一比对、取最相似者。不依赖 Boss 字体内部 glyph 顺序，顺序怎么打乱都能解。
//   B) 字形顺序法（兜底）：假设 Boss 字体 glyph 顺序即 0–9（社区"粗暴映射"法）。仅在找不到
//      参考字体时启用，置信度中等，需用户肉眼复核。
//
// 依赖：fontkit（读 woff/woff2/ttf）。本模块不负责下载字体（下载在 crawler 侧用 fetch 完成）。

import { create } from 'fontkit'
import { readFileSync } from 'node:fs'

const PUA_LO = 0xe000
const PUA_HI = 0xe0ff // Boss 薪资/图标字体均用低区 PUA；收窄扫描上限以加速（高区码点本就不参与解密）
const GRID = 36 // 默认光栅化网格边长（实测 36 能给出干净的 0-9 置换；prepareDecoder 会多分辨率自寻最优）
// 候选分辨率：不同 Boss 字体在不同分辨率下对近似字形(6/8、7/8)的区分度不同，
// 自动遍历挑「缺失+重复」最少的映射，避免写死单一分辨率导致换字体即失效。
const GRID_CANDIDATES = [36, 32, 40, 28, 44, 24, 20]

// ── 路径扁平化（贝塞尔 → 线段）──────────────────────────────────────────────
// fontkit 的 path.commands 格式为 { command, args }：
//   moveTo:            args=[x,y]
//   lineTo:            args=[x,y]
//   quadraticCurveTo:  args=[cpx,cpy,x,y]
//   cubicCurveTo:      args=[cp1x,cp1y,cp2x,cp2y,x,y]
//   closePath:         args=[]
function flattenPath(path) {
  const segs = []
  let cur = null
  let subStart = null
  for (const c of path.commands) {
    const cmd = c.command
    if (cmd === 'moveTo') {
      cur = [c.args[0], c.args[1]]
      subStart = cur
    } else if (cmd === 'lineTo') {
      if (cur) segs.push([cur, [c.args[0], c.args[1]]])
      cur = [c.args[0], c.args[1]]
    } else if (cmd === 'cubicCurveTo' || cmd === 'cubicTo') {
      const p = cubic(cur, [c.args[0], c.args[1]], [c.args[2], c.args[3]], [c.args[4], c.args[5]], 10)
      for (const q of p) {
        segs.push([cur, q])
        cur = q
      }
    } else if (cmd === 'quadraticCurveTo' || cmd === 'quadTo') {
      const p = quad(cur, [c.args[0], c.args[1]], [c.args[2], c.args[3]], 10)
      for (const q of p) {
        segs.push([cur, q])
        cur = q
      }
    } else if (cmd === 'closePath') {
      if (cur && subStart) segs.push([cur, subStart])
      cur = subStart
    }
  }
  return segs
}

function cubic(p0, p1, p2, p3, n) {
  const out = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const mt = 1 - t
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0]
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
    out.push([x, y])
  }
  return out
}

function quad(p0, p1, p2, n) {
  const out = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const mt = 1 - t
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
    out.push([x, y])
  }
  return out
}

// 偶数规则射线法判断点是否在多边形内（多轮廓/带孔字形通用）
function pointInPoly(px, py, segs) {
  let cross = 0
  for (const [[x0, y0], [x1, y1]] of segs) {
    if ((y0 > py) !== (y1 > py)) {
      const xint = x0 + ((py - y0) / (y1 - y0)) * (x1 - x0)
      if (xint > px) cross++
    }
  }
  return cross % 2 === 1
}

// 把字形路径栅格化成 GRID×GRID 的 0/1 位图（保持长宽比、居中）
function rasterize(path, grid = GRID) {
  const segs = flattenPath(path)
  // 计算 bbox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [[x0, y0], [x1, y1]] of segs) {
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const bits = new Uint8Array(GRID * GRID)
  if (!isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) return bits
  const w = maxX - minX
  const h = maxY - minY
  const scale = (GRID - 2) / Math.max(w, h)
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const fx = minX + ((col + 0.5) / GRID) * w
      const fy = maxY - ((row + 0.5) / GRID) * h
      if (pointInPoly(fx, fy, segs)) bits[row * GRID + col] = 1
    }
  }
  return bits
}

function hamming(a, b) {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

function isEncryptedChar(cp) {
  return cp >= PUA_LO && cp <= PUA_HI
}

// 暴露给自检用：栅格化任意字形路径
export function rasterizePath(path) {
  return rasterize(path)
}

// 参考字体：优先系统常见字体
const REF_PATHS = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
]
export function findReferenceFont() {
  for (const p of REF_PATHS) {
    try {
      readFileSync(p)
      return p
    } catch {}
  }
  return null
}

// 返回所有可用的参考字体路径（多字体投票，降低单字体对 7/8 等近似字形的偏置）
export function findReferenceFonts() {
  const out = []
  for (const p of REF_PATHS) {
    try {
      readFileSync(p)
      out.push(p)
    } catch {}
  }
  return out
}

// 收集字体中真实存在的 PUA 字形（仅扫描一次，跨分辨率复用，避免每分辨率重复 glyphForCodePoint）
function collectGlyphs(font) {
  const out = []
  for (let cp = PUA_LO; cp <= PUA_HI; cp++) {
    const g = font.glyphForCodePoint(cp)
    if (!g || g.id === 0) continue // .notdef 跳过
    if (!g.path || !g.path.commands || g.path.commands.length === 0) continue
    out.push({ cp, g, path: g.path })
  }
  return out
}

// 在给定分辨率 grid 下，用参考字体集合为已收集的字形构建 PUA→数字 映射。
function buildMapFromGlyphs(font, glyphs, refs, grid) {
  // refBitmaps[r][d] = 参考字体 r 中数字 d 的光栅位图
  const refBitmaps = []
  for (const rp of refs) {
    try {
      const ref = create(readFileSync(rp))
      const bm = []
      for (let d = 0; d <= 9; d++) bm[d] = rasterize(ref.glyphForCodePoint(0x30 + d).path, grid)
      refBitmaps.push(bm)
    } catch {}
  }
  const map = new Map()
  const mapDist = new Map()
  for (const { cp, g, path } of glyphs) {
    let digit
    let bestDist
    if (refs.length) {
      const bits = rasterize(path, grid)
      // 对每个数字 d，求「跨所有参考字体」汉明距离之和，取最小者（投票降偏置）
      let best = -1
      let bestTotal = Infinity
      for (let d = 0; d <= 9; d++) {
        let total = 0
        for (const bm of refBitmaps) total += hamming(bits, bm[d])
        if (total < bestTotal) {
          bestTotal = total
          best = d
        }
      }
      digit = best
      bestDist = bestTotal
    } else {
      // 顺序法：假设 glyph id 2..11 对应 0..9
      if (g.id >= 2 && g.id <= 11) {
        digit = g.id - 2
        bestDist = 0
      } else continue
    }
    map.set(cp, digit)
    mapDist.set(cp, bestDist)
  }
  return { map, mapDist }
}

// 兼容旧调用（selfTest）：从 buffer 直接建映射
export function buildMapFromFont(fontBuffer, refFontPaths, grid = GRID) {
  const font = create(fontBuffer)
  const refs = Array.isArray(refFontPaths) ? refFontPaths : refFontPaths ? [refFontPaths] : []
  const method = refs.length ? 'outline' : 'order'
  const glyphs = collectGlyphs(font)
  const { map, mapDist } = buildMapFromGlyphs(font, glyphs, refs, grid)
  return { map, method, font, mapDist }
}

// 映射质量评分：缺失数字数 + 重复映射数（越低越干净；0 表示完美的 0-9 置换）
function scoreMap(map) {
  const seen = new Set()
  let dup = 0
  for (const d of map.values()) {
    if (seen.has(d)) dup++
    seen.add(d)
  }
  const missing = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !seen.has(d)).length
  return missing + dup
}

// 用映射解码一段薪资文本；非 PUA 字符原样保留（K / - / 万 / 千 / · 等）
export function decodeSalary(text, map) {
  if (!text) return ''
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (isEncryptedChar(cp) && map.has(cp)) out += String(map.get(cp))
    else out += ch
  }
  return out
}

// 一站式：给定字体 buffer（+可选参考字体数组）返回解码函数与元信息。
// 内部自动遍历多个光栅化分辨率，挑选「映射最干净（缺失+重复最少）」的一版，
// 从而对任意 Boss 字体都能自适应选出可正确还原 0-9 的分辨率。
export function prepareDecoder(fontBuffer, refFontPaths = findReferenceFonts(), gridCandidates = GRID_CANDIDATES) {
  const refs = Array.isArray(refFontPaths) ? refFontPaths : refFontPaths ? [refFontPaths] : []
  const font = create(fontBuffer)
  const glyphs = collectGlyphs(font) // 字形仅扫描一次，跨分辨率复用
  let best = null
  let bestScore = Infinity
  let bestGrid = GRID
  for (const g of gridCandidates) {
    const { map, mapDist } = buildMapFromGlyphs(font, glyphs, refs, g)
    const sc = scoreMap(map)
    // 评分相同则偏好：覆盖数字更多 > 分辨率更接近默认 36
    const cover = new Set(map.values()).size
    const combined = sc * 100000 - cover * 1000 + Math.abs(g - 36)
    if (combined < bestScore) {
      bestScore = combined
      best = { map, mapDist }
      bestGrid = g
    }
    if (sc === 0) break // 已得干净置换，立即停止（常见路径只跑 1 个分辨率）
  }
  const { map, mapDist } = best
  const method = refs.length ? 'outline' : 'order'
  // 把「最佳汉明距离」转成 0~1 置信度：距离越小越可信（GRID×GRID 为满格差异）
  const distToConf = (dist) => {
    const c = 1 - dist / (bestGrid * bestGrid)
    return Math.max(0, Math.min(1, c))
  }
  return {
    method,
    hasReference: refs.length > 0,
    mapSize: map.size,
    grid: bestGrid,
    map,
    mapDist,
    decode: (text) => decodeSalary(text, map),
    // 解码文本的置信度：取所有加密字符置信度的均值（无加密字符则返回 null）
    decodeConfidence: (text) => {
      if (!text) return null
      let sum = 0
      let n = 0
      for (const ch of text) {
        const cp = ch.codePointAt(0)
        if (isEncryptedChar(cp) && mapDist.has(cp)) {
          sum += distToConf(mapDist.get(cp))
          n++
        }
      }
      return n ? sum / n : null
    }
  }
}

// 自检（轻量）：参考字体自身数字应原样通过。证明非 PUA 直通逻辑无误。
export function selfTest(refFontPath = findReferenceFont()) {
  if (!refFontPath) return { ok: false, reason: 'no reference font' }
  const ref = readFileSync(refFontPath)
  const { map, method } = buildMapFromFont(ref, [refFontPath])
  const sample = '0123456789'
  const decoded = decodeSalary(sample, map)
  const ok = decoded === sample
  return { ok, method, input: sample, decoded, mapSize: map.size }
}

// 自检（核心）：把参考字体的数字字形当成"加密字形"（Boss 用的就是真实数字形状，
// 只是码点被打乱到 PUA），逐个比对，应各自映射回自身。证明栅格化+轮廓比对正确。
export function selfTestCore(refFontPath = findReferenceFont()) {
  if (!refFontPath) return { ok: false, reason: 'no reference font' }
  const ref = create(readFileSync(refFontPath))
  const refBitmaps = []
  for (let d = 0; d <= 9; d++) refBitmaps[d] = rasterize(ref.glyphForCodePoint(0x30 + d).path)
  const mismatches = []
  for (let d = 0; d <= 9; d++) {
    const enc = rasterize(ref.glyphForCodePoint(0x30 + d).path) // 加密字形 == 同数字形状
    let best = -1
    let bestD = Infinity
    for (let k = 0; k <= 9; k++) {
      const dist = hamming(enc, refBitmaps[k])
      if (dist < bestD) {
        bestD = dist
        best = k
      }
    }
    if (best !== d) mismatches.push({ encrypted: d, matched: best, dist: bestD })
  }
  return { ok: mismatches.length === 0, mismatches }
}
