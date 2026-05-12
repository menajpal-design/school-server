package com.hridoy.easystudy.screens

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.hridoy.easystudy.R
import com.hridoy.easystudy.adapter.SimpleAdapter
import com.hridoy.easystudy.model.SimpleItem
import com.hridoy.easystudy.network.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class AcademicActivity : AppCompatActivity() {

    private lateinit var progressBar: ProgressBar
    private lateinit var summaryText: TextView
    private lateinit var recyclerView: RecyclerView
    private lateinit var classesCount: TextView
    private lateinit var subjectsCount: TextView
    private lateinit var examsCount: TextView
    private lateinit var resultsCount: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_academic)

        progressBar = findViewById(R.id.progressBar)
        summaryText = findViewById(R.id.summaryText)
        recyclerView = findViewById(R.id.recyclerView)
        classesCount = findViewById(R.id.classesCount)
        subjectsCount = findViewById(R.id.subjectsCount)
        examsCount = findViewById(R.id.examsCount)
        resultsCount = findViewById(R.id.resultsCount)
        recyclerView.layoutManager = LinearLayoutManager(this)

        findViewById<Button>(R.id.classesButton).setOnClickListener {
            startActivity(AcademicDetailActivity.intentFor(this, "Classes", "classes", "Class structure, sections and teachers."))
        }
        findViewById<Button>(R.id.subjectsButton).setOnClickListener {
            startActivity(AcademicDetailActivity.intentFor(this, "Subjects", "subjects", "Subject catalog and assignments."))
        }
        findViewById<Button>(R.id.examsButton).setOnClickListener {
            startActivity(AcademicDetailActivity.intentFor(this, "Exams", "exams", "Exam routines and schedules."))
        }
        findViewById<Button>(R.id.resultsButton).setOnClickListener {
            startActivity(AcademicDetailActivity.intentFor(this, "Results", "results", "Result workflow and marks entry."))
        }
        findViewById<Button>(R.id.reportCardButton).setOnClickListener {
            startActivity(AcademicDetailActivity.intentFor(this, "Report Card", "report-card", "Student report card preview."))
        }

        loadAcademicOverview()
    }

    private fun loadAcademicOverview() {
        progressBar.visibility = View.VISIBLE
        RetrofitClient.api.getAcademic().enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (!response.isSuccessful || response.body() == null) {
                    Toast.makeText(this@AcademicActivity, "Failed to load academic data", Toast.LENGTH_SHORT).show()
                    return
                }

                val body = response.body()!!
                classesCount.text = countOrFallback(body, "classes", "classesCount")
                subjectsCount.text = countOrFallback(body, "subjects", "subjectsCount")
                examsCount.text = countOrFallback(body, "exams", "examsCount")
                resultsCount.text = countOrFallback(body, "results", "resultsCount")

                summaryText.text = "Live academic snapshot loaded from the server."
                recyclerView.adapter = SimpleAdapter(buildSummaryItems(body))
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                summaryText.text = "Using local fallback data."
                recyclerView.adapter = SimpleAdapter(
                    listOf(
                        SimpleItem("Academic overview", t.localizedMessage ?: "Network error"),
                        SimpleItem("Classes", "Open the classes screen to manage sections and teachers."),
                        SimpleItem("Subjects", "Open the subjects screen to manage curriculum.")
                    )
                )
            }
        })
    }

    private fun buildSummaryItems(body: JsonObject): List<SimpleItem> {
        val items = mutableListOf<SimpleItem>()
        body.entrySet().take(8).forEach { entry ->
            items.add(SimpleItem(entry.key, elementToString(entry.value)))
        }
        if (items.isEmpty()) {
            items.add(SimpleItem("Academic", "No summary fields available"))
        }
        return items
    }

    private fun countOrFallback(body: JsonObject, arrayKey: String, countKey: String): String {
        val array = body.getAsJsonArray(arrayKey)
        if (array != null) return array.size().toString()
        val count = body.get(countKey)
        return if (count != null && !count.isJsonNull) count.asString else "0"
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
}
