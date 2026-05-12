package com.hridoy.easystudy

import android.app.Application
import com.hridoy.easystudy.storage.SessionManager

class EasyStudyApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Initialize SessionManager
        SessionManager.init(this)
    }
}
