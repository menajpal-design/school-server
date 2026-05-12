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

class IdCardsActivity : AppCompatActivity() {
    private lateinit var progressBar: ProgressBar
    private lateinit var statsContainer: LinearLayout
    private lateinit var totalCardsTV: TextView
    private lateinit var generatedTV: TextView
    private lateinit var renewalTV: TextView
    private lateinit var pendingTV: TextView
    private lateinit var generateButton: Button
    private lateinit var templatesButton: Button
    private lateinit var reportsButton: Button
    private lateinit var renewalButton: Button
    private lateinit var backButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_id_cards)

        initViews()
        loadIdCardsStats()
        setupListeners()
    }

    private fun initViews() {
        progressBar = findViewById(R.id.progressBar)
        statsContainer = findViewById(R.id.statsContainer)
        totalCardsTV = findViewById(R.id.totalCardsTV)
        generatedTV = findViewById(R.id.generatedTV)
        renewalTV = findViewById(R.id.renewalTV)
        pendingTV = findViewById(R.id.pendingTV)
        generateButton = findViewById(R.id.generateButton)
        templatesButton = findViewById(R.id.templatesButton)
        reportsButton = findViewById(R.id.reportsButton)
        renewalButton = findViewById(R.id.renewalButton)
        backButton = findViewById(R.id.backButton)
    }

    private fun setupListeners() {
        generateButton.setOnClickListener {
            startActivity(
                IdCardsDetailActivity.intentFor(
                    this,
                    "Generate ID Cards",
                    "generate",
                    "Generate digital ID cards for students and staff."
                )
            )
        }
        templatesButton.setOnClickListener {
            startActivity(
                IdCardsDetailActivity.intentFor(
                    this,
                    "ID Card Templates",
                    "templates",
                    "Manage ID card design templates."
                )
            )
        }
        reportsButton.setOnClickListener {
            startActivity(
                IdCardsDetailActivity.intentFor(
                    this,
                    "ID Cards Reports",
                    "reports",
                    "View ID card generation reports."
                )
            )
        }
        renewalButton.setOnClickListener {
            startActivity(
                IdCardsDetailActivity.intentFor(
                    this,
                    "ID Card Renewal",
                    "renewal",
                    "Manage ID card renewals and expiry."
                )
            )
        }
        backButton.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }

    private fun loadIdCardsStats() {
        progressBar.visibility = View.VISIBLE
        RetrofitClient.api.getIdCards().enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body() ?: JsonObject()
                    val stats = data.getAsJsonObject("stats") ?: data

                    val total = stats.get("total")?.asString ?: "0"
                    val generated = stats.get("generated")?.asString ?: "0"
                    val renewal = stats.get("renewal")?.asString ?: "0"
                    val pending = stats.get("pending")?.asString ?: "0"

                    totalCardsTV.text = total
                    generatedTV.text = generated
                    renewalTV.text = renewal
                    pendingTV.text = pending
                } else {
                    Toast.makeText(
                        this@IdCardsActivity,
                        "Failed to load ID cards data",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(
                    this@IdCardsActivity,
                    "Network error: ${t.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
    }
}
