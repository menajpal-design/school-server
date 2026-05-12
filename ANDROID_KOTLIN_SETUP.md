# Android Native (Kotlin) Setup Guide

## Overview

This guide explains how to set up native Android development using **Kotlin** with the School Management System API.

**Important**: React Native has been replaced with native Kotlin for better performance and control.

---

## Prerequisites

1. **Android Studio** (latest version) - [Download](https://developer.android.com/studio)
2. **JDK 11 or higher**
3. **Kotlin** (included with Android Studio)
4. **Android SDK API 24+**

---

## Project Structure

```
android/
├── app/src/main/java/com/schooln/
│   ├── config/
│   │   └── Config.kt              # App configuration (server URLs, API endpoints)
│   ├── network/
│   │   ├── HttpClient.kt          # Retrofit + OkHttp setup with JWT auth
│   │   └── api/
│   │       └── ApiServices.kt     # API service interfaces & data classes
│   ├── ui/
│   │   ├── screens/               # Screen composables/activities
│   │   ├── components/            # Reusable UI components
│   │   └── navigation/            # Navigation setup
│   ├── viewmodels/
│   │   └── *ViewModel.kt          # ViewModel classes
│   ├── repository/
│   │   └── *Repository.kt         # Repository pattern for data
│   └── MainActivity.kt            # Main entry point
├── build.gradle.kts               # App-level build configuration
└── AndroidManifest.xml            # Android manifest
```

---

## 1. Project Setup

### Clone or Create Android Project

```bash
# If creating new project:
# File → New → New Android Project → Select "Empty Activity" template

# Or navigate to existing android folder
cd android
```

### Update build.gradle.kts (App level)

Add these dependencies to `android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.schooln"
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.schooln"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        
        vectorDrawables {
            useSupportLibrary = true
        }
    }
    
    buildTypes {
        debug {
            buildConfigField("String", "SERVER_URL", "\"http://localhost:5000\"")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "SERVER_URL", "\"https://school-server-b264c1a1fac6.herokuapp.com\"")
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    
    kotlinOptions {
        jvmTarget = "11"
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.3"
    }
}

dependencies {
    // Androidx
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    implementation("androidx.activity:activity-compose:1.8.0")
    
    // Compose
    implementation(platform("androidx.compose:compose-bom:2023.10.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-livedata")
    
    // Retrofit + OkHttp
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")
    
    // Kotlin Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    
    // ViewModel
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2")
    
    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.4")
    
    // Data Store (for SharedPreferences alternative)
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    
    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
```

---

## 2. Configuration Setup

### Config.kt

The `Config.kt` file contains all configuration:

```kotlin
// Use from code:
val apiUrl = Config.API_BASE_URL
val serverUrl = Config.SERVER_URL
```

### Changing Server URL

For **development**, edit `Config.kt`:

```kotlin
object Config {
    const val SERVER_URL = "http://10.0.2.2:5000"  // Local emulator
    // OR
    const val SERVER_URL = "http://192.168.1.100:5000"  // Local network
    // OR
    const val SERVER_URL = "https://school-server-b264c1a1fac6.herokuapp.com"  // Production
}
```

For **production via BuildConfig**, it's already set in `build.gradle.kts`.

---

## 3. Network Setup

### HttpClient.kt Features

- ✅ JWT Bearer token authentication
- ✅ Automatic request/response logging (debug mode)
- ✅ 30-second timeout
- ✅ GSON serialization

### Usage in Code

```kotlin
// In your Activity or Fragment
val context = this

// Create API service
val authApi = createApiService<AuthApi>(context)

// Make API call
lifecycleScope.launch {
    try {
        val response = authApi.login(LoginRequest(
            email = "user@example.com",
            password = "password123"
        ))
        
        if (response.isSuccessful) {
            val loginData = response.body()?.data
            // Save token
            saveToken(context, loginData?.token ?: "")
        }
    } catch (e: Exception) {
        Log.e("AuthApi", "Login failed", e)
    }
}
```

---

## 4. Building UI with Jetpack Compose

### Example Login Screen

```kotlin
// com/schooln/ui/screens/LoginScreen.kt
package com.schooln.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.schooln.viewmodels.AuthViewModel

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    viewModel: AuthViewModel = viewModel()
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center
    ) {
        TextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
        )
        
        TextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
        )
        
        if (errorMessage.isNotEmpty()) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
        
        Button(
            onClick = {
                isLoading = true
                // Call login
                viewModel.login(email, password) { success ->
                    isLoading = false
                    if (success) {
                        onLoginSuccess()
                    } else {
                        errorMessage = "Login failed"
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            enabled = !isLoading
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else {
                Text("Login")
            }
        }
    }
}
```

---

## 5. ViewModel Pattern

### Example AuthViewModel

```kotlin
// com/schooln/viewmodels/AuthViewModel.kt
package com.schooln.viewmodels

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.schooln.network.api.AuthApi
import com.schooln.network.api.LoginRequest
import com.schooln.network.createApiService
import kotlinx.coroutines.launch
import android.util.Log

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val authApi = createApiService<AuthApi>(application)
    
    fun login(email: String, password: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val response = authApi.login(LoginRequest(email, password))
                if (response.isSuccessful) {
                    val token = response.body()?.data?.token
                    if (token != null) {
                        saveToken(token)
                        onResult(true)
                    }
                } else {
                    onResult(false)
                }
            } catch (e: Exception) {
                Log.e("AuthViewModel", "Login error", e)
                onResult(false)
            }
        }
    }
    
    private fun saveToken(token: String) {
        // Save to SharedPreferences or DataStore
        val prefs = getApplication<Application>()
            .getSharedPreferences("school_app_prefs", 0)
        prefs.edit().putString("auth_token", token).apply()
    }
}
```

---

## 6. Running the App

### On Emulator

```bash
# Open Android Studio
# File → Open → Select android folder
# Run → Run 'app'
```

### On Physical Device

```bash
# Connect device via USB
# Enable USB Debugging on device
# Run → Run 'app'
```

### Change Server URL for Local Development

For **emulator** (localhost):
```kotlin
const val SERVER_URL = "http://10.0.2.2:5000"  // Special emulator DNS
```

For **physical device** (local network):
```kotlin
const val SERVER_URL = "http://192.168.1.100:5000"  // Replace with your PC IP
```

For **production**:
```kotlin
const val SERVER_URL = "https://school-server-b264c1a1fac6.herokuapp.com"
```

---

## 7. Mobile-Responsive Design

### Screen Size Adaptation (Jetpack Compose)

```kotlin
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass

@Composable
fun ResponsiveLayout() {
    val windowSizeClass = calculateWindowSizeClass(this as Activity)
    
    when (windowSizeClass.widthSizeClass) {
        WindowWidthSizeClass.Compact -> CompactView()      // Phone (< 600dp)
        WindowWidthSizeClass.Medium -> MediumView()        // Tablet (600-840dp)
        WindowWidthSizeClass.Expanded -> ExpandedView()    // Large tablet (> 840dp)
    }
}
```

---

## 8. Testing

### Unit Test Example

```kotlin
// app/src/test/java/com/schooln/network/HttpClientTest.kt
import org.junit.Test
import org.junit.Assert.*

class HttpClientTest {
    @Test
    fun testConfigValidation() {
        assertTrue(Config.validate())
        assertTrue(Config.API_BASE_URL.isNotEmpty())
    }
}
```

---

## 9. Debugging

### Enable Logging

In `Config.kt`:
```kotlin
const val DEBUG = true  // Enable HTTP logging
```

### Check Logcat

```bash
# In Android Studio
View → Tool Windows → Logcat
# Search for "schooln" or "ApiError"
```

---

## 10. Building Release APK

```bash
# In Android Studio
Build → Generate Signed Bundle/APK
# Select APK
# Create/select keystore
# Follow wizard
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Check SERVER_URL, ensure server is running, check emulator/device network |
| 401 Unauthorized | Token not saved/expired - re-login |
| 403 Forbidden | Insufficient permissions - check user role |
| CORS error | Add app URL to ALLOWED_ORIGINS on server |
| HTTPS certificate error | Use valid certificate or disable SSL verification (dev only) |

---

## Next Steps

1. ✅ Set up Android project structure
2. ✅ Add Config.kt and network files
3. ✅ Create login screen with Compose
4. ✅ Implement other screens (dashboard, messages, etc.)
5. ✅ Add unit & integration tests
6. ✅ Build and release APK

---

## Resources

- [Kotlin Documentation](https://kotlinlang.org/docs/home.html)
- [Jetpack Compose Docs](https://developer.android.com/jetpack/compose/documentation)
- [Retrofit Documentation](https://square.github.io/retrofit/)
- [Android Architecture Components](https://developer.android.com/guide/components)
