import { spawn, ChildProcess } from 'child_process';
import { Worker, WorkerStatus, SpawnParams } from './types.js';

interface WorkerProcess {
  worker: Worker;
  process: ChildProcess;
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

    const args = [
      '--print', params.systemPrompt,
      '--dangerously-skip-permissions'
    ];

    const proc = spawn('claude', args, {
      cwd: params.workingDir || process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const worker: Worker = {
      id,
      status: 'idle',
      systemPrompt: params.systemPrompt,
      outputBuffer: [],
      lastReadIndex: 0,
      createdAt: new Date()
    };

    const workerProcess: WorkerProcess = { worker, process: proc };
    this.workers.set(id, workerProcess);

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      worker.outputBuffer.push(text);
      if (text.includes('claude>') || text.includes('$')) {
        worker.status = 'idle';
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      worker.outputBuffer.push(`[ERROR] ${data.toString()}`);
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
    wp.process.stdin?.write(message + '\n');
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

    // Ctrl+C 시뮬레이션
    wp.process.stdin?.write('\x03');

    setTimeout(() => {
      this.send(workerId, message);
    }, 100);
  }

  kill(workerId: string): boolean {
    const wp = this.workers.get(workerId);
    if (!wp) return false;

    wp.process.kill('SIGTERM');
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
