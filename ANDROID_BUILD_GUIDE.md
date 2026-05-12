# Android Native Build & Run Guide

## Project Structure

The native Android app has been fully configured with:

```
android/
├── app/
│   ├── build.gradle.kts (Updated with all dependencies)
│   ├── src/main/
│   │   ├── AndroidManifest.xml (Updated with permissions & activities)
│   │   ├── java/com/hridoy/easystudy/
│   │   │   ├── EasyStudyApp.kt (Application class - SessionManager init)
│   │   │   ├── MainActivity.kt (Main menu after login)
│   │   │   ├── model/User.kt (All data classes)
│   │   │   ├── network/
│   │   │   │   ├── RetrofitClient.kt (HTTP client, emulator URL: 10.0.2.2:5000)
│   │   │   │   ├── ApiService.kt (40+ endpoints)
│   │   │   │   └── TokenStorage.kt (Session token holder)
│   │   │   ├── screens/
│   │   │   │   ├── LoginActivity.kt (Login screen)
│   │   │   │   ├── ProfileActivity.kt (User profile)
│   │   │   │   └── DashboardActivity.kt (Dashboard stats)
│   │   │   └── storage/SessionManager.kt (SharedPreferences for tokens)
│   │   └── res/
│   │       ├── layout/
│   │       │   ├── activity_login.xml
│   │       │   ├── activity_profile.xml
│   │       │   ├── activity_dashboard.xml
│   │       │   └── activity_main.xml
│   │       └── drawable/
│   │           ├── edit_text_background.xml
│   │           └── card_background.xml
│   └── gradle/ (Gradle wrapper)
└── gradle/libs.versions.toml (Dependency versions)
```

## Prerequisites

### Option A: Build from Android Studio (Recommended)

1. **Install Android Studio**
   - Download from: https://developer.android.com/studio
   - Install with default options (includes JDK and SDK tools)

2. **Open Project**
   - File → Open → Select `c:\New folder\school_n\android`
   - Wait for Gradle sync to complete

### Option B: Build from Command Line

1. **Set JAVA_HOME** (Required for Gradle)
   ```powershell
   # Find your Java installation (usually in Android Studio):
   # C:\Program Files\Android\Android Studio\jbr
   # or C:\Program Files\Android\jdk\jdk-17.x.x
   
   # Set environment variable:
   [Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\jbr", "User")
   
   # Verify:
   $env:JAVA_HOME
   java -version
   ```

2. **Set ANDROID_HOME** (Usually auto-detected by Android Studio)
   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   ```

## Building the App

### Method 1: Android Studio (Easiest)

1. Open project in Android Studio
2. Click "Run" button (green play icon) or press Shift+F10
3. Select emulator or connected device
4. App will build and run automatically

### Method 2: Command Line

```powershell
# Navigate to project
cd "c:\New folder\school_n\android"

# Build debug APK
.\gradlew.bat build

# Or build and run directly (requires emulator/device)
.\gradlew.bat installDebug
```

## Running the App

### Setup Android Emulator

1. **In Android Studio**:
   - Tools → Device Manager → Create Virtual Device
   - Select Pixel 6 (API 30+)
   - Click "Create"

2. **Run App**:
   - Click Run (Shift+F10)
   - Select your emulator
   - Click "OK"

### Test Credentials

```
Email: head@school.com
Password: password123

Other test users:
- teacher@school.com / password123
- student@school.com / password123
```

## Important Configuration

### Emulator Network Access

- Emulator localhost → Host machine: Use `10.0.2.2` (NOT 127.0.0.1)
- **Currently configured**: RetrofitClient.kt uses `http://10.0.2.2:5000/`
- **For physical device**: Change to your LAN IP (e.g., 192.168.x.x:5000)

### Backend Server Requirements

The app connects to the backend at `http://10.0.2.2:5000/` (emulator) or `http://<YOUR_IP>:5000/` (device)

**Backend must be running**:
```powershell
cd "c:\New folder\school_n\server"
npm run dev
```

Verify server is running:
- Terminal shows: `Server running on port 5000`
- Verify MongoDB: `mongodb://localhost:27017/drms`

## API Endpoints Available

All major features are implemented:

- ✅ **Auth**: Login, Profile, Change Password
- ✅ **Dashboard**: Stats, Attendance Overview, Fee Overview
- ✅ **Academic**: Classes, Subjects, Exams, Results, Report Card
- ✅ **Attendance**: Mark, View, Reports
- ✅ **Finance**: Fees, Collections, Salary, Reports
- ✅ **ID Cards**: List, Generate, Search, Download PDF
- ✅ **Documents**: Upload, View, Manage
- ✅ **Notices**: View
- ✅ **Users**: List, Permissions
- ✅ **Committee**: View
- ✅ **Parent Portal**: Access
- ✅ **Institution**: Info

