# Android UI Navigation & Sidebar Setup

## Overview

এই ডকুমেন্টে Android app-এর sidebar (drawer) এবং bottom navigation সিস্টেম আছে।

**Features:**
- ✅ Bottom Navigation Bar (phones < 600dp)
- ✅ Navigation Drawer/Sidebar (tablets ≥ 600dp)  
- ✅ Responsive design - screen size অনুযায়ী automatic switch
- ✅ Bengali UI text
- ✅ Multiple screens (Dashboard, Attendance, Messages, Profile, etc.)

---

## File Structure

```
android/app/src/main/java/com/schooln/
├── config/
│   └── Config.kt                 # Server URLs & API endpoints
├── network/
│   ├── HttpClient.kt             # Retrofit + JWT auth
│   └── api/ApiServices.kt        # API interfaces
├── ui/
│   ├── theme/
│   │   ├── Theme.kt              # Theme configuration
│   │   ├── Color.kt              # Color scheme (light/dark)
│   │   └── Type.kt               # Typography settings
│   ├── navigation/
│   │   └── Navigation.kt          # Bottom nav + Drawer components
│   └── screens/
│       └── Screens.kt            # Dashboard, Attendance, Messages, Profile screens
└── MainActivity.kt               # Main app entry point
```

---

## Component Breakdown

### 1. Navigation Structure (`Navigation.kt`)

#### **NavItem** - Navigation menu items
```kotlin
sealed class NavItem(route: String, title: String, icon: ImageVector) {
    object Dashboard : NavItem("dashboard", "ড্যাশবোর্ড", Icons.Filled.Dashboard)
    object Attendance : NavItem("attendance", "উপস্থিতি", Icons.Filled.CheckCircle)
    object Messages : NavItem("messages", "বার্তা", Icons.Filled.Mail)
    object Profile : NavItem("profile", "প্রোফাইল", Icons.Filled.Person)
    // ... more items
}
```

#### **BottomNavigationBar** - Shows on phones (< 600dp)
```kotlin
@Composable
fun BottomNavigationBar(
    currentRoute: String,
    onNavigate: (String) -> Unit
)
```

#### **NavigationDrawer** - Sidebar showing on tablets (600dp+)
```kotlin
@Composable
fun NavigationDrawer(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    userName: String = "ব্যবহারকারী",
    userRole: String = "শিক্ষার্থী"
)
```

#### **ResponsiveNavigation** - Automatically switches between drawer and bottom nav
```kotlin
@Composable
fun ResponsiveNavigation(
    windowWidthSizeClass: WindowWidthSizeClass,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    content: @Composable (Modifier) -> Unit
)
```

---

### 2. Screens (`Screens.kt`)

#### **DashboardScreen**
- Welcome card with user name
- Quick stats (Attendance, Marks, Fee Status)
- Important notices
- Bengali text support

#### **AttendanceScreen**
- Attendance statistics (Total, Present, Absent)
- Daily attendance list
- Status indicators (green for present, red for absent)

#### **MessagesScreen**
- Message list with sender name
- Subject preview
- Unread indicator
- Timestamp

#### **ProfileScreen**
- User profile information
- Personal details (email, phone, DOB)
- School information (class, section, academic year)

#### **Placeholder Screens**
- Academic
- Notices
- Finance
- Documents
- Settings

---

### 3. Theme (`Theme.kt`, `Color.kt`, `Type.kt`)

