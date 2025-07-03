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
    
    @objc(generateResponse:withResolver:withRejecter:)
    func generateResponse(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        guard let llmInference = self.llmInference else {
            reject("MODEL_NOT_LOADED", "Gemma model is not loaded", nil)
            return
        }
        
        modelQueue.async {
            do {
                let response = try llmInference.generateResponse(inputText: prompt)
                DispatchQueue.main.async {
                    resolve(response)
                }
            } catch {
                DispatchQueue.main.async {
                    reject("INFERENCE_ERROR", "Failed to generate response: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc(isModelLoaded:withRejecter:)
    func isModelLoaded(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        resolve(llmInference != nil)
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
} 