#!/usr/bin/env bash
# 启动一个"调试模式"的真实 Chrome（独立 profile + 远程调试端口 9222），供 crawler --cdp 连接。
# 真实 Chrome 指纹合法、由你完成人机验证，Boss 几乎不会踢——这是绕开反爬的推荐方式。
set -e

PROFILE="$HOME/boss_real_profile"                       # 独立 profile，不影响你日常用的 Chrome
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "未找到 Google Chrome，请先安装：https://www.google.com/chrome/"
  exit 1
fi

# 若调试端口已被占用（Chrome 已在跑），直接提示，不重复启动
if curl -s http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
  echo "调试端口 9222 已在监听（Chrome 可能已启动）。直接运行： npm run crawl -- --cdp"
  exit 0
fi

# 后台启动真实 Chrome，打开 Boss 登录页
"$CHROME" --remote-debugging-port=9222 --user-data-dir="$PROFILE" --no-first-run \
  "https://www.zhipin.com/web/geek/job?query=AI%20Agent%E5%89%8D%E7%AB%AF&city=%E6%B7%B1%E5%9C%B3" >/dev/null 2>&1 &

echo "已在后台启动真实 Chrome（调试端口 9222，独立 profile：$PROFILE）"
echo "请在打开的 Chrome 里登录 Boss 账号（完成任何人机验证）。"
echo "登录就绪后，另开一个终端运行： npm run crawl -- --cdp"
