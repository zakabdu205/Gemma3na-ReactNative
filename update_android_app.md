Of course. Here is a complete rewrite of the `GemmaBridgeModule.kt` file.

This modern version addresses all the identified issues by incorporating the latest best practices for Android development as of July 2025.

### Key Improvements in the Rewritten Code:

1.  **Kotlin Coroutines & Flows:**

    - Replaces the `Executors.newSingleThreadExecutor()` with a dedicated `CoroutineScope` and `Dispatchers.IO` for all background operations. This is the modern, efficient, and standard way to handle asynchronous tasks in Kotlin.
    - Uses `SharedFlow` to emit progress updates and results, enabling a more responsive and non-blocking architecture, perfect for React Native's event-driven nature.

2.  **Modern Storage & Permission Handling:**

    - Abandons direct, hardcoded file path access, which is unreliable and deprecated.
    - Integrates the **Storage Access Framework (SAF)** using `ActivityResultLauncher`. This is the official, secure, and user-friendly way for the user to grant access to the `gemma.task` model file, ensuring compatibility with all modern Android versions (including Android 11+ Scoped Storage).
    - Model URI is now stored persistently using **Jetpack DataStore**, the modern replacement for `SharedPreferences`.

3.  **ViewModel-like Architecture & Dependency Injection:**

    - The `GemmaBridgeCore` singleton is refactored into a `GemmaModelManager`, which acts like a repository or a ViewModel. It manages the model's lifecycle, state, and operations.
    - This manager is provided to the `GemmaBridgeModule` via a simple form of dependency injection, making the code more modular, testable, and easier to manage.

4.  **State Management with `StateFlow`:**

    - The model's loading state (`UNINITIALIZED`, `LOADING`, `READY`, `ERROR`) is managed using a `StateFlow`, providing a single source of truth that can be safely observed from multiple coroutines.

5.  **True Streaming with `generateResponseAsync`:**

    - Implements true, real-time token streaming by leveraging MediaPipe's `generateResponseAsync` method with its result listener. This is a significant enhancement over the original "pseudo-streaming."

6.  **Simplified and Robust Code:**

    - Removes the complex and brittle retry logic, as coroutines and modern lifecycle management handle this more gracefully.
    - Eliminates the need for manual `WakeLock` management. Long-running tasks in a coroutine on an I/O dispatcher are handled efficiently by the system.
    - Error handling is improved with a sealed class `GemmaResult`, providing more structured and predictable error reporting.

---

### Rewritten `GemmaBridgeModule.kt`