## Screens Implemented

### Completed (Ready to Use)
1. **LoginActivity** - Full login with email/password
2. **MainActivity** - Menu with all feature buttons
3. **ProfileActivity** - Show user profile
4. **DashboardActivity** - Display stats

### Available in MainActivity Menu
- All features listed above accessible via buttons
- Real-time data from API
- Error handling and loading states

## Testing the App

### Quick Smoke Test
1. Build and run app
2. See LoginActivity with email/password fields
3. Click "Login" (should fail with no server)
4. Start server: `npm run dev` (in server folder)
5. Try login again - should succeed
6. Should see MainActivity menu with all buttons
7. Click Dashboard - should see stats
8. Click Profile - should see user info

### Common Errors & Solutions

**Error**: "Address already in use"
- Server port 5000 conflict
- Solution: `Stop-Process -Name node -Force` then `npm run dev`

**Error**: "Failed to connect to 10.0.2.2:5000"
- Server not running
- Solution: Start server with `npm run dev`

**Error**: "Login failed"
- Wrong credentials
- Server not responding
- Solution: Check both server is running AND credentials are correct

**Error**: "Gradle sync failed"
- JAVA_HOME not set
- Solution: Set JAVA_HOME environment variable (see Prerequisites)

## Next Steps for Development

To add more screens:

1. **Create Activity/Layout**:
   ```kotlin
   // screens/AcademicActivity.kt
   class AcademicActivity : AppCompatActivity() { ... }
   ```
   ```xml
   <!-- res/layout/activity_academic.xml -->
   <LinearLayout ...> ... </LinearLayout>
   ```

2. **Add to Manifest**:
   ```xml
   <activity android:name=".screens.AcademicActivity" />
   ```

3. **Add Button in MainActivity**:
   ```kotlin
   findViewById<Button>(R.id.buttonAcademic).setOnClickListener {
       val intent = Intent(this, AcademicActivity::class.java)
       startActivity(intent)
   }
   ```

4. **Load Data via Retrofit**:
   ```kotlin
   RetrofitClient.api.getAcademic().enqueue(object : Callback<JsonObject> { ... })
   ```

## Troubleshooting

### Build Issues

- **Dependency resolution failed**: Update Gradle in project settings
- **Kotlin version mismatch**: Check build.gradle.kts has compatible versions
- **Resource not found**: Check all layout files exist and spelling is correct

### Runtime Issues

- **App crashes on login**: Check server is running and credentials are correct
- **Token not persisting**: SessionManager might not be initialized - verify EasyStudyApp in Manifest
- **Network requests failing**: Check emulator network access (use 10.0.2.2 not 127.0.0.1)

### Performance

- App should load login screen instantly
- Login request should complete in <2 seconds
- Dashboard stats should load in <1 second (if server is responsive)

## Architecture Overview

The app follows MVP (Model-View-Presenter) pattern:

- **Model**: User.kt - Kotlin data classes using Gson
- **View**: Activities + Layouts (XML)
- **Presenter**: Retrofit API calls with callbacks
- **Storage**: SessionManager - SharedPreferences persistence
- **Network**: RetrofitClient - Centralized HTTP client

## Session Management

- **Login**: Token saved to SharedPreferences (via SessionManager)
- **Logout**: Token cleared from SharedPreferences
- **Persistence**: Token survives app restart
- **Auth Header**: Token auto-injected in all requests via OkHttp interceptor

## File Upload/Download

Not yet implemented but infrastructure ready:
- MultipartBody.Part ready in build.gradle.kts
- File permissions added to AndroidManifest
- Can be added to ApiService interface when needed

## What's NOT Implemented Yet

- PDF Generation (library added: iText7)
- QR Code Generation (library added: ZXing)
- Charts (library added: MPAndroidChart)
- Offline functionality (Room DB library added)
- Push Notifications

These can be added as needed using the included libraries.

## Support

If you encounter issues:
1. Check logs in Android Studio Logcat
2. Verify server is running: `npm run dev`
3. Check JAVA_HOME is set: `$env:JAVA_HOME`
4. Clear Gradle cache: `.\gradlew.bat clean`
5. Rebuild: `.\gradlew.bat build`
