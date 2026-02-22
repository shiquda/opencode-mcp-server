import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// 默认配置（从环境变量读取）
const DEFAULT_CONFIG = {
  url: process.env.OPENCODE_URL || 'http://localhost:8848',
  username: process.env.OPENCODE_USERNAME || '',
  password: process.env.OPENCODE_PASSWORD || '',
  token: process.env.OPENCODE_TOKEN || '',
  authType: process.env.OPENCODE_AUTH_TYPE || 'basic', // OpenCode 使用 basic auth
};

const PORT = parseInt(process.env.PORT || '3000');

// 认证头生成函数
function getAuthHeader(config: typeof DEFAULT_CONFIG): Record<string, string> {
  const headers: Record<string, string> = {};
  
  switch (config.authType) {
    case 'bearer':
      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      } else if (config.password) {
        headers['Authorization'] = `Bearer ${config.password}`;
      }
      break;
    case 'basic':
      // OpenCode 使用 basic auth，用户名是 "opencode"，密码是设置的密码
      const user = config.username || 'opencode';
      const pass = config.password;
      if (pass) {
        const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
      break;
    case 'none':
    default:
      break;
  }
  
  return headers;
}

// 定义工具
const TOOLS: Tool[] = [
  {
    name: 'opencode_chat',
    description: '发送消息给 OpenCode Agent 执行编程任务。会先创建会话（如果没有session_id），然后发送消息。',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '要发送给 OpenCode 的消息/任务描述（必需）',
        },
        session_id: {
          type: 'string',
          description: '可选的会话 ID。如果不提供，会自动创建新会话',
        },
        directory: {
          type: 'string',
          description: '工作目录（可选，用于指定项目路径）',
        },
        url: {
          type: 'string',
          description: `OpenCode 服务器地址（可选，默认: ${DEFAULT_CONFIG.url}）`,
        },
        username: {
          type: 'string',
          description: '用户名（可选，默认: opencode）',
        },
        password: {
          type: 'string',
          description: '密码（可选，从环境变量读取）',
        },
        auth_type: {
          type: 'string',
          description: '认证类型: basic | bearer | none（可选，默认: basic）',
          enum: ['basic', 'bearer', 'none'],
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'opencode_create_session',
    description: '创建新的 OpenCode 会话',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '会话标题（可选）',
        },
        directory: {
          type: 'string',
          description: '工作目录（可选）',
        },
        url: {
          type: 'string',
          description: `OpenCode 服务器地址（可选，默认: ${DEFAULT_CONFIG.url}）`,
        },
        username: {
          type: 'string',
          description: '用户名（可选）',
        },
        password: {
          type: 'string',
          description: '密码（可选）',
        },
        auth_type: {
          type: 'string',
          description: '认证类型（可选，默认: basic）',
          enum: ['basic', 'bearer', 'none'],
        },
      },
    },
  },
  {
    name: 'opencode_list_sessions',
    description: '列出所有 OpenCode 会话',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: '按目录过滤（可选）',
        },
        limit: {
          type: 'number',
          description: '最大返回数量（可选）',
        },
        url: {
          type: 'string',
          description: `OpenCode 服务器地址（可选，默认: ${DEFAULT_CONFIG.url}）`,
        },
        username: {
          type: 'string',
          description: '用户名（可选）',
        },
        password: {
          type: 'string',
          description: '密码（可选）',
        },
        auth_type: {
          type: 'string',
          description: '认证类型（可选，默认: basic）',
          enum: ['basic', 'bearer', 'none'],
        },
      },
    },
  },
  {
    name: 'opencode_get_session',
    description: '获取特定会话的详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '会话 ID（必需，格式: ses_xxx）',
        },
        url: {
          type: 'string',
          description: `OpenCode 服务器地址（可选，默认: ${DEFAULT_CONFIG.url}）`,
        },
        username: {
          type: 'string',
          description: '用户名（可选）',
        },
        password: {
          type: 'string',
          description: '密码（可选）',
        },
        auth_type: {
          type: 'string',
          description: '认证类型（可选，默认: basic）',
          enum: ['basic', 'bearer', 'none'],
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'opencode_get_messages',
    description: '获取会话的消息列表',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '会话 ID（必需）',
        },
        limit: {
          type: 'number',
          description: '最大消息数量（可选）',
        },
        url: {
          type: 'string',
          description: `OpenCode 服务器地址（可选，默认: ${DEFAULT_CONFIG.url}）`,
        },
        username: {
          type: 'string',
          description: '用户名（可选）',
        },
        password: {
          type: 'string',
          description: '密码（可选）',
        },
        auth_type: {
          type: 'string',
          description: '认证类型（可选，默认: basic）',
          enum: ['basic', 'bearer', 'none'],
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'opencode_check_health',
    description: '检查 OpenCode 服务器连接状态',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: `OpenCode 服务器地址（可选，默认: ${DEFAULT_CONFIG.url}）`,
        },
        username: {
          type: 'string',
          description: '用户名（可选）',
        },
        password: {
          type: 'string',
          description: '密码（可选）',
        },
        auth_type: {
          type: 'string',
          description: '认证类型（可选，默认: basic）',
          enum: ['basic', 'bearer', 'none'],
        },
      },
    },
  },
];

