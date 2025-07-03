# Gemma Bridge Implementation Guide

## Overview

This document explains how the Gemma native bridge was implemented for iOS (completed) and what needs to be done for Android, along with usage instructions and testing guidelines.

## What We Accomplished

### ✅ iOS Implementation Completed

#### 1. Native Swift Bridge (`/ios/GemmaBridge.swift`)

**Before**: Only had a demo `greet` method with no Gemma integration.

**After**: Complete MediaPipe GenAI integration with:
- Proper MediaPipe framework imports
- Model loading from app bundle (`gemma.task`)
- Background queue processing for inference
- Error handling and async operations
- Two exposed methods: `generateResponse` and `isModelLoaded`

```swift
import Foundation
import MediaPipeTasksGenAI

@objc(GemmaBridge)
class GemmaBridge: NSObject {
    private var llmInference: LlmInference?
    private let modelQueue = DispatchQueue(label: "com.koa.gemma.model", qos: .userInitiated)
    
    override init() {
        super.init()
        initializeModel()
    }
    
    private func initializeModel() {
        modelQueue.async { [weak self] in
            guard let self = self else { return }
            
            guard let modelPath = Bundle.main.path(forResource: "gemma", ofType: "task") else {
                print("Error: Could not find gemma.task file in bundle")
                return
            }
            
            do {
                let options = LlmInference.Options(modelPath: modelPath)
                self.llmInference = try LlmInference(options: options)
                print("Gemma model initialized successfully")
            } catch {
                print("Error initializing Gemma model: \(error)")
            }
        }
    }
}
```

#### 2. Objective-C Bridge Registration (`/ios/GemmaBridge.m`)

**Updated** to expose the correct methods:
```objc
RCT_EXTERN_METHOD(generateResponse:(NSString *)prompt
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isModelLoaded:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
```

#### 3. Dependency Management (`/ios/Podfile`)

**Already correctly configured**:
```ruby
pod 'MediaPipeTasksGenAI'
pod 'MediaPipeTasksGenAIC'
```

#### 4. Model Asset Integration

- ✅ Model file (`gemma.task`) properly bundled in iOS app
- ✅ Build system copies model during compilation
- ✅ Model accessible via `Bundle.main.path(forResource:ofType:)`

### ✅ JavaScript Bridge Unification

#### Updated Bridge Interfaces

**Both bridge files now have consistent interfaces**:

`/lib/GemmaBridge.ts` (NativeModules approach):
```typescript
interface IGemmaBridge {
  generateResponse(prompt: string): Promise<string>;
  isModelLoaded(): Promise<boolean>;
}
```

`/GemmaBridge/NativeGemmaBridge.ts` (TurboModule approach):
```typescript
export interface Spec extends TurboModule {
  generateResponse(prompt: string): Promise<string>;
  isModelLoaded(): Promise<boolean>;
}
```

#### Fixed App Integration (`/app/index.tsx`)

**Updated import and usage**:
```typescript
import GemmaBridge from "../lib/GemmaBridge";

// Usage
const result = await GemmaBridge.generateResponse(prompt);
```

## How the Bridge Works

### Architecture Flow

```
React Native App (TypeScript)
       ↓
JavaScript Bridge (/lib/GemmaBridge.ts)
       ↓
React Native Bridge (iOS: GemmaBridge.m)
       ↓  
Native Implementation (iOS: GemmaBridge.swift)
       ↓
MediaPipe GenAI Framework
       ↓
Gemma Model (gemma.task)
```

### Key Components

1. **Model Loading**: Happens automatically on bridge initialization
2. **Background Processing**: All inference runs on dedicated queue
3. **Error Handling**: Comprehensive error reporting via React Native promises
4. **Memory Management**: Swift automatic reference counting handles cleanup

## Usage in React Native App

### Basic Implementation

```typescript
import React, { useState, useEffect } from 'react';
import GemmaBridge from '../lib/GemmaBridge';

export default function GemmaChat() {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    // Check if model is loaded
    checkModelStatus();
  }, []);

  const checkModelStatus = async () => {
    try {
      const isLoaded = await GemmaBridge.isModelLoaded();
      setModelReady(isLoaded);
    } catch (error) {
      console.error('Error checking model status:', error);
    }
  };

  const generateText = async (prompt: string) => {
    if (!modelReady) {
      setResponse('Model not ready yet. Please wait...');
      return;
    }

    setLoading(true);
    try {
      const result = await GemmaBridge.generateResponse(prompt);
      setResponse(result);
    } catch (error) {
      setResponse(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Your UI components here
  );
}
```

### Advanced Usage with Error Handling

```typescript
const handleGemmaRequest = async (prompt: string) => {
  try {
    // Check model status first
    const isModelLoaded = await GemmaBridge.isModelLoaded();
    
    if (!isModelLoaded) {
      throw new Error('Gemma model is not loaded yet');
    }

    // Generate response
    const response = await GemmaBridge.generateResponse(prompt);
    return response;
    
  } catch (error) {
    if (error.code === 'MODEL_NOT_LOADED') {
      // Handle model not loaded
      return 'Please wait for the model to finish loading...';
    } else if (error.code === 'INFERENCE_ERROR') {
      // Handle inference errors
      return 'Error generating response. Please try again.';
    } else {
      // Handle other errors
      return `Unexpected error: ${error.message}`;
    }
  }
};
```

