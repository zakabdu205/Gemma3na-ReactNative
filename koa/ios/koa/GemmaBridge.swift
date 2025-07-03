import MediaPipeTasksGenai

@objc(GemmaBridge)
class GemmaBridge: NSObject {

  var llmInference: LlmInference?

  override init() {
    super.init()

    // It's important to use the .task extension here
    guard let modelPath = Bundle.main.path(forResource: "gemma", ofType: "task") else {
      print("Failed to find the model file.")
      return
    }

    let options = LlmInference.Options()
    options.baseOptions.modelPath = modelPath
    options.maxTokens = 1000 // Adjust as needed
    options.topK = 40
    options.temperature = 0.7
    options.randomSeed = Int.random(in: 0..<1000)


    do {
      llmInference = try LlmInference(options: options)
    } catch {
      print("Failed to create the LlmInference instance: \(error)")
    }
  }

  @objc(generateResponse:withResolver:withRejecter:)
  func generateResponse(prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
    guard let llmInference = llmInference else {
      let error = NSError(domain: "GemmaBridge", code: -1, userInfo: [NSLocalizedDescriptionKey: "LLM Inference instance is not available."])
      reject("E_LLM_ERROR", "LLM Inference instance is not available.", error)
      return
    }

    // Run inference on a background thread to avoid blocking the UI
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let result = try llmInference.generateResponse(inputText: prompt)
        resolve(result)
      } catch {
        reject("E_LLM_ERROR", "Failed to generate response.", error)
      }
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false // Initialization can be done on a background thread
  }
} 