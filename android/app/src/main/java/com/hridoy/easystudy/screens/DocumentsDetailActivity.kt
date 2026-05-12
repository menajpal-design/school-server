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

class DocumentsDetailActivity : AppCompatActivity() {
    private lateinit var progressBar: ProgressBar
    private lateinit var descriptionTV: TextView
    private lateinit var recyclerView: RecyclerView
    private lateinit var backButton: Button

    companion object {
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_TYPE = "type"
        private const val EXTRA_DESCRIPTION = "description"

        fun intentFor(context: Context, title: String, type: String, description: String): Intent {
            return Intent(context, DocumentsDetailActivity::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_TYPE, type)
                putExtra(EXTRA_DESCRIPTION, description)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_documents_detail)

        initViews()
        val type = intent.getStringExtra(EXTRA_TYPE) ?: "overview"
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Documents"
        val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""

        supportActionBar?.title = title
        descriptionTV.text = description

        loadDocumentsData(type)
        backButton.setOnClickListener { finish() }
    }

    private fun initViews() {
        progressBar = findViewById(R.id.progressBar)
        descriptionTV = findViewById(R.id.descriptionTV)
        recyclerView = findViewById(R.id.recyclerView)
        backButton = findViewById(R.id.backButton)
        recyclerView.layoutManager = LinearLayoutManager(this)
    }

    private fun loadDocumentsData(type: String) {
        progressBar.visibility = View.VISIBLE
        val call = when (type) {
            "upload" -> RetrofitClient.api.uploadDocument(emptyMap())
            "manage" -> RetrofitClient.api.getManagedDocuments()
            else -> RetrofitClient.api.getDocuments()
        }

        call.enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    displayData(response.body() ?: JsonObject(), type)
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(this@DocumentsDetailActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun displayData(data: JsonObject, type: String) {
        val items = mutableListOf<SimpleItem>()
        when (type) {
            "upload" -> items.add(SimpleItem("Upload", "Tap to select and upload a file"))
            "manage" -> {
                data.entrySet().forEach { items.add(SimpleItem(it.key, it.value.asString)) }
            }
        }
        if (items.isEmpty()) items.add(SimpleItem("Documents", "Loading..."))
        recyclerView.adapter = SimpleAdapter(items)
    }
}
