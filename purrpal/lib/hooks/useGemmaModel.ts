import { useState, useEffect, useCallback } from 'react';
import SimplifiedGemmaBridge from '../GemmaBridge';
import { ModelStatus } from '../managers/ModelManager';

export interface UseGemmaModelReturn {
  // Model state
  status: ModelStatus;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Model operations
  loadModel: (modelFileName?: string) => Promise<boolean>;
  unloadModel: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  
  // Model info
  deviceCapabilities: {
    platform: string;
    supportsGPU: boolean;
    totalMemoryMB: number;
  } | null;
}

export function useGemmaModel(): UseGemmaModelReturn {
  const [status, setStatus] = useState<ModelStatus>({
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
    modelPath: null,
    backend: null,
    loadTime: null
  });

  const [deviceCapabilities, setDeviceCapabilities] = useState<{
    platform: string;
    supportsGPU: boolean;
    totalMemoryMB: number;
  } | null>(null);

  // Load device capabilities
  useEffect(() => {
    const loadDeviceCapabilities = async () => {
      try {
        const capabilities = await SimplifiedGemmaBridge.getDeviceCapabilities();
        setDeviceCapabilities(capabilities);
      } catch (error) {
        console.error('Failed to load device capabilities:', error);
      }
    };

    loadDeviceCapabilities();
  }, []);

  // Subscribe to model status changes
  useEffect(() => {
    const unsubscribe = SimplifiedGemmaBridge.onModelStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Get initial status
    const getInitialStatus = async () => {
      try {
        const initialStatus = await SimplifiedGemmaBridge.getModelStatus();
        setStatus(initialStatus);
      } catch (error) {
        console.error('Failed to get initial model status:', error);
      }
    };

    getInitialStatus();

    return unsubscribe;
  }, []);

  // Load model function
  const loadModel = useCallback(async (modelFileName?: string): Promise<boolean> => {
    try {
      return await SimplifiedGemmaBridge.loadModel(modelFileName);
    } catch (error) {
      console.error('Failed to load model:', error);
      return false;
    }
  }, []);

  // Unload model function
  const unloadModel = useCallback(async (): Promise<boolean> => {
    try {
      return await SimplifiedGemmaBridge.unloadModel();
    } catch (error) {
      console.error('Failed to unload model:', error);
      return false;
    }
  }, []);

  // Refresh status function
  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const newStatus = await SimplifiedGemmaBridge.getModelStatus();
      setStatus(newStatus);
    } catch (error) {
      console.error('Failed to refresh model status:', error);
    }
  }, []);

  return {
    status,
    isLoaded: status.isLoaded,
    isLoading: status.isLoading,
    error: status.error,
    loadModel,
    unloadModel,
    refreshStatus,
    deviceCapabilities
  };
}