package com.hridoy.easystudy.screens

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.hridoy.easystudy.MainActivity
import com.hridoy.easystudy.R
import com.hridoy.easystudy.storage.SessionManager

class SettingsActivity : AppCompatActivity() {
    private lateinit var userNameTV: TextView
    private lateinit var userEmailTV: TextView
    private lateinit var changePasswordButton: Button
    private lateinit var logoutButton: Button
    private lateinit var backButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        userNameTV = findViewById(R.id.userNameTV)
        userEmailTV = findViewById(R.id.userEmailTV)
        changePasswordButton = findViewById(R.id.changePasswordButton)
        logoutButton = findViewById(R.id.logoutButton)
        backButton = findViewById(R.id.backButton)

        // Load user info
        userNameTV.text = SessionManager.getUserName()
        userEmailTV.text = SessionManager.getUserEmail()

        changePasswordButton.setOnClickListener {
            startActivity(Intent(this, ChangePasswordActivity::class.java))
        }

        logoutButton.setOnClickListener {
            SessionManager.logout()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        backButton.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }
}
