package ir.azuraai.app;

import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onStart() {
    super.onStart();
    // Remote WebView debugging (chrome://inspect) — debug builds only.
    // Detected via the application flag so it works whether or not the
    // project generates BuildConfig. Release builds keep debugging off.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      boolean isDebuggable =
          (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
      WebView.setWebContentsDebuggingEnabled(isDebuggable);
    }
  }
}
