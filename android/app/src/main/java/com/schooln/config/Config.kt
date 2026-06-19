package com.schooln.config

import android.content.Context

/**
 * Application Configuration for School Management System - Android
 * This object holds all configuration values for the Android app
 */
object Config {
    // Server Configuration
    const val DEFAULT_SERVER_URL = "https://school-server-b264c1a1fac6.herokuapp.com"
    const val WEB_APP_URL = "https://www.easyschool.live"
    private const val SERVER_URL_KEY = "server_url_override"
    
    // API Endpoints
    object ApiEndpoints {
        fun authBase(context: Context): String = getApiBaseUrl(context) + "/auth"
        fun usersBase(context: Context): String = getApiBaseUrl(context) + "/users"
        fun contentBase(context: Context, path: String): String = getApiBaseUrl(context) + "/$path"

        fun login(context: Context): String = authBase(context) + "/login"
        fun register(context: Context): String = authBase(context) + "/register"
        fun logout(context: Context): String = authBase(context) + "/logout"
        fun verifyToken(context: Context): String = authBase(context) + "/verify"

        fun profile(context: Context): String = usersBase(context) + "/profile"

        fun students(context: Context): String = contentBase(context, "students")
        fun teachers(context: Context): String = contentBase(context, "teachers")
        fun staff(context: Context): String = contentBase(context, "staff")

        fun attendance(context: Context): String = contentBase(context, "attendance")
        fun academic(context: Context): String = contentBase(context, "academic")
        fun finance(context: Context): String = contentBase(context, "finance")
        fun notices(context: Context): String = contentBase(context, "notices")

        fun messages(context: Context): String = contentBase(context, "messages")
        fun notifications(context: Context): String = contentBase(context, "notifications")

        fun configEndpoints(context: Context): String = contentBase(context, "config/endpoints")
        fun configStatus(context: Context): String = contentBase(context, "config/status")
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
        DEFAULT_SERVER_URL.contains("localhost") -> "development"
        DEFAULT_SERVER_URL.contains("herokuapp") -> "production"
        else -> "custom"
    }

    /**
     * Get server URL from a saved override, falling back to the public default.
     */
    fun getServerUrl(context: Context? = null): String {
        val storedUrl = context
            ?.getSharedPreferences(PREFERENCE_NAME, Context.MODE_PRIVATE)
            ?.getString(SERVER_URL_KEY, "")
            ?.trim()
            .orEmpty()

        return if (storedUrl.isNotBlank()) storedUrl.trimEnd('/') else DEFAULT_SERVER_URL
    }

    /**
     * Store a custom server URL at runtime.
     */
    fun setServerUrl(context: Context, serverUrl: String) {
        context.getSharedPreferences(PREFERENCE_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(SERVER_URL_KEY, serverUrl.trim().trimEnd('/'))
            .apply()
    }

    /**
     * Clear a saved server URL override.
     */
    fun clearServerUrl(context: Context) {
        context.getSharedPreferences(PREFERENCE_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(SERVER_URL_KEY)
            .apply()
    }

    /**
     * Get API base URL for Retrofit and REST calls.
     */
    fun getApiBaseUrl(context: Context? = null): String {
        return "${getServerUrl(context).trimEnd('/')}/api"
    }

    /**
     * Retrofit expects a trailing slash on the base URL.
     */
    fun getRetrofitBaseUrl(context: Context? = null): String {
        return "${getApiBaseUrl(context).trimEnd('/')}/"
    }
    
    /**
     * Validate configuration
     */
    fun validate(): Boolean {
        return DEFAULT_SERVER_URL.isNotEmpty() &&
               API_TIMEOUT_SECONDS > 0
    }
}
