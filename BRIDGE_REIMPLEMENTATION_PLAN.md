# Bridge Reimplementation Plan for Purrpal AI

## Overview

Based on the analysis of the current implementation and latest MediaPipe GenAI documentation, this plan outlines the comprehensive reimplementation strategy to achieve your goals:

1. Focus bridge on native model loading and control through Expo
2. Pass tokens per second and MediaPipe info to frontend
3. Control model parameters from Expo
4. Implement proper model loading via Expo plugins
5. Use GPU on Android, CPU on iOS
6. Package bridge for reuse
7. Implement chat interface with context awareness
8. Auto-load model without warmup requirement

## Current State Assessment

### ✅ Already Implemented
- Complete iOS native bridge with MediaPipe integration
- Complete Android native bridge with GPU/CPU support
- Performance metrics tracking (tokens/sec, memory, timing)
- Model loading from assets
- Error handling and retry logic
- Basic chat interface

### 🔄 Needs Enhancement
- Model loading strategy (currently uses hardcoded bundled models)
- Parameter control from Expo (partial implementation)
- Modular packaging for reuse
- Context-aware conversation management
- Auto-loading without explicit warmup

## Phase 1: Enhanced Bridge Architecture

### 1.1 Modular Native Bridge Design

**Goal**: Redesign bridge to focus purely on model operations while exposing all control to Expo.

#### iOS Bridge Enhancements (`GemmaBridge.swift`)
```swift
// Enhanced interface focusing on model control
@objc(GemmaBridge)
class GemmaBridge: NSObject {
    // Core model operations
    @objc func loadModel(modelPath: String, config: [String: Any]) -> Promise
    @objc func unloadModel() -> Promise
    @objc func isModelReady() -> Promise<Bool>
    
    // Inference with full parameter control
    @objc func generateResponse(prompt: String, params: [String: Any]) -> Promise<String>
    
    // Real-time metrics for frontend
    @objc func getTokensPerSecond() -> Promise<Double>
    @objc func getMediaPipeInfo() -> Promise<[String: Any]>
    @objc func getModelMetrics() -> Promise<[String: Any]>
    
    // Parameter control
    @objc func updateModelConfig(config: [String: Any]) -> Promise<Bool>
    @objc func setInferenceParams(params: [String: Any]) -> Promise<Bool>
}
```

#### Android Bridge Enhancements (`GemmaBridgeModule.kt`)
```kotlin
class GemmaBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    // Enhanced model loading with GPU/CPU selection
    @ReactMethod
    fun loadModel(modelPath: String, useGPU: Boolean, config: ReadableMap, promise: Promise)
    
    @ReactMethod
    fun unloadModel(promise: Promise)
    
    @ReactMethod
    fun isModelReady(promise: Promise)
    
    // Enhanced inference with parameter control
    @ReactMethod
    fun generateResponse(prompt: String, params: ReadableMap, promise: Promise)
    
    // Real-time metrics
    @ReactMethod
    fun getTokensPerSecond(promise: Promise)
    
    @ReactMethod
    fun getMediaPipeInfo(promise: Promise)
    
    // GPU/CPU backend control
    @ReactMethod
    fun switchBackend(useGPU: Boolean, promise: Promise)
    
    @ReactMethod
    fun getBackendCapabilities(promise: Promise)
}
```

## Phase 2: Expo Plugin for Model Management

### 2.1 Create Expo Plugin for Model Assets

**File**: `expo-plugin-gemma-models/`

```typescript
// Plugin to handle large model files
export default function gemmaModelsPlugin(config: ExpoConfig) {
  return withPlugins(config, [
    // iOS plugin
    [
      withXcodeProject,
      async (config) => {
        // Add model files to iOS bundle
        // Handle large file optimization
        // Configure build settings for 4GB+ files
      }
    ],
    // Android plugin
    [
      withAndroidManifest,
      async (config) => {
        // Configure asset extraction
        // Set up model directory
        // Handle large asset management
      }
    ]
  ]);
}
```

### 2.2 Model Loading Strategy

#### Expo Plugin Implementation
```typescript
// expo-plugins/gemma-model-loader.ts
export class GemmaModelLoader {
  async downloadModel(modelUrl: string, targetPath: string): Promise<void> {
    // Download with progress tracking
    // Verify model integrity
    // Move to secure app storage
  }
  
  async extractBundledModel(): Promise<string> {
    // Extract from app bundle/assets
    // Validate model file
    // Return model path
  }
  
  async getModelInfo(modelPath: string): Promise<ModelInfo> {
    // Read model metadata
    // Validate compatibility
    // Return size, version, capabilities
  }
}
```

## Phase 3: Frontend Integration & Control

### 3.1 Enhanced JavaScript Bridge

