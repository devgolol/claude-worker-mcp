import { spawn, ChildProcess } from 'child_process';
import { Worker, WorkerStatus, SpawnParams } from './types.js';

interface WorkerProcess {
  worker: Worker;
  workingDir: string;
  proc: ChildProcess;
}

export class WorkerManager {
  private workers: Map<string, WorkerProcess> = new Map();
  private counter = 0;

  private generateId(): string {
    return `worker_${++this.counter}`;
  }

  spawn(params: SpawnParams): Worker {
    const id = params.id || this.generateId();

    if (this.workers.has(id)) {
      throw new Error(`Worker ${id} already exists`);
    }

    const worker: Worker = {
      id,
      status: 'idle',
      systemPrompt: params.systemPrompt,
      outputBuffer: [],
      lastReadIndex: 0,
      createdAt: new Date()
    };

    const args = [
      '-p', '',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--system-prompt', params.systemPrompt,
      '--dangerously-skip-permissions'
    ];

    const proc = spawn('claude', args, {
      cwd: params.workingDir || process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const workerProcess: WorkerProcess = {
      worker,
      workingDir: params.workingDir || process.cwd(),
      proc
    };

    this.workers.set(id, workerProcess);

    // stdout 파싱
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // assistant 메시지에서 텍스트 추출
          if (json.type === 'assistant' && json.message?.content) {
            const content = json.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') {
                  worker.outputBuffer.push(block.text);
                }
              }
            }
          }

          // result면 완료
          if (json.type === 'result') {
            worker.status = 'idle';
          }
        } catch {
          // 파싱 실패 무시
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.trim()) {
        worker.outputBuffer.push(`[STDERR] ${text}`);
      }
    });

    proc.on('close', (code) => {
      worker.status = 'done';
      worker.outputBuffer.push(`[CLOSED] exit code: ${code}`);
    });

    proc.on('error', (err) => {
      worker.status = 'error';
      worker.outputBuffer.push(`[ERROR] ${err.message}`);
    });

    return worker;
  }

  send(workerId: string, message: string): void {
    const wp = this.workers.get(workerId);
    if (!wp) throw new Error(`Worker ${workerId} not found`);

    wp.worker.status = 'working';

    const jsonMsg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: message
      }
    });

    wp.proc.stdin?.write(jsonMsg + '\n');
  }

  read(workerId: string): string[] {
    const wp = this.workers.get(workerId);
    if (!wp) throw new Error(`Worker ${workerId} not found`);

    const newOutput = wp.worker.outputBuffer.slice(wp.worker.lastReadIndex);
    wp.worker.lastReadIndex = wp.worker.outputBuffer.length;
    return newOutput;
  }

  status(workerId: string): WorkerStatus {
    const wp = this.workers.get(workerId);
    if (!wp) throw new Error(`Worker ${workerId} not found`);
    return wp.worker.status;
  }

  interrupt(workerId: string, message: string): void {
    const wp = this.workers.get(workerId);
    if (!wp) throw new Error(`Worker ${workerId} not found`);

    // Escape 보내서 중단
    wp.proc.stdin?.write('\x1b');
    wp.worker.outputBuffer.push('[INTERRUPTED]');
    wp.worker.status = 'idle';

    // 새 메시지 전송
    setTimeout(() => {
      this.send(workerId, message);
    }, 100);
  }

  kill(workerId: string): boolean {
    const wp = this.workers.get(workerId);
    if (!wp) return false;

    wp.proc.kill('SIGTERM');
    this.workers.delete(workerId);
    return true;
  }

  list(): Worker[] {
    return Array.from(this.workers.values()).map(wp => wp.worker);
  }

  get(workerId: string): Worker | undefined {
    return this.workers.get(workerId)?.worker;
  }
}
