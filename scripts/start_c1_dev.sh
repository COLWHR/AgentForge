#!/bin/bash

# AgentForge Phase C1 联调环境启动脚本 (macOS 兼容版)
# 自动打开三个终端/窗格来运行基础设施、后端和前端

echo "🚀 正在启动 AgentForge Phase C1 联调环境..."

# 确保在项目根目录运行
PROJECT_ROOT=$(pwd)
if [ ! -f "$PROJECT_ROOT/backend/main.py" ]; then
    echo "❌ 错误: 请在项目根目录 (AgentForge) 执行此脚本"
    exit 1
fi

echo "🧹 正在清理可能残留的旧进程..."

# 清理后端进程 (占用 8000 端口)
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "   发现占用 8000 端口的进程，正在杀死..."
    kill -9 $(lsof -Pi :8000 -sTCP:LISTEN -t)
fi

# 清理前端进程 (占用 5173 端口)
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
    echo "   发现占用 5173 端口的进程，正在杀死..."
    kill -9 $(lsof -Pi :5173 -sTCP:LISTEN -t)
fi

# 停止可能正在运行的 docker 容器 (Redis)
echo "   正在清理 Redis 容器..."
docker-compose down 2>/dev/null

echo "✅ 清理完成！"

echo "⚠️ 尝试使用 osascript 打开新的终端窗口 (仅限 macOS)"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # 1. 启动基础设施 (Redis)
    echo "📦 启动 Redis..."
    osascript -e 'tell app "Terminal"
        do script "cd '$PROJECT_ROOT' && docker-compose up redis"
    end tell'
    
    sleep 2 # 等待 Redis 启动
    
    # 2. 启动后端 (带自动注入 Dev Token)
    echo "⚙️ 启动 Backend..."
    osascript -e 'tell app "Terminal"
        do script "cd '$PROJECT_ROOT' && export PYTHONPATH='$PROJECT_ROOT' && uvicorn backend.main:app --reload --port 8000"
    end tell'
    
    # 3. 启动前端
    echo "🎨 启动 Frontend..."
    osascript -e 'tell app "Terminal"
        do script "cd '$PROJECT_ROOT'/frontend && npm run dev"
    end tell'
    
    echo "✅ 启动完成！请查看新打开的终端窗口。"
    echo "🌐 前端访问地址: http://localhost:5173"
    exit 0
else
    echo "❌ 错误: 当前操作系统不支持 osascript。请手动开启终端运行。"
    exit 1
fi
