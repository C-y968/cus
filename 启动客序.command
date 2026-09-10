#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo '请先安装 Node.js 24。'
  read -k 1
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -d dist ]]; then npm run build; fi
if ! node scripts/service.mjs start; then
  echo '启动未完成，请查看上方提示。按任意键关闭。'
  read -k 1
  exit 1
fi
open http://127.0.0.1:4380
echo '可以关闭此终端窗口。需要停止时双击“停止客序.command”。'
