import { NativeModules } from "react-native";

const { GemmaBridge } = NativeModules;

// Error codes consistent across platforms
export enum GemmaErrorCode {
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  INFERENCE_ERROR = 'INFERENCE_ERROR',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  BACKEND_NOT_SUPPORTED = 'BACKEND_NOT_SUPPORTED',
  ASSET_EXTRACTION_FAILED = 'ASSET_EXTRACTION_FAILED'
}

export interface BackendInfo {
  backend: 'CPU' | 'GPU';
  cacheEnabled: boolean;
  modelSize: string;
  gpuSupported?: boolean; // Android only
}

export interface PerformanceMetrics {
  modelLoadTime: number; // milliseconds
  timeToFirstToken: number; // milliseconds
  tokensPerSecond: number;
  totalTokens: number;
  peakMemoryMB: number;
  inferenceTime: number; // milliseconds
  lastInferenceTimestamp: number;
}

export interface GemmaConfig {
  maxTokens?: number;
  useGPU?: boolean; // Android only
  temperature?: number;
  topK?: number;
  randomSeed?: number;
}

export interface StreamingCallback {
  (partialResponse: string, isComplete: boolean): void;
}

interface IGemmaBridge {
  // Core methods
  generateResponse(prompt: string): Promise<string>;
  isModelLoaded(): Promise<boolean>;
  
  // Backend information with performance data
  getBackendInfo(): Promise<BackendInfo>;
  
  // Phase 3 methods - Performance & Enhanced Features
  generateResponseWithProgress(
    prompt: string, 
    callback: StreamingCallback
  ): Promise<string>;
  
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
  
  configure(options: GemmaConfig): Promise<void>;
  
  // Utility methods
  clearCache?(): Promise<void>;
  warmupModel?(): Promise<void>;
  resetMemoryTracking?(): Promise<boolean>;
}

export default GemmaBridge as IGemmaBridge;
