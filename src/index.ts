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
      description: '독립 Claude 워커 생성. 병렬 작업 시 여러 워커 spawn 후 각각 send. systemPrompt로 워커 역할 지정 (예: "코드 리뷰어", "테스트 작성자", "문서 작성자"). 세션 유지되어 대화 컨텍스트 이어감.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '워커 ID (생략시 자동생성: worker_1, worker_2...)' },
          systemPrompt: { type: 'string', description: '워커의 역할/성격 정의. 예: "너는 코드 리뷰 전문가. 버그와 보안 취약점만 지적해."' },
          workingDir: { type: 'string', description: '워커의 작업 디렉토리 (파일 접근 기준 경로)' }
        },
        required: ['systemPrompt']
      }
    },
    {
      name: 'worker_send',
      description: '워커에게 메시지 전송. 비동기로 즉시 반환됨. 결과는 worker_read로 폴링. 여러 워커에게 동시에 send하면 병렬 처리됨.',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '대상 워커 ID' },
          message: { type: 'string', description: '워커에게 보낼 작업 지시' }
        },
        required: ['workerId', 'message']
      }
    },
    {
      name: 'worker_read',
      description: '워커 출력 읽기. 마지막 read 이후 새 출력만 반환. status가 idle이면 작업 완료된 것. working이면 아직 처리중이니 다시 폴링.',
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
      description: '워커 상태 확인. idle=대기중/작업완료, working=처리중, done=프로세스종료, error=오류발생',
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
      description: '워커 현재 작업 중단하고 새 명령 주입. 오래 걸리는 작업 취소하거나 방향 전환할 때 사용.',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '워커 ID' },
          message: { type: 'string', description: '중단 후 새로 보낼 메시지' }
        },
        required: ['workerId', 'message']
      }
    },
    {
      name: 'worker_kill',
      description: '워커 프로세스 완전 종료. 세션/컨텍스트 삭제됨. 작업 끝났거나 더 이상 필요없을 때 정리용.',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string', description: '종료할 워커 ID' }
        },
        required: ['workerId']
      }
    },
    {
      name: 'worker_list',
      description: '현재 활성화된 모든 워커 목록과 상태 조회. 병렬 작업 관리/모니터링용.',
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
