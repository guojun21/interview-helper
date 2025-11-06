#!/bin/bash

echo "🚀 启动 DialogHelper Electron 应用..."

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
fi

# 启动开发模式
echo "🔧 启动开发服务器..."
npm run electron:dev

