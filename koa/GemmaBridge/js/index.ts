import { NativeModules } from "react-native";

const LINKING_ERROR =
  `The package 'react-native-gemma-bridge' doesn't seem to be linked. Make sure: \n\n` +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo Go\n";

// This is a JSI module, so we need to use the global object
const GemmaBridge = (global as any).GemmaBridge
  ? (global as any).GemmaBridge
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export function generateResponse(prompt: string): Promise<string> {
  return GemmaBridge.generateResponse(prompt);
}
