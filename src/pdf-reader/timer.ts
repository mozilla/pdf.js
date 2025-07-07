export class Timer {
  private startTime: number | null = null;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): void {
    this.startTime = null;
  }

  reset(): void {
    if (this.startTime !== null) {
      this.startTime = performance.now();
    }
  }

  getElapsedSeconds(): number {
    if (this.startTime === null) {
      return 0;
    }
    return (performance.now() - this.startTime) / 1000;
  }

  hasTimeStampPassed(timestamp: number): boolean {
    if (this.startTime === null) {
      return false;
    }
    return this.getElapsedSeconds() >= timestamp;
  }

  isRunning(): boolean {
    return this.startTime !== null;
  }
}
