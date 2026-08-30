#!/usr/bin/env bash
# crawl-run.sh —— Boss 求职情报系统 采集+分析 一键编排（供手动或 launchd 定时调用）
# 仅在本机运行（需要浏览器 + Boss 登录态 + backend/.env 里的智谱 key）。
#
# 用法：
#   ROLES="AI Agent 前端,AI 产品经理,AI 算法工程师" CITIES="深圳,广州,惠州,东莞" ./scripts/crawl-run.sh
#   ./scripts/crawl-run.sh --font-dump          # 抓字体做离线诊断（攻击 36% 薪资解码率）
#   ./scripts/crawl-run.sh --launch             # 用 Playwright Chromium（无调试 Chrome 时兜底）
#   ./scripts/crawl-run.sh --manual             # 手动翻页收割（被风控横跳时用）
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROLES="${ROLES:-AI Agent 前端,AI 产品经理,AI 算法工程师}"
CITIES="${CITIES:-深圳,广州,惠州,东莞}"
NODE_VER="${NODE_VER:-22}"

LOG_DIR="$PROJECT_DIR/data/logs"; mkdir -p "$LOG_DIR"
LOCK="$PROJECT_DIR/data/crawl.lock"
PIDF="$PROJECT_DIR/data/crawl.pid"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/crawl-$TS.log"

# 原子锁：macOS 默认无 flock，用 mkdir（POSIX 原子）—— 防止 launchd 与手动并发
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "[$(date)] 已有 crawl 运行（lock=$LOCK），本次跳过" | tee -a "$LOG_DIR/crawl-latest.log"
  exit 0
fi
# 记录本脚本 PID（detached spawn 后它就是进程组组长），供停止接口按进程组杀整条链。
echo $$ > "$PIDF"
cleanup() {
  # 终止整个进程组（脚本自身 + node crawler 子树），避免孤儿进程继续占用真机资源。
  kill -TERM -$$ >/dev/null 2>&1 || true
  rm -f "$PIDF"
  rmdir "$LOCK" >/dev/null 2>&1 || true
}
trap cleanup EXIT TERM INT

# 激活 Node 22（crawler / node:sqlite 强依赖）
# 策略：优先用 PATH 里已满足版本的 node；其次 nvm；再次常见绝对路径兜底。
# 避免在非交互环境（launchd / API 拉起）硬依赖 `nvm use` 失败而整轮退出。
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  nv="$(node --version 2>/dev/null || true)"
  case "$nv" in
    v2[2-9]*|v[3-9]*) NODE_OK=1 ;;
  esac
fi
if [ "$NODE_OK" -ne 1 ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    if command -v nvm >/dev/null 2>&1 && nvm use "$NODE_VER" >/dev/null 2>&1; then
      nb="$(nvm which "$NODE_VER" 2>/dev/null || true)"
      [ -n "$nb" ] && export PATH="$(dirname "$nb"):$PATH"
      NODE_OK=1
    fi
  fi
fi
if [ "$NODE_OK" -ne 1 ]; then
  for d in "$HOME/.nvm/versions/node/v22.23.1/bin" "$HOME/.nvm/versions/node/v22.23.1/bin" "$HOME/.workbuddy/binaries/node/versions/22.22.2/bin" "/usr/local/bin" "/opt/homebrew/bin"; do
    if [ -x "$d/node" ] && "$d/node" --version 2>/dev/null | grep -qE '^v(2[2-9]|[3-9])'; then
      export PATH="$d:$PATH"; NODE_OK=1; break
    fi
  done
fi
if [ "$NODE_OK" -ne 1 ]; then
  echo "[$(date)] 未找到 Node 22+（当前 node=$(command -v node >/dev/null 2>&1 && node --version 2>/dev/null || echo none)）" | tee -a "$LOG"
  exit 1
fi
echo "[$(date)] node=$(command -v node) $(node --version 2>/dev/null)" | tee -a "$LOG"

echo "===== [$(date)] crawl-run 开始 =====" | tee -a "$LOG"
echo "roles=$ROLES cities=$CITIES node=$NODE_VER" | tee -a "$LOG"

cd "$PROJECT_DIR"
# crawler 内部已自动串联 analyze-all -> rebuild-skills -> report（除非 --no-pipeline）
ARGS=(--roles "$ROLES" --cities "$CITIES" "$@")
node backend/src/crawler.js "${ARGS[@]}" 2>&1 | tee -a "$LOG"

echo "===== [$(date)] crawler 结束；字体离线诊断 =====" | tee -a "$LOG"
shopt -s nullglob
for f in data/boss_fonts/*.{woff,woff2,ttf,otf}; do
  echo "--- font-test: $f ---" | tee -a "$LOG"
  node backend/src/analyze.js --font-test "$f" 2>&1 | tee -a "$LOG"
done
echo "===== [$(date)] crawl-run 全部结束 =====" | tee -a "$LOG"
