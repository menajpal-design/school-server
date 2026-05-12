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

class IdCardsDetailActivity : AppCompatActivity() {
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
            return Intent(context, IdCardsDetailActivity::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_TYPE, type)
                putExtra(EXTRA_DESCRIPTION, description)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_id_cards_detail)

        initViews()
        val type = intent.getStringExtra(EXTRA_TYPE) ?: "overview"
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "ID Cards"
        val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""

        supportActionBar?.title = title
        descriptionTV.text = description

        loadIdCardsData(type)
        backButton.setOnClickListener { finish() }
    }

    private fun initViews() {
        progressBar = findViewById(R.id.progressBar)
        descriptionTV = findViewById(R.id.descriptionTV)
        recyclerView = findViewById(R.id.recyclerView)
        backButton = findViewById(R.id.backButton)
        recyclerView.layoutManager = LinearLayoutManager(this)
    }

    private fun loadIdCardsData(type: String) {
        progressBar.visibility = View.VISIBLE
        val call = when (type) {
            "generate" -> RetrofitClient.api.generateIdCard(emptyMap())
            "templates" -> RetrofitClient.api.getIdCards()
            "reports" -> RetrofitClient.api.searchIdCardOwners("")
            "renewal" -> RetrofitClient.api.getIdCards()
            else -> RetrofitClient.api.getIdCards()
        }

        call.enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body() ?: JsonObject()
                    displayData(data, type)
                } else {
                    Toast.makeText(
                        this@IdCardsDetailActivity,
                        "Failed to load ID cards data",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(
                    this@IdCardsDetailActivity,
                    "Error: ${t.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
    }

    private fun displayData(data: JsonObject, type: String) {
        val items = mutableListOf<SimpleItem>()

        when (type) {
            "generate" -> {
                items.add(SimpleItem("Generate ID Cards", "Select students/staff to generate digital ID cards with QR codes."))
                items.add(SimpleItem("Select Type", "Students or Staff"))
                items.add(SimpleItem("Select Class", "Choose class or department"))
            }
            "templates" -> {
                items.add(SimpleItem("ID Card Templates", "Manage design templates for ID cards."))
                items.add(SimpleItem("Default Template", "Professional ID card layout"))
                items.add(SimpleItem("Custom Template", "Create custom design"))
            }
            "reports" -> {
                items.add(SimpleItem("ID Card Reports", "View generation history and statistics."))
                data.entrySet().forEach { entry ->
                    if (entry.key !in listOf("_id", "createdAt", "updatedAt")) {
                        items.add(SimpleItem(entry.key.replaceFirstChar { it.uppercase() }, entry.value.asString))
                    }
                }
            }
            "renewal" -> {
                items.add(SimpleItem("Renewal Management", "Manage ID card expiry and renewal requests."))
                items.add(SimpleItem("Expiry Date", "Set card validity period"))
                items.add(SimpleItem("Renewal Requests", "Process renewal requests"))
            }
            else -> {
                data.entrySet().forEach { entry ->
                    items.add(SimpleItem(entry.key, entry.value.asString))
                }
            }
        }

        if (items.isEmpty()) {
            items.add(SimpleItem("ID Cards Module", "ID card data loading..."))
        }

        recyclerView.adapter = SimpleAdapter(items)
    }
}
