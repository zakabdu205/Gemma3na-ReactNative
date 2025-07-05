# Gemma Bridge Documentation

## Overview

This documentation covers the production-ready implementation of Gemma LLM bridge for React Native Expo applications, with optimizations for memory-constrained devices.

## Quick Start

```typescript
import GemmaBridge from './lib/GemmaBridge';

// Check if model is loaded
const loaded = await GemmaBridge.isModelLoaded();

// Generate response
const response = await GemmaBridge.generateResponse("Hello, how are you?");

// Get performance metrics
const metrics = await GemmaBridge.getPerformanceMetrics();
```

## Device Compatibility

### ✅ Supported Devices

| Device | RAM | Status | Expected Performance |
|--------|-----|--------|---------------------|
| iPhone 15 Pro | 8GB | ✅ Excellent | 15+ tokens/sec |
| iPhone 15 | 6GB | ✅ Good | 12-15 tokens/sec |
| iPad Pro M2 | 8-16GB | ✅ Excellent | 20+ tokens/sec |
| Android Flagship | 8GB+ | ✅ Excellent | 15-20 tokens/sec |
| Android Mid-range | 6GB+ | ✅ Good | 10-15 tokens/sec |

### ⚠️ Limited Support

| Device | RAM | Status | Recommendations |
|--------|-----|--------|----------------|
| iPhone 14 | 6GB | ⚠️ Limited | Use smaller model |
| iPhone 13 | 4-6GB | ⚠️ Limited | iOS Simulator only |
| Android Budget | 4GB | ⚠️ Limited | Consider cloud API |

### ❌ Not Recommended

| Device | RAM | Status | Alternative |
|--------|-----|--------|-------------|
| iPhone 12 | 4GB | ❌ Crashes | Use Gemini API |
| Older Android | <4GB | ❌ OOM | Use Gemini API |

## Memory Optimization Strategies

### 1. Device Detection & Fallback

```typescript
// Automatic device capability detection
const backendInfo = await GemmaBridge.getBackendInfo();
const metrics = await GemmaBridge.getPerformanceMetrics();

if (metrics.peakMemoryMB > 8000) {
  console.warn('High memory usage detected, consider optimization');
}
```

### 2. Model Size Optimization

```typescript
// For memory-constrained devices
const config = {
  maxTokens: 256,      // Reduce from 1000
  temperature: 0.5,    // Lower temperature
  topK: 20            // Reduce from 40
};

await GemmaBridge.configure(config);
```

### 3. Memory Management

```typescript
// Reset memory tracking
await GemmaBridge.resetMemoryTracking();

// Monitor memory usage
const metrics = await GemmaBridge.getPerformanceMetrics();
console.log(`Peak Memory: ${metrics.peakMemoryMB}MB`);
```

## Performance Optimization

### Lazy Loading Strategy

The bridge implements lazy loading to minimize startup memory usage:

```typescript
// Model loads only when first inference is requested
const response = await GemmaBridge.generateResponse("test"); // Triggers loading
```

### Memory-Aware Configuration

```typescript
// Get available memory before initialization
const isLowMemoryDevice = () => {
  // Implement platform-specific memory detection
  return Platform.OS === 'ios' && DeviceInfo.getTotalMemory() < 6000000000;
};

if (isLowMemoryDevice()) {
  await GemmaBridge.configure({
    maxTokens: 128,
    temperature: 0.3,
    topK: 10
  });
}
```

## Error Handling

### Common Error Codes

```typescript
enum GemmaErrorCode {
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED', 
  INFERENCE_ERROR = 'INFERENCE_ERROR',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  BACKEND_NOT_SUPPORTED = 'BACKEND_NOT_SUPPORTED'
}
```

### Error Recovery