```typescript
// lib/GemmaBridge.ts - Enhanced interface
export interface GemmaModelConfig {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  randomSeed: number;
  useGPU?: boolean; // Android only
  memoryOptimization?: 'speed' | 'memory' | 'balanced';
}

export interface TokenMetrics {
  tokensPerSecond: number;
  timeToFirstToken: number;
  totalTokens: number;
  averageTokenTime: number;
  peakTokensPerSecond: number;
}

export interface MediaPipeInfo {
  version: string;
  backend: 'CPU' | 'GPU' | 'TPU';
  device: string;
  memoryUsed: number;
  memoryTotal: number;
  modelSize: number;
  quantization: string;
  cacheSize: number;
}

class EnhancedGemmaBridge {
  // Model lifecycle
  async loadModel(modelPath: string, config: GemmaModelConfig): Promise<void>
  async unloadModel(): Promise<void>
  async isModelReady(): Promise<boolean>
  
  // Real-time metrics (called frequently)
  async getTokenMetrics(): Promise<TokenMetrics>
  async getMediaPipeInfo(): Promise<MediaPipeInfo>
  
  // Parameter control during runtime
  async updateConfig(config: Partial<GemmaModelConfig>): Promise<void>
  async setInferenceParams(params: InferenceParams): Promise<void>
  
  // Enhanced inference
  async generateWithMetrics(prompt: string): Promise<{
    response: string;
    metrics: TokenMetrics;
    timestamp: number;
  }>
}
```

### 3.2 Real-time Frontend Integration

```typescript
// hooks/useGemmaMetrics.ts
export function useGemmaMetrics() {
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [mediaPipeInfo, setMediaPipeInfo] = useState<MediaPipeInfo | null>(null);
  
  useEffect(() => {
    // Real-time metrics polling
    const interval = setInterval(async () => {
      const [tokenMetrics, mpInfo] = await Promise.all([
        GemmaBridge.getTokenMetrics(),
        GemmaBridge.getMediaPipeInfo()
      ]);
      setMetrics(tokenMetrics);
      setMediaPipeInfo(mpInfo);
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, []);
  
  return { metrics, mediaPipeInfo };
}
```

## Phase 4: GPU/CPU Selection Strategy

### 4.1 Android GPU Detection & Utilization

```kotlin
// Enhanced GPU detection and management
class GPUCapabilityDetector {
    fun detectGPUCapabilities(): GPUCapabilities {
        return GPUCapabilities(
            hasVulkan = hasVulkanSupport(),
            hasOpenGL = hasOpenGLSupport(),
            gpuMemory = getGPUMemory(),
            vulkanVersion = getVulkanVersion(),
            driverVersion = getDriverVersion(),
            recommendedBackend = selectOptimalBackend()
        )
    }
    
    fun selectOptimalBackend(): String {
        val capabilities = detectGPUCapabilities()
        val deviceRAM = getDeviceRAM()
        
        return when {
            capabilities.hasVulkan && deviceRAM >= 8_000_000_000 -> "GPU"
            capabilities.hasOpenGL && deviceRAM >= 6_000_000_000 -> "GPU_FALLBACK"
            else -> "CPU"
        }
    }
}
```

### 4.2 iOS CPU Optimization

```swift
// Enhanced iOS CPU optimization
class iOSCPUOptimizer {
    func optimizeForDevice() -> CPUOptimizations {
        let deviceInfo = getDeviceInfo()
        
        return CPUOptimizations(
            coreCount = ProcessInfo.processInfo.processorCount,
            memoryPressureHandling = true,
            backgroundPriorityQoS = .userInitiated,
            thermalStateMonitoring = true,
            batteryOptimizations = deviceInfo.isLowPowerModeEnabled
        )
    }
}
```

## Phase 5: Reusable Bridge Package

### 5.1 NPM Package Structure

```
react-native-gemma-bridge/
├── src/
│   ├── index.ts                 # Main interface
│   ├── types.ts                 # TypeScript definitions
│   ├── GemmaBridge.ts           # Bridge implementation
│   └── hooks/
│       ├── useGemmaModel.ts     # Model management hook
│       ├── useGemmaMetrics.ts   # Metrics hook
│       └── useGemmaChat.ts      # Chat interface hook
├── ios/
│   ├── GemmaBridge.swift        # iOS implementation
│   ├── GemmaBridge.m           # Objective-C bridge
│   └── GemmaBridge.podspec     # CocoaPods spec
├── android/
│   ├── src/main/java/com/reactnativegemmabridte/
│   │   ├── GemmaBridgeModule.kt
│   │   └── GemmaBridgePackage.kt
│   └── build.gradle
├── expo-plugin/
│   └── gemma-model-plugin.ts   # Expo plugin for model management
└── package.json
```

### 5.2 Package Configuration

```json
// package.json
{
  "name": "react-native-gemma-bridge",
  "version": "1.0.0",
  "description": "React Native bridge for Google Gemma AI models with MediaPipe",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "files": ["lib/", "ios/", "android/", "expo-plugin/"],
  "dependencies": {
    "react-native": ">=0.70.0"
  },
  "peerDependencies": {
    "expo": ">=49.0.0"
  }
}
```