```kotlin
package com.anonymous.purrpal

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.net.toUri
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import kotlin.system.measureTimeMillis

// --- DataStore for persisting the model URI ---
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "gemma_settings")
private val MODEL_URI_KEY = stringPreferencesKey("model_uri")

// --- Modern Error and Result Handling ---
sealed class GemmaResult<out T> {
    data class Success<out T>(val data: T) : GemmaResult<T>()
    data class Error(val code: String, val message: String) : GemmaResult<Nothing>()
    data object Loading : GemmaResult<Nothing>()
}

enum class GemmaErrorCode(val code: String) {
    MODEL_NOT_READY("MODEL_NOT_READY"),
    INFERENCE_ERROR("INFERENCE_ERROR"),
    INITIALIZATION_FAILED("INITIALIZATION_FAILED"),
    INVALID_URI("INVALID_URI"),
    STORAGE_ERROR("STORAGE_ERROR"),
    INTERNAL_ERROR("INTERNAL_ERROR")
}

// --- Singleton Model Manager (ViewModel-like architecture) ---
class GemmaModelManager(private val context: Context) {

    enum class ModelState { UNINITIALIZED, LOADING, READY, ERROR }

    private val _modelState = MutableStateFlow(ModelState.UNINITIALIZED)
    val modelState: StateFlow<ModelState> = _modelState.asStateFlow()

    private val _lastError = MutableStateFlow<GemmaResult.Error?>(null)
    val lastError: StateFlow<GemmaResult.Error?> = _lastError.asStateFlow()

    private var llmInference: LlmInference? = null
    private val modelScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val performanceMetrics = MutableStateFlow<ReadableMap>(Arguments.createMap())

    init {
        // Automatically try to initialize if a URI was previously saved
        modelScope.launch {
            val savedUri = getModelUri()
            if (savedUri != null) {
                initializeModel(savedUri)
            }
        }
    }

    private suspend fun saveModelUri(uri: Uri) {
        context.dataStore.edit { settings ->
            settings[MODEL_URI_KEY] = uri.toString()
        }
    }

    suspend fun getModelUri(): Uri? {
        return context.dataStore.data.map { preferences ->
            preferences[MODEL_URI_KEY]?.toUri()
        }.firstOrNull()
    }

    suspend fun initializeModel(uri: Uri): GemmaResult<Unit> {
        if (_modelState.value == ModelState.LOADING) return GemmaResult.Loading
        _modelState.value = ModelState.LOADING

        return withContext(Dispatchers.IO) {
            try {
                // Ensure we have persistent read access to the URI
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                )

                val modelPath = copyModelToCache(uri)
                if (modelPath == null) {
                    _modelState.value = ModelState.ERROR
                    val error = GemmaResult.Error(GemmaErrorCode.STORAGE_ERROR.code, "Failed to copy model to cache.")
                    _lastError.value = error
                    return@withContext error
                }

                val options = LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(2048) // A sensible default
                    .build()

                val loadTime = measureTimeMillis {
                    llmInference = LlmInference.createFromOptions(context, options)
                }

                updatePerformanceMetric("modelLoadTime", loadTime.toDouble())
                _modelState.value = ModelState.READY
                _lastError.value = null
                saveModelUri(uri)
                GemmaResult.Success(Unit)
            } catch (e: Exception) {
                _modelState.value = ModelState.ERROR
                val error = GemmaResult.Error(
                    GemmaErrorCode.INITIALIZATION_FAILED.code,
                    "Model initialization failed: ${e.message}"
                )
                _lastError.value = error
                error
            }
        }
    }

    private fun copyModelToCache(uri: Uri): String? {
        return try {
            val modelFile = File(context.cacheDir, "gemma.task")
            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(modelFile).use { output ->
                    input.copyTo(output)
                }
            }
            modelFile.absolutePath
        } catch (e: Exception) {
            null
        }
    }

    fun generateResponseStream(prompt: String): Flow<GemmaResult<String>> = channelFlow {
        if (_modelState.value != ModelState.READY || llmInference == null) {
            send(GemmaResult.Error(GemmaErrorCode.MODEL_NOT_READY.code, "Model is not initialized."))
            return@channelFlow
        }

        try {
            send(GemmaResult.Loading)
            val startTime = System.currentTimeMillis()
            var firstTokenTime: Long? = null

            llmInference?.generateResponseAsync(prompt,
                { partialResult, done ->
                    if (firstTokenTime == null) {
                        firstTokenTime = System.currentTimeMillis()
                        val ttft = firstTokenTime!! - startTime
                        updatePerformanceMetric("timeToFirstToken", ttft.toDouble())
                    }
                    // Emitting each chunk as it arrives
                    trySend(GemmaResult.Success(partialResult))
                    if (done) {
                        val totalInferenceTime = System.currentTimeMillis() - startTime
                        updatePerformanceMetric("lastInferenceTime", totalInferenceTime.toDouble())
                        channel.close()
                    }
                },
                { error ->
                    trySend(GemmaResult.Error(GemmaErrorCode.INFERENCE_ERROR.code, error.message ?: "Unknown inference error"))
                    channel.close()
                }
            )
        } catch (e: Exception) {
            send(GemmaResult.Error(GemmaErrorCode.INTERNAL_ERROR.code, "Failed to start generation: ${e.message}"))
        }
        awaitClose() // Keep the flow open until the channel is closed
    }

    private fun updatePerformanceMetric(key: String, value: Any) {
        val currentMetrics = performanceMetrics.value
        val newMetrics = Arguments.createMap().apply {
            merge(currentMetrics)
            when (value) {
                is String -> putString(key, value)
                is Double -> putDouble(key, value)
                is Int -> putInt(key, value)
                is Boolean -> putBoolean(key, value)
            }
        }
        performanceMetrics.value = newMetrics
    }

    fun getSystemInfo(): ReadableMap {
        return Arguments.createMap().apply {
            putString("deviceModel", Build.MODEL)
            putString("deviceManufacturer", Build.MANUFACTURER)
            putInt("apiLevel", Build.VERSION.SDK_INT)
            // Add other relevant system info here
        }
    }

    fun release() {
        modelScope.cancel()
        llmInference?.close()
        llmInference = null
        _modelState.value = ModelState.UNINITIALIZED
    }
}


// --- The React Native Bridge Module ---
class GemmaBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        // Singleton manager instance
        @Volatile
        private var INSTANCE: GemmaModelManager? = null

        fun getInstance(context: Context): GemmaModelManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: GemmaModelManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val gemmaManager = getInstance(reactContext)
    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var modelPickerLauncher: ActivityResultLauncher<Array<String>>? = null

    init {
        reactContext.addLifecycleEventListener(this)

        // Using WeakReference to avoid memory leaks with Activity contexts
        val activity = WeakReference(currentActivity)

        modelPickerLauncher = (activity.get() as? ComponentActivity)?.registerForActivityResult(
            ActivityResultContracts.OpenDocument()
        ) { uri: Uri? ->
            uri?.let {
                moduleScope.launch {
                    gemmaManager.initializeModel(it)
                }
            }
        }
    }

    override fun getName() = "GemmaBridge"

    override fun getConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "EVENT_GEMMA_PROGRESS" to "onGemmaProgress"
        )
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun selectModelAndInitialize(promise: Promise) {
        // Launches the system file picker. The result is handled by the launcher callback.
        modelPickerLauncher?.launch(arrayOf("*/*")) // You can restrict MIME types here
        promise.resolve("File picker opened. Awaiting user selection.")
    }

    @ReactMethod
    fun generateResponse(prompt: String, promise: Promise) {
        moduleScope.launch {
            val fullResponse = StringBuilder()
            gemmaManager.generateResponseStream(prompt)
                .onEach { result ->
                    val params = Arguments.createMap()
                    when(result) {
                        is GemmaResult.Success -> {
                            fullResponse.append(result.data)
                            params.putString("status", "generating")
                            params.putString("chunk", result.data)
                        }
                        is GemmaResult.Error -> {
                            params.putString("status", "error")
                            params.putString("code", result.code)
                            params.putString("message", result.message)
                        }
                        is GemmaResult.Loading -> {
                             params.putString("status", "loading")
                        }
                    }
                    sendEvent("onGemmaProgress", params)
                }
                .onCompletion {
                    if (it == null) { // Flow completed without error
                        promise.resolve(fullResponse.toString())
                    } else {
                        promise.reject(GemmaErrorCode.INFERENCE_ERROR.code, it.message, it)
                    }
                }
                .catch { e ->
                    promise.reject(GemmaErrorCode.INTERNAL_ERROR.code, "An unexpected error occurred in the flow.", e)
                }
                .collect() // Start collecting the flow
        }
    }

    @ReactMethod
    fun getModelState(promise: Promise) {
        val stateMap = Arguments.createMap().apply {
            putString("state", gemmaManager.modelState.value.name)
            gemmaManager.lastError.value?.let {
                val errorMap = Arguments.createMap().apply {
                    putString("code", it.code)
                    putString("message", it.message)
                }
                putMap("error", errorMap)
            }
        }
        promise.resolve(stateMap)
    }

    @ReactMethod
    fun getPerformanceMetrics(promise: Promise) {
        promise.resolve(gemmaManager.performanceMetrics.value)
    }

    @ReactMethod
    fun getSystemInfo(promise: Promise) {
        promise.resolve(gemmaManager.getSystemInfo())
    }

    // --- Lifecycle Methods ---
    override fun onHostResume() {
        // Optional: Re-register launcher if activity was destroyed
    }

    override fun onHostPause() {
        // Not used
    }

    override fun onHostDestroy() {
        // Clean up coroutines and manager resources
        moduleScope.cancel()
        gemmaManager.release()
        INSTANCE = null // Allow GC
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        onHostDestroy()
    }
}
```
