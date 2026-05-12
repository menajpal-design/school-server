package com.schooln

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavHost
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.schooln.ui.navigation.NavItem
import com.schooln.ui.navigation.ResponsiveNavigation
import com.schooln.ui.navigation.TopNavigationBar
import com.schooln.ui.screens.*
import com.schooln.ui.theme.SchoolManagementTheme

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SchoolManagementTheme {
                // A surface container using the 'background' color from the theme
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    SchoolApp()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun SchoolApp(
    modifier: Modifier = Modifier
) {
    val navController = rememberNavController()
    var currentRoute by remember { mutableStateOf(NavItem.Dashboard.route) }
    var isDrawerOpen by remember { mutableStateOf(false) }
    
    val windowSizeClass = calculateWindowSizeClass(this as ComponentActivity)
    val isCompactScreen = windowSizeClass.widthSizeClass == WindowWidthSizeClass.Compact
    
    ResponsiveNavigation(
        windowWidthSizeClass = windowSizeClass.widthSizeClass,
        currentRoute = currentRoute,
        onNavigate = { route ->
            currentRoute = route
            navController.navigate(route) {
                popUpTo(NavItem.Dashboard.route) { saveState = true }
                lazyRestoreState = true
                restoreState = true
            }
        },
        userName = "করিম হোসেন",
        userRole = "শিক্ষার্থী"
    ) { contentModifier ->
        Column(modifier = contentModifier.fillMaxSize()) {
            if (isCompactScreen) {
                // Top bar only on compact screens
                TopNavigationBar(
                    title = getScreenTitle(currentRoute),
                    onMenuClick = { isDrawerOpen = !isDrawerOpen },
                    showMenuIcon = false
                )
            }
            
            // Navigation content
            NavHost(
                navController = navController,
                startDestination = NavItem.Dashboard.route,
                modifier = Modifier.weight(1f)
            ) {
                composable(NavItem.Dashboard.route) {
                    DashboardScreen()
                }
                composable(NavItem.Attendance.route) {
                    AttendanceScreen()
                }
                composable(NavItem.Academic.route) {
                    AcademicScreen()
                }
                composable(NavItem.Messages.route) {
                    MessagesScreen()
                }
                composable(NavItem.Notices.route) {
                    NoticesScreen()
                }
                composable(NavItem.Finance.route) {
                    FinanceScreen()
                }
                composable(NavItem.Documents.route) {
                    DocumentsScreen()
                }
                composable(NavItem.Profile.route) {
                    ProfileScreen()
                }
                composable(NavItem.Settings.route) {
                    SettingsScreen()
                }
            }
        }
    }
}

/**
 * Get screen title based on current route
 */
private fun getScreenTitle(route: String): String {
    return when (route) {
        NavItem.Dashboard.route -> NavItem.Dashboard.title
        NavItem.Attendance.route -> NavItem.Attendance.title
        NavItem.Academic.route -> NavItem.Academic.title
        NavItem.Messages.route -> NavItem.Messages.title
        NavItem.Notices.route -> NavItem.Notices.title
        NavItem.Finance.route -> NavItem.Finance.title
        NavItem.Documents.route -> NavItem.Documents.title
        NavItem.Profile.route -> NavItem.Profile.title
        NavItem.Settings.route -> NavItem.Settings.title
        else -> "স্কুল ম্যানেজমেন্ট"
    }
}

/**
 * Placeholder screens for other sections
 */
@Composable
fun AcademicScreen() {
    // TODO: Implement Academic screen
    PlaceholderScreen("শিক্ষাগত")
}

@Composable
fun NoticesScreen() {
    // TODO: Implement Notices screen
    PlaceholderScreen("বিজ্ঞপ্তি")
}

@Composable
fun FinanceScreen() {
    // TODO: Implement Finance screen
    PlaceholderScreen("অর্থনীতি")
}

@Composable
fun DocumentsScreen() {
    // TODO: Implement Documents screen
    PlaceholderScreen("নথি")
}

@Composable
fun SettingsScreen() {
    // TODO: Implement Settings screen
    PlaceholderScreen("সেটিংস")
}

@Composable
fun PlaceholderScreen(title: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "শীঘ্রই আসছে",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
