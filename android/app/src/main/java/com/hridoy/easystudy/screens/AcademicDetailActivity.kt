package com.hridoy.easystudy.screens

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.hridoy.easystudy.R
import com.hridoy.easystudy.adapter.SimpleAdapter
import com.hridoy.easystudy.model.SimpleItem
import com.hridoy.easystudy.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class AcademicDetailActivity : AppCompatActivity() {

    private lateinit var titleText: TextView
    private lateinit var descriptionText: TextView
    private lateinit var statusText: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var recyclerView: RecyclerView

    private val endpointKey: String by lazy { intent.getStringExtra(EXTRA_ENDPOINT).orEmpty() }
    private val screenTitle: String by lazy { intent.getStringExtra(EXTRA_TITLE).orEmpty() }
    private val screenDescription: String by lazy { intent.getStringExtra(EXTRA_DESCRIPTION).orEmpty() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_academic_detail)

        titleText = findViewById(R.id.titleText)
        descriptionText = findViewById(R.id.descriptionText)
        statusText = findViewById(R.id.statusText)
        progressBar = findViewById(R.id.progressBar)
        recyclerView = findViewById(R.id.recyclerView)
        recyclerView.layoutManager = LinearLayoutManager(this)

        titleText.text = screenTitle.ifBlank { "Academic" }
        descriptionText.text = screenDescription.ifBlank { "Academic module detail view" }

        findViewById<View>(R.id.refreshButton).setOnClickListener { loadData() }
        loadData()
    }

    private fun loadData() {
        progressBar.visibility = View.VISIBLE
        statusText.text = "Loading ${screenTitle.ifBlank { "academic" }}..."

        val call = when (endpointKey) {
            "classes" -> RetrofitClient.api.getAcademicClasses()
            "subjects" -> RetrofitClient.api.getAcademicSubjects()
            "exams" -> RetrofitClient.api.getAcademicExams()
            "results" -> RetrofitClient.api.getAcademicResults()
            "report-card" -> RetrofitClient.api.getAcademicReportCard()
            else -> RetrofitClient.api.getAcademic()
        }

        call.enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (!response.isSuccessful || response.body() == null) {
                    statusText.text = "Failed to load ${screenTitle.lowercase()}"
                    recyclerView.adapter = SimpleAdapter(listOf(SimpleItem("Error", "Server returned ${response.code()} ${response.message()}")))
                    return
                }

                val body = response.body()!!
                val items = when (endpointKey) {
                    "classes" -> extractItems(body, listOf("classes", "data", "items"), "Class")
                    "subjects" -> extractItems(body, listOf("subjects", "data", "items"), "Subject")
                    "exams" -> extractItems(body, listOf("exams", "data", "items"), "Exam")
                    "results" -> extractItems(body, listOf("results", "data", "items"), "Result")
                    "report-card" -> extractItems(body, listOf("reportCard", "report-card", "data", "items"), "Report card")
                    else -> buildFallbackItems(body)
                }

                statusText.text = "Loaded ${items.size} items"
                recyclerView.adapter = SimpleAdapter(items)
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                statusText.text = "Network error"
                recyclerView.adapter = SimpleAdapter(listOf(SimpleItem("Error", t.localizedMessage ?: "Unknown error")))
            }
        })
    }

    private fun buildFallbackItems(body: JsonObject): List<SimpleItem> {
        val items = mutableListOf<SimpleItem>()
        body.entrySet().take(10).forEach { entry ->
            items.add(SimpleItem(entry.key, elementToString(entry.value)))
        }
        if (items.isEmpty()) {
            items.add(SimpleItem(screenTitle.ifBlank { "Academic" }, "No data returned from the server"))
        }
        return items
    }

    private fun extractItems(body: JsonObject, keys: List<String>, label: String): List<SimpleItem> {
        val array = findArray(body, keys)
        if (array != null && array.size() > 0) {
            return array.mapIndexed { index, element ->
                val objectValue = if (element.isJsonObject) element.asJsonObject else JsonObject()
                val name = objectValue.get("name")?.asString
                    ?: objectValue.get("title")?.asString
                    ?: objectValue.get("code")?.asString
                    ?: objectValue.get("rollNumber")?.asString
                    ?: objectValue.get("examName")?.asString
                    ?: "${label} ${index + 1}"
                val subtitle = objectValue.entrySet().joinToString(" · ") { "${it.key}: ${elementToString(it.value)}" }
                SimpleItem(name, subtitle.ifBlank { label })
            }
        }

        return buildFallbackItems(body)
    }

    private fun findArray(body: JsonObject, keys: List<String>): JsonArray? {
        for (key in keys) {
            val array = body.getAsJsonArray(key)
            if (array != null) return array
        }
        return null
    }

    private fun elementToString(element: JsonElement?): String {
        if (element == null || element.isJsonNull) return "N/A"
        return when {
            element.isJsonPrimitive -> element.asString
            element.isJsonArray -> "${element.asJsonArray.size()} items"
            element.isJsonObject -> element.asJsonObject.entrySet().joinToString(", ") { "${it.key}: ${elementToString(it.value)}" }
            else -> element.toString()
        }
    }

    companion object {
        private const val EXTRA_TITLE = "extra_title"
        private const val EXTRA_ENDPOINT = "extra_endpoint"
        private const val EXTRA_DESCRIPTION = "extra_description"

        fun intentFor(context: Context, title: String, endpoint: String, description: String): Intent {
            return Intent(context, AcademicDetailActivity::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ENDPOINT, endpoint)
                putExtra(EXTRA_DESCRIPTION, description)
            }
        }
    }
}
