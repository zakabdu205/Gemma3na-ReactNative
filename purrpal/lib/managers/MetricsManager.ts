export interface InferenceMetrics {
  response: string;
  inferenceTimeMs: number;
  tokenCount: number;
  tokensPerSecond: number;
  timestamp: number;
}

export interface PerformanceStats {
  totalInferences: number;
  averageInferenceTime: number;
  averageTokensPerSecond: number;
  totalTokens: number;
  fastestInference: number;
  slowestInference: number;
  lastInferenceTime: number;
  sessionStartTime: number;
}

export interface SystemMetrics {
  platform: string;
  memoryUsageMB: number;
  cpuUsage: number;
  batteryLevel: number;
  thermalState: string;
}

export class MetricsManager {
  private static instance: MetricsManager;
  private metrics: InferenceMetrics[] = [];
  private sessionStartTime: number;
  private maxHistorySize: number = 100; // Keep last 100 inferences

  private constructor() {
    this.sessionStartTime = Date.now();
  }

  static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager();
    }
    return MetricsManager.instance;
  }

  // Record inference metrics
  recordInference(rawResult: { response: string; inferenceTimeMs: number; tokenCount: number }): InferenceMetrics {
    const tokensPerSecond = rawResult.tokenCount / (rawResult.inferenceTimeMs / 1000);
    
    const metrics: InferenceMetrics = {
      response: rawResult.response,
      inferenceTimeMs: rawResult.inferenceTimeMs,
      tokenCount: rawResult.tokenCount,
      tokensPerSecond,
      timestamp: Date.now()
    };

    // Add to history
    this.metrics.push(metrics);

    // Maintain max history size
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics = this.metrics.slice(-this.maxHistorySize);
    }

    return metrics;
  }

  // Get current performance statistics
  getPerformanceStats(): PerformanceStats {
    if (this.metrics.length === 0) {
      return {
        totalInferences: 0,
        averageInferenceTime: 0,
        averageTokensPerSecond: 0,
        totalTokens: 0,
        fastestInference: 0,
        slowestInference: 0,
        lastInferenceTime: 0,
        sessionStartTime: this.sessionStartTime
      };
    }

    const inferenceTimes = this.metrics.map(m => m.inferenceTimeMs);
    const tokensPerSecond = this.metrics.map(m => m.tokensPerSecond);
    const totalTokens = this.metrics.reduce((sum, m) => sum + m.tokenCount, 0);

    return {
      totalInferences: this.metrics.length,
      averageInferenceTime: this.average(inferenceTimes),
      averageTokensPerSecond: this.average(tokensPerSecond),
      totalTokens,
      fastestInference: Math.min(...inferenceTimes),
      slowestInference: Math.max(...inferenceTimes),
      lastInferenceTime: this.metrics[this.metrics.length - 1].inferenceTimeMs,
      sessionStartTime: this.sessionStartTime
    };
  }

  // Get recent metrics (last N inferences)
  getRecentMetrics(count: number = 10): InferenceMetrics[] {
    return this.metrics.slice(-count);
  }

  // Get metrics for a time period
  getMetricsInTimeRange(startTime: number, endTime: number): InferenceMetrics[] {
    return this.metrics.filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
  }

  // Get rolling average for last N inferences
  getRollingAverage(metric: keyof InferenceMetrics, windowSize: number = 5): number {
    if (this.metrics.length === 0) return 0;
    
    const recentMetrics = this.metrics.slice(-windowSize);
    const values = recentMetrics.map(m => m[metric] as number).filter(v => typeof v === 'number');
    
    return this.average(values);
  }

  // Get performance trends
  getPerformanceTrends(windowSize: number = 10): {
    inferenceTimesTrend: number[];
    tokensPerSecondTrend: number[];
    timestamps: number[];
  } {
    const recentMetrics = this.metrics.slice(-windowSize);
    
    return {
      inferenceTimesTrend: recentMetrics.map(m => m.inferenceTimeMs),
      tokensPerSecondTrend: recentMetrics.map(m => m.tokensPerSecond),
      timestamps: recentMetrics.map(m => m.timestamp)
    };
  }

  // Calculate percentiles
  getPercentiles(metric: keyof InferenceMetrics): { p50: number; p90: number; p95: number; p99: number } {
    if (this.metrics.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const values = this.metrics.map(m => m[metric] as number).filter(v => typeof v === 'number').sort((a, b) => a - b);
    
    return {
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    };
  }

  // Export metrics data
  exportMetrics(): {
    sessionInfo: { startTime: number; endTime: number; duration: number };
    performanceStats: PerformanceStats;
    allMetrics: InferenceMetrics[];
    percentiles: {
      inferenceTime: { p50: number; p90: number; p95: number; p99: number };
      tokensPerSecond: { p50: number; p90: number; p95: number; p99: number };
    };
  } {
    const now = Date.now();
    
    return {
      sessionInfo: {
        startTime: this.sessionStartTime,
        endTime: now,
        duration: now - this.sessionStartTime
      },
      performanceStats: this.getPerformanceStats(),
      allMetrics: [...this.metrics],
      percentiles: {
        inferenceTime: this.getPercentiles('inferenceTimeMs'),
        tokensPerSecond: this.getPercentiles('tokensPerSecond')
      }
    };
  }

  // Clear metrics history
  clearHistory(): void {
    this.metrics = [];
    this.sessionStartTime = Date.now();
  }

  // Get session duration
  getSessionDuration(): number {
    return Date.now() - this.sessionStartTime;
  }

  // Check if performance is degrading
  isPerformanceDegrading(windowSize: number = 5): boolean {
    if (this.metrics.length < windowSize * 2) return false;

    const recentAvg = this.getRollingAverage('inferenceTimeMs', windowSize);
    const previousAvg = this.getRollingAverage('inferenceTimeMs', windowSize * 2) - recentAvg;

    // Performance is degrading if recent average is 20% slower than previous
    return recentAvg > previousAvg * 1.2;
  }

  // Get inference rate (inferences per minute)
  getInferenceRate(): number {
    if (this.metrics.length === 0) return 0;
    
    const sessionDurationMinutes = this.getSessionDuration() / (1000 * 60);
    return this.metrics.length / sessionDurationMinutes;
  }

  // Get token throughput (tokens per minute)
  getTokenThroughput(): number {
    if (this.metrics.length === 0) return 0;
    
    const totalTokens = this.metrics.reduce((sum, m) => sum + m.tokenCount, 0);
    const sessionDurationMinutes = this.getSessionDuration() / (1000 * 60);
    
    return totalTokens / sessionDurationMinutes;
  }

  // Helper methods
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  // Real-time metrics for UI display
  getRealtimeMetrics(): {
    currentTokensPerSecond: number;
    averageTokensPerSecond: number;
    lastInferenceTime: number;
    totalInferences: number;
    sessionDuration: number;
    inferenceRate: number;
  } {
    const stats = this.getPerformanceStats();
    const latest = this.metrics[this.metrics.length - 1];
    
    return {
      currentTokensPerSecond: latest?.tokensPerSecond || 0,
      averageTokensPerSecond: stats.averageTokensPerSecond,
      lastInferenceTime: latest?.inferenceTimeMs || 0,
      totalInferences: stats.totalInferences,
      sessionDuration: this.getSessionDuration(),
      inferenceRate: this.getInferenceRate()
    };
  }
}