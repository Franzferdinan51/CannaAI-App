# CannaAI Mobile Apps

AI-powered cannabis cultivation companion app for Android and iOS. Built with Capacitor from the [CannaAI Web Version](https://github.com/Franzferdinan51/CannaAI-Web-Version).

## Project Structure

```
CannaAI-App/
├── android/              # Android native project (Capacitor)
│   └── app/build/outputs/apk/debug/app-debug.apk
├── ios/                  # iOS native project (Capacitor)
│   └── App.app          # Built iOS app
├── web/                  # Shared web source (Vite + React)
│   ├── src/              # React components, services, types
│   ├── package.json      # npm dependencies
│   ├── vite.config.ts
│   └── capacitor.config.ts
└── README.md
```

## Quick Start

### Android
```bash
# Install APK directly
adb install CannaAI-android.apk

# Or open in Android Studio
cd android && studio .
```

### iOS
```bash
# Open in Xcode
open ios/App/App.xcodeproj
# Or use command line
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug \
  -sdk iphonesimulator26.4 \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

### Web Development
```bash
cd web
npm install
npm run dev        # Development server
npm run build      # Production build
npx cap sync android   # Sync to Android
npx cap sync ios       # Sync to iOS
npx cap open android   # Open in Android Studio
npx cap open ios       # Open in Xcode
```

## Features

- 🌿 **Plant Health Analysis** — Vision AI diagnoses plant issues from photos
- 📊 **Dashboard** — Overview of system status and recent analyses
- 💬 **AI Chat** — Chat with AI models via LM Studio or OpenRouter
- 🧠 **Council Chamber** — Multi-agent deliberation for complex decisions
- 📚 **Strain Library** — Cannabis strain database
- ⚙️ **Settings Panel** — Configure AI providers and model preferences

## AI Providers

| Provider | Type | Notes |
|----------|------|-------|
| LM Studio | Local | Connect to local Qwen3-VL-4B-Thinking model |
| OpenRouter | API | Various models via openrouter.ai |
| NVIDIA NIM | API | NVIDIA-hosted inference endpoints |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Mobile**: Capacitor 7
- **Android**: Gradle + Kotlin
- **iOS**: Xcode 26 + Swift
- **AI**: Multi-provider architecture (LM Studio, OpenRouter, NVIDIA NIM)

## App Bundle IDs

- **Android**: `com.cannaai.app`
- **iOS**: `com.cannaai.app`

## Version

- App Version: 1.0.0
- Capacitor: 7.x
- Min iOS: 15.0
- Min Android: API 22 (Android 5.1)