package com.schooln.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

/**
 * Navigation Items for the app
 */
sealed class NavItem(
    val route: String,
    val title: String,
    val icon: ImageVector
) {
    object Dashboard : NavItem("dashboard", "ড্যাশবোর্ড", Icons.Filled.Dashboard)
    object Attendance : NavItem("attendance", "উপস্থিতি", Icons.Filled.CheckCircle)
    object Academic : NavItem("academic", "শিক্ষাগত", Icons.Filled.School)
    object Messages : NavItem("messages", "বার্তা", Icons.Filled.Mail)
    object Notices : NavItem("notices", "বিজ্ঞপ্তি", Icons.Filled.Notifications)
    object Finance : NavItem("finance", "অর্থনীতি", Icons.Filled.MonetizationOn)
    object Documents : NavItem("documents", "নথি", Icons.Filled.Description)
    object Profile : NavItem("profile", "প্রোফাইল", Icons.Filled.Person)
    object Settings : NavItem("settings", "সেটিংস", Icons.Filled.Settings)
    
    companion object {
        val items = listOf(
            Dashboard,
            Attendance,
            Academic,
            Messages,
            Notices,
            Finance,
            Documents,
            Profile,
            Settings
        )
    }
}

/**
 * Bottom Navigation Bar Component (for phones)
 */
@Composable
fun BottomNavigationBar(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface
    ) {
        // Main navigation items (show first 5)
        val mainItems = listOf(
            NavItem.Dashboard,
            NavItem.Attendance,
            NavItem.Academic,
            NavItem.Messages,
            NavItem.Notices
        )
        
        mainItems.forEach { item ->
            NavigationBarItem(
                icon = { Icon(item.icon, contentDescription = item.title) },
                label = { Text(item.title, maxLines = 1) },
                selected = currentRoute == item.route,
                onClick = { onNavigate(item.route) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            )
        }
    }
}

/**
 * Navigation Drawer (Sidebar) Component (for tablets)
 */
@Composable
fun NavigationDrawer(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    userName: String = "ব্যবহারকারী",
    userRole: String = "শিক্ষার্থী",
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(280.dp)
            .background(MaterialTheme.colorScheme.surface)
            .verticalScroll(rememberScrollState())
    ) {
        // Header
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            color = MaterialTheme.colorScheme.primaryContainer,
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = "Profile",
                    modifier = Modifier
                        .size(56.dp)
                        .background(
                            MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .padding(8.dp),
                    tint = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = userName,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Text(
                    text = userRole,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
        
        Divider(modifier = Modifier.padding(vertical = 8.dp))
        
        // Navigation Items
        NavItem.items.forEach { item ->
            NavigationDrawerItem(
                label = { Text(item.title) },
                icon = { Icon(item.icon, contentDescription = item.title) },
                selected = currentRoute == item.route,
                onClick = { onNavigate(item.route) },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                colors = NavigationDrawerItemDefaults.colors(
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Logout Button
        Divider(modifier = Modifier.padding(vertical = 8.dp))
        NavigationDrawerItem(
            label = { Text("লগআউট", color = Color.Red) },
            icon = { Icon(Icons.Filled.Logout, contentDescription = "Logout", tint = Color.Red) },
            selected = false,
            onClick = { /* TODO: Handle logout */ },
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            colors = NavigationDrawerItemDefaults.colors(
                unselectedIconColor = Color.Red,
                unselectedTextColor = Color.Red
            )
        )
    }
}

/**
 * Top Navigation Bar (Header)
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun TopNavigationBar(
    title: String,
    onMenuClick: () -> Unit = {},
    onSearchClick: () -> Unit = {},
    showMenuIcon: Boolean = true,
    modifier: Modifier = Modifier
) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = {
            if (showMenuIcon) {
                IconButton(onClick = onMenuClick) {
                    Icon(Icons.Filled.Menu, contentDescription = "Menu")
                }
            }
        },
        actions = {
            IconButton(onClick = onSearchClick) {
                Icon(Icons.Filled.Search, contentDescription = "Search")
            }
            IconButton(onClick = { /* TODO: Handle notifications */ }) {
                Icon(Icons.Filled.Notifications, contentDescription = "Notifications")
            }
        },
        modifier = modifier,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.primary,
            titleContentColor = MaterialTheme.colorScheme.onPrimary,
            navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
            actionIconContentColor = MaterialTheme.colorScheme.onPrimary
        )
    )
}

/**
 * Responsive Navigation Container
 * Shows drawer on large screens (tablets), bottom navigation on small screens (phones)
 */
@Composable
fun ResponsiveNavigation(
    isCompactScreen: Boolean,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    userName: String = "ব্যবহারকারী",
    userRole: String = "শিক্ষার্থী",
    content: @Composable (Modifier) -> Unit
) {
    if (isCompactScreen) {
        // Phone: Bottom Navigation
        Column(modifier = Modifier.fillMaxSize()) {
            content(Modifier.weight(1f))
            BottomNavigationBar(
                currentRoute = currentRoute,
                onNavigate = onNavigate
            )
        }
    } else {
        // Tablet: Side Drawer
        Row(modifier = Modifier.fillMaxSize()) {
            NavigationDrawer(
                currentRoute = currentRoute,
                onNavigate = onNavigate,
                userName = userName,
                userRole = userRole
            )
            content(Modifier.weight(1f))
        }
    }
}
