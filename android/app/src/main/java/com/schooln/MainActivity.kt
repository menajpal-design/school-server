package com.schooln

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalConfiguration
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.compose.ui.unit.dp
import com.schooln.config.Config
import com.schooln.ui.navigation.NavItem
import com.schooln.ui.navigation.ResponsiveNavigation
import com.schooln.ui.navigation.TopNavigationBar
import com.schooln.network.api.ConfigApi
import com.schooln.network.api.EndpointsResponse
import com.schooln.network.createApiService
import com.schooln.ui.screens.*
import com.schooln.ui.theme.SchoolManagementTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SchoolManagementTheme {
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

@Composable
fun SchoolApp(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val navController = rememberNavController()
    var currentRoute by remember { mutableStateOf(NavItem.Dashboard.route) }
    val isCompactScreen = LocalConfiguration.current.screenWidthDp < 600

    LaunchedEffect(Unit) {
        bootstrapServerUrl(context)
    }
    
    ResponsiveNavigation(
        isCompactScreen = isCompactScreen,
        currentRoute = currentRoute,
        onNavigate = { route ->
            currentRoute = route
            navController.navigate(route) {
                popUpTo(NavItem.Dashboard.route) { saveState = true }
                launchSingleTop = true
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
                    onMenuClick = { /* handled by responsive nav container */ },
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
 * Fetch the latest server URL from the public config endpoint and persist it.
 * This lets the app follow the deployed server automatically instead of relying on localhost.
 */
private suspend fun bootstrapServerUrl(context: android.content.Context) {
    runCatching {
        val configApi = createApiService<ConfigApi>(context)
        val response = configApi.getEndpoints()

        if (response.isSuccessful) {
            val endpoints = response.body()?.data
            val serverUrl = endpoints?.serverUrl?.trim().orEmpty()

            if (serverUrl.isNotBlank()) {
                Config.setServerUrl(context, serverUrl)
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
