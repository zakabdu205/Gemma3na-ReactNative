import { NativeModules, Platform } from "react-native";
import { FileManager, ModelDownloadProgress } from "./FileManager";
import { PermissionManager } from "./PermissionManager";

const { GemmaBridge } = NativeModules;

export interface ModelConfig {
  useGPU: boolean;
  autoLoad: boolean;
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface ModelStatus {
  isLoaded: boolean;
  isLoading: boolean;
  loadProgress: number; // 0-1
  error: string | null;
  modelPath: string | null;
  backend: "CPU" | "GPU" | null;
  loadTime: number | null; // milliseconds
}

export interface DeviceCapabilities {
  platform: string;
  supportsGPU: boolean;
  totalMemoryMB: number;
}

export class ModelManager {
  private static instance: ModelManager;
  private fileManager: FileManager;
  private permissionManager: PermissionManager;
  private status: ModelStatus;
  private config: ModelConfig;
  private statusListeners: ((status: ModelStatus) => void)[] = [];

  private constructor() {
    this.fileManager = FileManager.getInstance();
    this.permissionManager = PermissionManager.getInstance();
    this.status = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: null,
      modelPath: null,
      backend: null,
      loadTime: null,
    };
    this.config = {
      useGPU: true, // Will be auto-detected on Android
      autoLoad: false, // Changed to false for on-demand loading
      retryAttempts: 3,
      retryDelay: 2000,
    };
  }

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  // Initialize model manager
  async initialize(): Promise<void> {
    await this.fileManager.initialize();

    if (this.config.autoLoad) {
      // Check if model is already loaded
      const isLoaded = await this.checkModelStatus();
      if (!isLoaded) {
        // Auto-load in background
        this.loadModelInBackground();
      }
    }
  }

