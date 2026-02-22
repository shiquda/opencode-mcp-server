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

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Default configuration (loaded from environment variables)
const DEFAULT_CONFIG = {
  url: process.env.OPENCODE_URL || 'http://localhost:8848',
  username: process.env.OPENCODE_USERNAME || '',
  password: process.env.OPENCODE_PASSWORD || '',
  token: process.env.OPENCODE_TOKEN || '',
  authType: process.env.OPENCODE_AUTH_TYPE || 'basic', // OpenCode uses basic auth by default
};

const PORT = parseInt(process.env.PORT || '3000');

// Generate authentication headers
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
      // OpenCode uses basic auth, username is "opencode", password is the one set during serve
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

// Define tools
const TOOLS: Tool[] = [
  {
    name: 'opencode_chat',
    description: 'Send a message to OpenCode Agent to execute programming tasks. Creates a new session if no session_id is provided, then sends the message.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message/task description to send to OpenCode (required)',
        },
        session_id: {
          type: 'string',
          description: 'Optional session ID. If not provided, a new session will be created automatically',
        },
        directory: {
          type: 'string',
          description: 'Working directory (optional, for specifying project path)',
        },
        url: {
          type: 'string',
          description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
        },
        username: {
          type: 'string',
          description: 'Username (optional, default: opencode)',
        },
        password: {
          type: 'string',
          description: 'Password (optional, loaded from environment variable)',
        },
        auth_type: {
          type: 'string',
          description: 'Authentication type: basic | bearer | none (optional, default: basic)',
          enum: ['basic', 'bearer', 'none'],
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'opencode_create_session',
    description: 'Create a new OpenCode session',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Session title (optional)',
        },
        directory: {
          type: 'string',
          description: 'Working directory (optional)',
        },
        url: {
          type: 'string',
          description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
        },
        username: {
          type: 'string',
          description: 'Username (optional)',
        },
        password: {
          type: 'string',
          description: 'Password (optional)',
        },
        auth_type: {
          type: 'string',
          description: 'Authentication type (optional, default: basic)',
          enum: ['basic', 'bearer', 'none'],
        },
      },
    },
  },
  {
    name: 'opencode_list_sessions',
    description: 'List all OpenCode sessions',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Filter by directory (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (optional)',
        },
        url: {
          type: 'string',
          description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
        },
        username: {
          type: 'string',
          description: 'Username (optional)',
        },
        password: {
          type: 'string',
          description: 'Password (optional)',
        },
        auth_type: {
          type: 'string',
          description: 'Authentication type (optional, default: basic)',
          enum: ['basic', 'bearer', 'none'],
        },
      },
    },
  },
  {
    name: 'opencode_get_session',
    description: 'Get detailed information about a specific session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID (required, format: ses_xxx)',
        },
        url: {
          type: 'string',
          description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
        },
        username: {
          type: 'string',
          description: 'Username (optional)',
        },
        password: {
          type: 'string',
          description: 'Password (optional)',
        },
        auth_type: {
          type: 'string',
          description: 'Authentication type (optional, default: basic)',
          enum: ['basic', 'bearer', 'none'],
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'opencode_get_messages',
    description: 'Get the message list from a session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID (required)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages (optional)',
        },
        url: {
          type: 'string',
          description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
        },
        username: {
          type: 'string',
          description: 'Username (optional)',
        },
        password: {
          type: 'string',
          description: 'Password (optional)',
        },
        auth_type: {
          type: 'string',
          description: 'Authentication type (optional, default: basic)',
          enum: ['basic', 'bearer', 'none'],
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'opencode_check_health',
    description: 'Check OpenCode server connection status',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
        },
        username: {
          type: 'string',
          description: 'Username (optional)',
        },
        password: {
          type: 'string',
          description: 'Password (optional)',
        },
        auth_type: {
          type: 'string',
          description: 'Authentication type (optional, default: basic)',
          enum: ['basic', 'bearer', 'none'],
        },
      },
    },
  },
];

