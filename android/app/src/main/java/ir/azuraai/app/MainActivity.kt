package ir.azuraai.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import com.getcapacitor.BridgeActivity

/**
 * The Azura app shell.
 *
 * A thin host for the Capacitor WebView plus the native launch animation. The
 * splash overlay is added *on top of* the bridge rather than replacing it, so
 * the web app can load and hydrate while the mark is still playing — the
 * hand-off is then invisible instead of a black flash.
 */
class MainActivity : BridgeActivity() {

    private var splash: AzuraSplashView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Remote WebView debugging (chrome://inspect) — debug builds only, so
        // release builds keep the WebView closed.
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        installSplash()
    }

    private fun installSplash() {
        val root = findViewById<ViewGroup>(android.R.id.content) ?: return
        val view = AzuraSplashView(this).apply {
            // The overlay owns its own plate. Without this the window behind it
            // can flash white before the WebView paints its zinc background.
            setBackgroundColor(Color.parseColor("#09090B"))
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ).apply { gravity = Gravity.CENTER }
        }
        root.addView(view)
        splash = view
    }

    /**
     * Dismisses the splash. Called by the web layer once React has painted, so
     * we never reveal a blank WebView. Falls back to a timer so a failed or
     * slow load can never leave the user stuck on the mark.
     */
    @Suppress("unused")
    fun hideSplash() {
        splash?.dismiss()
        splash = null
    }

    override fun onStart() {
        super.onStart()
        // Safety net: never leave the overlay up longer than this, whatever
        // the web layer reports.
        splash?.postDelayed({ hideSplash() }, SPLASH_MAX_MS)
    }

    override fun onDestroy() {
        splash = null
        super.onDestroy()
    }

    private companion object {
        const val SPLASH_MAX_MS = 2600L
    }
}