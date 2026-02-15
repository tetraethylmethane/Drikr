# Firebase Phone Authentication Setup Guide

## Quick Start Steps

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select an existing one
3. Enable **Phone Authentication**:
   - Go to **Authentication** > **Sign-in method**
   - Click on **Phone** and enable it
   - Make sure it's enabled for your project
4. Enable **Firestore Database**:
   - Go to **Firestore Database** > **Create database**
   - Start in **test mode** (for development)
   - Select a location for your database

### 2. Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to **Your apps** section
3. Click on **Web app** (</> icon) or create one if you don't have it
4. Copy your Firebase config values

### 3. Configure Environment Variables

Create a `.env` file in the project root with your Firebase config:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
```

**OR** directly edit `src/config/firebase.ts` and replace the placeholder values.

### 4. Start the App

```bash
# Install dependencies (if not done already)
npm install

# Start Expo development server
npm start

# Or start on specific platform:
npm run web      # For web browser
npm run ios      # For iOS simulator (Mac only)
npm run android  # For Android emulator
```

### 5. Test the Login Flow

1. Open the app (web browser, iOS simulator, or Android emulator)
2. You should see the **Login Screen** with "Welcome to Drikr 🌾"
3. Enter your phone number in +91 format (e.g., +919876543210)
4. Click **Send OTP**
5. Enter the 6-digit OTP received on your phone
6. Click **Verify OTP**
7. On successful verification, you'll be navigated to the HomeScreen

## Troubleshooting

### Issue: "reCAPTCHA verification failed"

- Make sure you've enabled Phone Authentication in Firebase Console
- For native apps, you may need to configure SHA-1/SHA-256 in Firebase Console (Android) or add your bundle ID (iOS)

### Issue: "Invalid phone number format"

- Make sure the phone number is in +91XXXXXXXXXX format (13 characters total)
- Example: +919876543210

### Issue: Firebase config not working

- Double-check your environment variables or config values in `src/config/firebase.ts`
- Restart the Expo server after changing config values

### Issue: OTP not received

- Check your Firebase project billing (Phone Auth requires a paid Firebase plan for production)
- Verify the phone number format is correct
- Check Firebase Console logs for errors

## Testing on Different Platforms

### Web (Easiest for Testing)

```bash
npm run web
```

- Opens in browser automatically
- Fastest for initial testing
- Full Firebase Phone Auth support

### iOS

```bash
npm run ios
```

- Requires Xcode (Mac only)
- May need to configure SHA certificates in Firebase Console

### Android

```bash
npm run android
```

- Requires Android Studio
- Need to add SHA-1 fingerprint in Firebase Console

## Production Setup

For production deployment:

1. Set up Firestore security rules
2. Enable App Check in Firebase Console
3. Configure proper billing plan (Phone Auth requires paid tier)
4. Add your production app bundle IDs/SHA certificates
