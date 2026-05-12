package com.schooln.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.google.gson.Gson
import com.schooln.config.Config
import com.schooln.network.api.AuthApi
import com.schooln.network.api.LoginRequest
import com.schooln.network.api.RegisterRequest
import com.schooln.network.createApiService
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(
    onAuthSuccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isRegister by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var institutionName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("student") }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Surface(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = if (isRegister) "Create account" else "Login",
                style = MaterialTheme.typography.headlineMedium
            )
            Text(
                text = "School Management System",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(24.dp))

            if (isRegister) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Full name") },
                    leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = institutionName,
                    onValueChange = { institutionName = it },
                    label = { Text("Institution name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                leadingIcon = { Icon(Icons.Filled.Mail, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            if (isRegister) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                RolePicker(role = role, onRoleChange = { role = it })
            }

            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            error?.let {
                Spacer(modifier = Modifier.height(12.dp))
                Text(text = it, color = MaterialTheme.colorScheme.error)
            }

            Spacer(modifier = Modifier.height(20.dp))
            Button(
                enabled = !isLoading,
                onClick = {
                    scope.launch {
                        isLoading = true
                        error = null
                        runCatching {
                            val authApi = createApiService<AuthApi>(context)
                            val response = if (isRegister) {
                                authApi.register(
                                    RegisterRequest(
                                        name = name.trim(),
                                        institutionName = institutionName.trim(),
                                        email = email.trim(),
                                        password = password,
                                        phone = phone.trim(),
                                        role = role
                                    )
                                )
                            } else {
                                authApi.login(LoginRequest(email = email.trim(), password = password))
                            }

                            if (!response.isSuccessful) {
                                throw IllegalStateException(response.errorBody()?.string() ?: "Request failed")
                            }

                            val body = response.body() ?: throw IllegalStateException("Empty response")
                            val token = body.token ?: body.data?.token
                            val user = body.user ?: body.data?.user

                            if (token.isNullOrBlank() || user == null) {
                                throw IllegalStateException(body.message ?: "Invalid server response")
                            }

                            saveAuth(context, token, user)
                            onAuthSuccess()
                        }.onFailure {
                            error = it.message ?: "Authentication failed"
                        }
                        isLoading = false
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text(if (isRegister) "Register" else "Login")
                }
            }

            TextButton(onClick = {
                isRegister = !isRegister
                error = null
            }) {
                Text(if (isRegister) "Already have an account? Login" else "Need an account? Register")
            }
        }
    }
}

@Composable
private fun RolePicker(role: String, onRoleChange: (String) -> Unit) {
    val roles = listOf(
        "student" to "Student",
        "parent" to "Parent",
        "subject_teacher" to "Teacher",
        "staff" to "Staff",
        "head" to "Institution Head"
    )
    Column(modifier = Modifier.fillMaxWidth()) {
        Text("Role", style = MaterialTheme.typography.labelLarge)
        Spacer(modifier = Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            roles.take(3).forEach { (value, label) ->
                FilterChip(
                    selected = role == value,
                    onClick = { onRoleChange(value) },
                    label = { Text(label) }
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            roles.drop(3).forEach { (value, label) ->
                FilterChip(
                    selected = role == value,
                    onClick = { onRoleChange(value) },
                    label = { Text(label) }
                )
            }
        }
    }
}

private fun saveAuth(context: Context, token: String, user: Any) {
    context.getSharedPreferences(Config.PREFERENCE_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(Config.TOKEN_KEY, token)
        .putString(Config.USER_KEY, Gson().toJson(user))
        .apply()
}
