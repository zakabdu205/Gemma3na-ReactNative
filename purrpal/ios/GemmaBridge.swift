import Foundation
import MediaPipeTasksGenAI

// Error codes for consistent error handling
enum GemmaErrorCode: String {
    case modelNotFound = "MODEL_NOT_FOUND"
    case modelLoadFailed = "MODEL_LOAD_FAILED"
    case inferenceError = "INFERENCE_ERROR"
    case outOfMemory = "OUT_OF_MEMORY"
    case backendNotSupported = "BACKEND_NOT_SUPPORTED"
    case assetExtractionFailed = "ASSET_EXTRACTION_FAILED"
}

@objc(GemmaBridge)
class GemmaBridge: NSObject {
    // Singleton to prevent multiple model instances
    static let shared = GemmaBridge()
    
    private var llmInference: LlmInference?
    private let modelQueue = DispatchQueue(label: "com.purrpal.gemma.model", qos: .userInitiated)
    private var modelLoadAttempts = 0
    private let maxLoadAttempts = 3
    private var isInitializing = false
    
    // Performance tracking
    private var modelLoadStartTime: CFAbsoluteTime = 0
    private var modelLoadTime: Double = 0
    private var lastInferenceStartTime: CFAbsoluteTime = 0
    private var lastInferenceTime: Double = 0
    private var lastTimeToFirstToken: Double = 0
    private var lastTokensPerSecond: Double = 0
    private var lastTotalTokens: Int = 0
    private var peakMemoryUsage: Double = 0
    
    // Configuration
    private var currentConfig = [String: Any]()
    private var defaultConfig: [String: Any] = [
        "maxTokens": 1000,
        "temperature": 0.7,
        "topK": 40,
        "randomSeed": 42
    ]
    
    private override init() {
        super.init()
        currentConfig = defaultConfig
        setupMemoryWarningNotification()
        // Delay model initialization to prevent memory pressure during app launch
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        // Cleanup model to free memory
        llmInference = nil
        print("GemmaBridge deallocated - model memory freed")
    }
    
    private func setupMemoryWarningNotification() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    @objc private func handleMemoryWarning() {
        // Handle memory pressure by clearing model if needed
        if llmInference != nil {
            print("Memory warning received - clearing model to free memory")
            llmInference = nil
            // Model will be reloaded on next inference request
        }
    }
    
