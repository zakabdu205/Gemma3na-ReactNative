import type { TurboModule } from "react-native/Libraries/TurboModule/RCTExport";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  generateResponse(prompt: string): Promise<string>;
  isModelLoaded(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>("GemmaBridge");
