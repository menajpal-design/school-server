# EasyStudy Mobile App - Android

## Overview

EasyStudy Mobile App is a native **Android application** built with **Kotlin** that provides full access to the school management system on your mobile device.

## Download

**[📥 Download APK](./app-debug.apk)** (7.3 MB)

Or visit the **[Downloads Page](/downloads)** for installation instructions.

## Features

### 🔐 Authentication
- Email/Password login
- Session token persistence
- Secure logout
- Remember me functionality

### 📊 Dashboard
- Summary statistics cards
- Financial overview with charts
- Attendance trends
- Recent notices

### 🎓 Academic Module
- Classes overview
- Subject listing
- Exam schedules
- Result management
- Report card generation

### 📅 Attendance
- Mark attendance
- View attendance reports
- Personal attendance record
- Attendance statistics

### 💰 Finance
- Manage student fees
- Track collections
- Salary management
- Generate financial reports
- View personal fees

### 🆔 ID Cards
- Generate digital ID cards
- ID card templates
- View generation reports
- Manage card renewal

### 📄 Documents
- Upload documents
- Manage uploaded files
- Share documents

### 📢 Additional Features
- Notices and announcements
- Committee information
- Users and roles management
- Parent portal
- User profile management
- Settings screen
- Navigation drawer sidebar

## System Requirements

- **Android Version:** 6.0 (API 24) or higher
- **Target Version:** Android 13+ (API 36+)
- **Storage:** At least 50MB free space
- **Internet:** Required for initial login and data sync
- **RAM:** Minimum 512MB recommended

## Installation

### Option 1: Direct APK Installation

1. Download the APK file from [Downloads Page](/downloads)
2. Enable "Unknown Sources" in your device settings:
   - Settings → Security → Unknown Sources → Enable
3. Open the downloaded APK file
4. Tap "Install"
5. Launch the app once installed

### Option 2: Via ADB (Android Debug Bridge)

```bash
adb install app-debug.apk
```

### Option 3: Android Studio

1. Open the project in Android Studio
2. Build → Build Bundle(s)/APK(s) → Build APK(s)
3. Wait for build completion
4. Run → Run 'app'

## Login

Use your school credentials:

**Test Account:**
- Email: `head@school.com`
- Password: `password123`

## Architecture

### Tech Stack
- **Language:** Kotlin
- **Platform:** Android (Native)
- **Networking:** Retrofit 2.9.0 + OkHttp
- **UI:** Android Material Design 3
- **Database:** SharedPreferences (Session)
- **Charts:** MPAndroidChart
- **Navigation:** Navigation Drawer + Activities

### Key Components

1. **MainActivity** - Navigation drawer and session management
2. **LoginActivity** - Authentication
3. **DashboardActivity** - Summary and charts
4. **FeatureActivities** - Individual feature modules
5. **DetailActivities** - Reusable detail screens
6. **SessionManager** - Token and user data persistence
7. **RetrofitClient** - API communication with auth interceptor
8. **ApiService** - 40+ endpoints defined

### API Integration

All API calls use:
- **Base URL:** `http://10.0.2.2:5000/` (Emulator) or dynamic URL
- **Authentication:** JWT Bearer token in headers
- **Serialization:** Gson for JSON parsing
- **Error Handling:** Proper HTTP error codes

## Features Implemented

✅ Core Authentication & Session Management
✅ Dashboard with Multi-Chart Visualization
✅ Academic Module (Classes, Subjects, Exams, Results, Report Cards)
✅ Attendance Module (Mark, Reports, Personal Record)
✅ Finance Module (Fees, Collections, Salary, Reports, Personal Fees)
✅ ID Cards Module (Generate, Templates, Reports, Renewal)
✅ Documents Module (Upload, Manage)
✅ Notices Module
✅ Committee Module
✅ Users & Roles Module
✅ Parent Portal Module
✅ User Profile & Settings
✅ Navigation Drawer Sidebar
✅ Offline Session Persistence
✅ Error Handling & User Feedback

## File Structure

```
android/
├── app/src/main/
│   ├── java/com/hridoy/easystudy/
│   │   ├── MainActivity.kt (Drawer + Navigation)
│   │   ├── screens/ (18 Activities)
│   │   ├── network/ (Retrofit, Auth)
│   │   ├── storage/ (SessionManager)
│   │   ├── adapter/ (RecyclerView adapters)
│   │   ├── model/ (Data classes)
│   │   └── utils/
│   ├── res/
│   │   ├── layout/ (20+ XML layouts)
│   │   ├── menu/ (Navigation drawer menu)
│   │   └── values/ (Strings, colors, styles)
│   └── AndroidManifest.xml
├── build.gradle.kts (Dependencies)
└── local.properties (SDK config)
```

## Troubleshooting

### App Won't Install
- Check Android version (minimum 6.0)
- Enable "Unknown Sources" in settings
- Ensure 50MB+ free storage

### Can't Login
- Verify email format
- Check password (case-sensitive)
- Ensure internet connection
- Verify server is running on port 5000

### Slow Performance
- Check internet connection
- Close other apps
- Clear app cache (Settings → Apps → EasyStudy → Storage → Clear Cache)
- Ensure device has 512MB+ RAM free

### Can't Connect to Server
- Verify server is running
- Check if running on emulator (use 10.0.2.2:5000)
- For physical device, use actual IP or domain
- Check firewall settings

## Building from Source

### Prerequisites
- Android Studio (latest)
- Java 17+ JDK
- Android SDK (API 36+)
- Gradle 8.0+

### Build Steps

```bash
cd android
./gradlew assembleDebug    # Debug APK
./gradlew assembleRelease  # Release APK (requires signing key)
```

### Build Output
- Debug: `app/build/outputs/apk/debug/app-debug.apk`
- Release: `app/build/outputs/apk/release/app-release.apk`

## Release Notes

### Version 1.0 (Current)
- ✅ Initial release
- ✅ All 16 feature modules
- ✅ Native Kotlin implementation
- ✅ Navigation drawer UI
- ✅ Full API integration
- ✅ Session persistence
- ✅ Multi-chart dashboard
- ✅ Offline login support

## Support & Documentation

- **API Docs:** See [Server README](../server/README.md)
- **Web Client:** See [Client README](../client/README.md)
- **Installation:** Visit [Downloads](/downloads)

## License

This project is part of the EasyStudy DRMS (Distributed Record Management System).

---

**Version:** 1.0 | **Built:** 2026 | **Platform:** Android 6.0+
