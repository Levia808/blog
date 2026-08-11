#!/usr/bin/env bash
# Threads 浏览器登录一键启动器 (Linux / macOS)
# 启动 ① 带调试端口的 Chrome (独立配置目录, 不影响日常浏览器) ② Cookie 桥服务
# 用法: 双击运行, 或 ./chrome-debug.sh
# 之后在后台「平台管理 → 浏览器登录」点击按钮即可完成登录取 Cookie

set -e

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="$HOME/.threads-debug-chrome"

# 找 Chrome
CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  if [ -x "$c" ]; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "未找到 Chrome/Chromium, 请先安装后再运行。"
  exit 1
fi

echo "启动调试 Chrome (端口 9222)…"
"$CHROME" --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run --no-default-browser-check \
  --no-pings --disable-features=TranslateUI \
  "https://www.threads.com/" &
CHROME_PID=$!

sleep 2
echo "启动 Cookie 桥 (端口 8788)…"
python3 "$BRIDGE_DIR/bridge.py" &
BRIDGE_PID=$!

echo ""
echo "✓ 已就绪: 在弹出的 Chrome 中登录 Threads 后, 回后台点「浏览器登录」即可自动获取 Cookie"
echo "  关闭: 按 Ctrl+C (或关闭此窗口)"

trap 'kill $CHROME_PID $BRIDGE_PID 2>/dev/null || true' EXIT INT TERM
wait
