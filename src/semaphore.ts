export class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }

  get status(): { running: number; queued: number; max: number } {
    return { running: this.running, queued: this.queue.length, max: this.max };
  }
}

let instance: Semaphore | undefined;

export function initSemaphore(max: number): void {
  instance = new Semaphore(max);
}

export function semaphore(): Semaphore {
  if (!instance) throw new Error("Semaphore not initialized");
  return instance;
}
