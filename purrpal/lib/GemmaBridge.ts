import { NativeModules } from "react-native";

const { GemmaBridge } = NativeModules;

interface IGemmaBridge {
  generateResponse(prompt: string): Promise<string>;
  isModelLoaded(): Promise<boolean>;
}

export default GemmaBridge as IGemmaBridge;
