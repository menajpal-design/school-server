package com.hridoy.easystudy.screens

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.JsonObject
import com.hridoy.easystudy.MainActivity
import com.hridoy.easystudy.R
import com.hridoy.easystudy.model.AuthRequest
import com.hridoy.easystudy.network.RetrofitClient
import com.hridoy.easystudy.storage.SessionManager
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class LoginActivity : AppCompatActivity() {

    private lateinit var emailEditText: EditText
    private lateinit var passwordEditText: EditText
    private lateinit var loginButton: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var errorTextView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        // If already logged in, go to MainActivity
        if (SessionManager.isLoggedIn()) {
            val intent = Intent(this, MainActivity::class.java)
            startActivity(intent)
            finish()
            return
        }

        initViews()
        setupListeners()
    }

    private fun initViews() {
        emailEditText = findViewById(R.id.emailEditText)
        passwordEditText = findViewById(R.id.passwordEditText)
        loginButton = findViewById(R.id.loginButton)
        progressBar = findViewById(R.id.progressBar)
        errorTextView = findViewById(R.id.errorTextView)
    }

    private fun setupListeners() {
        loginButton.setOnClickListener {
            val email = emailEditText.text.toString().trim()
            val password = passwordEditText.text.toString().trim()

            if (email.isEmpty() || password.isEmpty()) {
                errorTextView.text = "Please enter email and password"
                errorTextView.visibility = View.VISIBLE
                return@setOnClickListener
            }

            performLogin(email, password)
        }
    }

    private fun performLogin(email: String, password: String) {
        progressBar.visibility = View.VISIBLE
        errorTextView.visibility = View.GONE
        loginButton.isEnabled = false

        val request = AuthRequest(email, password)
        RetrofitClient.api.login(request).enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                loginButton.isEnabled = true

                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    val token = body.get("token")?.asString
                    val user = body.getAsJsonObject("user")

                    if (token != null && user != null) {
                        // Save session
                        SessionManager.setToken(token)
                        SessionManager.saveUserInfo(
                            userId = user.get("_id")?.asString ?: "",
                            name = user.get("name")?.asString ?: "",
                            email = user.get("email")?.asString ?: "",
                            role = user.get("role")?.asString ?: "",
                            photo = user.get("photo")?.asString
                        )

                        Toast.makeText(
                            this@LoginActivity,
                            "Login successful!",
                            Toast.LENGTH_SHORT
                        ).show()

                        // Navigate to MainActivity
                        val intent = Intent(this@LoginActivity, MainActivity::class.java)
                        startActivity(intent)
                        finish()
                    } else {
                        errorTextView.text = "Invalid response from server"
                        errorTextView.visibility = View.VISIBLE
                    }
                } else {
                    val errorMsg = when {
                        response.code() == 401 -> "Invalid email or password"
                        response.code() == 404 -> "User not found"
                        response.code() == 500 -> "Server error"
                        else -> "Login failed: ${response.message()}"
                    }
                    errorTextView.text = errorMsg
                    errorTextView.visibility = View.VISIBLE
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                loginButton.isEnabled = true
                errorTextView.text = "Network error: ${t.message}"
                errorTextView.visibility = View.VISIBLE
            }
        })
    }
}
