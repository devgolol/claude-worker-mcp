#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WorkerManager } from './worker.js';

const server = new Server(
  { name: 'claude-worker-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const manager = new WorkerManager();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'worker_spawn',
      description: '새 워커 Claude 세션 생성',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '워커 ID (자동생성 가능)' },
          systemPrompt: { type: 'string', description: '시스템 프롬프트' },
          workingDir: { type: 'string', description: '작업 디렉토리' }
        },
        required: ['systemPrompt']
      }
    },
    {
      name: 'worker_send',
      description: '워커에게 비동기 명령 전송',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '워커 ID' },
          message: { type: 'string', description: '메시지' }
        },
        required: ['workerId', 'message']
      }
    },
    {
      name: 'worker_read',
      description: '워커 출력 폴링',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '워커 ID' }
        },
        required: ['workerId']
      }
    },
    {
      name: 'worker_status',
      description: '워커 상태 확인',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '워커 ID' }
        },
        required: ['workerId']
      }
    },
    {
      name: 'worker_interrupt',
      description: '워커 중단 후 새 명령 주입',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '워커 ID' },
          message: { type: 'string', description: '새 메시지' }
        },
        required: ['workerId', 'message']
      }
    },
    {
      name: 'worker_kill',
      description: '워커 세션 종료',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '워커 ID' }
        },
        required: ['workerId']
      }
    },
    {
      name: 'worker_list',
      description: '활성 워커 목록',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'worker_spawn': {
      const { id, systemPrompt, workingDir } = args as { id?: string; systemPrompt: string; workingDir?: string };
      const worker = manager.spawn({ id, systemPrompt, workingDir });
      return { content: [{ type: 'text', text: JSON.stringify({ id: worker.id, status: worker.status }) }] };
    }
    case 'worker_send': {
      const { workerId, message } = args as { workerId: string; message: string };
      manager.send(workerId, message);
      return { content: [{ type: 'text', text: JSON.stringify({ sent: true, workerId }) }] };
    }
    case 'worker_read': {
      const { workerId } = args as { workerId: string };
      const output = manager.read(workerId);
      return { content: [{ type: 'text', text: output.join('') }] };
    }
    case 'worker_status': {
      const { workerId } = args as { workerId: string };
      const status = manager.status(workerId);
      return { content: [{ type: 'text', text: JSON.stringify({ workerId, status }) }] };
    }
    case 'worker_interrupt': {
      const { workerId, message } = args as { workerId: string; message: string };
      manager.interrupt(workerId, message);
      return { content: [{ type: 'text', text: JSON.stringify({ interrupted: true, workerId }) }] };
    }
    case 'worker_kill': {
      const { workerId } = args as { workerId: string };
      const killed = manager.kill(workerId);
      return { content: [{ type: 'text', text: JSON.stringify({ killed, workerId }) }] };
    }
    case 'worker_list': {
      const workers = manager.list();
      const summary = workers.map(w => ({ id: w.id, status: w.status, createdAt: w.createdAt.toISOString() }));
      return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