  // Load model with retry logic and permission handling
  async loadModel(
    modelFileName: string = "gemma.task",
    config?: Partial<ModelConfig>
  ): Promise<boolean> {
    if (this.status.isLoading) {
      console.log("Model is already loading");
      return false;
    }

    // Update config
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.updateStatus({ isLoading: true, loadProgress: 0, error: null });

    try {
      // Handle platform-specific model loading
      if (Platform.OS === "ios") {
        return await this.loadiOSModel(modelFileName);
      } else {
        return await this.loadAndroidModel(modelFileName);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.updateStatus({
        isLoaded: false,
        isLoading: false,
        loadProgress: 0,
        error: errorMessage,
      });

      console.error("Model loading failed:", errorMessage);
      return false;
    }
  }

  // Load model on iOS (bundled)
  private async loadiOSModel(modelFileName: string): Promise<boolean> {
    console.log("Loading iOS bundled model:", modelFileName);

    // Get device capabilities
    const deviceInfo = await this.getDeviceCapabilities();
    const useGPU = this.config.useGPU && deviceInfo.supportsGPU;

    this.updateStatus({ loadProgress: 0.1 });

    // Try to extract from bundle first
    let modelPath: string;
    try {
      modelPath = await this.fileManager.extractBundledModel(modelFileName);
    } catch (extractError) {
      throw new Error(`Failed to extract bundled model: ${extractError}`);
    }

    this.updateStatus({ loadProgress: 0.3, modelPath });

    // Validate model file
    const isValid = await this.fileManager.validateModel(modelFileName);
    if (!isValid) {
      throw new Error("Model file validation failed");
    }

    this.updateStatus({ loadProgress: 0.5 });

    // Load model with retry logic
    const success = await this.loadModelWithRetry(modelPath, useGPU);

    if (success) {
      this.updateStatus({
        isLoaded: true,
        isLoading: false,
        loadProgress: 1,
        backend: useGPU ? "GPU" : "CPU",
        error: null,
      });

      console.log(
        `iOS model loaded successfully with ${useGPU ? "GPU" : "CPU"} backend`
      );
      return true;
    } else {
      throw new Error("iOS model loading failed after all retry attempts");
    }
  }

  // Load model on Android (external storage)
  private async loadAndroidModel(modelFileName: string): Promise<boolean> {
    console.log("Loading Android external model:", modelFileName);

    // Check permissions first
    const hasPermission = await this.permissionManager.hasStoragePermission();
    if (!hasPermission) {
      console.log("Storage permission not granted, requesting...");
      const permissionGranted =
        await this.permissionManager.requestStoragePermission();
      if (!permissionGranted) {
        throw new Error("Storage permission is required to load the model");
      }
    }

    this.updateStatus({ loadProgress: 0.1 });

    // Get device capabilities
    const deviceInfo = await this.getDeviceCapabilities();
    const useGPU = this.config.useGPU && deviceInfo.supportsGPU;

    // Check if model file exists in external storage
    let modelPath = await this.fileManager.getModelPath(modelFileName);

    if (!modelPath) {
      // Model not found in Documents folder
      throw new Error(
        `Model file '${modelFileName}' not found in Documents folder. Please ensure the model file is placed in your device's Documents folder.`
      );
    }

    this.updateStatus({ loadProgress: 0.3, modelPath });

    // Validate model file
    const isValid = await this.fileManager.validateModel(modelFileName);
    if (!isValid) {
      throw new Error("Model file validation failed");
    }

    this.updateStatus({ loadProgress: 0.5 });

    // Load model with retry logic
    const success = await this.loadModelWithRetry(modelPath, useGPU);

    if (success) {
      this.updateStatus({
        isLoaded: true,
        isLoading: false,
        loadProgress: 1,
        backend: useGPU ? "GPU" : "CPU",
        error: null,
      });

      console.log(
        `Android model loaded successfully with ${
          useGPU ? "GPU" : "CPU"
        } backend`
      );
      return true;
    } else {
      throw new Error("Android model loading failed after all retry attempts");
    }
  }

  // Load model with retry logic
  private async loadModelWithRetry(
    modelPath: string,
    useGPU: boolean
  ): Promise<boolean> {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        console.log(
          `Loading model attempt ${attempt}/${this.config.retryAttempts}`
        );

        const result = await GemmaBridge.loadModel(modelPath, useGPU);

        if (result) {
          const loadTime = Date.now() - startTime;
          this.updateStatus({ loadTime });
          return true;
        }
      } catch (error) {
        console.error(`Load attempt ${attempt} failed:`, error);

        if (attempt < this.config.retryAttempts) {
          console.log(`Retrying in ${this.config.retryDelay}ms...`);
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay)
          );

          // Update progress for retry
          const retryProgress =
            0.5 + (attempt / this.config.retryAttempts) * 0.3;
          this.updateStatus({ loadProgress: retryProgress });
        }
      }
    }

    return false;
  }

  // Load model in background without blocking
  private loadModelInBackground(): void {
    // Use a common model name - this should be configurable
    const defaultModel = "gemma.task";

    setTimeout(async () => {
      await this.loadModel(defaultModel);
    }, 100); // Small delay to not block app startup
  }

  // Unload model
  async unloadModel(): Promise<boolean> {
    try {
      if (!this.status.isLoaded) {
        return true;
      }

      const result = await GemmaBridge.unloadModel();

      if (result) {
        this.updateStatus({
          isLoaded: false,
          isLoading: false,
          loadProgress: 0,
          error: null,
          modelPath: null,
          backend: null,
          loadTime: null,
        });

        console.log("Model unloaded successfully");
        return true;
      }

      return false;
    } catch (error) {
      console.error("Model unloading failed:", error);
      return false;
    }
  }

  // Check current model status
  async checkModelStatus(): Promise<boolean> {
    try {
      const isLoaded = await GemmaBridge.isModelLoaded();
      this.updateStatus({ isLoaded });
      return isLoaded;
    } catch (error) {
      console.error("Failed to check model status:", error);
      return false;
    }
  }

  // Get device capabilities
  async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    try {
      return await GemmaBridge.getDeviceInfo();
    } catch (error) {
      console.error("Failed to get device capabilities:", error);
      return {
        platform: "unknown",
        supportsGPU: false,
        totalMemoryMB: 0,
      };
    }
  }

  // Download model from URL
  async downloadModel(
    modelUrl: string,
    fileName: string,
    onProgress?: (progress: ModelDownloadProgress) => void
  ): Promise<string> {
    try {
      this.updateStatus({ isLoading: true, loadProgress: 0 });

      const modelPath = await this.fileManager.downloadModel(
        modelUrl,
        fileName,
        (progress) => {
          this.updateStatus({ loadProgress: progress.progress * 0.8 }); // Reserve 20% for loading
          onProgress?.(progress);
        }
      );

      this.updateStatus({ isLoading: false, loadProgress: 1, modelPath });
      return modelPath;
    } catch (error) {
      this.updateStatus({
        isLoading: false,
        error: error instanceof Error ? error.message : "Download failed",
      });
      throw error;
    }
  }

  // Get current status
  getStatus(): ModelStatus {
    return { ...this.status };
  }

  // Get current config
  getConfig(): ModelConfig {
    return { ...this.config };
  }

  // Update config
  updateConfig(newConfig: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Subscribe to status updates
  onStatusChange(listener: (status: ModelStatus) => void): () => void {
    this.statusListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index > -1) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  // Update status and notify listeners
  private updateStatus(updates: Partial<ModelStatus>): void {
    this.status = { ...this.status, ...updates };
    this.statusListeners.forEach((listener) => listener(this.status));
  }

  // List available models
  async getAvailableModels() {
    return await this.fileManager.listDownloadedModels();
  }

  // Delete a model
  async deleteModel(fileName: string): Promise<boolean> {
    return await this.fileManager.deleteModel(fileName);
  }

  // Get storage info
  async getStorageInfo() {
    const availableSpace = await this.fileManager.getAvailableSpace();
    const models = await this.fileManager.listDownloadedModels();
    const totalModelSize = models.reduce((sum, model) => sum + model.size, 0);

    return {
      availableSpaceBytes: availableSpace,
      totalModelSizeBytes: totalModelSize,
      modelCount: models.length,
      modelsDirectory: this.fileManager.getModelsDirectory(),
    };
  }
}
