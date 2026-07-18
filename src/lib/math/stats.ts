export interface PricePoint {
  odds: number;
  timestamp: number;
}

export class RollingBaseline {
  private windowSizeMs: number;
  private history: PricePoint[] = [];

  constructor(windowSizeMinutes: number) {
    this.windowSizeMs = windowSizeMinutes * 60 * 1000;
  }

  public addPrice(odds: number, timestamp: number) {
    this.history.push({ odds, timestamp });
    this.clean(timestamp);
  }

  private clean(currentTimestamp: number) {
    const threshold = currentTimestamp - this.windowSizeMs;
    this.history = this.history.filter((h) => h.timestamp >= threshold);
  }

  public getStats(): { mean: number; stdDev: number; count: number } {
    const count = this.history.length;
    if (count === 0) {
      return { mean: 1.0, stdDev: 0.0, count };
    }
    const sum = this.history.reduce((acc, p) => acc + p.odds, 0);
    const mean = sum / count;
    if (count <= 1) {
      return { mean, stdDev: 0.0, count };
    }
    const sqDiffSum = this.history.reduce((acc, p) => acc + Math.pow(p.odds - mean, 2), 0);
    const stdDev = Math.sqrt(sqDiffSum / (count - 1));
    return { mean, stdDev, count };
  }

  public getHistory(): PricePoint[] {
    return this.history;
  }
}

/**
 * Calculates z-score: standard deviations away from the rolling mean.
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0.0;
  return (value - mean) / stdDev;
}

/**
 * Calculates velocity (odds movement speed): change in value per second.
 */
export function calculateVelocity(
  currentValue: number,
  previousValue: number,
  timeDiffSeconds: number
): number {
  if (timeDiffSeconds <= 0) return 0.0;
  return (currentValue - previousValue) / timeDiffSeconds;
}
