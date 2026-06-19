package com.schooln.network.api

import retrofit2.Response
import retrofit2.http.*
import com.google.gson.JsonElement

/**
 * Data Classes for API Communication
 */

// Auth Related
data class LoginRequest(
    val identifier: String,
    val password: String
)

data class LoginResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val token: String? = null,
    val user: UserData? = null,
    val data: LoginData? = null
)

data class LoginData(
    val token: String,
    val user: UserData
)

data class UserData(
    val id: String,
    val email: String,
    val name: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val role: String,
    val phone: String? = null,
    val institution: JsonElement? = null
)

data class ApiResponse<T>(
    val success: Boolean,
    val message: String? = null,
    val data: T? = null
)

/**
 * Authentication API Service
 */
interface AuthApi {
    
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
    
    @POST("auth/logout")
    suspend fun logout(): Response<ApiResponse<Unit>>
    
    @GET("auth/verify")
    suspend fun verifyToken(): Response<ApiResponse<UserData>>
    
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<LoginResponse>
}

interface AdmissionApi {
    @GET("admissions/public/schools")
    suspend fun schools(@Query("search") search: String = ""): Response<SchoolsResponse>

    @POST("admissions/public/apply")
    suspend fun apply(@Body request: AdmissionApplyRequest): Response<ApiResponse<AdmissionApplicationData>>
}

data class SchoolsResponse(
    val schools: List<SchoolData> = emptyList()
)

data class SchoolData(
    val _id: String,
    val name: String,
    val type: String? = null,
    val eiin: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null
)

data class AdmissionApplyRequest(
    val institutionId: String,
    val studentName: String,
    val guardianName: String,
    val guardianPhone: String,
    val guardianEmail: String = "",
    val dateOfBirth: String = "",
    val address: String,
    val previousSchool: String = "",
    val previousResult: String = "",
    val requestedClass: String
)

data class AdmissionApplicationData(
    val _id: String? = null,
    val status: String? = null
)

data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String,
    val phone: String = "",
    val role: String = "head",
    val institutionId: String = "6a02bd07535ddb19281c62c9"
)

/**
 * User API Service
 */
interface UserApi {
    
    @GET("users/profile")
    suspend fun getProfile(): Response<ApiResponse<UserData>>
    
    @PUT("users/profile")
    suspend fun updateProfile(@Body user: UserData): Response<ApiResponse<UserData>>
    
    @GET("users")
    suspend fun getUsers(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiResponse<List<UserData>>>
}

/**
 * Attendance API Service
 */
interface AttendanceApi {
    
    @GET("attendance")
    suspend fun getAttendance(
        @Query("studentId") studentId: String? = null,
        @Query("month") month: Int? = null,
        @Query("year") year: Int? = null
    ): Response<ApiResponse<List<AttendanceRecord>>>
}

data class AttendanceRecord(
    val id: String,
    val studentId: String,
    val date: String,
    val status: String, // "present", "absent", "late"
    val remarks: String? = null
)

/**
 * Messages API Service
 */
interface MessageApi {
    
    @GET("messages/inbox")
    suspend fun getInbox(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiResponse<List<Message>>>
    
    @GET("messages/sent")
    suspend fun getSent(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiResponse<List<Message>>>
    
    @POST("messages/send")
    suspend fun sendMessage(@Body message: SendMessageRequest): Response<ApiResponse<Message>>
    
    @GET("messages/stats/unread")
    suspend fun getUnreadCount(): Response<ApiResponse<UnreadCount>>
}

data class Message(
    val id: String,
    val fromUserId: String,
    val fromUserName: String,
    val toUserId: String,
    val toUserName: String,
    val subject: String,
    val body: String,
    val isRead: Boolean,
    val createdAt: String
)

data class SendMessageRequest(
    val toUserId: String,
    val toUserEmail: String,
    val subject: String,
    val body: String,
    val sendAsEmail: Boolean = false
)

data class UnreadCount(
    val count: Int
)

/**
 * Notifications API Service
 */
interface NotificationApi {
    
    @GET("notifications")
    suspend fun getNotifications(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiResponse<List<Notification>>>
    
    @PATCH("notifications/{id}/read")
    suspend fun markAsRead(@Path("id") id: String): Response<ApiResponse<Unit>>
}

data class Notification(
    val id: String,
    val title: String,
    val message: String,
    val isRead: Boolean,
    val createdAt: String
)

/**
 * Config API Service
 */
interface ConfigApi {
    
    @GET("config/endpoints")
    suspend fun getEndpoints(): Response<ApiResponse<EndpointsResponse>>
    
    @GET("config/status")
    suspend fun getStatus(): Response<ApiResponse<StatusResponse>>
}

data class EndpointsResponse(
    val serverUrl: String,
    val apiBaseUrl: String,
    val environment: String,
    val timestamp: String
)

data class StatusResponse(
    val status: String,
    val environment: String,
    val serverUrl: String,
    val features: Features
)

data class Features(
    val emailEnabled: Boolean,
    val smsEnabled: Boolean
)
