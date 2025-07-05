package com.anonymous.purrpal

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.util.concurrent.Executors

class GemmaBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var llmInference: LlmInference? = null
    private val backgroundExecutor = Executors.newSingleThreadExecutor()

    init {
        // This runs when the module is initialized
        backgroundExecutor.execute {
            try {
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath("/data/local/tmp/llm/gemma.task") // Using the absolute path for the model
                    .setMaxTokens(1000)
                    .setTopK(40)
                    .setTemperature(0.7f)
                    .setRandomSeed((0..1000).random())
                    .build()
                llmInference = LlmInference.createFromOptions(reactContext, options)
            } catch (e: Exception) {
                // In a real app, you might want to send this error to JS
                // For now, we'll just log it.
                e.printStackTrace()
            }
        }
    }

    override fun getName() = "GemmaBridge"

    @ReactMethod
    fun generateResponse(prompt: String, promise: Promise) {
        if (llmInference == null) {
            promise.reject("E_LLM_ERROR", "LLM Inference instance is not available or failed to initialize.")
            return
        }

        backgroundExecutor.execute {
            try {
                val result = llmInference?.generateResponse(prompt)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("E_LLM_ERROR", "Failed to generate response.", e)
            }
        }
    }
} 