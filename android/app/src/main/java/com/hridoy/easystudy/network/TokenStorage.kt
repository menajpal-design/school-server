package com.hridoy.easystudy.network

import com.hridoy.easystudy.storage.SessionManager

object TokenStorage {
    var token: String?
        get() = SessionManager.getToken()
        set(value) {
            if (value.isNullOrBlank()) {
                SessionManager.clearToken()
            } else {
                SessionManager.setToken(value)
            }
        }

    fun clear() {
        SessionManager.clearToken()
    }
}
