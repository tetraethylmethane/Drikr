# Complete Firebase Setup Guide for Drikr

This guide will walk you through creating a Firebase project and configuring it for phone authentication.

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `Drikr` (or any name you prefer)
4. Click **Continue**
5. **Google Analytics** (optional):
   - You can enable or disable Google Analytics
   - For development, you can disable it
   - Click **Continue** or **Create project**
6. Wait for project creation (takes 10-30 seconds)
7. Click **Continue** when done

## Step 2: Enable Phone Authentication

1. In your Firebase project, click on **Authentication** in the left sidebar
2. Click **Get started** (if this is your first time)
3. Click on the **Sign-in method** tab
4. Find **Phone** in the list of providers
5. Click on **Phone**
6. Toggle the **Enable** switch to ON
7. Click **Save**

⚠️ **Important:** Phone Authentication requires a billing account (Blaze plan) for production use, but you can test it in development mode.

## Step 3: Enable Firestore Database

1. In the left sidebar, click on **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Click **Next**
5. Select a location (choose the closest one to you)
6. Click **Enable**
7. Wait for database creation (takes 10-30 seconds)

## Step 4: Get Firebase Configuration

1. Click on the **gear icon** (⚙️) next to "Project Overview" in the left sidebar
2. Click **Project settings**
3. Scroll down to **"Your apps"** section
4. Click on the **Web app** icon (`</>`)
5. If you don't have a web app yet:
   - Enter app nickname: `Drikr Web` (or any name)
   - **Don't** check "Also set up Firebase Hosting" (optional)
   - Click **Register app**
6. You'll see your Firebase configuration like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

7. **Copy these values** - you'll need them in the next step

## Step 5: Configure Your App

Now you have two options:

### Option A: Direct Configuration (Easier for testing)

1. Open `src/config/firebase.ts` in your project
2. Replace the placeholder values on lines 27-32 with your actual Firebase config:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSy...your-actual-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-actual-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

### Option B: Environment Variables (Better for production)

1. Create a `.env` file in your project root (same level as `package.json`)
2. Add your Firebase config:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...your-actual-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-actual-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

3. **Important:** Add `.env` to `.gitignore` if it exists to avoid committing secrets

## Step 6: Test Your Setup

1. Restart your Expo server:

   ```bash
   # Press Ctrl+C to stop, then:
   npm start
   ```

2. In your app, try to:
   - Enter your phone number: `+919876543210`
   - Tap "Send OTP"
   - You should receive an OTP on your phone
   - Enter the OTP and verify

## Troubleshooting

### "Phone Authentication is not enabled"

- Go back to Firebase Console → Authentication → Sign-in method
- Make sure Phone is enabled (toggle is ON)

### "Billing account required"

- Phone Authentication requires Firebase Blaze plan (pay-as-you-go)
- However, you get free tier with 10K verifications/month
- Go to Firebase Console → Upgrade → Select Blaze plan
- You can set budget alerts to avoid unexpected charges

### "Invalid phone number format"

- Make sure phone number starts with `+91`
- Format: `+91XXXXXXXXXX` (13 characters total)
- Example: `+919876543210`

### "OTP not received"

- Check your phone number format
- Wait 30-60 seconds for SMS
- Check Firebase Console → Authentication → Users (might show errors)
- Try a different phone number for testing

## Security Notes

⚠️ **Important Security Considerations:**

1. **Firestore Rules:** Update Firestore security rules before production:

   - Go to Firestore Database → Rules
   - Replace test mode rules with production rules

2. **API Key Security:**

   - Firebase web API keys are safe to expose in client-side code
   - However, consider setting up API restrictions in Google Cloud Console

3. **Phone Number Privacy:**
   - Phone numbers are stored in Firebase Auth
   - Consider implementing additional privacy measures for production

## Next Steps

Once Firebase is configured:

- ✅ Test phone authentication
- ✅ Verify user data is saved to Firestore
- ✅ Test OTP verification flow
- ✅ Test navigation to HomeScreen after login

## Need Help?

If you encounter issues:

1. Check Firebase Console for error logs
2. Check terminal/console for error messages
3. Verify all config values are correct
4. Make sure you've restarted the Expo server after config changes
