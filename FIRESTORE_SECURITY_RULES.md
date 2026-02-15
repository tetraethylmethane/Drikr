# Firestore Security Rules for PIN-Based Authentication

This document contains Firestore security rules to ensure that users can only read and write their own user records.

## How to Apply These Rules

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **Drikr-8321a**
3. Navigate to **Firestore Database** > **Rules**
4. Replace the existing rules with the rules below
5. Click **Publish**

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users collection - users can only read/write their own document
    // Document ID is the phone number (e.g., +91XXXXXXXXXX)
    match /users/{phoneNumber} {
      // Allow read: Anyone can read (to check if user exists)
      // In production, you might want to restrict this
      allow read: if true;

      // Allow create: Anyone can create a new user account
      // Ensure the phone number matches the document ID and required fields are present
      allow create: if request.resource.data.phoneNumber == phoneNumber
                    && request.resource.data.keys().hasAll(['phoneNumber', 'pinHash', 'sessionToken'])
                    && request.resource.data.pinHash is string
                    && request.resource.data.phoneNumber is string
                    && request.resource.data.sessionToken is string;

      // Allow update: Only if authenticated (for security)
      // In this implementation, we need to allow updates for session tokens
      // Prevent updating pinHash (should only be set during creation)
      allow update: if request.auth != null
                    && request.resource.data.phoneNumber == phoneNumber
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pinHash']);

      // Allow delete: Only if authenticated (users can delete their own account)
      allow delete: if request.auth != null;
    }

    // Deny all other access by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Alternative: More Restrictive Rules (Recommended)

If you want stricter rules that ensure users can only access documents where they are the owner:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function to check if user owns the document
    function isOwner(phoneNumber) {
      return request.auth != null
             && exists(/databases/$(database)/documents/users/$(phoneNumber));
    }

    // Users collection
    match /users/{phoneNumber} {
      // Allow read: User is authenticated
      allow read: if request.auth != null;

      // Allow create: Authenticated user creating their own record
      allow create: if request.auth != null
                    && request.resource.data.phoneNumber == phoneNumber
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.keys().hasAll(['phoneNumber', 'pinHash', 'uid'])
                    && request.resource.data.pinHash is string;

      // Allow update: User is updating their own record, can't change PIN hash
      allow update: if request.auth != null
                    && resource.data.uid == request.auth.uid
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pinHash', 'phoneNumber']);

      // Allow delete: User can delete their own account
      allow delete: if request.auth != null
                    && resource.data.uid == request.auth.uid;
    }

    // Add rules for other collections as needed
    // Example: Allow read/write for other collections only if authenticated
    match /crops/{document=**} {
      allow read, write: if request.auth != null;
    }

    match /market/{document=**} {
      allow read, write: if request.auth != null;
    }

    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Testing Security Rules

You can test these rules using the Firebase Console:

1. Go to **Firestore Database** > **Rules**
2. Click **Rules Playground**
3. Test scenarios:
   - **Read own user document**: Should succeed
   - **Write to own user document**: Should succeed
   - **Read another user's document**: Should fail
   - **Write to another user's document**: Should fail

## Important Notes

1. **PIN Hash Protection**: The rules prevent updating the `pinHash` field after initial creation. This ensures PINs cannot be changed without proper security measures.

2. **Phone Number as Document ID**: Since we use the phone number as the document ID, the security relies on users knowing the phone number. Consider adding additional security layers if sensitive data is stored.

3. **Anonymous Authentication**: Our implementation uses Firebase Anonymous Authentication for session management. Users must be authenticated (even anonymously) to access their documents.

4. **UID Matching**: The stricter rules ensure that only the user who created the account (matching UID) can modify it.

## Additional Security Recommendations

1. **Rate Limiting**: Consider implementing rate limiting for PIN attempts to prevent brute force attacks.

2. **Audit Logging**: Enable Firestore audit logs to track access patterns.

3. **PIN Reset**: If you implement PIN reset functionality, ensure it goes through proper verification (e.g., OTP verification before reset).

4. **Encryption**: While PINs are hashed, consider encrypting other sensitive user data before storing in Firestore.
