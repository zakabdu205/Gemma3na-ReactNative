import React, { useState, useCallback } from "react";
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
  Modal,
  TouchableOpacity,
} from "react-native";
import { useGemmaModel, useGemmaMetrics } from "../lib/hooks";
import SimplifiedGemmaBridge from "../lib/GemmaBridge";

export default function Index() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversation, setConversation] = useState<
    Array<{
      type: "user" | "assistant";
      content: string;
      timestamp: number;
    }>
  >([]);

  // Use the new hooks
  const {
    status,
    isLoaded,
    isLoading,
    error,
    loadModel,
    unloadModel,
    deviceCapabilities,
  } = useGemmaModel();

  const {
    realtimeMetrics,
    performanceStats,
    isPerformanceDegrading,
    clearMetrics,
  } = useGemmaMetrics();

  // Handle first request with model loading
  const handleSendMessage = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    const userMessage = prompt.trim();
    setPrompt("");
    setIsGenerating(true);

    // Add user message to conversation
    const newUserMessage = {
      type: "user" as const,
      content: userMessage,
      timestamp: Date.now(),
    };
    setConversation((prev) => [...prev, newUserMessage]);

    try {
      // Load model if not loaded
      if (!isLoaded) {
        console.log("Model not loaded, loading now...");
        const loadSuccess = await loadModel();
        if (!loadSuccess) {
          throw new Error("Failed to load model");
        }
      }

      // Generate response
      const result = await SimplifiedGemmaBridge.generateResponseWithMetrics(
        userMessage
      );

      // Add assistant response to conversation
      const assistantMessage = {
        type: "assistant" as const,
        content: result.response,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, assistantMessage]);

      console.log("Response generated:", {
        tokensPerSecond: result.metrics.tokensPerSecond,
        inferenceTime: result.metrics.inferenceTimeMs,
      });
    } catch (error: any) {
      console.error("Error generating response:", error);

      // Add error message to conversation
      const errorMessage = {
        type: "assistant" as const,
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, errorMessage]);

      // Show user-friendly error
      Alert.alert("Error", `Failed to generate response: ${error.message}`, [
        { text: "OK" },
      ]);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, isLoaded, isGenerating, loadModel]);

  // Show performance stats
  const showPerformanceStats = useCallback(() => {
    if (!realtimeMetrics || !performanceStats) {
      Alert.alert(
        "No Performance Data",
        "Send a message first to see performance metrics"
      );
      return;
    }

    const statsText = `
Current Performance:
• Tokens/sec: ${realtimeMetrics.currentTokensPerSecond.toFixed(1)}
• Last inference: ${realtimeMetrics.lastInferenceTime}ms
• Total messages: ${realtimeMetrics.totalInferences}

Session Stats:
• Average tokens/sec: ${performanceStats.averageTokensPerSecond.toFixed(1)}
• Best tokens/sec: ${performanceStats.bestTokensPerSecond.toFixed(1)}
• Session duration: ${Math.round(realtimeMetrics.sessionDuration / 1000)}s

Device:
• Platform: ${deviceCapabilities?.platform || "Unknown"}
• GPU Support: ${deviceCapabilities?.supportsGPU ? "Yes" : "No"}
• Memory: ${deviceCapabilities?.totalMemoryMB || 0}MB
    `;

    Alert.alert("Performance Metrics", statsText.trim());
  }, [realtimeMetrics, performanceStats, deviceCapabilities]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    Alert.alert(
      "Clear Conversation",
      "Are you sure you want to clear the conversation?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setConversation([]);
            setResponse("");
            clearMetrics();
          },
        },
      ]
    );
  }, [clearMetrics]);

  // Manual model loading
  const handleLoadModel = useCallback(async () => {
    if (isLoading) return;

    try {
      const success = await loadModel();
      if (success) {
        Alert.alert("Success", "Model loaded successfully!");
      } else {
        Alert.alert("Error", "Failed to load model");
      }
    } catch (error: any) {
      Alert.alert("Error", `Failed to load model: ${error.message}`);
    }
  }, [isLoading, loadModel]);

  // Get loading status text
  const getLoadingStatusText = () => {
    if (isLoading) {
      const progress = Math.round(status.loadProgress * 100);
      return `Loading model... ${progress}%`;
    }
    return null;
  };

  // Get model status display
  const getModelStatusDisplay = () => {
    if (isLoading) {
      const progress = Math.round(status.loadProgress * 100);
      return `🔄 Loading (${progress}%)`;
    }
    if (isLoaded) {
      return `✅ Loaded${status.backend ? ` (${status.backend})` : ""}`;
    }
    if (error) {
      return `❌ Error: ${error}`;
    }
    return "⏳ Not Loaded";
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Purrpal AI</Text>
          <Text style={styles.subtitle}>
            On-device Gemma AI • {Platform.OS} •{" "}
            {deviceCapabilities?.platform || "Unknown"}
          </Text>
        </View>

        {/* Status Bar */}
        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              Model: {getModelStatusDisplay()}
            </Text>
            {realtimeMetrics && (
              <Text style={styles.metricsText}>
                {realtimeMetrics.currentTokensPerSecond.toFixed(1)} tok/s
              </Text>
            )}
          </View>
          {isPerformanceDegrading && (
            <Text style={styles.warningText}>⚠️ Performance degrading</Text>
          )}
        </View>

        {/* Conversation */}
        <ScrollView
          style={styles.conversationContainer}
          showsVerticalScrollIndicator={false}
        >
          {conversation.length === 0 ? (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeText}>Welcome to Purrpal AI! 🐱</Text>
              <Text style={styles.welcomeSubtext}>
                Your AI model will load automatically when you send your first
                message.
              </Text>
            </View>
          ) : (
            conversation.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.messageContainer,
                  message.type === "user"
                    ? styles.userMessage
                    : styles.assistantMessage,
                ]}
              >
                <Text style={styles.messageText}>{message.content}</Text>
                <Text style={styles.messageTime}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))
          )}
          {isGenerating && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0066cc" />
              <Text style={styles.loadingText}>Generating response...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Ask me anything..."
            placeholderTextColor="#999"
            multiline
            maxLength={1000}
            editable={!isGenerating}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!prompt.trim() || isGenerating) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!prompt.trim() || isGenerating}
          >
            <Text style={styles.sendButtonText}>
              {isGenerating ? "⏳" : "Send"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={showPerformanceStats}
          >
            <Text style={styles.actionButtonText}>📊 Stats</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLoadModel}
            disabled={isLoading}
          >
            <Text style={styles.actionButtonText}>
              {isLoading ? "Loading..." : "🔄 Load Model"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={clearConversation}
          >
            <Text style={styles.actionButtonText}>🗑️ Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading Modal */}
      <Modal visible={isLoading} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.modalTitle}>Loading Model</Text>
            <Text style={styles.modalMessage}>{getLoadingStatusText()}</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${status.loadProgress * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.modalSubtext}>
              {Platform.OS === "ios"
                ? "Loading model from app bundle..."
                : "Loading model from Documents folder..."}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#2c3e50",
  },
  subtitle: {
    fontSize: 14,
    color: "#7f8c8d",
    marginTop: 4,
  },
  statusContainer: {
    backgroundColor: "#e8f4fd",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusText: {
    fontSize: 14,
    color: "#2c3e50",
    fontWeight: "500",
  },
  metricsText: {
    fontSize: 12,
    color: "#0066cc",
    fontWeight: "500",
  },
  warningText: {
    fontSize: 12,
    color: "#e74c3c",
    marginTop: 4,
  },
  conversationContainer: {
    flex: 1,
    marginBottom: 16,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
    marginBottom: 8,
  },
  welcomeSubtext: {
    fontSize: 16,
    color: "#7f8c8d",
    textAlign: "center",
    lineHeight: 24,
  },
  messageContainer: {
    marginVertical: 4,
    padding: 12,
    borderRadius: 12,
    maxWidth: "85%",
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#0066cc",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e1e8ed",
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#7f8c8d",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e1e8ed",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 8,
    fontSize: 16,
    backgroundColor: "#ffffff",
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#0066cc",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#bdc3c7",
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e1e8ed",
  },
  actionButtonText: {
    fontSize: 14,
    color: "#2c3e50",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    minWidth: 280,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2c3e50",
    marginTop: 16,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 16,
    color: "#7f8c8d",
    textAlign: "center",
    marginBottom: 16,
  },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#e1e8ed",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0066cc",
  },
  modalSubtext: {
    fontSize: 14,
    color: "#95a5a6",
    textAlign: "center",
  },
});