// Create MCP Server
const server = new Server(
  {
    name: 'opencode-remote-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool call requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Merge configuration: params > env vars > defaults
    const config = {
      url: (args?.url as string) || DEFAULT_CONFIG.url,
      username: (args?.username as string) || DEFAULT_CONFIG.username,
      password: (args?.password as string) || DEFAULT_CONFIG.password,
      token: (args?.password as string) || DEFAULT_CONFIG.token,
      authType: ((args?.auth_type as string) || DEFAULT_CONFIG.authType).toLowerCase(),
    };

    // Ensure URL format is correct
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
        
        // Create a new session if no session_id is provided
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
            throw new Error(`Failed to create session: ${createResponse.status} - ${error}`);
          }

          const sessionData = await createResponse.json() as { id: string };
          targetSessionId = sessionData.id;
        }
        
        // Send message to session
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
          throw new Error(`Failed to send message: ${response.status} - ${error}`);
        }

        const data = await response.json() as { info?: { id: string }; parts?: any[] };
        return {
          content: [
            {
              type: 'text',
              text: `✅ Message sent!\nSession ID: ${targetSessionId}\nMessage ID: ${data.info?.id || 'unknown'}\n\nResponse:\n${JSON.stringify(data, null, 2)}`,
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
          throw new Error(`Failed to create session: ${response.status} - ${error}`);
        }

        const data = await response.json() as { id: string; title?: string };
        return {
          content: [
            {
              type: 'text',
              text: `✅ Session created successfully!\nSession ID: ${data.id}\nTitle: ${data.title || 'Untitled'}`,
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
          throw new Error(`Failed to list sessions: ${response.status}`);
        }

        const sessions = await response.json() as Array<{ id: string; title?: string; time?: { created: number } }>;
        
        if (sessions.length === 0) {
          return {
            content: [{ type: 'text', text: 'No sessions found' }],
          };
        }

        const sessionList = sessions.map((s, i) => 
          `${i + 1}. ${s.title || 'Untitled'}\n   ID: ${s.id}\n   Created: ${s.time?.created ? new Date(s.time.created).toLocaleString() : 'unknown'}`
        ).join('\n\n');

        return {
          content: [{ type: 'text', text: `📋 Session List (${sessions.length}):\n\n${sessionList}` }],
        };
      }

      case 'opencode_get_session': {
        const { session_id } = args as { session_id: string };
        
        const response = await fetch(`${baseUrl}/session/${session_id}`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`Failed to get session: ${response.status}`);
        }

        const data = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `📄 Session Details:\n${JSON.stringify(data, null, 2)}`,
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
          throw new Error(`Failed to get messages: ${response.status}`);
        }

        const messages = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `💬 Message List:\n${JSON.stringify(messages, null, 2)}`,
            },
          ],
        };
      }

      case 'opencode_check_health': {
        const response = await fetch(`${baseUrl}/global/health`, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }

        const data = await response.json() as { healthy: boolean; version: string };
        return {
          content: [
            {
              type: 'text',
              text: `✅ OpenCode server is running normally\nVersion: ${data.version}\nHealthy: ${data.healthy ? 'Yes' : 'No'}\nAddress: ${baseUrl}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `❌ Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Select launch mode
const mode = process.argv[2] || 'stdio';

if (mode === 'stdio') {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenCode MCP Server v0.1.0 running on stdio');
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
      version: '0.1.0',
      defaultEndpoint: DEFAULT_CONFIG.url,
      authType: DEFAULT_CONFIG.authType,
    });
  });

  app.listen(PORT, () => {
    console.log(`OpenCode MCP Server v0.1.0 running on http://localhost:${PORT}`);
    console.log(`Default OpenCode endpoint: ${DEFAULT_CONFIG.url}`);
    console.log(`Default auth type: ${DEFAULT_CONFIG.authType}`);
    console.log('');
    console.log('Available tools:');
    console.log('  - opencode_chat: Send programming tasks (auto-creates session)');
    console.log('  - opencode_create_session: Create session');
    console.log('  - opencode_list_sessions: List sessions');
    console.log('  - opencode_get_session: Get session details');
    console.log('  - opencode_get_messages: Get session messages');
    console.log('  - opencode_check_health: Health check');
  });
} else {
  console.error('Usage: node index.js [stdio|sse]');
  process.exit(1);
}
