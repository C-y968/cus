#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
if ! node scripts/service.mjs stop; then
  echo '未停止，请查看上方提示。按任意键关闭。'
  read -k 1
  exit 1
fi
