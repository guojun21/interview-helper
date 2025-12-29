#!/bin/bash

PORT=5173

echo "🔍 检查端口 $PORT 是否被占用..."

# 查找占用端口的进程
PIDS=$(lsof -ti :$PORT)

if [ -n "$PIDS" ]; then
  echo "🔪 发现占用端口 $PORT 的进程，正在杀死..."
  for PID in $PIDS; do
    echo "  - 杀死进程 PID: $PID"
    kill -9 $PID
  done
  echo "✅ 已杀死所有占用进程"
  echo "⏳ 等待端口释放..."
  sleep 2
else
  echo "✅ 端口 $PORT 未被占用"
fi

# 再次检查
PIDS=$(lsof -ti :$PORT)
if [ -n "$PIDS" ]; then
  echo "⚠️ 端口 $PORT 仍被占用，但继续尝试启动..."
else
  echo "✅ 端口 $PORT 已释放"
fi

echo "🚀 启动 Electron 开发环境..."
npm run electron:dev
