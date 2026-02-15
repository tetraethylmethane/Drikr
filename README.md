# Drikr - Mobile-Only AI Farming App

নে A comprehensive mobile farming assistant built with React Native and TypeScript, powered by AI for intelligent crop recommendations, disease detection, market prices, and profit analysis.

## Features

### 🤖 AI-Powered Features
- **Crop Recommendation**: Get AI-suggested crops based on soil and weather conditions
- **Disease Detection**: Upload leaf images to detect plant diseases automatically
- **Pest Detection**: Identify pests and get natural control remedies
- **Profit & Loss Analysis**: Calculate farming profitability with detailed cost breakdown

### 📊 Market & Data
- **Real-time Market Prices**: Live crop prices with 7-day trend charts
- **Weather Forecast**: Current weather and 7-day forecast
- **Farming Calendar**: Sowing, irrigation, and harvest reminders

### 🌐 Multilingual Support
- Multi language support
- Voice assistant with bilingual support
- UI and content fully translated

### 💬 Community
- Community forum for farmers to share tips
- Like, comment, and share functionality
- Real-time discussions

### 🎤 Voice Assistant
- Speech-to-Text (STT) input
- Text-to-Speech (TTS) output
- AI-powered voice commands
- Floating mic button for quick access

## Tech Stack

### Mobile App
- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **Styling**: NativeWind (Tailwind CSS)
- **Navigation**: React Navigation
- **State Management**: Redux Toolkit
- **Voice**: @react-native-voice/voice + expo-speech
- **Charts**: Victory Native
- **Image Upload**: expo-image-picker
- **i18n**: i18next + react-i18next

### Backend (Reference)
- Flask REST API
- Endpoints: `/crop/recommend`, `/disease/detect`, `/pest/detect`, `/market/prices`, `/finance/analyze`, `/voice/process`, `/translate`, `/weather`

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- Expo CLI
- iOS Simulator (Mac) or Android Emulator
- Expo Go app (for physical device testing)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/Drikr.git
cd Drikr
```

2. **Install dependencies**
```bash
npm install
```

3. **Update API configuration**
Edit `src/config/api.ts` and update the `API_BASE_URL` with your Flask backend URL:
```typescript
export const API_BASE_URL = 'http://your-backend-url:5000';
```

4. **Start the development server**
```bash
npm start
```

5. **Run on iOS**
```bash
npm run ios
```

6. **Run on Android**
```bash
npm run android
```

## Project Structure

```
Drikr/
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Loader.tsx
│   │   └── VoiceAssistant.tsx
│   ├── screens/           # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── CropScreen.tsx
│   │   ├── MarketScreen.tsx
│   │   ├── CommunityScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── navigation/        # Navigation setup
│   │   └── AppNavigator.tsx
│   ├── store/            # Redux store and slices
│   │   ├── store.ts
│   │   ├── slices/
│   │   └── hooks.ts
│   ├── i18n/            # Internationalization
│   │   ├── i18n.ts
│   │   └── locales/
│   ├── services/        # API services
│   │   └── api.ts
│   └── config/         # Configuration
│       └── api.ts
├── App.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

## Key Features Implementation

### Crop Recommendation
Users input soil NPK values, temperature, humidity, pH, and rainfall. The app sends this data to the backend AI which returns suitable crops with Tamil translations.

### Disease Detection
Users can capture or upload leaf images. The AI analyzes the image and returns disease name, accuracy percentage, and cure methods.

### Profit & Loss Analysis
Farmers input crop details, area, costs, and market prices. The app calculates:
- Estimated yield (kg/acre)
- Total costs
- Expected revenue
- Profit/Loss amount
- Visual charts comparing costs vs revenue

### Market Prices
Displays real-time crop prices with interactive charts showing price trends over the last 7 days.

### Voice Assistant
Floating microphone button allows users to:
- Ask questions in their preferred language
- Get AI-powered responses
- Receive information via text-to-speech
- Navigate the app hands-free

## Development Notes

### Backend Integration
Update the API endpoints in `src/config/api.ts` to connect to your Flask backend. All API calls are handled through `src/services/api.ts`.

### Adding New Features
1. Create screen in `src/screens/`
2. Add translations in `src/i18n/locales/`
3. Update navigation in `src/navigation/AppNavigator.tsx`
4. Add Redux slices in `src/store/slices/` if needed

### Building for Production
```bash
expo build:android
expo build:ios
```

## Contributing
This is a project focused on helping farmers through AI and mobile technology. Contributions are welcome!

## License
MIT License

## Support
For issues and questions, please open an issue on GitHub or contact the development team.

---

**Built with ❤️ for farmers**



