package com.hridoy.easystudy.screens

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.JsonObject
import com.hridoy.easystudy.R
import com.hridoy.easystudy.adapter.SimpleAdapter
import com.hridoy.easystudy.model.SimpleItem
import com.hridoy.easystudy.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class FinanceDetailActivity : AppCompatActivity() {
    private lateinit var progressBar: ProgressBar
    private lateinit var descriptionTV: TextView
    private lateinit var recyclerView: RecyclerView
    private lateinit var backButton: Button

    companion object {
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_TYPE = "type"
        private const val EXTRA_DESCRIPTION = "description"

        fun intentFor(
            context: Context,
            title: String,
            type: String,
            description: String
        ): Intent {
            return Intent(context, FinanceDetailActivity::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_TYPE, type)
                putExtra(EXTRA_DESCRIPTION, description)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_finance_detail)

        initViews()
        val type = intent.getStringExtra(EXTRA_TYPE) ?: "overview"
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Finance"
        val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""

        supportActionBar?.title = title
        descriptionTV.text = description

        loadFinanceData(type)
        backButton.setOnClickListener { finish() }
    }

    private fun initViews() {
        progressBar = findViewById(R.id.progressBar)
        descriptionTV = findViewById(R.id.descriptionTV)
        recyclerView = findViewById(R.id.recyclerView)
        backButton = findViewById(R.id.backButton)
        recyclerView.layoutManager = LinearLayoutManager(this)
    }

    private fun loadFinanceData(type: String) {
        progressBar.visibility = View.VISIBLE
        val call = when (type) {
            "fees" -> RetrofitClient.api.getFees()
            "collections" -> RetrofitClient.api.getCollections()
            "salary" -> RetrofitClient.api.getSalaries()
            "reports" -> RetrofitClient.api.getFinanceReports()
            "my-fees" -> RetrofitClient.api.getMyFees()
            else -> RetrofitClient.api.getFees()
        }

        call.enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body() ?: JsonObject()
                    displayData(data, type)
                } else {
                    Toast.makeText(
                        this@FinanceDetailActivity,
                        "Failed to load finance data",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(
                    this@FinanceDetailActivity,
                    "Error: ${t.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
    }

    private fun displayData(data: JsonObject, type: String) {
        val items = mutableListOf<SimpleItem>()

        when (type) {
            "fees" -> {
                items.add(SimpleItem("Fee Management", "Manage student fees, due dates, and payment schedules."))
                items.add(SimpleItem("Academic Year", "Select academic year"))
                items.add(SimpleItem("Class", "Select class to view fees"))
            }
            "collections" -> {
                items.add(SimpleItem("Fee Collections", "Track payments received from students."))
                data.entrySet().forEach { entry ->
                    if (entry.key !in listOf("_id", "createdAt", "updatedAt")) {
                        items.add(SimpleItem(entry.key.replaceFirstChar { it.uppercase() }, entry.value.asString))
                    }
                }
            }
            "salary" -> {
                items.add(SimpleItem("Salary Management", "Manage staff and teacher salaries."))
                items.add(SimpleItem("Month", "Select month to view salaries"))
                items.add(SimpleItem("Department", "Select department"))
            }
            "reports" -> {
                items.add(SimpleItem("Financial Reports", "View comprehensive financial summaries and analysis."))
                data.entrySet().forEach { entry ->
                    if (entry.key !in listOf("_id", "createdAt", "updatedAt")) {
                        items.add(SimpleItem(entry.key.replaceFirstChar { it.uppercase() }, entry.value.asString))
                    }
                }
            }
            "my-fees" -> {
                items.add(SimpleItem("Your Fee Status", "View your personal fee details and payment history."))
                data.entrySet().forEach { entry ->
                    if (entry.key !in listOf("_id", "createdAt", "updatedAt")) {
                        items.add(SimpleItem(entry.key.replaceFirstChar { it.uppercase() }, entry.value.asString))
                    }
                }
            }
            else -> {
                data.entrySet().forEach { entry ->
                    items.add(SimpleItem(entry.key, entry.value.asString))
                }
            }
        }

        if (items.isEmpty()) {
            items.add(SimpleItem("Finance Module", "Finance data loading..."))
        }

        recyclerView.adapter = SimpleAdapter(items)
    }
}
