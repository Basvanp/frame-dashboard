package dev.framedashboard.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

/** Full-screen, always-awake WebView on the hosted dashboard. */
public class MainActivity extends Activity {

    private static final long RETRY_MS = 30_000;
    private static final long RELOAD_MS = 6 * 60 * 60 * 1000L; // pick up new deploys

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;

    private final Runnable reload = new Runnable() {
        @Override
        public void run() {
            web.loadUrl(BuildConfig.DASHBOARD_URL);
            handler.postDelayed(this, RELOAD_MS);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (BuildConfig.DASHBOARD_URL.isEmpty()) {
            TextView msg = new TextView(this);
            msg.setText("No dashboard URL. Run `npm run shell:config` and rebuild the APK.");
            msg.setTextColor(Color.LTGRAY);
            msg.setTextSize(24);
            msg.setPadding(96, 96, 96, 96);
            setContentView(msg);
            return;
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0x15, 0x13, 0x0f));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false; // stay inside the app
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Boot races the network on most sticks. Try again shortly.
                if (request.isForMainFrame()) {
                    handler.postDelayed(() -> view.loadUrl(BuildConfig.DASHBOARD_URL), RETRY_MS);
                }
            }
        });

        setContentView(web);
        web.requestFocus();
        handler.post(reload);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    // D-pad centre on some remotes arrives as DPAD_CENTER, which the page
    // doesn't see as Enter. Translate it.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (web != null && event.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER) {
            web.dispatchKeyEvent(new KeyEvent(event.getAction(), KeyEvent.KEYCODE_ENTER));
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
