package com.hridoy.easystudy.network

import com.google.gson.JsonObject
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    // Auth endpoints
    @POST("api/auth/login")
    fun login(@Body request: com.hridoy.easystudy.model.AuthRequest): Call<JsonObject>

    @GET("api/auth/profile")
    fun profile(): Call<JsonObject>

    @PUT("api/auth/change-password")
    fun changePassword(@Body request: Map<String, String>): Call<JsonObject>

    // Dashboard endpoints
    @GET("api/dashboard/stats")
    fun dashboardStats(): Call<JsonObject>

    @GET("api/dashboard/attendance-overview")
    fun dashboardAttendance(): Call<JsonObject>

    @GET("api/dashboard/fee-overview")
    fun dashboardFees(): Call<JsonObject>

    // Academic endpoints
    @GET("api/academic")
    fun getAcademic(): Call<JsonObject>

    @GET("api/academic/classes")
    fun getAcademicClasses(): Call<JsonObject>

    @GET("api/academic/subjects")
    fun getAcademicSubjects(): Call<JsonObject>

    @GET("api/academic/exams")
    fun getAcademicExams(): Call<JsonObject>

    @GET("api/academic/results")
    fun getAcademicResults(): Call<JsonObject>

    @GET("api/academic/report-card")
    fun getAcademicReportCard(): Call<JsonObject>

    // Attendance endpoints
    @GET("api/attendance")
    fun getAttendance(): Call<JsonObject>

    @POST("api/attendance/mark")
    fun markAttendance(@Body request: Map<String, String>): Call<JsonObject>

    @GET("api/attendance/reports")
    fun getAttendanceReports(): Call<JsonObject>

    @GET("api/attendance/me")
    fun getMyAttendance(): Call<JsonObject>

    // Finance endpoints
    @GET("api/finance/fees")
    fun getFees(): Call<JsonObject>

    @GET("api/finance/collections")
    fun getCollections(): Call<JsonObject>

    @GET("api/finance/salary")
    fun getSalaries(): Call<JsonObject>

    @GET("api/finance/reports")
    fun getFinanceReports(): Call<JsonObject>

    @GET("api/finance/my-fees")
    fun getMyFees(): Call<JsonObject>

    @GET("api/finance/payments")
    fun getPayments(): Call<JsonObject>

    // ID Cards endpoints
    @GET("api/id-cards")
    fun getIdCards(): Call<JsonObject>

    @POST("api/id-cards/generate")
    fun generateIdCard(@Body request: Map<String, Any>): Call<JsonObject>

    @GET("api/id-cards/search")
    fun searchIdCardOwners(@Query("type") type: String, @Query("search") search: String): Call<JsonObject>

    @GET("api/id-cards/{id}/download-pdf")
    fun downloadIdCardPdf(@Path("id") id: String): Call<JsonObject>

    @GET("api/id-cards/bulk-generate")
    fun bulkGenerateIdCards(@Body request: Map<String, Any>): Call<JsonObject>

    // Documents endpoints
    @GET("api/documents")
    fun getDocuments(): Call<JsonObject>

    @GET("api/documents/manage")
    fun getManagedDocuments(): Call<JsonObject>

    @POST("api/documents/upload")
    fun uploadDocument(@Body request: Map<String, String>): Call<JsonObject>

    @DELETE("api/documents/{id}")
    fun deleteDocument(@Path("id") id: String): Call<JsonObject>

    // Notices endpoints
    @GET("api/notices")
    fun getNotices(): Call<JsonObject>

    @GET("api/notices/{id}")
    fun getNoticeDetail(@Path("id") id: String): Call<JsonObject>

    // Users & Roles endpoints
    @GET("api/students")
    fun getStudents(): Call<JsonObject>

    @GET("api/teachers")
    fun getTeachers(): Call<JsonObject>

    @GET("api/staff")
    fun getStaff(): Call<JsonObject>

    @GET("api/users")
    fun getUsers(): Call<JsonObject>

    @GET("api/users/all")
    fun getAllUsers(): Call<JsonObject>

    @GET("api/users/permissions")
    fun getUserPermissions(): Call<JsonObject>

    @GET("api/users/{id}")
    fun getUserDetail(@Path("id") id: String): Call<JsonObject>

    @POST("api/users")
    fun createUser(@Body request: Map<String, String>): Call<JsonObject>

    @PUT("api/users/{id}")
    fun updateUser(@Path("id") id: String, @Body request: Map<String, String>): Call<JsonObject>

    // Committee endpoints
    @GET("api/committee")
    fun getCommittee(): Call<JsonObject>

    @GET("api/committee/{id}")
    fun getCommitteeDetail(@Path("id") id: String): Call<JsonObject>

    // Parent Portal endpoints
    @GET("api/parent")
    fun getParent(): Call<JsonObject>

    // Institution endpoints
    @GET("api/institution")
    fun getInstitution(): Call<JsonObject>

    @GET("api/institution/{id}")
    fun getInstitutionDetail(@Path("id") id: String): Call<JsonObject>

    // Health check
    @GET("api/health")
    fun health(): Call<JsonObject>
}
