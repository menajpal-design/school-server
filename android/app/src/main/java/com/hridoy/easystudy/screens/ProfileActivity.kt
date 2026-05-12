package com.hridoy.easystudy.screens

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.JsonObject
import com.hridoy.easystudy.R
import com.hridoy.easystudy.network.RetrofitClient
import com.hridoy.easystudy.storage.SessionManager
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class ProfileActivity : AppCompatActivity() {

    private lateinit var nameTextView: TextView
    private lateinit var emailTextView: TextView
    private lateinit var roleTextView: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var changePasswordButton: Button
    private lateinit var logoutButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile)

        initViews()
        bindSessionInfo()
        setupActions()
        loadProfile()
    }

    private fun initViews() {
        nameTextView = findViewById(R.id.nameTextView)
        emailTextView = findViewById(R.id.emailTextView)
        roleTextView = findViewById(R.id.roleTextView)
        progressBar = findViewById(R.id.progressBar)
        changePasswordButton = findViewById(R.id.changePasswordButton)
        logoutButton = findViewById(R.id.logoutButton)
    }

    private fun bindSessionInfo() {
        nameTextView.text = SessionManager.getUserName() ?: "Loading..."
        emailTextView.text = SessionManager.getUserEmail() ?: "Loading..."
        roleTextView.text = SessionManager.getUserRole() ?: "Loading..."
    }

    private fun setupActions() {
        changePasswordButton.setOnClickListener {
            startActivity(Intent(this, ChangePasswordActivity::class.java))
        }

        logoutButton.setOnClickListener {
            SessionManager.logout()
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }
    }

    private fun loadProfile() {
        progressBar.visibility = View.VISIBLE
        RetrofitClient.api.profile().enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val user = response.body()!!.getAsJsonObject("user")
                    if (user != null) {
                        nameTextView.text = user.get("name")?.asString ?: "N/A"
                        emailTextView.text = user.get("email")?.asString ?: "N/A"
                        roleTextView.text = user.get("role")?.asString ?: "N/A"

                        // Update session
                        SessionManager.saveUserInfo(
                            userId = user.get("_id")?.asString ?: "",
                            name = user.get("name")?.asString ?: "",
                            email = user.get("email")?.asString ?: "",
                            role = user.get("role")?.asString ?: "",
                            photo = user.get("photo")?.asString
                        )
                    }
                } else {
                    Toast.makeText(this@ProfileActivity, "Failed to load profile", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(this@ProfileActivity, "Network error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }
}
