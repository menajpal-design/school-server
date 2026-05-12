package com.hridoy.easystudy.network

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object RetrofitClient {
    // Use 10.0.2.2 for emulator to access localhost on host machine
    // For physical device, use your LAN IP (e.g., 192.168.x.x)
    @Volatile
    private var baseUrl = "http://10.0.2.2:5000/"

    @Volatile
    private var retrofit: Retrofit? = null

    fun setBaseUrl(url: String) {
        baseUrl = if (url.endsWith("/")) url else "$url/"
        retrofit = null
    }

    private val interceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val authInterceptor = Interceptor { chain ->
        val request = chain.request().newBuilder()
        TokenStorage.token?.takeIf { it.isNotBlank() }?.let { token ->
            request.addHeader("Authorization", "Bearer $token")
        }
        chain.proceed(request.build())
    }

    private val client = OkHttpClient.Builder()
        .addInterceptor(interceptor)
        .addInterceptor(authInterceptor)
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    val api: ApiService
        get() {
            val current = retrofit
            if (current != null) {
                return current.create(ApiService::class.java)
            }

            return synchronized(this) {
                val cached = retrofit
                if (cached != null) {
                    cached.create(ApiService::class.java)
                } else {
                    val created = Retrofit.Builder()
                        .baseUrl(baseUrl)
                        .client(client)
                        .addConverterFactory(GsonConverterFactory.create())
                        .build()
                    retrofit = created
                    created.create(ApiService::class.java)
                }
            }
    }
}
