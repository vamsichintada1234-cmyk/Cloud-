package com.glowwall.app;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;

/** Hosts the Glowwall web app and lets it set the phone's wallpaper directly. */
public class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/index.html";
    private static final int BG = Color.rgb(13, 12, 18);

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new Bridge(), "GlowwallNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Keep the app on its own page; send any other link to the browser.
                Uri uri = req.getUrl();
                if (START_URL.equals(uri.toString())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Let the page close an open preview or sheet first; leave the app only when nothing is open.
        web.evaluateJavascript("window.__glowwallBack ? window.__glowwallBack() : false", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }

    private class Bridge {
        /** Physical screen size in pixels as "shortSide,longSide". */
        @JavascriptInterface
        public String screenSize() {
            int w, h;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Rect b = getWindowManager().getMaximumWindowMetrics().getBounds();
                w = b.width();
                h = b.height();
            } else {
                DisplayMetrics m = new DisplayMetrics();
                getWindowManager().getDefaultDisplay().getRealMetrics(m);
                w = m.widthPixels;
                h = m.heightPixels;
            }
            return Math.min(w, h) + "," + Math.max(w, h);
        }

        /** Sets a base64-encoded image as the wallpaper. target is "home", "lock" or "both". */
        @JavascriptInterface
        public String setWallpaper(String base64, String target) {
            Bitmap bmp = null;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bmp == null) return "error: image could not be decoded";
                int flags;
                if ("home".equals(target)) flags = WallpaperManager.FLAG_SYSTEM;
                else if ("lock".equals(target)) flags = WallpaperManager.FLAG_LOCK;
                else flags = WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK;
                WallpaperManager.getInstance(MainActivity.this).setBitmap(bmp, null, true, flags);
                return "ok";
            } catch (Exception e) {
                return "error: " + e.getMessage();
            } finally {
                if (bmp != null) bmp.recycle();
            }
        }

        /** Saves a base64-encoded PNG to Pictures/Glowwall in the phone's gallery. */
        @JavascriptInterface
        public String saveImage(String base64, String filename) {
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Glowwall");
            Uri uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return "error: gallery unavailable";
            try (OutputStream out = cr.openOutputStream(uri)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
                return "ok";
            } catch (Exception e) {
                cr.delete(uri, null, null);
                return "error: " + e.getMessage();
            }
        }
    }
}
