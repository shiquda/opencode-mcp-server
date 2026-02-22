#!/bin/bash

# OpenCode MCP Server 安装脚本

echo "🚀 安装 OpenCode MCP Server..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 需要 Node.js 18+"
    echo "请安装 Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ 错误: Node.js 版本需要 18+，当前版本: $(node --version)"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 安装依赖
echo "📦 安装依赖..."
npm install

# 构建
echo "🔨 构建项目..."
npm run build

# 复制环境变量文件
if [ ! -f .env ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，配置你的 OpenCode 服务器地址和密码"
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "使用方法:"
echo "  1. 编辑 .env 文件，配置 OpenCode 服务器信息"
echo "  2. 运行 SSE 模式（推荐，用于 OpenClaw）:"
echo "     npm start"
echo ""
echo "  3. 或运行 Stdio 模式（用于 Claude Desktop）:"
echo "     node dist/index.js stdio"
echo ""
echo "MCP 配置示例:"
echo '  {'
echo '    "mcpServers": {'
echo '      "opencode-remote": {'
echo '        "type": "remote",'
echo '        "url": "http://localhost:3000/sse",'
echo '        "enabled": true'
echo '      }'
echo '    }'
echo '  }'
echo ""
