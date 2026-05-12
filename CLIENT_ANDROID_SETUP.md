# Client & Android Setup Guide

## Client (Next.js) Setup

### 1. Static Server URL (Recommended for Production)

Set this on **Heroku Dashboard** for `school-client` app:

```
Settings → Config Vars → Reveal Config Vars

Key: NEXT_PUBLIC_API_URL
Value: https://school-server-b264c1a1fac6.herokuapp.com/api
```

### 2. Local Development

Create `.env.local` in `client/` folder:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 3. Dynamic Server URL (Optional)

Alternatively, fetch server URL dynamically at runtime:

```typescript
// In client/lib/api.ts or client/hooks/useConfig.ts
const getApiBaseUrl = async () => {
  try {
    const response = await fetch('https://school-server-b264c1a1fac6.herokuapp.com/api/config/endpoints');
    const data = await response.json();
    return data.data.apiBaseUrl; // e.g., https://school-server-b264c1a1fac6.herokuapp.com/api
  } catch (error) {
    // Fallback to environment variable
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  }
};
```

---

## Android (Native Kotlin) Setup

### 1. Add Server URL to Android App

Create `android/app/src/main/java/com/schooln/config/Config.kt`:

```kotlin
package com.schooln.config

object Config {
    // Static server URL - can be changed at build time
    const val SERVER_URL = "https://school-server-b264c1a1fac6.herokuapp.com"
    const val API_BASE_URL = "$SERVER_URL/api"
    
    // Or use BuildConfig variants for different environments
    // See build.gradle.kts for productFlavors
}
```

### 2. Update build.gradle.kts with Server URL

Add to `android/app/build.gradle.kts`:

```kotlin
android {
    // ... existing config
    
    buildFeatures {
        buildConfig = true
    }
    
    buildTypes {
        debug {
            buildConfigField("String", "SERVER_URL", "\"http://localhost:5000\"")
            buildConfigField("String", "API_BASE_URL", "\"http://localhost:5000/api\"")
        }
        release {
            buildConfigField("String", "SERVER_URL", "\"https://school-server-b264c1a1fac6.herokuapp.com\"")
            buildConfigField("String", "API_BASE_URL", "\"https://school-server-b264c1a1fac6.herokuapp.com/api\"")
        }
    }
}
```

### 3. Use in Android Code (Kotlin)

```kotlin
import com.schooln.BuildConfig

// In your API client / Retrofit setup
val apiBaseUrl = BuildConfig.API_BASE_URL
// e.g., "https://school-server-b264c1a1fac6.herokuapp.com/api"
```

### 4. Mobile-Responsive Design

- Use **Jetpack Compose** for responsive UI (recommended for modern Android)
- Or use **Material Design 3** with responsive layouts
- All screens should adapt to different screen sizes

---

## Server Config Endpoints (For Any Client)

### Get Dynamic Endpoints

```
GET https://school-server-b264c1a1fac6.herokuapp.com/api/config/endpoints

Response:
{
  "success": true,
  "data": {
    "serverUrl": "https://school-server-b264c1a1fac6.herokuapp.com",
    "apiBaseUrl": "https://school-server-b264c1a1fac6.herokuapp.com/api",
    "environment": "production",
    "timestamp": "2026-05-12T10:30:00Z"
  }
}
```

### Get Server Status

```
GET https://school-server-b264c1a1fac6.herokuapp.com/api/config/status

Response:
{
  "success": true,
  "data": {
    "status": "online",
    "environment": "production",
    "serverUrl": "https://school-server-b264c1a1fac6.herokuapp.com",
    "features": {
      "emailEnabled": false,
      "smsEnabled": true
    },
    "timestamp": "2026-05-12T10:30:00Z"
  }
}
```

---

## Environment Variables Summary

### Server (Heroku)

```
SERVER_URL=https://school-server-b264c1a1fac6.herokuapp.com
ANDROID_URL=http://your-android-device-ip:8081
ALLOWED_ORIGINS=https://your-domain.com,https://another-domain.com
```

### Client (Heroku)

```
NEXT_PUBLIC_API_URL=https://school-server-b264c1a1fac6.herokuapp.com/api
```

### Android (Local Development)

Create `android/local.properties`:
```
sdk.dir=/path/to/Android/sdk
```

Create `android/app/build.gradle.kts` with buildTypes as shown above.

---

## CORS Configuration

The server automatically accepts:
- ✅ All localhost variants (dev)
- ✅ Both Heroku domains
- ✅ Android URLs (if ANDROID_URL env var set)
- ✅ Custom domains via ALLOWED_ORIGINS (comma-separated)

If you get CORS error:
1. Make sure `NEXT_PUBLIC_API_URL` is set correctly on Heroku client app
2. Add your domain to `ALLOWED_ORIGINS` on Heroku server app
3. For Android: Set `ANDROID_URL` env var on server

---

## Testing

### Test Client Connection

```bash
# From browser console on client domain
fetch('https://school-server-b264c1a1fac6.herokuapp.com/api/config/endpoints')
  .then(r => r.json())
  .then(d => console.log(d.data.apiBaseUrl))
```

### Test Android Connection

```bash
# From Android device
curl https://school-server-b264c1a1fac6.herokuapp.com/api/config/endpoints
```

---

## Next Steps

1. **Client**: Set `NEXT_PUBLIC_API_URL` on Heroku dashboard ✓
2. **Android**: Add Config.kt and update build.gradle.kts with server URLs
3. **Testing**: Run tests from each platform to verify connectivity
