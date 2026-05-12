package com.hridoy.easystudy.model

import com.google.gson.annotations.SerializedName

data class User(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val email: String? = null,
    val role: String? = null,
    val phone: String? = null,
    val photo: String? = null,
    val permissions: List<String>? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class AuthRequest(
    val email: String,
    val password: String
)

data class AuthResponse(
    val token: String,
    val user: User
)

data class ChangePasswordRequest(
    val oldPassword: String,
    val newPassword: String,
    val confirmPassword: String
)

data class StudentData(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val rollNumber: String? = null,
    val class: String? = null,
    val section: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val photo: String? = null
)

data class TeacherData(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val employeeId: String? = null,
    val designation: String? = null,
    val department: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val photo: String? = null
)

data class StaffData(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val employeeId: String? = null,
    val designation: String? = null,
    val department: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val photo: String? = null
)

data class DashboardStats(
    val totalStudents: Int? = null,
    val totalTeachers: Int? = null,
    val totalStaff: Int? = null,
    val todayAttendanceCount: Int? = null,
    val monthlyFeeCollection: Double? = null,
    val activeNotices: Int? = null,
    val idCardsIssued: Int? = null
)

data class AttendanceRecord(
    @SerializedName("_id")
    val id: String? = null,
    val studentId: String? = null,
    val date: String? = null,
    val status: String? = null, // present, absent, leave
    val remarks: String? = null,
    val createdAt: String? = null
)

data class FeeRecord(
    @SerializedName("_id")
    val id: String? = null,
    val studentId: String? = null,
    val amount: Double? = null,
    val dueDate: String? = null,
    val status: String? = null, // pending, paid, partial
    val description: String? = null,
    val createdAt: String? = null
)

data class IdCard(
    @SerializedName("_id")
    val id: String? = null,
    val cardNumber: String? = null,
    val ownerId: String? = null,
    val ownerType: String? = null, // student, teacher, staff
    val issuedDate: String? = null,
    val expiryDate: String? = null,
    val qrCode: String? = null,
    val barcode: String? = null,
    val photoUrl: String? = null,
    val createdAt: String? = null
)

data class Notice(
    @SerializedName("_id")
    val id: String? = null,
    val title: String? = null,
    val content: String? = null,
    val category: String? = null,
    val priority: String? = null, // high, medium, low
    val publishedAt: String? = null,
    val author: String? = null,
    val createdAt: String? = null
)

data class Document(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val url: String? = null,
    val mimeType: String? = null,
    val size: Long? = null,
    val ownerType: String? = null,
    val ownerName: String? = null,
    val uploadedAt: String? = null,
    val createdAt: String? = null
)

data class ExamResult(
    @SerializedName("_id")
    val id: String? = null,
    val studentId: String? = null,
    val examId: String? = null,
    val subjectId: String? = null,
    val marksObtained: Double? = null,
    val totalMarks: Double? = null,
    val grade: String? = null,
    val remarks: String? = null,
    val createdAt: String? = null
)

data class Class(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val code: String? = null,
    val totalStudents: Int? = null,
    val teacherId: String? = null,
    val createdAt: String? = null
)

data class Subject(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val code: String? = null,
    val teacherId: String? = null,
    val classId: String? = null,
    val createdAt: String? = null
)

data class Exam(
    @SerializedName("_id")
    val id: String? = null,
    val title: String? = null,
    val date: String? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val classId: String? = null,
    val totalMarks: Double? = null,
    val createdAt: String? = null
)

data class Committee(
    @SerializedName("_id")
    val id: String? = null,
    val name: String? = null,
    val description: String? = null,
    val members: List<String>? = null,
    val createdAt: String? = null
)