```typescript
try {
  const response = await GemmaBridge.generateResponse(prompt);
} catch (error) {
  switch (error.code) {
    case 'OUT_OF_MEMORY':
      // Reduce model parameters
      await GemmaBridge.configure({ maxTokens: 64 });
      break;
    case 'MODEL_LOAD_FAILED':
      // Fallback to cloud API
      return await callGeminiAPI(prompt);
    default:
      console.error('Unexpected error:', error);
  }
}
```

## Architecture

### iOS Implementation

- **Singleton Pattern**: Prevents multiple model instances
- **Lazy Loading**: Model loads on first use
- **Memory Pressure Handling**: Automatic cleanup on low memory
- **XNNPACK Cache Fix**: Uses Documents directory for cache

### Android Implementation

- **Singleton Pattern**: `GemmaBridgeCore` prevents duplicates
- **GPU Detection**: Automatic fallback to CPU if GPU fails
- **Wake Lock**: Prevents sleep during inference
- **Asset Extraction**: Model extracted to app files directory

## Performance Benchmarks

### Expected Performance (React Native overhead ~20-30%)

| Device Type | TTFT | Tokens/sec | Memory Usage |
|-------------|------|------------|--------------|
| iPhone 15 Pro | 8-10s | 12-15 | 1.2-1.5GB |
| iPhone 15 | 10-12s | 10-12 | 1.5-2GB |
| Android Flagship | 6-8s | 15-18 | 1-1.5GB |
| Android Mid-range | 8-12s | 8-12 | 1.5-2.5GB |

### Memory Limits

- **Safe Usage**: Under 1.5GB peak memory
- **Warning Zone**: 1.5-3GB (monitor closely)
- **Critical**: Over 3GB (likely to crash)

## iPhone 14 Specific Issues

### Problem: XNNPACK Runtime Failures
```
ERROR: failed to create XNNPACK runtime
libc++abi: terminating due to uncaught exception of type std::bad_alloc
```

### Root Cause
The 4.1GB Gemma model exceeds iPhone 14's available memory after iOS overhead.

### Solutions

#### Option 1: Use Smaller Model (Recommended)
- **Gemma 2B**: ~1.5GB memory usage
- **Gemma 1B**: ~800MB memory usage
- Trade-off: Reduced quality for compatibility

#### Option 2: Dynamic Model Loading
```typescript
const getModelForDevice = () => {
  const deviceMemory = DeviceInfo.getTotalMemory();
  
  if (deviceMemory < 6000000000) { // < 6GB
    return 'gemma-2b.task';
  } else if (deviceMemory < 8000000000) { // < 8GB  
    return 'gemma-3b.task';
  } else {
    return 'gemma-4b.task'; // Full model
  }
};
```

#### Option 3: Cloud Fallback
```typescript
const generateResponse = async (prompt: string) => {
  try {
    // Try local model first
    return await GemmaBridge.generateResponse(prompt);
  } catch (error) {
    if (error.code === 'OUT_OF_MEMORY') {
      // Fallback to Gemini API
      return await callGeminiAPI(prompt);
    }
    throw error;
  }
};
```

## Testing Strategy

### Memory Testing
```typescript
const testMemoryUsage = async () => {
  await GemmaBridge.resetMemoryTracking();
  
  // Test with various prompt sizes
  const prompts = [
    "Hi",
    "Tell me a short story.",
    "Explain quantum computing in detail."
  ];
  
  for (const prompt of prompts) {
    await GemmaBridge.generateResponse(prompt);
    const metrics = await GemmaBridge.getPerformanceMetrics();
    console.log(`Prompt length: ${prompt.length}, Memory: ${metrics.peakMemoryMB}MB`);
  }
};
```

### Performance Testing
```typescript
const benchmarkPerformance = async () => {
  const start = Date.now();
  const response = await GemmaBridge.generateResponse("Benchmark test");
  const totalTime = Date.now() - start;
  
  const metrics = await GemmaBridge.getPerformanceMetrics();
  
  return {
    totalTime,
    tokensPerSecond: metrics.tokensPerSecond,
    timeToFirstToken: metrics.timeToFirstToken,
    memoryUsage: metrics.peakMemoryMB
  };
};
```