#### **Light Color Scheme**
- Primary: Blue (#0066CC)
- Secondary: Cyan (#00BCD4)
- Tertiary: Green (#4CAF50)
- Error: Red (#B3261E)

#### **Dark Color Scheme**
- Automatic color inversion
- Dark background with light text
- High contrast for accessibility

#### **Typography**
- Body text sizes: 12sp, 14sp, 16sp
- Headline sizes: 22sp, 28sp, 32sp
- Bold titles for section headers
- Custom letter spacing

---

### 4. Main App (`MainActivity.kt`)

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SchoolManagementTheme {
                SchoolApp()
            }
        }
    }
}

@Composable
fun SchoolApp() {
    // Navigation controller
    val navController = rememberNavController()
    
    // Current screen tracking
    var currentRoute by remember { mutableStateOf(NavItem.Dashboard.route) }
    
    // Window size class for responsive design
    val windowSizeClass = calculateWindowSizeClass(...)
    
    // Navigation structure
    ResponsiveNavigation(
        windowWidthSizeClass = windowSizeClass.widthSizeClass,
        currentRoute = currentRoute,
        onNavigate = { route -> /* navigate */ },
        content = { /* screen content */ }
    )
}
```

---

## Usage

### Navigating Between Screens

```kotlin
// In any composable screen
val navController = rememberNavController()

Button(onClick = {
    navController.navigate(NavItem.Messages.route)
}) {
    Text("Go to Messages")
}
```

### Responsive Design

**Phone (< 600dp):**
```
┌─────────────────┐
│     Header      │
│ (Top App Bar)   │
├─────────────────┤
│                 │
│   Screen        │
│   Content       │
│                 │
├─────────────────┤
│ Bottom Nav Bar  │  ← 5 main items
└─────────────────┘
```

**Tablet (≥ 600dp):**
```
┌─────────────────────────────┐
│ Sidebar │   Screen Content  │
│         │                   │
│ ═══════ │                   │
│ • Dash. │   Dashboard       │
│ • Att.  │   or              │
│ • Msg.  │   Other Screen    │
│ • Prof. │                   │
│ • Set.  │                   │
│         │                   │
│ • Logout│                   │
└─────────────────────────────┘
```

---

## Customization

### Change Colors

Edit `android/app/src/main/java/com/schooln/ui/theme/Color.kt`:

```kotlin
val md_theme_light_primary = Color(0xFF0066CC)  // Change to your color
```

### Change Typography

Edit `android/app/src/main/java/com/schooln/ui/theme/Type.kt`:

```kotlin
bodyMedium = TextStyle(
    fontSize = 14.sp,  // Change size
    fontWeight = FontWeight.Bold,  // Change weight
    fontFamily = FontFamily.Default  // Change font
)
```

### Add New Screen

1. Create composable in `Screens.kt`:
```kotlin
@Composable
fun NewScreen() {
    Column {
        // Your UI
    }
}
```

2. Add NavItem:
```kotlin
object NewItem : NavItem("new", "নতুন", Icons.Filled.SomeIcon)
```

3. Add to NavHost in `MainActivity.kt`:
```kotlin
composable(NavItem.NewItem.route) {
    NewScreen()
}
```

---

## Features Implemented

### ✅ Navigation System
- Bottom navigation bar (phones)
- Navigation drawer/sidebar (tablets)
- Auto-responsive switching

### ✅ Screens
- Dashboard with stats and notices
- Attendance tracking
- Messages/inbox
- User profile
- Placeholder screens for future development

### ✅ Theme
- Material Design 3
- Light and dark color schemes
- Responsive typography
- Bengali text support

### ✅ UI Components
- Cards
- Icons
- Buttons
- Text fields
- Lists
- Sections

### ✅ User Experience
- User profile display in sidebar
- Unread message indicator
- Attendance status visualization
- Date/time information
- Bengali language support

---

## Building & Running

### In Android Studio

```bash
# Build APK
Build → Build Bundle/APK → Build APK(s)

# Run on emulator/device
Run → Run 'app'
```

### From Command Line

```bash
# Build debug APK
./gradlew assembleDebug

# Run on connected device
./gradlew installDebug

# Build release APK
./gradlew assembleRelease
```

---

## Next Steps

1. ✅ Basic navigation setup
2. ✅ Theme and colors
3. ✅ Screen layouts
4. [ ] Connect to actual API (use network/api services)
5. [ ] Implement authentication
6. [ ] Add data loading from server
7. [ ] Handle user interactions
8. [ ] Error handling
9. [ ] Loading states
10. [ ] Testing

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot resolve symbol 'Navigation'" | Check imports in build.gradle.kts - add navigation-compose dependency |
| "NavHost" not working | Ensure navController is passed correctly |
| Bottom nav not showing | Check if screen size is < 600dp (compact) |
| Sidebar not visible | Check if screen size is ≥ 600dp (medium/expanded) |
| Crashes on navigation | Verify NavItem routes match composable() route names |

---

## Dependencies Required

Make sure these are in `build.gradle.kts`:

```kotlin
// Navigation
implementation("androidx.navigation:navigation-compose:2.7.4")

// Window Size
implementation("androidx.compose.material3:material3-window-size-class:1.1.0")

// Material Icons
implementation("androidx.compose.material:material-icons-extended:1.5.3")
```

---

## Resources

- [Jetpack Compose Navigation](https://developer.android.com/jetpack/compose/navigation)
- [Material Design 3 for Compose](https://developer.android.com/jetpack/androidx/releases/compose-material3)
- [Responsive Design in Compose](https://developer.android.com/develop/ui/compose/responsive-layouts)

---

*Last Updated: May 12, 2026*
*Android Native Development with Kotlin & Jetpack Compose*
