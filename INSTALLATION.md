# Installation Guide for Drikr

Follow these steps to get your Drikr mobile app up and running.

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (v16 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node -v`

2. **npm** or **yarn**
   - Comes with Node.js
   - Verify: `npm -v` or `yarn -v`

3. **Expo CLI**
   - Install globally: `npm install -g expo-cli`
   - Verify: `expo --version`

4. **Mobile Device Setup**
   - **iOS**: Install Expo Go from App Store
   - **Android**: Install Expo Go from Play Store

## Installation Steps

### 1. Install Dependencies

```bash
# Navigate to project directory
cd Drikr

# Install all dependencies
npm install
```

### 2. Configure API Backend

Edit `src/config/api.ts`:

```typescript
export const API_BASE_URL = 'http://your-backend-url:5000';
```

For local development on a physical device, use your computer's local IP address:
- Windows: `ipconfig`
- Mac/Linux: `ifconfig`
- Example: `http://192.168.1.100:5000`

### 3. Create App Assets

Create the following images in the `assets/` directory:
- `icon.png` (1024x1024px)
- `splash.png` (1242x2436px)
- `adaptive-icon.png` (1024x1024px)
- `favicon.png` (48x48px)

See `assets/README.md` for details.

### 4. Start Development Server

```bash
npm start
```

This will:
- Start the Metro bundler
- Display a QR code
- Open Expo DevTools in your browser

### 5. Run on Device/Emulator

#### Physical Device (Recommended for Testing)
1. Scan the QR code with:
   - **iOS**: Camera app
   - **Android**: Expo Go app

#### iOS Simulator (Mac only)
```bash
npm run ios
```

#### Android Emulator
```bash
npm run android
```

(Requires Android Studio with an emulator set up)

## Troubleshooting

### Port Already in Use
If port 19000 is busy, use a different port:
```bash
expo start --port 8081
```

### Network Issues on Device
- Ensure device and computer are on the same WiFi network
- For Android, try enabling "Legacy Expo CLI" in Expo Go settings

### Module Not Found Errors
Clear cache and reinstall:
```bash
npm start -- --clear
```

### Permission Errors
The app requires the following permissions:
- Camera (for disease/pest detection)
- Microphone (for voice assistant)
- Location (for weather/regional data)

Grant these permissions when prompted.

## Development Tips

### Hot Reload
The app automatically reloads when you save files. Shake your device or press `r` in terminal to manually reload.

### Debug Menu
- **iOS**: Cmd+D in simulator or shake device
- **Android**: Cmd+M in emulator or shake device

### View Logs
```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

Logs appear in the terminal.

### Testing on Multiple Devices
You can test on multiple devices simultaneously by scanning the QR code from each device.

## Building for Production

### Android APK
```bash
eas build --platform android
```

Requires Expo account and `eas.json` configuration.

### iOS IPA
```bash
eas build --platform ios
```

Requires:
- Apple Developer account
- Expo account
- Proper certificates and provisioning profiles

## Next Steps

1. Test all features:
   - Crop recommendation
   - Disease detection
   - Market prices
   - Voice assistant
   - Language switching

2. Connect to your backend API

3. Customize branding and colors

4. Add more features as needed

## Support

For issues or questions:
1. Check Expo documentation: https://docs.expo.dev/
2. Check React Native documentation: https://reactnative.dev/
3. Open an issue on GitHub

---

**Note**: This app is designed for mobile devices only. Desktop/web functionality is not supported.

