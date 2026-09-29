package com.sunrisemotel.admin

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
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
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.io.File
import java.net.URL
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * The Sunrise Manager app: a WebView wrapper around the signed-in manager portal
 * (BuildConfig.BASE_URL + BuildConfig.START_PATH, i.e. /admin).
 *
 * Why a second app instead of the guest app: the person checking guests in at
 * 06:00 wants the arrivals board on the home screen, not the booking page they
 * would have to navigate to. Two applicationIds = two icons, two names, and
 * updates that never fight each other.
 *
 * No portal logic lives here. Every change deployed to the site appears in this
 * app the moment the page reloads — nothing to re-release.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var offlineView: LinearLayout

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var updateDownloadId: Long = -1L

    // Fires the system install prompt when our DownloadManager update finishes.
    // Same applicationId + same keystore signature = "Updating…", not a duplicate.
    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id != updateDownloadId) return
            try {
                val file = File(
                    getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    UPDATE_FILE
                )
                if (!file.exists()) return
                val contentUri = FileProvider.getUriForFile(
                    this@MainActivity, "$packageName.provider", file
                )
                val install = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(install)
            } catch (e: Exception) {
                Log.w(TAG, "Install prompt failed: ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "SunriseManager"
        private const val FILE_CHOOSER_REQUEST = 2001
        private const val PREFS = "sunrise_manager_prefs"
        private const val KEY_LAST_CHECK = "last_update_check"
        private const val UPDATE_FILE = "update.apk"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_SunriseManager)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        offlineView = findViewById(R.id.offlineView)
        findViewById<Button>(R.id.retryButton).setOnClickListener { loadPortal() }

        // Pull-to-refresh must ONLY fire at the very top of the page, otherwise
        // scrolling back up mid-page turns into endless refreshes.
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
        // Photo proof and room pictures are picked through the system chooser,
        // so the WebView only needs to hand the chosen file back to the page.
        settings.allowFileAccess = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        // The marker the rest of the site reads to know it is inside our app.
        settings.userAgentString = settings.userAgentString + " SunriseManagerApp/1.0"

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // Phone, mail and WhatsApp leave the WebView and open the real
                // app: a manager tapping a guest's number expects to dial.
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
                // Never silently continue past a bad certificate.
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
                // The manager portal uploads photos from here: hand the request to
                // the system picker and return whatever comes back.
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
                // The portal never needs location; refuse instead of prompting.
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
                        .setTitle("Exit Sunrise Manager?")
                        .setMessage("Leave the manager portal? Your sign-in stays in place for next time.")
                        .setPositiveButton("Exit") { _, _ -> finish() }
                        .setNegativeButton("Stay", null)
                        .show()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadPortal()
        }

        checkForAppUpdate()
    }

    private fun loadPortal() {
        offlineView.visibility = View.GONE
        webView.loadUrl(BuildConfig.BASE_URL.trimEnd('/') + BuildConfig.START_PATH)
    }

    // Polls the site's version truth at most once a day and prompts only when the
    // installed versionCode is older. `?app=admin` keeps this app on its own
    // release line: a manager build never gets told to install the guest APK.
    private fun checkForAppUpdate() {
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST_CHECK, 0)
        if (System.currentTimeMillis() - last < 24 * 60 * 60 * 1000L) return
        prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
        thread {
            try {
                val endpoint = BuildConfig.BASE_URL.trimEnd('/') + "/api/version?app=admin"
                val conn = URL(endpoint).openConnection()
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                val body = conn.getInputStream().bufferedReader().readText()
                val json = JSONObject(body)
                val remoteCode = json.optInt("latestVersionCode", BuildConfig.VERSION_CODE)
                if (remoteCode <= BuildConfig.VERSION_CODE) return@thread
                val name = json.optString("latestVersionName", "")
                val apkUrl = json.optString("apkUrl", "")
                if (apkUrl.isBlank()) return@thread
                val force = json.optBoolean("forceUpdate", false)
                val notes = json.optJSONArray("whatsNew")?.let { arr ->
                    (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
                } ?: emptyList()
                runOnUiThread { showUpdateDialog(name, apkUrl, force, notes) }
            } catch (e: Exception) {
                // Offline, cold cache, DNS hiccup — the portal still loads.
                Log.w(TAG, "Version check failed: ${e.message}")
            }
        }
    }

    private fun showUpdateDialog(versionName: String, apkUrl: String, force: Boolean, notes: List<String>) {
        val message = buildString {
            if (notes.isEmpty()) {
                append("Please update to keep the portal running smoothly.")
            } else {
                append("What's improved:\n")
                notes.forEach { append("\n• ").append(it) }
            }
        }
        val builder = AlertDialog.Builder(this)
            .setTitle("New Update Available - v$versionName")
            .setMessage(message)
            .setPositiveButton("Update Now") { _, _ ->
                startInAppUpdate(apkUrl)
                if (force) finish()
            }
        if (force) {
            builder.setCancelable(false)
        } else {
            builder.setNegativeButton("Later", null)
        }
        builder.show()
    }

    // DownloadManager fetches the APK into the app's own files dir, then
    // updateReceiver (top of this class) fires the system install prompt.
    private fun startInAppUpdate(apkUrl: String) {
        try {
            val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
                setTitle("Updating Sunrise Manager")
                setDescription("Downloading update…")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                setDestinationInExternalFilesDir(
                    this@MainActivity,
                    Environment.DIRECTORY_DOWNLOADS,
                    UPDATE_FILE
                )
                setMimeType("application/vnd.android.package-archive")
            }
            updateDownloadId = manager.enqueue(request)
            AlertDialog.Builder(this)
                .setTitle("Downloading update…")
                .setMessage("Keep the app open. The install prompt appears automatically.")
                .setPositiveButton("OK", null)
                .show()
        } catch (e: Exception) {
            Log.w(TAG, "In-app download failed, opening browser: ${e.message}")
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)))
            } catch (_: Exception) {
            }
        }
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

    override fun onResume() {
        super.onResume()
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(
                    updateReceiver,
                    IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    Context.RECEIVER_NOT_EXPORTED
                )
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                registerReceiver(updateReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
            }
        } catch (_: Exception) {
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            unregisterReceiver(updateReceiver)
        } catch (_: Exception) {
        }
        CookieManager.getInstance().flush()
    }
}