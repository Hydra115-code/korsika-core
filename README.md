# Korsika - AI Copilot 🚗🟣

Korsika is a futuristic, voice-activated AI co-pilot designed for the web. It integrates real-time navigation, music control, and computer vision safety features into a unified, hands-free dashboard.

## 🏆 Hackathon Submission
Built for the **AI Partner Catalyst: Accelerate Innovation** Hackathon.

## ✨ Features
- **Voice-First Interface:** Talk to Korsika naturally using ElevenLabs & Gemini.
- **Smart Navigation:** Real-time Google Maps routing with Split-Screen UI.
- **Driver Mode:** Visual road analysis using the camera (Gemini Vision).
- **Media Control:** Voice commands to open songs in Spotify.
- **Context Aware:** Knows your location, time, and notifications.

## 🚀 Tech Stack
- **Framework:** Next.js 14 (App Router)
- **AI:** Google Gemini 1.5 Flash
- **Voice:** ElevenLabs
- **Maps:** Google Maps Embed API
- **Styling:** Tailwind CSS + Framer Motion

## 🛠️ Installation & Setup

1. **Clone the repo:**
   ```bash
   git clone [https://github.com/tu-usuario/korsika-core.git](https://github.com/Hydra115-code/korsika-core.git)
   cd korsika-core
Install dependencies:

Bash

npm install
Set up Environment Variables: Create a .env.local file and add:

Bash

GOOGLE_API_KEY=your_gemini_key
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_maps_key
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_elevenlabs_id
Run the development server:

Bash

npm run dev