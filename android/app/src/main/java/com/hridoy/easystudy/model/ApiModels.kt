package com.hridoy.easystudy.model

data class AuthRequest(
    val email: String,
    val password: String
)

data class SimpleItem(
    val title: String,
    val subtitle: String
)