// 创建 MCP Server
const server = new Server(
  {
    name: 'opencode-remote-mcp',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 合并配置：参数 > 环境变量 > 默认值
    const config = {
      url: (args?.url as string) || DEFAULT_CONFIG.url,
      username: (args?.username as string) || DEFAULT_CONFIG.username,
      password: (args?.password as string) || DEFAULT_CONFIG.password,
      token: (args?.password as string) || DEFAULT_CONFIG.token,
      authType: ((args?.auth_type as string) || DEFAULT_CONFIG.authType).toLowerCase(),
    };

    // 确保 URL 格式正确
    const baseUrl = config.url.replace(/\/$/, '');
    const authHeaders = getAuthHeader(config);

    switch (name) {
      case 'opencode_chat': {
        const { message, session_id, directory } = args as { 
          message: string; 
          session_id?: string;
          directory?: string;
        };
        
        let targetSessionId = session_id;
        
        // 如果没有提供 session_id，先创建新会话
        if (!targetSessionId) {
          const queryParams = new URLSearchParams();
          if (directory) queryParams.append('directory', directory);
          
          const createResponse = await fetch(`${baseUrl}/session?${queryParams}`, {
            method: 'POST',
            headers: {
              ...authHeaders,
            },
          });

          if (!createResponse.ok) {
            const error = await createResponse.text();
            throw new Error(`创建会话失败: ${createResponse.status} - ${error}`);
          }

          const sessionData = await createResponse.json() as { id: string };
          targetSessionId = sessionData.id;
        }
        
        // 发送消息到会话
        const queryParams = new URLSearchParams();
        if (directory) queryParams.append('directory', directory);
        
        const response = await fetch(`${baseUrl}/session/${targetSessionId}/message?${queryParams}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            parts: [{ type: 'text', text: message }],
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`发送消息失败: ${response.status} - ${error}`);
        }

        const data = await response.json() as { info?: { id: string }; parts?: any[] };
        return {
          content: [
            {
              type: 'text',
              text: `✅ 消息已发送！\n会话 ID: ${targetSessionId}\n消息 ID: ${data.info?.id || 'unknown'}\n\n响应:\n${JSON.stringify(data, null, 2)}`,
            },
          ],
        };
      }

      case 'opencode_create_session': {
        const { title, directory } = args as { title?: string; directory?: string };
        
        const queryParams = new URLSearchParams();
        if (directory) queryParams.append('directory', directory);
        
        const body = title ? JSON.stringify({ title }) : undefined;
        const headers = body 
          ? { 'Content-Type': 'application/json', ...authHeaders }
          : authHeaders;
        
        const response = await fetch(`${baseUrl}/session?${queryParams}`, {
          method: 'POST',
          headers,
          body,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`创建会话失败: ${response.status} - ${error}`);
        }

        const data = await response.json() as { id: string; title?: string };
        return {
          content: [
            {
              type: 'text',
              text: `✅ 会话创建成功！\n会话 ID: ${data.id}\n标题: ${data.title || '未命名'}`,
            },
          ],
        };
      }

      case 'opencode_list_sessions': {
        const { directory, limit } = args as { directory?: string; limit?: number };
        
        const queryParams = new URLSearchParams();
        if (directory) queryParams.append('directory', directory);
        if (limit) queryParams.append('limit', limit.toString());
        
        const response = await fetch(`${baseUrl}/session?${queryParams}`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`获取会话列表失败: ${response.status}`);
        }

        const sessions = await response.json() as Array<{ id: string; title?: string; time?: { created: number } }>;
        
        if (sessions.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无会话' }],
          };
        }

        const sessionList = sessions.map((s, i) => 
          `${i + 1}. ${s.title || '未命名'}\n   ID: ${s.id}\n   创建: ${s.time?.created ? new Date(s.time.created).toLocaleString() : 'unknown'}`
        ).join('\n\n');

        return {
          content: [{ type: 'text', text: `📋 会话列表 (${sessions.length}):\n\n${sessionList}` }],
        };
      }

      case 'opencode_get_session': {
        const { session_id } = args as { session_id: string };
        
        const response = await fetch(`${baseUrl}/session/${session_id}`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`获取会话失败: ${response.status}`);
        }

        const data = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `📄 会话详情:\n${JSON.stringify(data, null, 2)}`,
            },
          ],
        };
      }

      case 'opencode_get_messages': {
        const { session_id, limit } = args as { session_id: string; limit?: number };
        
        const queryParams = new URLSearchParams();
        if (limit) queryParams.append('limit', limit.toString());
        
        const response = await fetch(`${baseUrl}/session/${session_id}/message?${queryParams}`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`获取消息失败: ${response.status}`);
        }

        const messages = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `💬 消息列表:\n${JSON.stringify(messages, null, 2)}`,
            },
          ],
        };
      }

      case 'opencode_check_health': {
        const response = await fetch(`${baseUrl}/global/health`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`健康检查失败: ${response.status}`);
        }

        const data = await response.json() as { healthy: boolean; version: string };
        return {
          content: [
            {
              type: 'text',
              text: `✅ OpenCode 服务器运行正常\n版本: ${data.version}\n健康: ${data.healthy ? '是' : '否'}\n地址: ${baseUrl}`,
            },
          ],
        };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `❌ 错误: ${errorMessage}` }],
      isError: true,
    };
  }
});

// 启动模式选择
const mode = process.argv[2] || 'stdio';

if (mode === 'stdio') {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenCode MCP Server v2.0.0 running on stdio');
  console.error(`Default endpoint: ${DEFAULT_CONFIG.url}`);
} else if (mode === 'sse') {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  let transport: SSEServerTransport | null = null;

  app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport('/messages', res);
    await server.connect(transport);
    console.log('Client connected via SSE');
  });

  app.post('/messages', async (req, res) => {
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).json({ error: 'No active SSE connection' });
    }
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      version: '2.0.0',
      defaultEndpoint: DEFAULT_CONFIG.url,
      authType: DEFAULT_CONFIG.authType,
    });
  });

  app.listen(PORT, () => {
    console.log(`OpenCode MCP Server v2.0.0 running on http://localhost:${PORT}`);
    console.log(`Default OpenCode endpoint: ${DEFAULT_CONFIG.url}`);
    console.log(`Default auth type: ${DEFAULT_CONFIG.authType}`);
    console.log('');
    console.log('可用工具:');
    console.log('  - opencode_chat: 发送编程任务（自动创建会话）');
    console.log('  - opencode_create_session: 创建会话');
    console.log('  - opencode_list_sessions: 列会话');
    console.log('  - opencode_get_session: 获取会话详情');
    console.log('  - opencode_get_messages: 获取会话消息');
    console.log('  - opencode_check_health: 健康检查');
  });
} else {
  console.error('Usage: node index.js [stdio|sse]');
  process.exit(1);
}
