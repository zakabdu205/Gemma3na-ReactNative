import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

export interface ModelDownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  progress: number; // 0-1
}

export interface ModelInfo {
  name: string;
  version: string;
  size: number;
  url: string;
  localPath?: string;
  isDownloaded: boolean;
}

export class FileManager {
  private static instance: FileManager;
  private modelsDirectory: string;

  private constructor() {
    // Use different paths for iOS and Android
    if (Platform.OS === "ios") {
      this.modelsDirectory = `${FileSystem.documentDirectory}models/`;
    } else {
      // On Android, check Documents folder in external storage
      this.modelsDirectory = `/storage/emulated/0/Documents/`;
    }
  }

  static getInstance(): FileManager {
    if (!FileManager.instance) {
      FileManager.instance = new FileManager();
    }
    return FileManager.instance;
  }

  // Initialize models directory
  async initialize(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.modelsDirectory);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.modelsDirectory, {
          intermediates: true,
        });
        console.log("Models directory created:", this.modelsDirectory);
      }
    } catch (error) {
      console.error("Failed to initialize models directory:", error);
      throw error;
    }
  }

  // Download model from URL with progress tracking
  async downloadModel(
    modelUrl: string,
    fileName: string,
    onProgress?: (progress: ModelDownloadProgress) => void
  ): Promise<string> {
    try {
      const localPath = `${this.modelsDirectory}${fileName}`;

      // Check if model already exists
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        console.log("Model already exists:", localPath);
        return localPath;
      }

      console.log("Starting model download:", modelUrl);

      // Download with progress tracking
      const downloadResult = await FileSystem.downloadAsync(
        modelUrl,
        localPath
      );

      // For now, we'll simulate progress - real progress tracking would need native implementation
      if (onProgress) {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        const fileSize =
          fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0;
        const progress: ModelDownloadProgress = {
          totalBytes: fileSize,
          downloadedBytes: fileSize,
          progress: 1,
        };
        onProgress(progress);
      }

      if (downloadResult.status === 200) {
        console.log("Model downloaded successfully:", localPath);
        return localPath;
      } else {
        throw new Error(
          `Download failed with status: ${downloadResult.status}`
        );
      }
    } catch (error) {
      console.error("Model download failed:", error);
      throw error;
    }
  }

  // Copy model from app bundle to documents (for bundled models)
  async extractBundledModel(bundledAssetName: string): Promise<string> {
    try {
      const localPath = `${this.modelsDirectory}${bundledAssetName}`;

      // Check if already extracted
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        console.log("Bundled model already extracted:", localPath);
        return localPath;
      }

      // On iOS, models are in the bundle, on Android they're in assets
      // The gemma.task file is located in the "Assets" folder in the iOS bundle.
      const bundlePath =
        Platform.OS === "ios"
          ? `${FileSystem.bundleDirectory}Assets/${bundledAssetName}`
          : `${FileSystem.bundleDirectory}assets/${bundledAssetName}`;

      console.log("Extracting bundled model from:", bundlePath);

      // Copy from bundle to documents
      await FileSystem.copyAsync({
        from: bundlePath,
        to: localPath,
      });

      console.log("Model extracted successfully:", localPath);
      return localPath;
    } catch (error) {
      console.error("Failed to extract bundled model:", error);
      throw error;
    }
  }

  // Get model file path if it exists
  async getModelPath(fileName: string): Promise<string | null> {
    try {
      const localPath = `${this.modelsDirectory}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(localPath);

      if (fileInfo.exists) {
        return localPath;
      }

      return null;
    } catch (error) {
      console.error("Error checking model path:", error);
      return null;
    }
  }

  // Get information about a model file
  async getModelInfo(fileName: string): Promise<ModelInfo | null> {
    try {
      const localPath = `${this.modelsDirectory}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(localPath);

      if (fileInfo.exists) {
        const fileSize = "size" in fileInfo ? fileInfo.size : 0;
        return {
          name: fileName,
          version: "local",
          size: fileSize,
          url: "",
          localPath: localPath,
          isDownloaded: true,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting model info:", error);
      return null;
    }
  }

  // List all downloaded models
  async listDownloadedModels(): Promise<ModelInfo[]> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.modelsDirectory);
      if (!dirInfo.exists) {
        return [];
      }

      const files = await FileSystem.readDirectoryAsync(this.modelsDirectory);
      const models: ModelInfo[] = [];

      for (const file of files) {
        if (file.endsWith(".task")) {
          const modelInfo = await this.getModelInfo(file);
          if (modelInfo) {
            models.push(modelInfo);
          }
        }
      }

      return models;
    } catch (error) {
      console.error("Error listing models:", error);
      return [];
    }
  }

  // Delete a model file
  async deleteModel(fileName: string): Promise<boolean> {
    try {
      const localPath = `${this.modelsDirectory}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(localPath);

      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localPath);
        console.log("Model deleted:", localPath);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error deleting model:", error);
      return false;
    }
  }

  // Get available storage space
  async getAvailableSpace(): Promise<number> {
    try {
      const spaceInfo = await FileSystem.getFreeDiskStorageAsync();
      return spaceInfo;
    } catch (error) {
      console.error("Error getting available space:", error);
      return 0;
    }
  }

  // Validate model file integrity (basic size check)
  async validateModel(
    fileName: string,
    expectedSize?: number
  ): Promise<boolean> {
    try {
      const modelInfo = await this.getModelInfo(fileName);
      if (!modelInfo) {
        return false;
      }

      // Basic validation - file exists and has reasonable size
      if (modelInfo.size < 1000000) {
        // Less than 1MB is probably not a valid model
        console.warn("Model file seems too small:", modelInfo.size);
        return false;
      }

      // Check expected size if provided
      if (expectedSize && Math.abs(modelInfo.size - expectedSize) > 1000000) {
        // 1MB tolerance
        console.warn(
          "Model size mismatch. Expected:",
          expectedSize,
          "Actual:",
          modelInfo.size
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error validating model:", error);
      return false;
    }
  }

  // Get models directory path
  getModelsDirectory(): string {
    return this.modelsDirectory;
  }
}
