# 🐱 PurrPal AI - On-Device Gemma Integration

[![React Native](https://img.shields.io/badge/React%20Native-0.79.5-blue.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-53.0.16-black.svg)](https://expo.dev/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.11-orange.svg)](https://mediapipe.dev/)
[![iOS](https://img.shields.io/badge/iOS-15.1+-lightgrey.svg)](https://developer.apple.com/ios/)
[![Android](https://img.shields.io/badge/Android-API%2021+-green.svg)](https://developer.android.com/)

A production-ready React Native Expo app demonstrating **on-device AI inference** using Google's Gemma 3na models (2B/4B) with a custom MediaPipe bridge. Run large language models completely offline on mobile devices.

## ✨ Features

- 🧠 **On-Device AI**: Complete offline inference with Google Gemma 3na models (2B/4B)
- 📱 **Cross-Platform**: Native iOS/Android implementation with React Native
- ⚡ **Real-Time Metrics**: Performance monitoring with tokens/sec tracking
- 💬 **Chat Interface**: Interactive conversation with history
- 🔧 **Model Management**: Dynamic loading/unloading with device optimization
- 🎯 **GPU Acceleration**: Android GPU support with CPU fallback
- 📊 **Performance Analytics**: Detailed inference metrics and trends

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- React Native development environment ([Setup Guide](https://reactnative.dev/docs/environment-setup))
- Gemma 3na model file (`gemma.task`) - [Download Guide](#-model-setup)

### Installation

```bash
# Clone the repository  
git clone https://github.com/YOUR-USERNAME/PurrPal-GemmaApp.git
cd PurrPal-GemmaApp/purrpal

# Install dependencies
npm install

# iOS setup (macOS only)
cd ios && pod install && cd ..
```

### 📱 Model Setup

#### Android

1. Create `Documents/gemma/` folder on your device
2. Place `gemma.task` file in the folder
3. App will auto-detect the model

#### iOS

1. Add `gemma.task` to your Xcode project bundle
2. Ensure file is included in build target

### Run the App

```bash
# Development builds
npx expo run:ios       # iOS Simulator/Device
npx expo run:android   # Android Emulator/Device

# Web preview (limited functionality)
npx expo start --web
```

## 🏗️ Architecture

### Native Bridge Implementation

Our custom MediaPipe bridge provides:

```typescript
// Enhanced TypeScript interface
interface GemmaBridge {
  loadModel(fileName?: string): Promise<boolean>;
  generateResponse(prompt: string): Promise<string>;
  getRealtimeMetrics(): Promise<PerformanceMetrics>;
  getDeviceCapabilities(): Promise<DeviceInfo>;
}
```

#### Platform-Specific Features

**Android** (`GemmaBridgeModule.kt`):

- GPU delegate with automatic CPU fallback
- Dynamic memory management
- Background thread processing
- Vulkan compute detection

**iOS** (`GemmaBridge.swift`):

- CPU-optimized inference
- Memory-efficient processing
- Dispatch queue management
- Thread-safe operations

## 📊 Performance

### Benchmark Results

- **Gemma 3na 2B**: ~20-30 tokens/sec (Android GPU)
- **Gemma 3na 4B**: ~10-15 tokens/sec (Android GPU)
- **Gemma 3na 2B**: ~12-18 tokens/sec (Android CPU)
- **Gemma 3na 4B**: ~6-10 tokens/sec (Android CPU)
- **Gemma 3na 2B**: ~8-12 tokens/sec (iOS CPU)
- **Gemma 3na 4B**: ~4-8 tokens/sec (iOS CPU)

### Optimization Features

- Intelligent device capability detection
- Automatic CPU/GPU delegate selection
- Real-time performance monitoring
- Memory usage optimization

## 🛠️ Development

### Project Structure

```text
purrpal/
├── android/               # Android native code
│   └── app/src/main/java/com/anonymous/purrpal/
│       ├── GemmaBridgeModule.kt    # Main bridge
│       └── GemmaBridgePackage.kt   # Module registration
├── ios/                   # iOS native code
│   ├── GemmaBridge.swift          # Main bridge
│   └── GemmaBridge.m              # Objective-C header
├── lib/                   # TypeScript bridge layer
│   ├── GemmaBridge.ts            # Enhanced interface
│   └── managers/                 # Model & metrics managers
└── app/                   # React Native screens
```

### Key Components

- **ModelManager**: Handles model lifecycle and device optimization
- **MetricsManager**: Real-time performance tracking and analytics
- **FileManager**: Model file operations and validation
- **PermissionManager**: Device access and capability checks

## 🔧 Configuration

### Model Options

```typescript
await GemmaBridge.configure({
  maxTokens: 512,
  temperature: 0.8,
  useGPU: true, // Android only
  enableMetrics: true,
});
```

### Performance Tuning

- **Android**: GPU acceleration on compatible devices (4GB+ RAM)
- **iOS**: CPU-optimized processing with Core ML integration
- **Memory**: Automatic model unloading on low memory

## 📚 API Reference

### Core Methods

```typescript
// Model Management
loadModel(fileName?: string): Promise<boolean>
unloadModel(): Promise<boolean>
isModelLoaded(): Promise<boolean>

// Inference
generateResponse(prompt: string): Promise<string>
generateResponseWithMetrics(prompt: string): Promise<ResponseWithMetrics>

// Analytics
getRealtimeMetrics(): Promise<PerformanceMetrics>
getPerformanceStats(): Promise<PerformanceStats>
getDeviceCapabilities(): Promise<DeviceCapabilities>
```

## 🔒 Security & Privacy

- **100% On-Device**: No data leaves your device
- **No API Keys**: Complete offline operation
- **Privacy First**: No telemetry or tracking
- **Secure Storage**: Model files encrypted at rest

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Google MediaPipe]([https://mediapipe.dev/](https://ai.google.dev/edge/mediapipe/solutions/guide)) for the inference framework
- [Google AI]((https://ai.google.dev/gemma/docs/gemma-3n)) for Gemma 3na models
- [Expo](https://expo.dev/) for the React Native framework

## Made with ❤️ for the React Native & AI community
