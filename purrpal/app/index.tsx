import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  SafeAreaView,
  TextInput,
  Button,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import GemmaBridge, { BackendInfo, PerformanceMetrics } from "../lib/GemmaBridge";

export default function Index() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [backendInfo, setBackendInfo] = useState<BackendInfo | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    // Load initial status and backend info
    const loadInitialData = async () => {
      try {
        const backend = await GemmaBridge.getBackendInfo();
        setBackendInfo(backend);
        
        // Poll for model loaded status since it takes time to initialize
        const checkModelStatus = async () => {
          try {
            const loaded = await GemmaBridge.isModelLoaded();
            console.log("Model loaded status:", loaded);
            setModelLoaded(loaded);
            
            if (!loaded) {
              // Retry in 2 seconds if not loaded yet
              setTimeout(checkModelStatus, 2000);
            }
          } catch (e) {
            console.error("Failed to check model status:", e);
            // Retry on error too
            setTimeout(checkModelStatus, 2000);
          }
        };
        
        checkModelStatus();
      } catch (e) {
        console.error("Failed to load initial data:", e);
      }
    };
    loadInitialData();
  }, []);

  const handlePress = async () => {
    if (loading || !prompt) return;

    setLoading(true);
    setResponse("");
    const startTime = Date.now();
    
    try {
      const result = await GemmaBridge.generateResponse(prompt);
      setResponse(result);
      
      // Get updated performance metrics
      const newMetrics = await GemmaBridge.getPerformanceMetrics();
      setMetrics(newMetrics);
      
      const totalTime = Date.now() - startTime;
      console.log(`Total request time: ${totalTime}ms`);
      
    } catch (e: any) {
      console.error(e);
      setResponse(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const showPerformanceStats = () => {
    if (!metrics) {
      Alert.alert("No Performance Data", "Run a query first to see performance metrics");
      return;
    }

    const statsText = `
Model Load Time: ${metrics.modelLoadTime.toFixed(0)}ms
Time to First Token: ${metrics.timeToFirstToken.toFixed(0)}ms
Tokens per Second: ${metrics.tokensPerSecond.toFixed(1)}
Total Tokens: ${metrics.totalTokens}
Inference Time: ${metrics.inferenceTime.toFixed(0)}ms
Peak Memory: ${metrics.peakMemoryMB.toFixed(1)}MB
Backend: ${backendInfo?.backend || 'Unknown'}
    `;

    Alert.alert("Performance Metrics", statsText.trim());
  };

  const warmupModel = async () => {
    setLoading(true);
    try {
      await GemmaBridge.warmupModel?.();
      Alert.alert("Success", "Model warmed up successfully!");
    } catch (e: any) {
      Alert.alert("Error", `Warmup failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetMemory = async () => {
    try {
      await GemmaBridge.resetMemoryTracking?.();
      // Refresh metrics
      const newMetrics = await GemmaBridge.getPerformanceMetrics();
      setMetrics(newMetrics);
      Alert.alert("Success", "Memory tracking reset!");
    } catch (e: any) {
      Alert.alert("Error", `Reset failed: ${e.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Purrpal AI</Text>
        <Text style={styles.subtitle}>
          Running Gemma on-device with React Native ({Platform.OS})
        </Text>
        
        {/* Status Info */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Model: {modelLoaded ? "✅ Loaded" : "❌ Not Loaded"}
          </Text>
          {backendInfo && (
            <Text style={styles.statusText}>
              Backend: {backendInfo.backend} | Size: {backendInfo.modelSize}
            </Text>
          )}
        </View>

        <TextInput
          style={styles.input}
          onChangeText={setPrompt}
          value={prompt}
          placeholder="Ask Gemma anything..."
          editable={!loading}
        />
        
        <View style={styles.buttonContainer}>
          <Button
            title={loading ? "Generating..." : "Ask"}
            onPress={handlePress}
            disabled={loading || !modelLoaded}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="📊 Stats"
            onPress={showPerformanceStats}
            disabled={loading}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="🔥 Warmup"
            onPress={warmupModel}
            disabled={loading}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="🧹 Reset Mem"
            onPress={resetMemory}
            disabled={loading}
          />
        </View>

        {loading && <ActivityIndicator size="large" style={styles.loader} />}

        {/* Performance Preview */}
        {metrics && (
          <View style={styles.metricsPreview}>
            <Text style={styles.metricsText}>
              Last: {metrics.tokensPerSecond.toFixed(1)} tokens/sec, {metrics.inferenceTime.toFixed(0)}ms
            </Text>
          </View>
        )}

        {response ? (
          <ScrollView style={styles.responseContainer}>
            <Text style={styles.responseText}>{response}</Text>
          </ScrollView>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    height: 50,
    width: "100%",
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  loader: {
    marginVertical: 20,
  },
  responseContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 8,
    width: "100%",
    maxHeight: "50%",
  },
  responseText: {
    fontSize: 16,
    color: "#333",
  },
  statusContainer: {
    backgroundColor: "#e8f4fd",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    width: "100%",
  },
  statusText: {
    fontSize: 14,
    color: "#0066cc",
    textAlign: "center",
    marginVertical: 2,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  buttonSpacer: {
    width: 8,
  },
  metricsPreview: {
    backgroundColor: "#f0f8ff",
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  metricsText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
});
