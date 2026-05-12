package com.schooln.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Dashboard Screen - Main home screen
 */
@Composable
fun DashboardScreen(
    modifier: Modifier = Modifier,
    userName: String = "করিম হোসেন",
    userRole: String = "শিক্ষার্থী"
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            // Welcome Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "স্বাগতম, $userName!",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Text(
                        text = "$userRole",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
        
        item {
            Text(
                text = "আজকের তথ্য",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        }
        
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Attendance Card
                StatCard(
                    title = "উপস্থিতি",
                    value = "95%",
                    icon = Icons.Filled.CheckCircle,
                    color = Color(0xFF4CAF50)
                )
                
                // Marks Card
                StatCard(
                    title = "রেজাল্ট",
                    value = "৮.৫/১০",
                    icon = Icons.Filled.School,
                    color = Color(0xFF2196F3)
                )
                
                // Fee Status Card
                StatCard(
                    title = "বেতন",
                    value = "জমা",
                    icon = Icons.Filled.MonetizationOn,
                    color = Color(0xFFFF9800)
                )
            }
        }
        
        item {
            Text(
                text = "গুরুত্বপূর্ণ নোটিস",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        }
        
        item {
            NoticeCard(
                title = "বার্ষিক পরীক্ষা শিডিউল",
                date = "১৫ জুন, ২০২৬",
                description = "বার্ষিক পরীক্ষা শুরু হবে ১৫ জুন থেকে।"
            )
        }
        
        item {
            NoticeCard(
                title = "গ্রীষ্মকালীন ছুটি ঘোষণা",
                date = "১ জুলাই, ২০২৬",
                description = "গ্রীষ্মকালীন ছুটি থাকবে ১ জুলাই থেকে ৩১ আগস্ট পর্যন্ত।"
            )
        }
    }
}

/**
 * Statistics Card Component
 */
@Composable
fun StatCard(
    title: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color
) {
    Card(
        modifier = Modifier
            .width(140.dp)
            .background(MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = title,
                modifier = Modifier.size(40.dp),
                tint = color
            )
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color
            )
        }
    }
}

/**
 * Notice Card Component
 */
@Composable
fun NoticeCard(
    title: String,
    date: String,
    description: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    imageVector = Icons.Filled.Notifications,
                    contentDescription = "Notice",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = date,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Attendance Screen
 */
@Composable
fun AttendanceScreen(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "উপস্থিতি তথ্য",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }
        
        item {
            AttendanceStats()
        }
        
        item {
            Text(
                text = "মে ২০২৬",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }
        
        items(10) { index ->
            AttendanceListItem(
                date = "${index + 1} মে",
                status = if (index % 2 == 0) "উপস্থিত" else "অনুপস্থিত",
                isPresent = index % 2 == 0
            )
        }
    }
}

@Composable
fun AttendanceStats() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        AttendanceStatItem("মোট দিন", "22", Color(0xFF2196F3))
        AttendanceStatItem("উপস্থিত", "21", Color(0xFF4CAF50))
        AttendanceStatItem("অনুপস্থিত", "1", Color(0xFFF44336))
    }
}

@Composable
fun AttendanceStatItem(label: String, value: String, color: Color) {
    Card(
        modifier = Modifier
            .width(120.dp)
            .background(MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(label, style = MaterialTheme.typography.bodySmall)
            Text(
                value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = color
            )
        }
    }
}

@Composable
fun AttendanceListItem(date: String, status: String, isPresent: Boolean) {
    Card {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(date, style = MaterialTheme.typography.titleSmall)
                Text(
                    status,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isPresent) Color(0xFF4CAF50) else Color(0xFFF44336)
                )
            }
            Icon(
                imageVector = if (isPresent) Icons.Filled.CheckCircle else Icons.Filled.Cancel,
                contentDescription = status,
                tint = if (isPresent) Color(0xFF4CAF50) else Color(0xFFF44336),
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

/**
 * Messages Screen
 */
@Composable
fun MessagesScreen(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "বার্তা",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }
        
        items(5) { index ->
            MessageListItem(
                senderName = "মিসেস রহিমা (শিক্ষক)",
                subject = "পরীক্ষার ফলাফল ঘোষণা",
                preview = "আপনার গণিত পরীক্ষার ফলাফল ৯০/১০০",
                isRead = index > 2,
                time = "${(index + 1) * 2} ঘন্টা আগে"
            )
        }
    }
}

@Composable
fun MessageListItem(
    senderName: String,
    subject: String,
    preview: String,
    isRead: Boolean,
    time: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .background(
                if (!isRead) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surface
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.Mail,
                contentDescription = "Message",
                modifier = Modifier.size(40.dp),
                tint = if (!isRead) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        senderName,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (!isRead) FontWeight.Bold else FontWeight.Normal
                    )
                    Text(
                        time,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(subject, style = MaterialTheme.typography.titleSmall)
                Text(
                    preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
    }
}

/**
 * Profile Screen
 */
@Composable
fun ProfileScreen(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(12.dp)
                    )
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = "Profile",
                    modifier = Modifier
                        .size(80.dp)
                        .background(
                            MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(40.dp)
                        )
                        .padding(16.dp),
                    tint = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "করিম হোসেন",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Text(
                    "রোল: ২৪",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
        
        item {
            ProfileInfoSection(
                label = "ব্যক্তিগত তথ্য",
                items = listOf(
                    Pair("ইমেইল", "karim@example.com"),
                    Pair("ফোন", "০১৭৬৫-১২৩৪৫৬"),
                    Pair("জন্ম তারিখ", "১৫ মার্চ ২০১০")
                )
            )
        }
        
        item {
            ProfileInfoSection(
                label = "স্কুল তথ্য",
                items = listOf(
                    Pair("ক্লাস", "অষ্টম"),
                    Pair("বিভাগ", "ক"),
                    Pair("শিক্ষা বর্ষ", "২০২৫-২০২৬")
                )
            )
        }
    }
}

@Composable
fun ProfileInfoSection(label: String, items: List<Pair<String, String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Card {
            Column(modifier = Modifier.padding(16.dp)) {
                items.forEachIndexed { index, (key, value) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(key, style = MaterialTheme.typography.bodyMedium)
                        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    }
                    if (index < items.size - 1) Divider()
                }
            }
        }
    }
}
