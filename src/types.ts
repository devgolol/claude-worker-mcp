export type WorkerStatus = 'idle' | 'working' | 'done' | 'error';

export interface Worker {
  id: string;
  status: WorkerStatus;
  systemPrompt: string;
  outputBuffer: string[];
  lastReadIndex: number;
  createdAt: Date;
}

export interface SpawnParams {
  id?: string;
  systemPrompt: string;
  workingDir?: string;
}

export interface SendParams {
  workerId: string;
  message: string;
}

export interface ReadParams {
  workerId: string;
}

export interface StatusParams {
  workerId: string;
}

export interface InterruptParams {
  workerId: string;
  message: string;
}

export interface KillParams {
  workerId: string;
}
