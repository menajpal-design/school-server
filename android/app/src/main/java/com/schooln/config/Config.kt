package com.schooln.config

/**
 * Application Configuration for School Management System - Android
 * This object holds all configuration values for the Android app
 */
object Config {
    // Server Configuration
    const val SERVER_URL = "https://school-server-b264c1a1fac6.herokuapp.com"
    const val API_BASE_URL = "$SERVER_URL/api"
    
    // API Endpoints
    object ApiEndpoints {
        const val AUTH = "$API_BASE_URL/auth"
        const val LOGIN = "$AUTH/login"
        const val REGISTER = "$AUTH/register"
        const val LOGOUT = "$AUTH/logout"
        const val VERIFY_TOKEN = "$AUTH/verify"
        
        const val USERS = "$API_BASE_URL/users"
        const val PROFILE = "$USERS/profile"
        
        const val STUDENTS = "$API_BASE_URL/students"
        const val TEACHERS = "$API_BASE_URL/teachers"
        const val STAFF = "$API_BASE_URL/staff"
        
        const val ATTENDANCE = "$API_BASE_URL/attendance"
        const val ACADEMIC = "$API_BASE_URL/academic"
        const val FINANCE = "$API_BASE_URL/finance"
        const val NOTICES = "$API_BASE_URL/notices"
        
        const val MESSAGES = "$API_BASE_URL/messages"
        const val NOTIFICATIONS = "$API_BASE_URL/notifications"
        
        const val CONFIG_ENDPOINTS = "$API_BASE_URL/config/endpoints"
        const val CONFIG_STATUS = "$API_BASE_URL/config/status"
    }
    
    // App Configuration
    const val APP_NAME = "School Management System"
    const val API_TIMEOUT_SECONDS = 30
    
    // Feature Flags
    const val ENABLE_EMAIL = false
    const val ENABLE_SMS = true
    const val ENABLE_NOTIFICATIONS = true
    
    // Storage
    const val PREFERENCE_NAME = "school_app_prefs"
    const val TOKEN_KEY = "auth_token"
    const val USER_KEY = "user_data"
    const val LANGUAGE_KEY = "app_language"
    
    // Default Language
    const val DEFAULT_LANGUAGE = "en" // "bn" for Bengali, "en" for English
    
    // Pagination
    const val PAGE_SIZE = 20
    
    // Logging
    const val DEBUG = true
    
    /**
     * Get current environment
     */
    fun getEnvironment(): String = when {
        SERVER_URL.contains("localhost") -> "development"
        SERVER_URL.contains("herokuapp") -> "production"
        else -> "custom"
    }
    
    /**
     * Validate configuration
     */
    fun validate(): Boolean {
        return SERVER_URL.isNotEmpty() && 
               API_BASE_URL.isNotEmpty() &&
               API_TIMEOUT_SECONDS > 0
    }
}
