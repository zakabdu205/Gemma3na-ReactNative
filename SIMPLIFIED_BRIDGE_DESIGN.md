# Simplified Native Bridge Design - Phase 1

## Overview

The current native implementations are complex with lots of logic that should be handled on the React Native side. This design simplifies the native bridges to focus only on:

1. **Model Loading/Unloading** from specified file paths
2. **Basic Inference** with minimal validation
3. **Simple Status Checks** (loaded/not loaded)
4. **Raw Performance Data** (timing only)

Everything else (metrics calculation, error handling, retries, configuration, UI state) moves to the RN/Expo side.

## Current Complexity Analysis

### What's Currently in Native (Should Move to RN):
- ❌ Complex retry logic and error handling
- ❌ Performance metrics calculation and storage
- ❌ Model configuration and parameter management
- ❌ Memory tracking and optimization
- ❌ Asset extraction and file management
- ❌ Wake lock management
- ❌ Complex validation and input sanitization
- ❌ Warmup logic and model preloading
- ❌ Background initialization and state management

### What Should Stay in Native (Core MediaPipe Operations):
- ✅ Model loading from file path
- ✅ Model unloading
- ✅ Basic inference call
- ✅ Simple status check
- ✅ Raw timing data

## Simplified Native Interface

### Core Methods (Both iOS & Android)
```typescript
interface SimplifiedGemmaBridge {
  // Model lifecycle - simple operations
  loadModel(filePath: string, useGPU: boolean): Promise<boolean>;
  unloadModel(): Promise<boolean>;
  isModelLoaded(): Promise<boolean>;
  
  // Simple inference with raw timing
  generateResponse(prompt: string): Promise<{
    response: string;
    inferenceTimeMs: number;
    tokenCount: number;
  }>;
  
  // Basic device info
  getDeviceInfo(): Promise<{
    platform: string;
    supportsGPU: boolean;
    totalMemoryMB: number;
  }>;
}
```

## Implementation Plan

### Step 1: Create Simplified iOS Bridge
**File**: `/ios/GemmaBridgeSimple.swift`

### Step 2: Create Simplified Android Bridge  
**File**: `/android/.../GemmaBridgeSimple.kt`

### Step 3: Create RN Model Manager
**File**: `/lib/ModelManager.ts` - Handles all complex logic

### Step 4: Create RN Metrics Manager
**File**: `/lib/MetricsManager.ts` - Handles performance tracking

### Step 5: Create RN File Manager
**File**: `/lib/FileManager.ts` - Handles model downloads and storage

## Benefits of Simplification

1. **Native Reliability**: Less native code = fewer crashes
2. **Easier Debugging**: Most logic in JavaScript
3. **Better Modularity**: Clear separation of concerns
4. **Faster Iteration**: Changes don't require native rebuilds
5. **Better Testing**: JavaScript code is easier to test
6. **Cross-Platform Consistency**: Logic shared between platforms

## File Structure After Simplification

```
lib/
├── bridges/
│   ├── SimplifiedGemmaBridge.ts     # Simple native interface
│   └── index.ts
├── managers/
│   ├── ModelManager.ts              # Model lifecycle & config
│   ├── MetricsManager.ts            # Performance tracking
│   ├── FileManager.ts               # File downloads & storage
│   └── ErrorManager.ts              # Error handling & retry logic
├── hooks/
│   ├── useGemmaModel.ts             # Model state hook
│   ├── useGemmaMetrics.ts           # Metrics hook
│   └── useModelDownload.ts          # Download progress hook
└── types/
    └── GemmaTypes.ts                # TypeScript definitions
```

This design makes the native code much simpler and moves all complex logic to the more flexible RN environment.