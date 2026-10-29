package com.refcut.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private static final String HOME = "http://127.0.0.1:" + NodeRunner.PORT + "/";
    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private String pendingDownload;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // renders can take a while; don't let the screen sleep while the app is open
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#0e0f13"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0e0f13"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !req.getUrl().toString().startsWith(HOME); // stay inside the app
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("video/*");
                startActivityForResult(Intent.createChooser(i, "Choose a video"), PICK_FILE);
                return true;
            }
        });
        web.setDownloadListener((url, ua, disposition, mime, length) -> download(url));

        web.loadDataWithBaseURL(null, "<html><body style='margin:0;background:#0e0f13;color:#9097a7;font-family:sans-serif;"
                + "display:flex;align-items:center;justify-content:center;height:100vh'>Starting RefCut…</body></html>", "text/html", "utf-8", null);
        NodeRunner.start(this);
        new Thread(() -> {
            boolean ok = NodeRunner.waitUntilReady(60000);
            runOnUiThread(() -> {
                if (ok) web.loadUrl(HOME);
                else web.loadDataWithBaseURL(null, "<body style='background:#0e0f13;color:#ff6b6b;font-family:sans-serif;padding:24px'>"
                        + "RefCut's engine did not start. Please close and reopen the app.</body>", "text/html", "utf-8", null);
            });
        }).start();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && pendingPick != null) {
            pendingPick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingPick = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // Save a rendered video into the phone's gallery (Movies/RefCut).
    private void download(String url) {
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = url;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 2);
            return;
        }
        Toast.makeText(this, "Saving video…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            String name = "RefCut-" + System.currentTimeMillis() + ".mp4";
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                try (InputStream in = c.getInputStream(); OutputStream out = openGalleryFile(name)) {
                    byte[] buf = new byte[256 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                toast("Saved to gallery: Movies/RefCut/" + name);
            } catch (Exception e) {
                toast("Could not save: " + e.getMessage());
            }
        }).start();
    }

    private OutputStream openGalleryFile(String name) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/RefCut");
            Uri uri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("gallery unavailable");
            return getContentResolver().openOutputStream(uri);
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "RefCut");
        dir.mkdirs();
        File f = new File(dir, name);
        return new FileOutputStream(f) {
            @Override
            public void close() throws java.io.IOException {
                super.close();
                MediaScannerConnection.scanFile(MainActivity.this, new String[]{f.getAbsolutePath()}, new String[]{"video/mp4"}, null);
            }
        };
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == 2 && pendingDownload != null) {
            String url = pendingDownload;
            pendingDownload = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) download(url);
            else toast("Storage permission is needed to save the video");
        }
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }
}
