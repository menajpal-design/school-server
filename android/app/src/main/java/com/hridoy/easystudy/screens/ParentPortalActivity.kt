package com.hridoy.easystudy.screens

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
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

class ParentPortalActivity : AppCompatActivity() {
    private lateinit var progressBar: ProgressBar
    private lateinit var recyclerView: RecyclerView
    private lateinit var backButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_parent_portal)

        progressBar = findViewById(R.id.progressBar)
        recyclerView = findViewById(R.id.recyclerView)
        backButton = findViewById(R.id.backButton)
        recyclerView.layoutManager = LinearLayoutManager(this)

        loadParentData()
        backButton.setOnClickListener { finish() }
    }

    private fun loadParentData() {
        progressBar.visibility = View.VISIBLE
        RetrofitClient.api.getParent().enqueue(object : Callback<JsonObject> {
            override fun onResponse(call: Call<JsonObject>, response: Response<JsonObject>) {
                progressBar.visibility = View.GONE
                if (response.isSuccessful && response.body() != null) {
                    val items = mutableListOf<SimpleItem>()
                    response.body()?.entrySet()?.forEach { 
                        items.add(SimpleItem(it.key, it.value.asString)) 
                    }
                    if (items.isEmpty()) items.add(SimpleItem("Parent Portal", "Your child's information"))
                    recyclerView.adapter = SimpleAdapter(items)
                }
            }

            override fun onFailure(call: Call<JsonObject>, t: Throwable) {
                progressBar.visibility = View.GONE
                Toast.makeText(this@ParentPortalActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }
}
