package com.sunrisemotel.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.firebase.messaging.FirebaseMessaging
import java.net.URL
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * WebView-only wrapper for https://sunrise-motel.vercel.app.
 * No booking logic lives here — every change on the website shows in the app automatically.
 * Website URL lives in exactly one place: BuildConfig.BASE_URL (app/build.gradle.kts).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var offlineView: LinearLayout

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_SunriseMotel)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        offlineView = findViewById(R.id.offlineView)
        findViewById<Button>(R.id.retryButton).setOnClickListener { loadHome() }

        // FIX: pull-to-refresh must ONLY fire at the very top of the page.
        // Otherwise scrolling up mid-page freezes into endless refreshes.
        swipeRefresh.setDistanceToTriggerSync(300)
        swipeRefresh.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 }
        webView.viewTreeObserver.addOnScrollChangedListener {
            swipeRefresh.isEnabled = webView.scrollY == 0
        }

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.settings.userAgentString = webView.settings.userAgentString + " SunriseMotelApp/1.0"

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("tel:") || url.startsWith("mailto:") ||
                    url.startsWith("sms:") || url.startsWith("smsto:") ||
                    url.startsWith("whatsapp:") || url.contains("wa.me") ||
                    url.startsWith("intent:")
                ) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (_: Exception) {
                    }
                    return true
                }
                return false
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
                offlineView.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView, url: String) {
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false
                swipeRefresh.isEnabled = webView.scrollY == 0
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    offlineView.visibility = View.VISIBLE
                    swipeRefresh.isRefreshing = false
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    val intent = params.createIntent()
                    @Suppress("DEPRECATION")
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST)
                    true
                } catch (_: Exception) {
                    filePathCallback = null
                    false
                }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                callback.invoke(origin, false, false)
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                fullscreenView = view
                fullscreenCallback = callback
                (window.decorView as ViewGroup).addView(
                    view, FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
            }

            override fun onHideCustomView() {
                fullscreenView?.let { (window.decorView as ViewGroup).removeView(it) }
                fullscreenView = null
                fullscreenCallback?.onCustomViewHidden()
            }
        }

        swipeRefresh.setOnRefreshListener { webView.reload() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (fullscreenView != null) {
                    webView.webChromeClient?.onHideCustomView()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("Exit Sunrise Motel?")
                        .setMessage("Close the app?")
                        .setPositiveButton("Exit") { _, _ -> finish() }
                        .setNegativeButton("Stay", null)
                        .show()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadHome()
        }

        // Additive services: push permission + topic + update check.
        startAppServices()
    }

    private fun loadHome() {
        offlineView.visibility = View.GONE
        webView.loadUrl(BuildConfig.BASE_URL)
    }

    // ADDITIVE: version check + push permission + FCM topic subscribe.
    // Booking/WebView logic above is untouched.
    private fun startAppServices() {
        // Android 13+ needs an explicit notification permission ask.
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIF_PERMISSION_REQUEST)
        }
        // Join the broadcast topic so /admin/notifications reaches this device.
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("all_users")
        } catch (e: Exception) {
            Log.w("SunriseApp", "FCM unavailable (google-services.json missing?): ${e.message}")
        }
        checkForAppUpdate()
    }

    // Polls the site's version truth once per launch; prompts when the
    // installed versionCode is older. Never blocks page loads.
    private fun checkForAppUpdate() {
        thread {
            try {
                val conn = URL(BuildConfig.BASE_URL.trimEnd('/') + "/api/version").openConnection()
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                val body = conn.getInputStream().bufferedReader().readText()
                val json = JSONObject(body)
                val remoteCode = json.optInt("latestVersionCode", BuildConfig.VERSION_CODE)
                if (remoteCode <= BuildConfig.VERSION_CODE) return@thread
                val name = json.optString("latestVersionName", "")
                val apkUrl = json.optString("apkUrl", "")
                val force = json.optBoolean("forceUpdate", false)
                val notes = json.optJSONArray("whatsNew")?.let { arr ->
                    (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
                } ?: emptyList()
                runOnUiThread { showUpdateDialog(name, apkUrl, force, notes) }
            } catch (e: Exception) {
                Log.w("SunriseApp", "Version check failed: ${e.message}")
            }
        }
    }

    private fun showUpdateDialog(versionName: String, apkUrl: String, force: Boolean, notes: List<String>) {
        val message = buildString {
            if (notes.isEmpty()) {
                append("Please update to keep booking smoothly.")
            } else {
                append("What's improved:\n")
                notes.forEach { append("\n• ").append(it) }
            }
        }
        val builder = AlertDialog.Builder(this)
            .setTitle("New Update Available - v$versionName")
            .setMessage(message)
            .setPositiveButton("Update Now") { _, _ ->
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)))
                } catch (_: Exception) {
                }
                if (force) finish()
            }
        if (force) {
            builder.setCancelable(false)
        } else {
            builder.setNegativeButton("Later", null)
        }
        builder.show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Used for the file chooser on older APIs")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val results: Array<Uri>? = if (resultCode == RESULT_OK && data != null) {
                val clip = data.clipData
                when {
                    clip != null -> Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                    data.data != null -> arrayOf(data.data!!)
                    else -> null
                }
            } else null
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 1001
        private const val NOTIF_PERMISSION_REQUEST = 1002
    }
}
