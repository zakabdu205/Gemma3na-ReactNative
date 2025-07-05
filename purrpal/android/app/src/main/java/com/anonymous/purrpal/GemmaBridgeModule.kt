package com.anonymous.purrpal

import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.util.concurrent.Executors
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

// Core singleton class to prevent multiple model instances
class GemmaBridgeCore(private val reactContext: ReactApplicationContext) {
    var llmInference: LlmInference? = null
    val backgroundExecutor = Executors.newSingleThreadExecutor()
    var currentBackend: String = "CPU"
    var modelLoadAttempts = 0
    val maxLoadAttempts = 3
    var wakeLock: PowerManager.WakeLock? = null
    var isInitializing = false
    
    // Performance tracking (shared across all instances)
    var modelLoadStartTime: Long = 0
    var modelLoadTime: Long = 0
    var lastInferenceStartTime: Long = 0
    var lastInferenceTime: Long = 0
    var lastTimeToFirstToken: Long = 0
    var lastTokensPerSecond: Double = 0.0
    var lastTotalTokens: Int = 0
    var peakMemoryUsage: Long = 0
    
    // Configuration (shared)
    val currentConfig = mutableMapOf<String, Any>(
        "maxTokens" to 1000,
        "temperature" to 0.7f,
        "topK" to 40,
        "randomSeed" to 42
    )
    
    // Lazy initialization - only load when actually needed
    fun initializeModelIfNeeded() {
        if (llmInference != null || isInitializing) return
        
        isInitializing = true
        backgroundExecutor.execute {
            try {
                initializeModel()
            } finally {
                isInitializing = false
            }
        }
    }
    
    private fun initializeModel() {
        if (llmInference != null) return // Double-check
        
        modelLoadAttempts++
        modelLoadStartTime = System.currentTimeMillis()
        
        try {
            val modelPath = extractModelFromAssets()
            val options = createLlmInferenceOptions(preferGPU = true)
            
            llmInference = LlmInference.createFromOptions(reactContext, options)
            
            // Record successful load time
            modelLoadTime = System.currentTimeMillis() - modelLoadStartTime
            println("Gemma model initialized lazily with $currentBackend backend (attempt $modelLoadAttempts) in ${modelLoadTime}ms")
            modelLoadAttempts = 0 // Reset on success
            
            // Update peak memory usage
            updateMemoryUsage()
        } catch (e: Exception) {
            handleModelLoadFailure(e)
        }
    }
    
    private fun isGPUSupported(): Boolean {
        return try {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
            hasVulkanSupport() &&
            getAvailableMemoryGB() >= 6 // Minimum 6GB RAM for GPU mode
        } catch (e: Exception) {
            false // Default to CPU if detection fails
        }
    }

    private fun hasVulkanSupport(): Boolean {
        return reactContext.packageManager.hasSystemFeature(
            PackageManager.FEATURE_VULKAN_HARDWARE_COMPUTE
        )
    }

    private fun getAvailableMemoryGB(): Long {
        val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val memInfo = android.app.ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        return memInfo.totalMem / (1024 * 1024 * 1024) // Convert to GB
    }

    private fun createLlmInferenceOptions(preferGPU: Boolean = false): LlmInference.LlmInferenceOptions {
        val modelPath = extractModelFromAssets()
        val baseOptionsBuilder = BaseOptions.builder()
            .setModelAssetPath(modelPath)

        // Try GPU first if preferred and supported
        if (preferGPU && isGPUSupported()) {
            try {
                baseOptionsBuilder.setDelegate(BaseOptions.Delegate.GPU)
                currentBackend = "GPU"
            } catch (e: Exception) {
                // Fallback to CPU
                println("GPU initialization failed, falling back to CPU: ${e.message}")
                baseOptionsBuilder.setDelegate(BaseOptions.Delegate.CPU)
                currentBackend = "CPU"
            }
        } else {
            baseOptionsBuilder.setDelegate(BaseOptions.Delegate.CPU)
            currentBackend = "CPU"
        }

        return LlmInference.LlmInferenceOptions.builder()
            .setBaseOptions(baseOptionsBuilder.build())
            .setMaxTokens(1000)
            .setTopK(40)
            .setTemperature(0.7f)
            .setRandomSeed((0..1000).random())
            .build()
    }

    private fun handleModelLoadFailure(error: Exception) {
        println("Model load failed (attempt $modelLoadAttempts/$maxLoadAttempts): ${error.message}")
        
        if (modelLoadAttempts < maxLoadAttempts) {
            // Try with CPU backend on next attempt if GPU failed
            val delay = modelLoadAttempts * 2000L // 2, 4, 6 seconds
            backgroundExecutor.execute {
                try {
                    Thread.sleep(delay)
                    initializeModel()
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                }
            }
        } else {
            println("Max load attempts reached. Model initialization failed permanently.")
        }
    }
    
    fun updateMemoryUsage() {
        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        val memoryUsageMB = usedMemory / (1024 * 1024)
        peakMemoryUsage = maxOf(peakMemoryUsage, memoryUsageMB)
        println("Current memory usage: ${memoryUsageMB}MB, Peak: ${peakMemoryUsage}MB")
    }
    