## Phase 6: Context-Aware Chat Interface

### 6.1 Conversation Management

```typescript
// services/ConversationManager.ts
export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();
  private currentConversationId: string | null = null;
  
  async startConversation(id: string, systemPrompt?: string): Promise<void> {
    const conversation = new Conversation(id, systemPrompt);
    this.conversations.set(id, conversation);
    this.currentConversationId = id;
  }
  
  async addMessage(role: 'user' | 'assistant', content: string): Promise<void> {
    const conversation = this.getCurrentConversation();
    conversation.addMessage(role, content);
    
    // Maintain context window (e.g., last 10 messages)
    if (conversation.messages.length > 20) {
      conversation.trimToContextWindow(10);
    }
  }
  
  async generateContextualResponse(prompt: string): Promise<string> {
    const conversation = this.getCurrentConversation();
    const contextualPrompt = conversation.buildContextualPrompt(prompt);
    
    const response = await GemmaBridge.generateResponse(contextualPrompt);
    await this.addMessage('user', prompt);
    await this.addMessage('assistant', response);
    
    return response;
  }
}
```

### 6.2 Enhanced Chat UI

```typescript
// components/ContextAwareChatInterface.tsx
export default function ContextAwareChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const { metrics, mediaPipeInfo } = useGemmaMetrics();
  const conversationManager = useConversationManager();
  
  const sendMessage = async (message: string) => {
    const response = await conversationManager.generateContextualResponse(message);
    // UI updates automatically through conversation state
  };
  
  return (
    <View style={styles.container}>
      {/* Real-time metrics display */}
      <MetricsDisplay metrics={metrics} mediaPipeInfo={mediaPipeInfo} />
      
      {/* Conversation selector */}
      <ConversationTabs 
        conversations={conversations}
        current={currentConversation}
        onSelect={setCurrentConversation}
      />
      
      {/* Chat messages with context indicators */}
      <ChatMessages 
        conversation={conversationManager.getCurrentConversation()}
        showContext={true}
      />
      
      {/* Input with parameter controls */}
      <ChatInput onSend={sendMessage} />
      
      {/* Model parameter controls */}
      <ModelParameterControls />
    </View>
  );
}
```

## Phase 7: Auto-Loading Without Warmup

### 7.1 Background Model Initialization

```typescript
// services/ModelAutoLoader.ts
export class ModelAutoLoader {
  private loadingPromise: Promise<void> | null = null;
  
  async initializeOnAppStart(): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;
    
    this.loadingPromise = this.performBackgroundLoad();
    return this.loadingPromise;
  }
  
  private async performBackgroundLoad(): Promise<void> {
    // Load in background with low priority
    const modelPath = await this.getModelPath();
    const config = await this.getOptimalConfig();
    
    // Load model with progress tracking
    await GemmaBridge.loadModel(modelPath, config);
    
    // Verify model is ready
    const isReady = await GemmaBridge.isModelReady();
    if (!isReady) {
      throw new Error('Model failed to load properly');
    }
    
    console.log('Model auto-loaded successfully');
  }
  
  async waitForModelReady(timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const isReady = await GemmaBridge.isModelReady();
      if (isReady) return true;
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return false;
  }
}
```

### 7.2 App Integration

```typescript
// App.tsx - Auto-loading integration
export default function App() {
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  
  useEffect(() => {
    const autoLoader = new ModelAutoLoader();
    
    // Start loading immediately
    autoLoader.initializeOnAppStart()
      .then(() => setModelStatus('ready'))
      .catch(() => setModelStatus('error'));
    
    // Show progress to user
    const checkProgress = setInterval(async () => {
      const isReady = await GemmaBridge.isModelReady();
      if (isReady) {
        setModelStatus('ready');
        clearInterval(checkProgress);
      }
    }, 1000);
    
    return () => clearInterval(checkProgress);
  }, []);
  
  if (modelStatus === 'loading') {
    return <ModelLoadingScreen />;
  }
  
  return <ContextAwareChatInterface />;
}
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Enhanced bridge interface design
- [ ] Expo plugin for model management
- [ ] GPU/CPU selection implementation

### Week 2: Core Features
- [ ] Real-time metrics integration
- [ ] Parameter control from Expo
- [ ] Auto-loading implementation

### Week 3: Advanced Features
- [ ] Context-aware conversation management
- [ ] Reusable package creation
- [ ] Performance optimization

### Week 4: Testing & Polish
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Performance benchmarking

## Success Metrics

1. **Model Loading**: Auto-loads without user intervention within 30 seconds
2. **Performance**: Real-time tokens/sec display with <100ms update latency
3. **Control**: All model parameters controllable from Expo interface
4. **Context**: Conversation context maintained across sessions
5. **Reusability**: Package can be integrated into new projects in <10 minutes
6. **Platform Optimization**: GPU on Android, optimized CPU on iOS

This plan addresses all your requirements while building on the existing solid foundation. The implementation focuses on modularity, performance, and user experience.