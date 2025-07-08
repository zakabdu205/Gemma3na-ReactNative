import Foundation
import MediaPipeTasksGenAI

// Simplified iOS bridge - only core MediaPipe operations
@objc(GemmaBridge)
class GemmaBridge: NSObject {
    
    private var llmInference: LlmInference?
    private let modelQueue = DispatchQueue(label: "com.purrpal.gemma.simple", qos: .userInitiated)
    
    override init() {
        super.init()
    }
    
    deinit {
        llmInference = nil
    }
    
    // MARK: - Core Model Operations
    
    @objc(loadModel:useGPU:withResolver:withRejecter:)
    func loadModel(filePath: String, useGPU: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        
        modelQueue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async {
                    reject("BRIDGE_ERROR", "Bridge instance deallocated", nil)
                }
                return
            }
            
            do {
                // Convert file URL to path
                let modelPath = self.path(from: filePath)
                
                // Validate file exists
                guard FileManager.default.fileExists(atPath: modelPath) else {
                    DispatchQueue.main.async {
                        reject("MODEL_NOT_FOUND", "Model file not found at path: \(modelPath)", nil)
                    }
                    return
                }
                
                // Create MediaPipe options - iOS only supports CPU
                let options = LlmInference.Options(modelPath: modelPath)
                
                // Load model
                self.llmInference = try LlmInference(options: options)
                
                DispatchQueue.main.async {
                    resolve(true)
                }
                
            } catch {
                DispatchQueue.main.async {
                    reject("MODEL_LOAD_FAILED", "Failed to load model: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc(unloadModel:withRejecter:)
    func unloadModel(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        modelQueue.async { [weak self] in
            self?.llmInference = nil
            DispatchQueue.main.async {
                resolve(true)
            }
        }
    }
    
    @objc(isModelLoaded:withRejecter:)
    func isModelLoaded(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        resolve(llmInference != nil)
    }
    
    // MARK: - Simple Inference
    
    @objc(generateResponse:withResolver:withRejecter:)
    func generateResponse(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        
        guard let llmInference = self.llmInference else {
            reject("MODEL_NOT_LOADED", "Model is not loaded", nil)
            return
        }
        
        modelQueue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async {
                    reject("BRIDGE_ERROR", "Bridge instance deallocated", nil)
                }
                return
            }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            do {
                let response = try llmInference.generateResponse(inputText: prompt)
                let endTime = CFAbsoluteTimeGetCurrent()
                
                let inferenceTimeMs = (endTime - startTime) * 1000
                let tokenCount = self.estimateTokenCount(response)
                
                let result: [String: Any] = [
                    "response": response,
                    "inferenceTimeMs": inferenceTimeMs,
                    "tokenCount": tokenCount
                ]
                
                DispatchQueue.main.async {
                    resolve(result)
                }
                
            } catch {
                DispatchQueue.main.async {
                    reject("INFERENCE_ERROR", "Inference failed: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    // MARK: - Device Info
    
    @objc(getDeviceInfo:withRejecter:)
    func getDeviceInfo(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        let deviceInfo: [String: Any] = [
            "platform": "iOS",
            "supportsGPU": false, // iOS MediaPipe only supports CPU for LLM
            "totalMemoryMB": getTotalMemoryMB()
        ]
        resolve(deviceInfo)
    }
    
    // MARK: - Helper Methods
    
    private func path(from urlOrPath: String) -> String {
        if urlOrPath.hasPrefix("file://") {
            if let url = URL(string: urlOrPath) {
                return url.path
            }
        }
        return urlOrPath
    }
    
    private func estimateTokenCount(_ text: String) -> Int {
        // Simple estimation: ~4 characters per token
        return max(1, text.count / 4)
    }
    
    private func getTotalMemoryMB() -> Int {
        return Int(ProcessInfo.processInfo.physicalMemory / (1024 * 1024))
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}