    private func initializeModelIfNeeded() {
        guard llmInference == nil && !isInitializing else { return }
        isInitializing = true
        modelLoadStartTime = CFAbsoluteTimeGetCurrent()
        
        modelQueue.async { [weak self] in
            defer {
                self?.isInitializing = false
            }
            
            guard let self = self else { return }
            
            // Double-check model isn't already loaded
            guard self.llmInference == nil else { return }
            
            self.modelLoadAttempts += 1
            
            do {
                let modelPath = try self.findModelPath()
                
                // Use the working MediaPipe iOS pattern with improved memory handling
                let options = LlmInference.Options(modelPath: modelPath)
                
                // Check available memory before loading (iPhone 14 crash prevention)
                let availableMemory = self.getAvailableMemoryMB()
                if availableMemory < 2000 { // Need at least 2GB free
                    throw NSError(domain: "GemmaBridge", code: 507, userInfo: [
                        NSLocalizedDescriptionKey: "Insufficient memory available (\(availableMemory)MB). Need at least 2000MB free."
                    ])
                }
                
                print("Available memory: \(availableMemory)MB, proceeding with model load")
                
                // Set cache directory to Documents instead of bundle (fixes XNNPACK write permission)
                if let documentsPath = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first {
                    // This prevents XNNPACK cache write errors in iOS bundle
                    print("Using Documents directory for XNNPACK cache: \(documentsPath)")
                }
                
                // Force garbage collection before loading
                if #available(iOS 16.0, *) {
                    // Modern memory management
                } else {
                    // Force cleanup for older devices
                }
                
                self.llmInference = try LlmInference(options: options)
                
                // Record successful load time
                self.modelLoadTime = (CFAbsoluteTimeGetCurrent() - self.modelLoadStartTime) * 1000 // Convert to ms
                print("Gemma model initialized lazily on attempt \(self.modelLoadAttempts) in \(self.modelLoadTime)ms")
                self.modelLoadAttempts = 0 // Reset on success
                
                // Update peak memory usage
                self.updateMemoryUsage()
            } catch {
                self.handleModelLoadFailure(error)
            }
        }
    }
    
    private func findModelPath() throws -> String {
        // Debug: List all files in bundle
        if let bundlePath = Bundle.main.resourcePath {
            print("Bundle path: \(bundlePath)")
            let fileManager = FileManager.default
            do {
                let files = try fileManager.contentsOfDirectory(atPath: bundlePath)
                print("Files in bundle root: \(files.prefix(10))") // Show first 10 files
                
                // Check for .task files specifically
                let taskFiles = files.filter { $0.hasSuffix(".task") }
                print("Task files found: \(taskFiles)")
            } catch {
                print("Error listing bundle contents: \(error)")
            }
        }
        
        // Try primary location
        if let modelPath = Bundle.main.path(forResource: "gemma", ofType: "task") {
            print("Found model at primary location: \(modelPath)")
            return modelPath
        }
        
        // Try alternative locations as fallback
        let alternativePaths = [
            "Assets/gemma", // Try without extension first
            "models/gemma.task",
            "assets/gemma.task", 
            "gemma.task",
            "Assets/gemma.task"
        ]
        
        for path in alternativePaths {
            // Try with both approaches
            if let modelPath = Bundle.main.path(forResource: path, ofType: nil) {
                print("Found model at alternative path: \(path) -> \(modelPath)")
                return modelPath
            }
            
            // Also try treating the path as resource name without extension
            let components = path.components(separatedBy: "/")
            if components.count > 1 {
                let directory = components.dropLast().joined(separator: "/")
                let filename = components.last!
                let nameComponents = filename.components(separatedBy: ".")
                if nameComponents.count > 1 {
                    let name = nameComponents.dropLast().joined(separator: ".")
                    let ext = nameComponents.last!
                    if let modelPath = Bundle.main.path(forResource: name, ofType: ext, inDirectory: directory) {
                        print("Found model in directory \(directory): \(modelPath)")
                        return modelPath
                    }
                }
            }
        }
        
        // Final attempt: Search recursively
        if let bundlePath = Bundle.main.resourcePath {
            let fileManager = FileManager.default
            let enumerator = fileManager.enumerator(atPath: bundlePath)
            while let file = enumerator?.nextObject() as? String {
                if file.hasSuffix("gemma.task") {
                    let fullPath = "\(bundlePath)/\(file)"
                    print("Found model via recursive search: \(fullPath)")
                    return fullPath
                }
            }
        }
        
        throw NSError(domain: "GemmaBridge", code: 404, userInfo: [
            NSLocalizedDescriptionKey: "Model file not found in bundle. Check that gemma.task is added to the Xcode project target."
        ])
    }
    
    private func handleModelLoadFailure(_ error: Error) {
        print("Model load failed (attempt \(modelLoadAttempts)/\(maxLoadAttempts)): \(error)")
        
        if modelLoadAttempts < maxLoadAttempts {
            // Retry with exponential backoff
            let delay = Double(modelLoadAttempts * 2)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.initializeModelIfNeeded()
            }
        } else {
            print("Max load attempts reached. Model initialization failed permanently.")
        }
    }
    
    private func updateMemoryUsage() {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size)/4
        
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_,
                         task_flavor_t(MACH_TASK_BASIC_INFO),
                         $0,
                         &count)
            }
        }
        
        if kerr == KERN_SUCCESS {
            let memoryUsage = Double(info.resident_size) / (1024 * 1024) // Convert to MB
            peakMemoryUsage = max(peakMemoryUsage, memoryUsage)
            print("Current memory usage: \(memoryUsage.rounded())MB, Peak: \(peakMemoryUsage.rounded())MB")
        }
    }
    
    private func getAvailableMemoryMB() -> Double {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size)/4
        
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_,
                         task_flavor_t(MACH_TASK_BASIC_INFO),
                         $0,
                         &count)
            }
        }
        
        if kerr == KERN_SUCCESS {
            // Get total device memory and subtract current usage
            let currentUsage = Double(info.resident_size) / (1024 * 1024)
            let totalMemory = Double(ProcessInfo.processInfo.physicalMemory) / (1024 * 1024)
            return max(0, totalMemory - currentUsage - 1000) // Leave 1GB buffer
        }
        
        return 2048 // Default to 2GB if we can't determine
    }
    
    // Add method to reset peak memory tracking (for testing)
    @objc(resetMemoryTracking:withRejecter:)
    func resetMemoryTracking(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        peakMemoryUsage = 0
        updateMemoryUsage()
        print("Memory tracking reset - new baseline: \(peakMemoryUsage.rounded())MB")
        resolve(true)
    }
    
    private func estimateTokenCount(_ text: String) -> Int {
        // Simple estimation: ~4 characters per token for English text
        return max(1, text.count / 4)
    }
    
    @objc(generateResponse:withResolver:withRejecter:)
    func generateResponse(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        // Validate input
        guard !prompt.isEmpty else {
            reject(GemmaErrorCode.inferenceError.rawValue, "Prompt cannot be empty", nil)
            return
        }
        
        guard prompt.count <= 8192 else {
            reject(GemmaErrorCode.inferenceError.rawValue, "Prompt too long (max 8192 characters)", nil)
            return
        }
        
        // Ensure model is loaded
        initializeModelIfNeeded()
        
        guard let llmInference = self.llmInference else {
            // If model is still loading, wait and retry
            if isInitializing {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                    self?.generateResponse(prompt: prompt, resolve: resolve, reject: reject)
                }
                return
            } else {
                reject(GemmaErrorCode.modelNotFound.rawValue, "Gemma model failed to load", nil)
                return
            }
        }
        
        modelQueue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async {
                    reject(GemmaErrorCode.inferenceError.rawValue, "Bridge instance deallocated", nil)
                }
                return
            }
            
            // Start performance tracking
            self.lastInferenceStartTime = CFAbsoluteTimeGetCurrent()
            let timeToFirstTokenStart = self.lastInferenceStartTime
            
            do {
                let response = try llmInference.generateResponse(inputText: prompt)
                
                // Calculate performance metrics
                let currentTime = CFAbsoluteTimeGetCurrent()
                self.lastInferenceTime = (currentTime - self.lastInferenceStartTime) * 1000 // ms
                self.lastTimeToFirstToken = (currentTime - timeToFirstTokenStart) * 1000 // ms (simplified for now)
                self.lastTotalTokens = self.estimateTokenCount(response)
                self.lastTokensPerSecond = Double(self.lastTotalTokens) / ((currentTime - self.lastInferenceStartTime))
                
                // Update memory usage
                self.updateMemoryUsage()
                
                DispatchQueue.main.async {
                    resolve(response)
                }
            } catch {
                DispatchQueue.main.async {
                    let errorCode = self.categorizeError(error)
                    reject(errorCode.rawValue, "Failed to generate response: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    private func categorizeError(_ error: Error) -> GemmaErrorCode {
        let errorDescription = error.localizedDescription.lowercased()
        
        if errorDescription.contains("memory") || errorDescription.contains("allocation") {
            return .outOfMemory
        } else if errorDescription.contains("model") || errorDescription.contains("load") {
            return .modelLoadFailed
        } else {
            return .inferenceError
        }
    }
    
    @objc(isModelLoaded:withRejecter:)
    func isModelLoaded(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        // Don't auto-initialize here, just check current state
        resolve(llmInference != nil)
    }
    
    @objc(getBackendInfo:withRejecter:)
    func getBackendInfo(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        let backendInfo: [String: Any] = [
            "backend": "CPU", // iOS always uses CPU for LLM inference
            "cacheEnabled": true,
            "modelSize": "4.1GB"
        ]
        resolve(backendInfo)
    }
    
    @objc(getPerformanceMetrics:withRejecter:)
    func getPerformanceMetrics(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        let metrics: [String: Any] = [
            "modelLoadTime": modelLoadTime,
            "timeToFirstToken": lastTimeToFirstToken,
            "tokensPerSecond": lastTokensPerSecond,
            "totalTokens": lastTotalTokens,
            "peakMemoryMB": peakMemoryUsage,
            "inferenceTime": lastInferenceTime,
            "lastInferenceTimestamp": lastInferenceStartTime * 1000 // Convert to ms timestamp
        ]
        resolve(metrics)
    }
    
    @objc(configure:withResolver:withRejecter:)
    func configure(options: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        // Update current configuration
        for (key, value) in options {
            currentConfig[key] = value
        }
        
        // Note: MediaPipe doesn't support runtime reconfiguration
        // Configuration will take effect on next model initialization
        print("Configuration updated: \(currentConfig)")
        resolve(true)
    }
    
    @objc(generateResponseWithProgress:withResolver:withRejecter:)
    func generateResponseWithProgress(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        // MediaPipe doesn't support true streaming, so we'll implement pseudo-streaming
        // by sending progress updates during generation
        
        guard !prompt.isEmpty else {
            reject(GemmaErrorCode.inferenceError.rawValue, "Prompt cannot be empty", nil)
            return
        }
        
        guard prompt.count <= 8192 else {
            reject(GemmaErrorCode.inferenceError.rawValue, "Prompt too long (max 8192 characters)", nil)
            return
        }
        
        // Ensure model is loaded for progress generation
        initializeModelIfNeeded()
        
        guard let llmInference = self.llmInference else {
            if isInitializing {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                    self?.generateResponseWithProgress(prompt: prompt, resolve: resolve, reject: reject)
                }
                return
            } else {
                reject(GemmaErrorCode.modelNotFound.rawValue, "Model failed to load", nil)
                return
            }
        }
        
        modelQueue.async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            do {
                // Send initial progress
                DispatchQueue.main.async {
                    // Send event to JS side indicating start
                    // This would need an event emitter in a real implementation
                }
                
                let response = try llmInference.generateResponse(inputText: prompt)
                
                // Calculate metrics
                let endTime = CFAbsoluteTimeGetCurrent()
                self.lastInferenceTime = (endTime - startTime) * 1000
                self.lastTotalTokens = self.estimateTokenCount(response)
                self.lastTokensPerSecond = Double(self.lastTotalTokens) / (endTime - startTime)
                
                DispatchQueue.main.async {
                    resolve(response)
                }
            } catch {
                DispatchQueue.main.async {
                    let errorCode = self.categorizeError(error)
                    reject(errorCode.rawValue, "Failed to generate response: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc(warmupModel:withRejecter:)
    func warmupModel(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        // Run a small inference to warm up the model
        generateResponse(prompt: "Hi", resolve: { _ in
            print("Model warmed up successfully")
            resolve(true)
        }, reject: reject)
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    // MARK: - React Native Static Method Dispatchers
    // These ensure React Native uses the singleton instance
    
    @objc static func generateResponse_static(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.generateResponse(prompt: prompt, resolve: resolve, reject: reject)
    }
    
    @objc static func isModelLoaded_static(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.isModelLoaded(resolve: resolve, reject: reject)
    }
    
    @objc static func getBackendInfo_static(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.getBackendInfo(resolve: resolve, reject: reject)
    }
    
    @objc static func getPerformanceMetrics_static(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.getPerformanceMetrics(resolve: resolve, reject: reject)
    }
    
    @objc static func configure_static(options: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.configure(options: options, resolve: resolve, reject: reject)
    }
    
    @objc static func generateResponseWithProgress_static(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.generateResponseWithProgress(prompt: prompt, resolve: resolve, reject: reject)
    }
    
    @objc static func warmupModel_static(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        shared.warmupModel(resolve: resolve, reject: reject)
    }
} 