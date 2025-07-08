package com.anonymous.purrpal

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.util.concurrent.Executors
import java.io.File

// Simplified Android bridge - only core MediaPipe operations
class GemmaBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var llmInference: LlmInference? = null
    private val backgroundExecutor = Executors.newSingleThreadExecutor()

    override fun getName() = "GemmaBridge"

    // MARK: - Core Model Operations

    @ReactMethod
    fun loadModel(filePath: String, useGPU: Boolean, promise: Promise) {
        backgroundExecutor.execute {
            try {
                // Handle different path types
                val actualPath = when {
                    filePath.startsWith("/") -> filePath
                    filePath.startsWith("file://") -> filePath.substring(7)
                    else -> {
                        // For relative paths, check Documents folder or internal storage
                        val documentsPath = "/storage/emulated/0/Documents/$filePath"
                        val internalPath = File(reactContext.filesDir, filePath).absolutePath
                        
                        when {
                            File(documentsPath).exists() -> documentsPath
                            File(internalPath).exists() -> internalPath
                            else -> filePath // Use as-is and let validation fail
                        }
                    }
                }

                // Validate file exists
                val modelFile = File(actualPath)
                if (!modelFile.exists()) {
                    promise.reject("MODEL_NOT_FOUND", 
                        "Model file not found at path: $actualPath. " +
                        "Please ensure gemma.task is in your Documents folder.")
                    return@execute
                }

                // Create MediaPipe options
                val baseOptionsBuilder = BaseOptions.builder()
                
                // Use appropriate method based on file location
                if (actualPath.startsWith("/storage/") || actualPath.startsWith("/data/")) {
                    // External file path - not supported by MediaPipe directly
                    // We need to copy it to internal storage first
                    val internalFile = File(reactContext.filesDir, "gemma.task")
                    if (!internalFile.exists()) {
                        modelFile.copyTo(internalFile, overwrite = true)
                    }
                    baseOptionsBuilder.setModelAssetPath(internalFile.absolutePath)
                } else {
                    // Assume it's an asset path
                    baseOptionsBuilder.setModelAssetPath(actualPath)
                }

                // Set backend based on preference and device capability
                if (useGPU && isGPUSupported()) {
                    try {
                        baseOptionsBuilder.setDelegate(BaseOptions.Delegate.GPU)
                    } catch (e: Exception) {
                        // Fallback to CPU if GPU fails
                        baseOptionsBuilder.setDelegate(BaseOptions.Delegate.CPU)
                    }
                } else {
                    baseOptionsBuilder.setDelegate(BaseOptions.Delegate.CPU)
                }

                val options = LlmInference.LlmInferenceOptions.builder()
                    .setBaseOptions(baseOptionsBuilder.build())
                    .build()

                // Load model
                llmInference = LlmInference.createFromOptions(reactContext, options)
                promise.resolve(true)

            } catch (e: Exception) {
                promise.reject("MODEL_LOAD_FAILED", "Failed to load model: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        backgroundExecutor.execute {
            try {
                llmInference?.close()
                llmInference = null
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("UNLOAD_ERROR", "Failed to unload model: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun isModelLoaded(promise: Promise) {
        promise.resolve(llmInference != null)
    }

    // MARK: - Simple Inference

    @ReactMethod
    fun generateResponse(prompt: String, promise: Promise) {
        val inference = llmInference
        if (inference == null) {
            promise.reject("MODEL_NOT_LOADED", "Model is not loaded")
            return
        }

        backgroundExecutor.execute {
            try {
                val startTime = System.currentTimeMillis()
                
                val response = inference.generateResponse(prompt)
                
                val endTime = System.currentTimeMillis()
                val inferenceTimeMs = endTime - startTime
                val tokenCount = estimateTokenCount(response)

                val result = WritableNativeMap().apply {
                    putString("response", response)
                    putDouble("inferenceTimeMs", inferenceTimeMs.toDouble())
                    putInt("tokenCount", tokenCount)
                }

                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("INFERENCE_ERROR", "Inference failed: ${e.message}", e)
            }
        }
    }

    // MARK: - Device Info

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        val deviceInfo = WritableNativeMap().apply {
            putString("platform", "Android")
            putBoolean("supportsGPU", isGPUSupported())
            putInt("totalMemoryMB", getTotalMemoryMB())
        }
        promise.resolve(deviceInfo)
    }

    // MARK: - Helper Methods

    private fun isGPUSupported(): Boolean {
        return try {
            android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N &&
            reactContext.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_VULKAN_HARDWARE_COMPUTE) &&
            getTotalMemoryMB() >= 4000 // Minimum 4GB RAM for GPU mode
        } catch (e: Exception) {
            false
        }
    }

    private fun getTotalMemoryMB(): Int {
        val activityManager = reactContext.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val memInfo = android.app.ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        return (memInfo.totalMem / (1024 * 1024)).toInt()
    }

    private fun estimateTokenCount(text: String): Int {
        // Simple estimation: ~4 characters per token
        return maxOf(1, text.length / 4)
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        backgroundExecutor.execute {
            llmInference?.close()
            llmInference = null
        }
    }
}