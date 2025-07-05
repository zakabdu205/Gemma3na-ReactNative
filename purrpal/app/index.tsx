import React, { useState } from "react";
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
} from "react-native";
import GemmaBridge from "../lib/GemmaBridge";

export default function Index() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading || !prompt) return;

    setLoading(true);
    setResponse("");
    try {
      const result = await GemmaBridge.generateResponse(prompt);
      setResponse(result);
    } catch (e: any) {
      console.error(e);
      setResponse(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Purrpal AI</Text>
        <Text style={styles.subtitle}>
          Running Gemma on-device with React Native ({Platform.OS})
        </Text>
        <TextInput
          style={styles.input}
          onChangeText={setPrompt}
          value={prompt}
          placeholder="Ask Gemma anything..."
          editable={!loading}
        />
        <Button
          title={loading ? "Generating..." : "Ask"}
          onPress={handlePress}
          disabled={loading}
        />

        {loading && <ActivityIndicator size="large" style={styles.loader} />}

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
});
