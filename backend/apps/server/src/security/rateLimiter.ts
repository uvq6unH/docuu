interface SocketRateEntry {
  inputTimestamps: number[];
  actionTimestamps: number[];
  lastActive: number;
}

export class SocketRateLimiter {
  private sockets: Map<string, SocketRateEntry> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 60_000);
    this.cleanupTimer.unref();
  }

  private getEntry(socketId: string, now: number): SocketRateEntry {
    let entry = this.sockets.get(socketId);
    if (!entry) {
      entry = {
        inputTimestamps: [],
        actionTimestamps: [],
        lastActive: now,
      };
      this.sockets.set(socketId, entry);
    }
    entry.lastActive = now;
    return entry;
  }

  /**
   * Enforces input frame rate limit (default 45 frames/sec, nominal 30Hz).
   * Returns true if allowed, false if dropped due to rate limit violation.
   */
  public checkInput(socketId: string, maxPerSecond = 45): boolean {
    const now = Date.now();
    const entry = this.getEntry(socketId, now);
    const windowStart = now - 1000;

    // Prune timestamps older than 1 second
    entry.inputTimestamps = entry.inputTimestamps.filter((t) => t >= windowStart);

    if (entry.inputTimestamps.length >= maxPerSecond) {
      return false;
    }

    entry.inputTimestamps.push(now);
    return true;
  }

  /**
   * Enforces room action rate limit (default 10 requests/sec).
   * Returns true if allowed, false if rate limited.
   */
  public checkAction(socketId: string, maxPerSecond = 10): boolean {
    const now = Date.now();
    const entry = this.getEntry(socketId, now);
    const windowStart = now - 1000;

    entry.actionTimestamps = entry.actionTimestamps.filter((t) => t >= windowStart);

    if (entry.actionTimestamps.length >= maxPerSecond) {
      return false;
    }

    entry.actionTimestamps.push(now);
    return true;
  }

  public removeSocket(socketId: string): void {
    this.sockets.delete(socketId);
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.sockets.entries()) {
      if (now - entry.lastActive > 60_000) {
        this.sockets.delete(id);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sockets.clear();
  }
}
