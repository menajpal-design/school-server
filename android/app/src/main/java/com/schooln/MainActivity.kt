package com.schooln

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.schooln.config.Config
import com.schooln.ui.theme.SchoolManagementTheme

class MainActivity : ComponentActivity() {
    private var webView: WebView? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        filePathCallback?.onReceiveValue(uris.toTypedArray())
        filePathCallback = null
    }

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        // Requested permissions at startup
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set premium status bar and navigation bar styling
        window.statusBarColor = android.graphics.Color.parseColor("#1E1B4B") // Deep indigo matching sidebar
        window.navigationBarColor = android.graphics.Color.parseColor("#1E1B4B")
        
        // Ensure status/navigation icons are colored appropriately (white icons on dark bar)
        val controller = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false

        // Request camera and notification permissions at startup for a smooth user experience
        val permissionsToRequest = mutableListOf(android.Manifest.permission.CAMERA)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            permissionsToRequest.add(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissionsLauncher.launch(permissionsToRequest.toTypedArray())

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val currentWebView = webView
                if (currentWebView?.canGoBack() == true) {
                    currentWebView.goBack()
                } else {
                    finish()
                }
            }
        })

        setContent {
            SchoolManagementTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    SchoolWebsiteApp(
                        onWebViewReady = { webView = it },
                        onPermissionRequest = { request ->
                            handleWebViewPermissionRequest(request)
                        },
                        onChooseFile = { callback ->
                            filePathCallback?.onReceiveValue(null)
                            filePathCallback = callback
                            fileChooserLauncher.launch("*/*")
                        }
                    )
                }
            }
        }
    }

    private fun handleWebViewPermissionRequest(request: PermissionRequest) {
        request.grant(request.resources)
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        super.onDestroy()
    }
}

@Composable
private fun SchoolWebsiteApp(
    onWebViewReady: (WebView) -> Unit,
    onPermissionRequest: (PermissionRequest) -> Unit,
    onChooseFile: (ValueCallback<Array<Uri>>) -> Unit
) {
    var loadingProgress by remember { mutableStateOf(0) }
    var isOffline by remember { mutableStateOf(false) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        if (isOffline) {
            OfflineScreen(
                onRetry = {
                    isOffline = false
                    loadingProgress = 0
                    webViewInstance?.reload()
                }
            )
        } else {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    val webView = createSchoolWebView(
                        context = context,
                        onProgressChanged = { progress ->
                            loadingProgress = progress
                        },
                        onErrorReceived = { offline ->
                            isOffline = offline
                        },
                        onPermissionRequest = onPermissionRequest,
                        onChooseFile = onChooseFile
                    ).also {
                        webViewInstance = it
                        onWebViewReady(it)
                    }
                    
                    androidx.swiperefreshlayout.widget.SwipeRefreshLayout(context).apply {
                        setOnRefreshListener {
                            webView.reload()
                            isRefreshing = false
                        }
                        
                        // Style the refresh spinner to match brand colors
                        setColorSchemeColors(
                            android.graphics.Color.parseColor("#6366F1"), // Indigo
                            android.graphics.Color.parseColor("#EC4899")  // Pink
                        )
                        
                        addView(webView)
                    }
                },
                update = { swipeRefreshLayout ->
                    val webView = swipeRefreshLayout.getChildAt(0) as? WebView
                    webView?.setOnScrollChangeListener { _, _, scrollY, _, _ ->
                        swipeRefreshLayout.isEnabled = scrollY == 0
                    }
                }
            )
            
            // Linear Progress Indicator at the top
            if (loadingProgress in 1..99) {
                LinearProgressIndicator(
                    progress = loadingProgress / 100f,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .align(Alignment.TopCenter),
                    color = Color(0xFF6366F1), // Premium Indigo
                    trackColor = Color(0x1F6366F1)
                )
            }
        }
    }
}

@Composable
private fun OfflineScreen(onRetry: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC)), // Slate-50 background
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.WifiOff,
                contentDescription = "No Connection",
                modifier = Modifier
                    .size(80.dp)
                    .background(Color(0xFFFEE2E2), shape = RoundedCornerShape(40.dp))
                    .padding(16.dp),
                tint = Color(0xFFEF4444) // Rose-500 tint
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Text(
                text = "সংযোগ বিচ্ছিন্ন!",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E293B) // Slate-800
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "আপনার ফোনে কোনো internet সংযোগ নেই। দয়া করে ওয়াই-ফাই বা মোবাইল ডেটা চেক করে আবার চেষ্টা করুন।",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF64748B), // Slate-500
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                lineHeight = 22.sp
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF6366F1), // Indigo-500
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text(
                    text = "আবার চেষ্টা করুন",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun createSchoolWebView(
    context: Context,
    onProgressChanged: (Int) -> Unit,
    onErrorReceived: (Boolean) -> Unit,
    onPermissionRequest: (PermissionRequest) -> Unit,
    onChooseFile: (ValueCallback<Array<Uri>>) -> Unit
): WebView {
    val startUrl = Config.WEB_APP_URL

    return WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadsImagesAutomatically = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.userAgentString = "${settings.userAgentString} EasySchoolAndroid"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                view.loadUrl(request.url.toString())
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                onErrorReceived(false)
                onProgressChanged(0)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                onProgressChanged(100)
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    onErrorReceived(true)
                }
            }
        }

        webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                onPermissionRequest(request)
            }

            override fun onProgressChanged(view: WebView, newProgress: Int) {
                onProgressChanged(newProgress)
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                onChooseFile(filePathCallback)
                return true
            }
        }

        setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimeType)
                .addRequestHeader("User-Agent", userAgent)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                .setTitle(fileName)

            val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            Toast.makeText(context, "Download started", Toast.LENGTH_SHORT).show()
        }

        loadUrl(startUrl)
    }
}
