package com.hridoy.easystudy.screens

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.JsonObject
import com.hridoy.easystudy.MainActivity
import com.hridoy.easystudy.R
import com.hridoy.easystudy.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class DocumentsActivity : AppCompatActivity() {
    private lateinit var progressBar: ProgressBar
    private lateinit var totalDocsTV: TextView
    private lateinit var uploadedTV: TextView
    private lateinit var sharedTV: TextView
    private lateinit var uploadButton: Button
    private lateinit var manageButton: Button
    private lateinit var backButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_documents)

        initViews()
        loadDocumentsStats()
        setupListeners()
    }

    private fun initViews() {
        progressBar = findViewById(R.id.progressBar)
        totalDocsTV = findViewById(R.id.totalDocsTV)
        uploadedTV = findViewById(R.id.uploadedTV)
        sharedTV = findViewById(R.id.sharedTV)
        uploadButton = findViewById(R.id.uploadButton)
        manageButton = findViewById(R.id.manageButton)
        backButton = findViewById(R.id.backButton)
    }

    private fun setupListeners() {
        uploadButton.setOnClickListener {
            startActivity(
                DocumentsDetailActivity.intentFor(
                    this,
                    "Upload Document",
                    "upload",
                    "Upload new documents to the system."
                )
            )
        }
        manageButton.setOnClickListener {
            startActivity(
                DocumentsDetailActivity.intentFor(
                    this,
                    "Manage Documents",
                    "manage",
                    "View and manage your uploaded documents."
                )
            )
        }
        backButton.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }

    private fun loadDocumentsStats() {
        progressBar.visibility = View.VISIBLE
        RetrofitClient.api.getDocuments().enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body() ?: JsonObject()
                    val stats = data.getAsJsonObject("stats") ?: data

                    totalDocsTV.text = stats.get("total")?.asString ?: "0"
                    uploadedTV.text = stats.get("uploaded")?.asString ?: "0"
                    sharedTV.text = stats.get("shared")?.asString ?: "0"
                } else {
                    Toast.makeText(this@DocumentsActivity, "Failed to load documents", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(this@DocumentsActivity, "Network error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }
}
