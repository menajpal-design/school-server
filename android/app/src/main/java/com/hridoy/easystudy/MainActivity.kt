package com.hridoy.easystudy

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.drawerlayout.widget.DrawerLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.navigation.NavigationView
import com.google.gson.JsonObject
import com.hridoy.easystudy.adapter.SimpleAdapter
import com.hridoy.easystudy.model.AuthRequest
import com.hridoy.easystudy.model.SimpleItem
import com.hridoy.easystudy.network.RetrofitClient
import com.hridoy.easystudy.network.TokenStorage
import com.hridoy.easystudy.screens.*
import com.hridoy.easystudy.storage.SessionManager
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class MainActivity : AppCompatActivity(), NavigationView.OnNavigationItemSelectedListener {
    private lateinit var loginLayout: View
    private lateinit var contentContainer: View
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var loginStatus: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var recyclerContent: RecyclerView
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var navigationView: NavigationView
    private lateinit var toolbar: Toolbar
    private val api = RetrofitClient.api

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sharedPreferences = getSharedPreferences("drms_mobile", Context.MODE_PRIVATE)
        initializeViews()

        // Use SessionManager token
        TokenStorage.token = SessionManager.getToken()

        if (SessionManager.isLoggedIn()) {
            showMenu()
        } else {
            showLogin()
        }
    }

    private fun initializeViews() {
        loginLayout = findViewById(R.id.loginLayout)
        contentContainer = findViewById(R.id.contentContainer)
        emailInput = findViewById(R.id.emailInput)
        passwordInput = findViewById(R.id.passwordInput)
        loginStatus = findViewById(R.id.loginStatus)
        progressBar = findViewById(R.id.progressBar)
        recyclerContent = findViewById(R.id.recyclerView)
        
        drawerLayout = findViewById(R.id.drawer_layout)
        navigationView = findViewById(R.id.navigation_view)
        toolbar = findViewById(R.id.toolbar)

        setSupportActionBar(toolbar)
        val toggle = ActionBarDrawerToggle(
            this, drawerLayout, toolbar,
            R.string.app_name, R.string.app_name
        )
        drawerLayout.addDrawerListener(toggle)
        toggle.syncState()

        navigationView.setNavigationItemSelectedListener(this)
        recyclerContent.layoutManager = LinearLayoutManager(this)

        // Login button listener
        findViewById<android.widget.Button>(R.id.buttonLogin).setOnClickListener { performLogin() }
    }

    private fun performLogin() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString().trim()

        if (email.isEmpty() || password.isEmpty()) {
            loginStatus.text = "Email and password required"
            return
        }

        progressBar.visibility = View.VISIBLE
        api.login(AuthRequest(email, password)).enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (!response.isSuccessful || response.body() == null) {
                    loginStatus.text = "Login failed"
                    return
                }

                val body = response.body() ?: JsonObject()
                val token = body.get("token")?.asString
                val user = body.getAsJsonObject("user")

                if (token.isNullOrBlank() || user == null) {
                    loginStatus.text = "Invalid response"
                    return
                }

                SessionManager.setToken(token)
                SessionManager.saveUserInfo(
                    userId = user.get("_id")?.asString ?: "",
                    name = user.get("name")?.asString ?: "",
                    email = user.get("email")?.asString ?: "",
                    role = user.get("role")?.asString ?: "",
                    photo = user.get("photo")?.asString
                )

                TokenStorage.token = token
                sharedPreferences.edit().putString("auth_token", token).apply()
                loginStatus.text = ""
                Toast.makeText(this@MainActivity, "Login successful", Toast.LENGTH_SHORT).show()
                showMenu()
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                loginStatus.text = "Error: ${t.message}"
            }
        })
    }

    private fun showLogin() {
        loginLayout.visibility = View.VISIBLE
        contentContainer.visibility = View.GONE
        toolbar.title = "Login"
    }

    private fun showMenu() {
        loginLayout.visibility = View.GONE
        contentContainer.visibility = View.GONE
        toolbar.title = "EasyStudy"
        updateNavHeader()
    }

    private fun updateNavHeader() {
        val headerView = navigationView.getHeaderView(0)
        val userName = headerView.findViewById<TextView>(R.id.nav_header_name)
        val userEmail = headerView.findViewById<TextView>(R.id.nav_header_email)

        userName.text = SessionManager.getUserName()
        userEmail.text = SessionManager.getUserEmail()
    }

    override fun onNavigationItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.nav_dashboard -> startActivity(Intent(this, DashboardActivity::class.java))
            R.id.nav_academic -> startActivity(Intent(this, AcademicActivity::class.java))
            R.id.nav_classes -> startActivity(AcademicDetailActivity.intentFor(this, "Classes", "classes", "Class structure and student counts"))
            R.id.nav_subjects -> startActivity(AcademicDetailActivity.intentFor(this, "Subjects", "subjects", "Subject catalog"))
            R.id.nav_exams -> startActivity(AcademicDetailActivity.intentFor(this, "Exams", "exams", "Exam routines"))
            R.id.nav_results -> startActivity(AcademicDetailActivity.intentFor(this, "Results", "results", "Result workflows"))
            R.id.nav_report_card -> startActivity(AcademicDetailActivity.intentFor(this, "Report Card", "report-card", "Report card preview"))
            
            R.id.nav_attendance -> startActivity(Intent(this, AttendanceActivity::class.java))
            R.id.nav_mark_attendance -> startActivity(AttendanceDetailActivity.intentFor(this, "Mark Attendance", "mark", "Mark daily attendance"))
            R.id.nav_attendance_reports -> startActivity(AttendanceDetailActivity.intentFor(this, "Reports", "reports", "Attendance reports"))
            R.id.nav_my_attendance -> startActivity(AttendanceDetailActivity.intentFor(this, "My Attendance", "my-attendance", "Your attendance record"))
            
            R.id.nav_finance -> startActivity(Intent(this, FinanceActivity::class.java))
            R.id.nav_fees -> startActivity(FinanceDetailActivity.intentFor(this, "Manage Fees", "fees", "Student fees"))
            R.id.nav_collections -> startActivity(FinanceDetailActivity.intentFor(this, "Collections", "collections", "Fee collections"))
            R.id.nav_salary -> startActivity(FinanceDetailActivity.intentFor(this, "Salary", "salary", "Staff salaries"))
            R.id.nav_finance_reports -> startActivity(FinanceDetailActivity.intentFor(this, "Reports", "reports", "Finance reports"))
            R.id.nav_my_fees -> startActivity(FinanceDetailActivity.intentFor(this, "My Fees", "my-fees", "Your fees"))
            
            R.id.nav_id_cards -> startActivity(Intent(this, IdCardsActivity::class.java))
            R.id.nav_generate_cards -> startActivity(IdCardsDetailActivity.intentFor(this, "Generate", "generate", "Generate ID cards"))
            R.id.nav_templates -> startActivity(IdCardsDetailActivity.intentFor(this, "Templates", "templates", "ID card templates"))
            R.id.nav_id_reports -> startActivity(IdCardsDetailActivity.intentFor(this, "Reports", "reports", "ID card reports"))
            R.id.nav_renewal -> startActivity(IdCardsDetailActivity.intentFor(this, "Renewal", "renewal", "Card renewal"))
            
            R.id.nav_documents -> startActivity(Intent(this, DocumentsActivity::class.java))
            R.id.nav_upload_doc -> startActivity(DocumentsDetailActivity.intentFor(this, "Upload", "upload", "Upload documents"))
            R.id.nav_manage_docs -> startActivity(DocumentsDetailActivity.intentFor(this, "Manage", "manage", "Manage documents"))
            
            R.id.nav_notices -> startActivity(Intent(this, NoticesActivity::class.java))
            R.id.nav_committee -> startActivity(Intent(this, CommitteeActivity::class.java))
            R.id.nav_users -> startActivity(Intent(this, UsersActivity::class.java))
            R.id.nav_parent_portal -> startActivity(Intent(this, ParentPortalActivity::class.java))
            
            R.id.nav_profile -> startActivity(Intent(this, ProfileActivity::class.java))
            R.id.nav_settings -> startActivity(Intent(this, SettingsActivity::class.java))
            R.id.nav_logout -> performLogout()
        }

        drawerLayout.closeDrawers()
        return true
    }

    private fun performLogout() {
        SessionManager.logout()
        TokenStorage.clear()
        sharedPreferences.edit().remove("auth_token").apply()
        emailInput.setText("")
        passwordInput.setText("")
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    override fun onSupportNavigateUp(): Boolean {
        return drawerLayout.isDrawerOpen(navigationView) || super.onSupportNavigateUp()
    }
}
