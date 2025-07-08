import { Platform, PermissionsAndroid, Alert, Linking } from "react-native";

export type ModelAccessStrategy =
  | "bundled"
  | "external"
  | "download"
  | "denied";

export interface PermissionStatus {
  hasPermission: boolean;
  strategy: ModelAccessStrategy;
  canRequestPermission: boolean;
  shouldShowRationale: boolean;
}

export class PermissionManager {
  private static instance: PermissionManager;

  private constructor() {}

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  // Check if storage permission is granted
  async hasStoragePermission(): Promise<boolean> {
    if (Platform.OS === "ios") {
      return true; // iOS uses bundled model, no permission needed
    }

    try {
      // Check traditional storage permissions
      const hasLegacyRead = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );
      const hasLegacyWrite = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
      );

      return hasLegacyRead && hasLegacyWrite;
    } catch (error) {
      console.error("Error checking storage permission:", error);
      return false;
    }
  }

  // Request storage permission
  async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS === "ios") {
      return true; // iOS uses bundled model
    }

    try {
      // Show explanation before requesting permission
      const shouldRequest = await this.showPermissionRationale();
      if (!shouldRequest) {
        return false;
      }

      // Request traditional permissions
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      return (
        granted["android.permission.READ_EXTERNAL_STORAGE"] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.WRITE_EXTERNAL_STORAGE"] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.error("Error requesting storage permission:", error);
      return false;
    }
  }

  // Show permission rationale to user
  private async showPermissionRationale(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        "Storage Access Required",
        "Purrpal needs access to your device storage to load the AI model. The model file is stored in your Documents folder and is about 4GB in size.\n\nWithout this permission, the app cannot function properly.",
        [
          {
            text: "Not Now",
            onPress: () => resolve(false),
            style: "cancel",
          },
          {
            text: "Grant Permission",
            onPress: () => resolve(true),
          },
        ]
      );
    });
  }

  // Open app settings for manual permission grant
  async openAppSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error("Error opening app settings:", error);
      Alert.alert(
        "Unable to Open Settings",
        "Please manually go to Settings > Apps > Purrpal > Permissions to grant storage access."
      );
    }
  }

  // Get comprehensive permission status
  async getPermissionStatus(): Promise<PermissionStatus> {
    if (Platform.OS === "ios") {
      return {
        hasPermission: true,
        strategy: "bundled",
        canRequestPermission: false,
        shouldShowRationale: false,
      };
    }

    const hasPermission = await this.hasStoragePermission();

    if (hasPermission) {
      return {
        hasPermission: true,
        strategy: "external",
        canRequestPermission: false,
        shouldShowRationale: false,
      };
    }

    return {
      hasPermission: false,
      strategy: "denied",
      canRequestPermission: true,
      shouldShowRationale: false,
    };
  }

  // Determine the best model access strategy
  async getModelAccessStrategy(): Promise<ModelAccessStrategy> {
    const status = await this.getPermissionStatus();

    if (Platform.OS === "ios") {
      return "bundled";
    }

    if (status.hasPermission) {
      return "external";
    }

    // If permission is denied and we can't request it, suggest download
    if (!status.canRequestPermission) {
      return "download";
    }

    return "denied";
  }

  // Handle permission denied with user-friendly options
  async handlePermissionDenied(): Promise<void> {
    Alert.alert(
      "Storage Permission Required",
      "Purrpal needs storage access to load the AI model. You can either:\n\n• Grant permission in Settings\n• Use a smaller model (coming soon)\n• Exit the app",
      [
        {
          text: "Exit App",
          onPress: () => {
            console.log("User chose to exit app");
          },
          style: "destructive",
        },
        {
          text: "Open Settings",
          onPress: () => this.openAppSettings(),
        },
      ]
    );
  }

  // Check if current platform supports the permission
  supportsStoragePermission(): boolean {
    return Platform.OS === "android";
  }

  // Get user-friendly permission explanation
  getPermissionExplanation(): string {
    if (Platform.OS === "ios") {
      return "Model is bundled with the app - no permission needed.";
    }

    return "Storage permission is needed to access the model file in your Documents folder.";
  }
}

export default PermissionManager;