## Android Implementation Requirements

### 🔄 What Needs to Be Done

The Android implementation is **partially complete** but needs these fixes:

#### 1. Fix Model Asset Management

**Current Issue**: Hardcoded path `/data/local/tmp/llm/gemma.task`

**Required Fix**:
```kotlin
// In GemmaBridgeModule.kt
private fun getModelPath(): String {
    return "${reactApplicationContext.filesDir}/models/gemma.task"
}

private fun copyModelFromAssets() {
    val assetManager = reactApplicationContext.assets
    val inputStream = assetManager.open("models/gemma.task")
    val outputFile = File("${reactApplicationContext.filesDir}/models/gemma.task")
    
    outputFile.parentFile?.mkdirs()
    outputFile.outputStream().use { outputStream ->
        inputStream.copyTo(outputStream)
    }
}
```

#### 2. Add Model to Android Assets

**Required**:
1. Create `android/app/src/main/assets/models/` directory
2. Place `gemma.task` file in the directory
3. Update `build.gradle` to handle large assets if needed

#### 3. Update Interface Consistency

**Current**: Android has `generateResponse` method ✅
**Needed**: Add `isModelLoaded` method to match iOS interface

```kotlin
@ReactMethod
fun isModelLoaded(promise: Promise) {
    promise.resolve(llmInference != null)
}
```

#### 4. Improve Error Handling

Add comprehensive error handling for:
- Model file not found
- Asset copying failures
- MediaPipe initialization errors
- Inference failures

## Testing Instructions

### Memory and Performance Testing

#### iOS Simulator Testing

1. **Launch with Memory Monitoring**:
```bash
cd /path/to/your/project
npx expo run:ios
# Open Xcode -> Window -> Devices and Simulators -> Select device -> Open memory graph
```

2. **Monitor Memory Usage**:
   - **Before model loading**: ~50-100MB baseline
   - **After model loading**: Expect +500MB-2GB depending on Gemma model size
   - **During inference**: Additional +100-500MB temporary allocation

3. **Performance Metrics**:
```bash
# Monitor CPU usage during inference
xcrun simctl spawn booted top -pid $(xcrun simctl spawn booted pgrep koa)
```

#### Testing Commands

1. **Check Model Loading**:
```typescript
// In your app
const isLoaded = await GemmaBridge.isModelLoaded();
console.log('Model loaded:', isLoaded);
```

2. **Test Simple Inference**:
```typescript
// Start with short prompts
const response = await GemmaBridge.generateResponse("Hello");
console.log('Response:', response);
```

3. **Test Model Performance**:
```typescript
// Measure response time
const startTime = Date.now();
const response = await GemmaBridge.generateResponse("Explain AI in simple terms");
const endTime = Date.now();
console.log(`Response time: ${endTime - startTime}ms`);
```

### Memory Requirements

#### Expected Memory Usage

| Component | Memory Usage |
|-----------|-------------|
| **Base App** | 50-100MB |
| **Gemma Model** | 500MB-2GB* |
| **Inference Buffer** | 100-500MB |
| **Total Peak** | 650MB-2.6GB |

*Depends on model size (Gemma 2B vs 7B variants)

#### Simulator vs Device

- **iOS Simulator**: Higher memory usage due to simulation overhead
- **Physical Device**: More accurate memory representation
- **Recommended**: Test on both, optimize for device performance

### Performance Benchmarks

#### Expected Response Times

| Model Size | Simple Query | Complex Query |
|------------|-------------|---------------|
| **Gemma 2B** | 1-3 seconds | 5-15 seconds |
| **Gemma 7B** | 3-8 seconds | 15-45 seconds |

#### Memory Optimization Tips

1. **Model Management**:
   - Load model once on app start
   - Keep model in memory during app lifetime
   - Unload only on memory pressure

2. **Inference Optimization**:
   - Use background queues for processing
   - Implement request cancellation
   - Batch multiple requests if possible

## Build and Test Commands

### iOS
```bash
# Clean build
cd ios && rm -rf Pods Podfile.lock && pod install && cd ..

# Run on simulator
npx expo run:ios

# Monitor logs
xcrun simctl spawn booted log show --predicate 'process == "koa"' --info --debug --last 2m
```

### Android (After Implementation)
```bash
# Clean build
cd android && ./gradlew clean && cd ..

# Run on emulator
npx expo run:android

# Monitor logs
adb logcat | grep koa
```

## Next Steps

1. **Complete Android Implementation** (1-2 days)
2. **Add Model Loading Progress** (Optional)
3. **Implement Request Cancellation** (Optional)
4. **Add Model Caching** (Performance optimization)
5. **Memory Pressure Handling** (Production readiness)

The iOS implementation is now fully functional and ready for testing. The Android implementation requires the fixes outlined above to achieve feature parity.