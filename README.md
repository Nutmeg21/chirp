# 🐦 Chirp: The AI-Powered Eco-Travel Guardian

![Chirp App](https://img.shields.io/badge/Status-Beta_Deployment-success)
![React Native](https://img.shields.io/badge/Built_With-React_Native_Web-blue)
![Gemini AI](https://img.shields.io/badge/Powered_By-Google_Gemini-orange)

Chirp is a context-aware, AI-driven travel planning application designed to eliminate app fatigue and promote sustainable tourism. By utilizing a Retrieval-Augmented Generation (RAG) architecture and real-time civic data, Chirp algorithmically nudges users toward eco-friendly transport and local businesses.

This project was built as a Final Year Project (FYP) focused on software engineering, API integration, and algorithmic behavioral nudging.

## 🌍 UN Sustainable Development Goals (SDGs)
Chirp actively addresses three specific SDGs:
* **SDG 8 (Decent Work & Economic Growth):** Distributes tourism revenue by routing users to local businesses rather than strictly corporate chains.
* **SDG 9 (Industry, Innovation & Infrastructure):** Leverages AI and live traffic APIs to optimize how tourists interact with existing civic transport infrastructure.
* **SDG 12 (Responsible Consumption & Production):** Minimizes travel waste by explicitly highlighting and rewarding "Eco-friendly" transit options and generating geographically efficient itineraries.

## ✨ Core Features
1. **AI Accommodation RAG Pipeline:** Fetches live data from the Google Places API and filters it through the Gemini LLM based on strict user parameters (Budget, Vibe) to return highly curated, relevant hotel matches with dynamic Booking.com deep links.
2. **Context-Aware Dynamic Itineraries:** Generates mathematically optimized, day-by-day travel schedules mapped via Leaflet. The system syncs with OpenWeather and Google Traffic to provide live, context-aware routing.
3. **Sustainable Transit Engine:** A scoring algorithm that cross-references distance, cost, and live traffic delays to assign dynamic tags like "🌱 Eco-friendly" and "✨ AI Recommended", actively penalizing congested car routes in favor of public transit.

## 🛠️ Tech Stack
* **Frontend:** React Native (Expo Web), custom pure-React UI components.
* **Backend / AI:** Google Gemini (Generative Language API) via REST.
* **Mapping & Data:** Google Places API (New), Google Routes API, OpenWeather API, Leaflet.js.
* **Deployment & Hosting:** Google Firebase Hosting.

## 🚀 Getting Started (Local Development)

### Prerequisites
Make sure you have Node.js and the Expo CLI installed on your machine.
```bash
npm install -g expo-cli
```

### Installation
1. Clone the repository:
```bash
git clone [https://github.com/yourusername/chirp-travel.git](https://github.com/yourusername/chirp-travel.git)
cd chirp-travel
```

2. Install the required dependencies (Note: The legacy-peer-deps flag is required to resolve React Native dependency tree conflicts):
```bash
npm install --legacy-peer-deps
```

3. Set up your Environment Variables. Create a `.env` file in the root directory and add your API keys:
```env
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_key_here
EXPO_PUBLIC_GOOGLE_PLACES_KEY=your_google_places_key_here
EXPO_PUBLIC_OPENWEATHER_KEY=your_openweather_key_here
```

4. Start the local development server:
```bash
npx expo start -w
```

## 🏗️ Technical Architecture & Trade-offs
* **Strict Prompt Sanitization:** Replaced open text inputs with custom dependency-free `StaticDropdown` components to prevent LLM hallucinations and guarantee perfectly formatted JSON responses.
* **Graceful Degradation for APIs:** Implemented robust `try/catch` error boundaries to handle Google Cloud free-tier rate limits (HTTP 429), preventing fatal UI crashes during high server traffic.
* **Asset Optimization:** Swapped third-party vector font libraries (which often break in Webpack bundlers) for localized, dynamic `tintColor` PNGs to guarantee 100% rendering reliability across all browsers.

## 📦 Deployment
This app is configured for serverless deployment via Firebase Hosting.
```bash
# Build the web bundle
npx expo export -p web

# Deploy to Google servers
firebase deploy --only hosting
```
