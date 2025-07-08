import { NativeModules } from "react-native";
import { ModelManager } from "./managers/ModelManager";
import { MetricsManager, InferenceMetrics } from "./managers/MetricsManager";

const { GemmaBridge } = NativeModules;

// Simple interface matching native bridge
interface SimplifiedNativeBridge {
  loadModel(filePath: string, useGPU: boolean): Promise<boolean>;
  unloadModel(): Promise<boolean>;
  isModelLoaded(): Promise<boolean>;
  generateResponse(prompt: string): Promise<{
    response: string;
    inferenceTimeMs: number;
    tokenCount: number;
  }>;
  getDeviceInfo(): Promise<{
    platform: string;
    supportsGPU: boolean;
    totalMemoryMB: number;
  }>;
}

// Enhanced interface with RN-side logic
export interface EnhancedGemmaBridge {
  // Model management (handled by ModelManager)
  loadModel(modelFileName?: string): Promise<boolean>;
  unloadModel(): Promise<boolean>;
  isModelLoaded(): Promise<boolean>;
  getModelStatus(): Promise<import("./managers/ModelManager").ModelStatus>;

  // Enhanced inference with metrics
  generateResponse(prompt: string): Promise<string>;
  generateResponseWithMetrics(prompt: string): Promise<{
    response: string;
    metrics: InferenceMetrics;
  }>;

  // Real-time metrics (handled by MetricsManager)
  getRealtimeMetrics(): Promise<{
    currentTokensPerSecond: number;
    averageTokensPerSecond: number;
    lastInferenceTime: number;
    totalInferences: number;
    sessionDuration: number;
    inferenceRate: number;
  }>;

  getPerformanceStats(): Promise<
    import("./managers/MetricsManager").PerformanceStats
  >;

  // Device and system info
  getDeviceCapabilities(): Promise<
    import("./managers/ModelManager").DeviceCapabilities
  >;
  getStorageInfo(): Promise<{
    availableSpaceBytes: number;
    totalModelSizeBytes: number;
    modelCount: number;
    modelsDirectory: string;
  }>;

  // Configuration
  configure(
    config: Partial<import("./managers/ModelManager").ModelConfig>
  ): Promise<void>;

  // Model file management
  downloadModel(url: string, fileName: string): Promise<string>;
  listAvailableModels(): Promise<import("./managers/FileManager").ModelInfo[]>;
  deleteModel(fileName: string): Promise<boolean>;

  // Utilities
  validateInput(prompt: string): { isValid: boolean; error?: string };
  exportMetrics(): Promise<any>;
  clearMetrics(): Promise<void>;
}

class SimplifiedGemmaBridgeImpl implements EnhancedGemmaBridge {
  private modelManager: ModelManager;
  private metricsManager: MetricsManager;
  private nativeBridge: SimplifiedNativeBridge;

  constructor() {
    this.modelManager = ModelManager.getInstance();
    this.metricsManager = MetricsManager.getInstance();
    this.nativeBridge = GemmaBridge;
  }

  // Initialize the bridge system
  async initialize(): Promise<void> {
    await this.modelManager.initialize();
  }

  // Model management
  async loadModel(modelFileName: string = "gemma.task"): Promise<boolean> {
    return await this.modelManager.loadModel(modelFileName);
  }

  async unloadModel(): Promise<boolean> {
    return await this.modelManager.unloadModel();
  }

  async isModelLoaded(): Promise<boolean> {
    return await this.modelManager.checkModelStatus();
  }

  async getModelStatus() {
    return this.modelManager.getStatus();
  }

  // Enhanced inference
  async generateResponse(prompt: string): Promise<string> {
    const validation = this.validateInput(prompt);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const result = await this.nativeBridge.generateResponse(prompt);

    // Record metrics
    this.metricsManager.recordInference(result);

    return result.response;
  }

  async generateResponseWithMetrics(prompt: string): Promise<{
    response: string;
    metrics: InferenceMetrics;
  }> {
    const validation = this.validateInput(prompt);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const result = await this.nativeBridge.generateResponse(prompt);

    // Record and return metrics
    const metrics = this.metricsManager.recordInference(result);

    return {
      response: result.response,
      metrics,
    };
  }

  // Metrics
  async getRealtimeMetrics() {
    return this.metricsManager.getRealtimeMetrics();
  }

  async getPerformanceStats() {
    return this.metricsManager.getPerformanceStats();
  }

  // Device info
  async getDeviceCapabilities() {
    return await this.modelManager.getDeviceCapabilities();
  }

  async getStorageInfo() {
    return await this.modelManager.getStorageInfo();
  }

  // Configuration
  async configure(
    config: Partial<import("./managers/ModelManager").ModelConfig>
  ): Promise<void> {
    this.modelManager.updateConfig(config);
  }

  // File management
  async downloadModel(url: string, fileName: string): Promise<string> {
    return await this.modelManager.downloadModel(url, fileName);
  }

  async listAvailableModels() {
    return await this.modelManager.getAvailableModels();
  }

  async deleteModel(fileName: string): Promise<boolean> {
    return await this.modelManager.deleteModel(fileName);
  }

  // Utilities
  validateInput(prompt: string): { isValid: boolean; error?: string } {
    if (!prompt || prompt.trim().length === 0) {
      return { isValid: false, error: "Prompt cannot be empty" };
    }

    if (prompt.length > 8192) {
      return {
        isValid: false,
        error: "Prompt is too long (max 8192 characters)",
      };
    }

    // Check for potentially problematic characters
    if (prompt.includes("\0")) {
      return { isValid: false, error: "Prompt contains null characters" };
    }

    return { isValid: true };
  }

  async exportMetrics() {
    return this.metricsManager.exportMetrics();
  }

  async clearMetrics(): Promise<void> {
    this.metricsManager.clearHistory();
  }

  // Subscribe to model status changes
  onModelStatusChange(
    listener: (status: import("./managers/ModelManager").ModelStatus) => void
  ): () => void {
    return this.modelManager.onStatusChange(listener);
  }

  // Get recent performance trends
  getPerformanceTrends(windowSize: number = 10) {
    return this.metricsManager.getPerformanceTrends(windowSize);
  }

  // Check if performance is degrading
  isPerformanceDegrading(): boolean {
    return this.metricsManager.isPerformanceDegrading();
  }
}

// Export singleton instance
const SimplifiedGemmaBridge = new SimplifiedGemmaBridgeImpl();

// Auto-initialize
SimplifiedGemmaBridge.initialize().catch(console.error);

export default SimplifiedGemmaBridge;