## Production Deployment

### Pre-deployment Checklist

- [ ] Test on target devices (especially iPhone 14/13)
- [ ] Implement memory monitoring
- [ ] Add cloud API fallback
- [ ] Configure appropriate model size for device capabilities
- [ ] Test error recovery flows
- [ ] Monitor memory usage in production

### Monitoring

```typescript
const monitorPerformance = async () => {
  const metrics = await GemmaBridge.getPerformanceMetrics();
  
  // Log to analytics
  Analytics.track('gemma_performance', {
    tokensPerSecond: metrics.tokensPerSecond,
    memoryUsage: metrics.peakMemoryMB,
    device: Platform.OS,
    modelSize: '4.1GB'
  });
  
  // Alert on high memory usage
  if (metrics.peakMemoryMB > 2000) {
    console.warn('High memory usage detected');
  }
};
```

## Troubleshooting

### Common Issues

1. **Model not found**
   - Verify model file is in iOS bundle/Android assets
   - Check file permissions

2. **High memory usage**
   - Reduce maxTokens in configuration
   - Use smaller model variant
   - Implement memory monitoring

3. **Slow performance**
   - Enable GPU on Android
   - Reduce prompt length
   - Use warmup on app start

4. **Crashes on iPhone 14**
   - Use Gemma 2B or 1B model
   - Implement cloud fallback
   - Add memory pre-checks

### Debug Commands

```typescript
// Get debug information
const debugInfo = {
  modelLoaded: await GemmaBridge.isModelLoaded(),
  backendInfo: await GemmaBridge.getBackendInfo(),
  metrics: await GemmaBridge.getPerformanceMetrics()
};

console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));
```

## API Reference

### Core Methods

```typescript
interface IGemmaBridge {
  generateResponse(prompt: string): Promise<string>;
  isModelLoaded(): Promise<boolean>;
  getBackendInfo(): Promise<BackendInfo>;
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
  configure(options: GemmaConfig): Promise<void>;
  generateResponseWithProgress(prompt: string, callback: StreamingCallback): Promise<string>;
  warmupModel?(): Promise<void>;
  resetMemoryTracking?(): Promise<boolean>;
}
```

### Configuration Options

```typescript
interface GemmaConfig {
  maxTokens?: number;    // Default: 1000, Recommended for low-memory: 128-256
  useGPU?: boolean;      // Android only, auto-detected
  temperature?: number;  // Default: 0.7, Range: 0.0-1.0
  topK?: number;        // Default: 40, Recommended for low-memory: 10-20
  randomSeed?: number;  // Default: 42
}
```

### Performance Metrics

```typescript
interface PerformanceMetrics {
  modelLoadTime: number;      // Time to load model (ms)
  timeToFirstToken: number;   // Time to first token (ms)
  tokensPerSecond: number;    // Generation speed
  totalTokens: number;        // Tokens in last response
  peakMemoryMB: number;       // Peak memory usage (MB)
  inferenceTime: number;      // Last inference time (ms)
  lastInferenceTimestamp: number; // Timestamp of last inference
}
```

## Changelog

### v1.0.0 (Phase 4 - Production Ready)
- ✅ Singleton pattern implementation
- ✅ Lazy loading optimization
- ✅ Memory pressure handling
- ✅ iPhone 14 compatibility analysis
- ✅ Comprehensive error handling
- ✅ Performance monitoring
- ✅ Production documentation

### Known Limitations
- iPhone 14 requires smaller model or cloud fallback
- XNNPACK cache permissions on iOS
- React Native overhead reduces performance by 20-30%
- No true streaming support (pseudo-streaming implemented)

## Support

For issues and feature requests, please refer to the implementation files:
- iOS: `ios/GemmaBridge.swift`
- Android: `android/app/src/main/java/com/anonymous/purrpal/GemmaBridgeModule.kt`
- TypeScript: `lib/GemmaBridge.ts`