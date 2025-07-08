import { useState, useEffect, useCallback } from 'react';
import SimplifiedGemmaBridge from '../GemmaBridge';
import { PerformanceStats } from '../managers/MetricsManager';

export interface RealtimeMetrics {
  currentTokensPerSecond: number;
  averageTokensPerSecond: number;
  lastInferenceTime: number;
  totalInferences: number;
  sessionDuration: number;
  inferenceRate: number;
}

export interface UseGemmaMetricsReturn {
  // Real-time metrics
  realtimeMetrics: RealtimeMetrics | null;
  performanceStats: PerformanceStats | null;
  
  // Controls
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  refreshMetrics: () => Promise<void>;
  clearMetrics: () => Promise<void>;
  exportMetrics: () => Promise<any>;
  
  // Analysis
  performanceTrends: {
    inferenceTimesTrend: number[];
    tokensPerSecondTrend: number[];
    timestamps: number[];
  } | null;
  isPerformanceDegrading: boolean;
}

export function useGemmaMetrics(pollingInterval: number = 1000): UseGemmaMetricsReturn {
  const [realtimeMetrics, setRealtimeMetrics] = useState<RealtimeMetrics | null>(null);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [performanceTrends, setPerformanceTrends] = useState<{
    inferenceTimesTrend: number[];
    tokensPerSecondTrend: number[];
    timestamps: number[];
  } | null>(null);
  const [isPerformanceDegrading, setIsPerformanceDegrading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingInterval_, setPollingInterval_] = useState<NodeJS.Timeout | null>(null);

  // Refresh all metrics
  const refreshMetrics = useCallback(async (): Promise<void> => {
    try {
      const [realtime, stats, trends, degrading] = await Promise.all([
        SimplifiedGemmaBridge.getRealtimeMetrics(),
        SimplifiedGemmaBridge.getPerformanceStats(),
        SimplifiedGemmaBridge.getPerformanceTrends(10),
        Promise.resolve(SimplifiedGemmaBridge.isPerformanceDegrading())
      ]);

      setRealtimeMetrics(realtime);
      setPerformanceStats(stats);
      setPerformanceTrends(trends);
      setIsPerformanceDegrading(degrading);
    } catch (error) {
      console.error('Failed to refresh metrics:', error);
    }
  }, []);

  // Start polling for real-time updates
  const startPolling = useCallback(() => {
    if (isPolling) return;

    setIsPolling(true);
    const interval = setInterval(refreshMetrics, pollingInterval);
    setPollingInterval_(interval);

    // Initial fetch
    refreshMetrics();
  }, [isPolling, pollingInterval, refreshMetrics]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (!isPolling) return;

    setIsPolling(false);
    if (pollingInterval_) {
      clearInterval(pollingInterval_);
      setPollingInterval_(null);
    }
  }, [isPolling, pollingInterval_]);

  // Clear metrics
  const clearMetrics = useCallback(async (): Promise<void> => {
    try {
      await SimplifiedGemmaBridge.clearMetrics();
      await refreshMetrics();
    } catch (error) {
      console.error('Failed to clear metrics:', error);
    }
  }, [refreshMetrics]);

  // Export metrics
  const exportMetrics = useCallback(async (): Promise<any> => {
    try {
      return await SimplifiedGemmaBridge.exportMetrics();
    } catch (error) {
      console.error('Failed to export metrics:', error);
      return null;
    }
  }, []);

  // Auto-start polling on mount
  useEffect(() => {
    startPolling();

    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval_) {
        clearInterval(pollingInterval_);
      }
    };
  }, [pollingInterval_]);

  return {
    realtimeMetrics,
    performanceStats,
    isPolling,
    startPolling,
    stopPolling,
    refreshMetrics,
    clearMetrics,
    exportMetrics,
    performanceTrends,
    isPerformanceDegrading
  };
}