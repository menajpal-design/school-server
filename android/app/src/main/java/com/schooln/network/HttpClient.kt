package com.schooln.network

import android.content.Context
import com.schooln.config.Config
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * HTTP Client Builder for the School Management System
 * Handles authentication, logging, and timeout configuration
 */
object HttpClientBuilder {
    
    /**
     * Build OkHttpClient with interceptors and security configuration
     */
    fun build(context: Context): OkHttpClient {
        val builder = OkHttpClient.Builder()
        
        // Logging Interceptor (only in debug mode)
        if (Config.DEBUG) {
            val loggingInterceptor = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            builder.addInterceptor(loggingInterceptor)
        }
        
        // Authentication Interceptor
        builder.addInterceptor(AuthInterceptor(context))
        
        // Timeout Configuration
        builder.connectTimeout(Config.API_TIMEOUT_SECONDS.toLong(), TimeUnit.SECONDS)
        builder.readTimeout(Config.API_TIMEOUT_SECONDS.toLong(), TimeUnit.SECONDS)
        builder.writeTimeout(Config.API_TIMEOUT_SECONDS.toLong(), TimeUnit.SECONDS)
        
        return builder.build()
    }
}

/**
 * Authentication Interceptor
 * Adds JWT Bearer token to all API requests
 */
class AuthInterceptor(private val context: Context) : Interceptor {
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Get JWT token from SharedPreferences
        val token = getAuthToken(context)
        
        // If token exists, add Authorization header
        val request = if (token.isNotEmpty()) {
            originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .build()
        } else {
            originalRequest.newBuilder()
                .addHeader("Content-Type", "application/json")
                .build()
        }
        
        return chain.proceed(request)
    }
    
    private fun getAuthToken(context: Context): String {
        val prefs = context.getSharedPreferences(Config.PREFERENCE_NAME, Context.MODE_PRIVATE)
        return prefs.getString(Config.TOKEN_KEY, "") ?: ""
    }
}

/**
 * Retrofit API Client Builder
 */
object RetrofitClient {
    
    private var retrofit: Retrofit? = null
    
    /**
     * Get or create Retrofit instance
     */
    fun getInstance(context: Context): Retrofit {
        if (retrofit == null) {
            retrofit = Retrofit.Builder()
                .baseUrl(Config.getRetrofitBaseUrl(context))
                .client(HttpClientBuilder.build(context))
                .addConverterFactory(GsonConverterFactory.create())
                .build()
        }
        return retrofit!!
    }
    
    /**
     * Reset Retrofit instance (useful for testing or when server URL changes)
     */
    fun reset() {
        retrofit = null
    }
}

/**
 * Create API Service
 * Usage: val authService = createApiService<AuthApi>(context)
 */
inline fun <reified T> createApiService(context: Context): T {
    return RetrofitClient.getInstance(context).create(T::class.java)
}
