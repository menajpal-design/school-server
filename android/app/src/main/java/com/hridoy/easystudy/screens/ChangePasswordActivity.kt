package com.hridoy.easystudy.screens

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.JsonObject
import com.hridoy.easystudy.R
import com.hridoy.easystudy.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class ChangePasswordActivity : AppCompatActivity() {

    private lateinit var currentPasswordEditText: EditText
    private lateinit var newPasswordEditText: EditText
    private lateinit var confirmPasswordEditText: EditText
    private lateinit var submitButton: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var errorTextView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_change_password)

        currentPasswordEditText = findViewById(R.id.currentPasswordEditText)
        newPasswordEditText = findViewById(R.id.newPasswordEditText)
        confirmPasswordEditText = findViewById(R.id.confirmPasswordEditText)
        submitButton = findViewById(R.id.submitButton)
        progressBar = findViewById(R.id.progressBar)
        errorTextView = findViewById(R.id.errorTextView)

        submitButton.setOnClickListener {
            submitChangePassword()
        }
    }

    private fun submitChangePassword() {
        val currentPassword = currentPasswordEditText.text.toString().trim()
        val newPassword = newPasswordEditText.text.toString().trim()
        val confirmPassword = confirmPasswordEditText.text.toString().trim()

        when {
            currentPassword.isEmpty() -> {
                showError("Current password is required")
                return
            }
            newPassword.length < 8 -> {
                showError("New password must be at least 8 characters")
                return
            }
            confirmPassword.isEmpty() -> {
                showError("Confirm your new password")
                return
            }
            newPassword != confirmPassword -> {
                showError("Passwords do not match")
                return
            }
        }

        setLoading(true)
        errorTextView.visibility = View.GONE

        val payload = mapOf(
            "currentPassword" to currentPassword,
            "newPassword" to newPassword
        )

        RetrofitClient.api.changePassword(payload).enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                setLoading(false)
                if (response.isSuccessful) {
                    Toast.makeText(
                        this@ChangePasswordActivity,
                        "Password changed successfully",
                        Toast.LENGTH_SHORT
                    ).show()
                    finish()
                } else {
                    showError("Unable to change password (${response.code()})")
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                setLoading(false)
                showError(t.localizedMessage ?: "Network error")
            }
        })
    }

    private fun showError(message: String) {
        errorTextView.text = message
        errorTextView.visibility = View.VISIBLE
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        submitButton.isEnabled = !loading
    }
}
