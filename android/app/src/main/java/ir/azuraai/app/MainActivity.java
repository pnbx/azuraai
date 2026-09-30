package ir.azuraai.app;

import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onStart() {
    super.onStart();
    // Remote WebView debugging (chrome://inspect) — debug builds only.
    // Release builds keep debugging disabled so the app is store-safe.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }
  }
}
