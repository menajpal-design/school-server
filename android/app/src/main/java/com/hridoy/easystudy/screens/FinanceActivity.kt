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

class FinanceActivity : AppCompatActivity() {
    private lateinit var progressBar: ProgressBar
    private lateinit var statsContainer: LinearLayout
    private lateinit var totalFeesTV: TextView
    private lateinit var collectedTV: TextView
    private lateinit var pendingTV: TextView
    private lateinit var salaryTV: TextView
    private lateinit var feesButton: Button
    private lateinit var collectionsButton: Button
    private lateinit var salaryButton: Button
    private lateinit var reportsButton: Button
    private lateinit var myFeesButton: Button
    private lateinit var backButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_finance)

        initViews()
        loadFinanceStats()
        setupListeners()
    }

    private fun initViews() {
        progressBar = findViewById(R.id.progressBar)
        statsContainer = findViewById(R.id.statsContainer)
        totalFeesTV = findViewById(R.id.totalFeesTV)
        collectedTV = findViewById(R.id.collectedTV)
        pendingTV = findViewById(R.id.pendingTV)
        salaryTV = findViewById(R.id.salaryTV)
        feesButton = findViewById(R.id.feesButton)
        collectionsButton = findViewById(R.id.collectionsButton)
        salaryButton = findViewById(R.id.salaryButton)
        reportsButton = findViewById(R.id.reportsButton)
        myFeesButton = findViewById(R.id.myFeesButton)
        backButton = findViewById(R.id.backButton)
    }

    private fun setupListeners() {
        feesButton.setOnClickListener {
            startActivity(
                FinanceDetailActivity.intentFor(
                    this,
                    "Manage Fees",
                    "fees",
                    "View and manage student fees."
                )
            )
        }
        collectionsButton.setOnClickListener {
            startActivity(
                FinanceDetailActivity.intentFor(
                    this,
                    "Collections",
                    "collections",
                    "Track fee collections and payments."
                )
            )
        }
        salaryButton.setOnClickListener {
            startActivity(
                FinanceDetailActivity.intentFor(
                    this,
                    "Salary",
                    "salary",
                    "Manage staff and teacher salaries."
                )
            )
        }
        reportsButton.setOnClickListener {
            startActivity(
                FinanceDetailActivity.intentFor(
                    this,
                    "Finance Reports",
                    "reports",
                    "View financial summaries and reports."
                )
            )
        }
        myFeesButton.setOnClickListener {
            startActivity(
                FinanceDetailActivity.intentFor(
                    this,
                    "My Fees",
                    "my-fees",
                    "View your personal fee details."
                )
            )
        }
        backButton.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }

    private fun loadFinanceStats() {
        progressBar.visibility = View.VISIBLE
        RetrofitClient.api.getFees().enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body() ?: JsonObject()
                    val stats = data.getAsJsonObject("stats") ?: data

                    val totalFees = stats.get("totalFees")?.asString ?: "0"
                    val collected = stats.get("collected")?.asString ?: "0"
                    val pending = stats.get("pending")?.asString ?: "0"
                    val salary = stats.get("salary")?.asString ?: "0"

                    totalFeesTV.text = totalFees
                    collectedTV.text = collected
                    pendingTV.text = pending
                    salaryTV.text = salary
                } else {
                    Toast.makeText(
                        this@FinanceActivity,
                        "Failed to load finance data",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(
                    this@FinanceActivity,
                    "Network error: ${t.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
    }
}