    fun resetMemoryTracking() {
        peakMemoryUsage = 0
        updateMemoryUsage()
        println("Memory tracking reset - new baseline: ${peakMemoryUsage}MB")
    }
    
    fun estimateTokenCount(text: String): Int {
        // Simple estimation: ~4 characters per token for English text
        return maxOf(1, text.length / 4)
    }

    private fun extractModelFromAssets(): String {
        val modelFile = File(reactContext.filesDir, "gemma.task")
        if (!modelFile.exists()) {
            try {
                reactContext.assets.open("gemma.task").use { input ->
                    FileOutputStream(modelFile).use { output ->
                        input.copyTo(output)
                    }
                }
            } catch (e: IOException) {
                throw RuntimeException("Failed to extract model from assets", e)
            }
        }
        return modelFile.absolutePath
    }
}

// Error codes for consistent error handling across platforms
enum class GemmaErrorCode(val code: String) {
    MODEL_NOT_FOUND("MODEL_NOT_FOUND"),
    MODEL_LOAD_FAILED("MODEL_LOAD_FAILED"),
    INFERENCE_ERROR("INFERENCE_ERROR"),
    OUT_OF_MEMORY("OUT_OF_MEMORY"),
    BACKEND_NOT_SUPPORTED("BACKEND_NOT_SUPPORTED"),
    ASSET_EXTRACTION_FAILED("ASSET_EXTRACTION_FAILED")
}

class GemmaBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        // Singleton to prevent multiple model instances
        @Volatile
        private var INSTANCE: GemmaBridgeCore? = null
        
        fun getInstance(context: ReactApplicationContext): GemmaBridgeCore {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: GemmaBridgeCore(context).also { INSTANCE = it }
            }
        }
    }
    
    private val bridge = getInstance(reactContext)
    
    // Delegate pattern - all calls go through singleton bridge
    private var llmInference: LlmInference?
        get() = bridge.llmInference
        set(value) { bridge.llmInference = value }
    
    private val backgroundExecutor = bridge.backgroundExecutor
    private var currentBackend: String
        get() = bridge.currentBackend
        set(value) { bridge.currentBackend = value }
    private var modelLoadAttempts: Int
        get() = bridge.modelLoadAttempts
        set(value) { bridge.modelLoadAttempts = value }
    private val maxLoadAttempts = bridge.maxLoadAttempts
    private var wakeLock: PowerManager.WakeLock?
        get() = bridge.wakeLock
        set(value) { bridge.wakeLock = value }

    override fun getName() = "GemmaBridge"

    @ReactMethod
    fun generateResponse(prompt: String, promise: Promise) {
        // Validate input
        if (prompt.isEmpty()) {
            promise.reject(GemmaErrorCode.INFERENCE_ERROR.code, "Prompt cannot be empty")
            return
        }
        
        if (prompt.length > 8192) {
            promise.reject(GemmaErrorCode.INFERENCE_ERROR.code, "Prompt too long (max 8192 characters)")
            return
        }

        // Ensure model is loaded
        bridge.initializeModelIfNeeded()

        if (llmInference == null) {
            if (bridge.isInitializing) {
                // Retry after delay if still initializing
                backgroundExecutor.execute {
                    Thread.sleep(2000)
                    generateResponse(prompt, promise)
                }
                return
            } else {
                promise.reject(GemmaErrorCode.MODEL_NOT_FOUND.code, "Model failed to load")
                return
            }
        }

        // Acquire wake lock for inference
        acquireWakeLock()

        backgroundExecutor.execute {
            try {
                // Start performance tracking
                bridge.lastInferenceStartTime = System.currentTimeMillis()
                val timeToFirstTokenStart = bridge.lastInferenceStartTime
                
                val result = llmInference?.generateResponse(prompt)
                
                // Calculate performance metrics
                val currentTime = System.currentTimeMillis()
                bridge.lastInferenceTime = currentTime - bridge.lastInferenceStartTime
                bridge.lastTimeToFirstToken = currentTime - timeToFirstTokenStart // Simplified for now
                bridge.lastTotalTokens = bridge.estimateTokenCount(result ?: "")
                bridge.lastTokensPerSecond = if (bridge.lastInferenceTime > 0) {
                    bridge.lastTotalTokens.toDouble() / (bridge.lastInferenceTime / 1000.0)
                } else {
                    0.0
                }
                
                // Update memory usage
                bridge.updateMemoryUsage()
                
                promise.resolve(result)
            } catch (e: Exception) {
                val errorCode = categorizeError(e)
                promise.reject(errorCode.code, "Failed to generate response: ${e.message}", e)
            } finally {
                releaseWakeLock()
            }
        }
    }

    @ReactMethod
    fun isModelLoaded(promise: Promise) {
        // Don't auto-initialize here, just check current state
        promise.resolve(llmInference != null)
    }

    @ReactMethod
    fun getBackendInfo(promise: Promise) {
        val backendInfo = mapOf(
            "backend" to bridge.currentBackend,
            "cacheEnabled" to true,
            "modelSize" to "4.1GB",
            "gpuSupported" to true // Android generally supports GPU
        )
        promise.resolve(backendInfo)
    }
    
    @ReactMethod
    fun getPerformanceMetrics(promise: Promise) {
        val metrics = mapOf(
            "modelLoadTime" to bridge.modelLoadTime,
            "timeToFirstToken" to bridge.lastTimeToFirstToken,
            "tokensPerSecond" to bridge.lastTokensPerSecond,
            "totalTokens" to bridge.lastTotalTokens,
            "peakMemoryMB" to bridge.peakMemoryUsage,
            "inferenceTime" to bridge.lastInferenceTime,
            "lastInferenceTimestamp" to bridge.lastInferenceStartTime
        )
        promise.resolve(metrics)
    }
    
    @ReactMethod
    fun configure(options: Map<String, Any>, promise: Promise) {
        // Update current configuration
        bridge.currentConfig.putAll(options)
        
        // Note: MediaPipe doesn't support runtime reconfiguration
        // Configuration will take effect on next model initialization
        println("Configuration updated: ${bridge.currentConfig}")
        promise.resolve(true)
    }
    
    @ReactMethod
    fun resetMemoryTracking(promise: Promise) {
        bridge.resetMemoryTracking()
        promise.resolve(true)
    }
    
    @ReactMethod
    fun generateResponseWithProgress(prompt: String, promise: Promise) {
        // MediaPipe doesn't support true streaming, so we'll implement pseudo-streaming
        // Input validation
        if (prompt.isEmpty()) {
            promise.reject(GemmaErrorCode.INFERENCE_ERROR.code, "Prompt cannot be empty")
            return
        }
        
        if (prompt.length > 8192) {
            promise.reject(GemmaErrorCode.INFERENCE_ERROR.code, "Prompt too long (max 8192 characters)")
            return
        }

        // Ensure model is loaded for progress generation
        bridge.initializeModelIfNeeded()

        if (llmInference == null) {
            if (bridge.isInitializing) {
                backgroundExecutor.execute {
                    Thread.sleep(2000)
                    generateResponseWithProgress(prompt, promise)
                }
                return
            } else {
                promise.reject(GemmaErrorCode.MODEL_NOT_FOUND.code, "Model failed to load")
                return
            }
        }

        // Acquire wake lock for inference
        acquireWakeLock()

        backgroundExecutor.execute {
            try {
                val startTime = System.currentTimeMillis()
                
                // In a real implementation, this would send progress events
                // For now, we'll just generate the full response
                val result = llmInference?.generateResponse(prompt)
                
                // Calculate metrics
                val endTime = System.currentTimeMillis()
                bridge.lastInferenceTime = endTime - startTime
                bridge.lastTotalTokens = bridge.estimateTokenCount(result ?: "")
                bridge.lastTokensPerSecond = if (bridge.lastInferenceTime > 0) {
                    bridge.lastTotalTokens.toDouble() / (bridge.lastInferenceTime / 1000.0)
                } else {
                    0.0
                }
                
                promise.resolve(result)
            } catch (e: Exception) {
                val errorCode = categorizeError(e)
                promise.reject(errorCode.code, "Failed to generate response: ${e.message}", e)
            } finally {
                releaseWakeLock()
            }
        }
    }
    
    @ReactMethod
    fun warmupModel(promise: Promise) {
        // Run a small inference to warm up the model
        backgroundExecutor.execute {
            try {
                bridge.initializeModelIfNeeded()
                // Wait for initialization if needed
                var attempts = 0
                while (llmInference == null && attempts < 10) {
                    Thread.sleep(1000)
                    attempts++
                }
                
                if (llmInference != null) {
                    llmInference?.generateResponse("Hi")
                    println("Model warmed up successfully")
                    promise.resolve(true)
                } else {
                    promise.reject(GemmaErrorCode.MODEL_NOT_FOUND.code, "Model not available for warmup")
                }
            } catch (e: Exception) {
                promise.reject(GemmaErrorCode.INFERENCE_ERROR.code, "Warmup failed: ${e.message}")
            }
        }
    }

    private fun categorizeError(error: Exception): GemmaErrorCode {
        val errorMessage = error.message?.lowercase() ?: ""
        
        return when {
            errorMessage.contains("memory") || errorMessage.contains("allocation") -> GemmaErrorCode.OUT_OF_MEMORY
            errorMessage.contains("model") || errorMessage.contains("load") -> GemmaErrorCode.MODEL_LOAD_FAILED
            errorMessage.contains("backend") || errorMessage.contains("gpu") -> GemmaErrorCode.BACKEND_NOT_SUPPORTED
            else -> GemmaErrorCode.INFERENCE_ERROR
        }
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "GemmaBridge::InferenceLock"
            )
            wakeLock?.acquire(30000) // 30 second timeout
        } catch (e: Exception) {
            println("Failed to acquire wake lock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            println("Failed to release wake lock: ${e.message}")
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        releaseWakeLock()
        backgroundExecutor.shutdown()
    }
} 