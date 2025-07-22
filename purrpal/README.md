# PurrPal AI - Gemma Integration

A React Native Expo app demonstrating on-device AI inference using Google's Gemma model with a custom native bridge.

## Quick Start

1. **Install dependencies**
   ```bash
   cd purrpal
   npm install
   ```

2. **Set up the Gemma model**
   - Place your `gemma.task` model file in the appropriate directory:
     - **iOS**: Add to Xcode project bundle
     - **Android**: Place in `Documents/gemma/` folder

3. **Run the app**
   ```bash
   npx expo run:ios    # for iOS
   npx expo run:android # for Android
   ```

## Features

- 🧠 On-device AI inference with Google Gemma
- 📱 Cross-platform (iOS/Android) support
- ⚡ Real-time performance metrics
- 💬 Chat interface with conversation history
- 🔧 Model management and configuration

## Bridge Integration

This project includes a complete native bridge implementation for integrating Gemma models into React Native apps. The bridge provides:

- Model loading/unloading
- Text generation with metrics
- Performance monitoring
- Device capability detection

## Requirements

- React Native development environment
- Gemma model file (`gemma.task`)
- iOS 13+ or Android API 21+
