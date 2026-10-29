package com.refcut.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/** Runs the RefCut Node.js server (bundled in assets/nodeapp) inside the app process. */
final class NodeRunner {
    static final int PORT = 18573;
    private static final String TAG = "RefCut";
    private static boolean started;

    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    private static native int startNode(String[] argv);

    /** Starts Node once per process; it keeps running for the life of the app. */
    static synchronized void start(Context ctx) {
        if (started) return;
        started = true;
        Context app = ctx.getApplicationContext();
        new Thread(null, () -> {
            try {
                File dir = new File(app.getFilesDir(), "nodeapp");
                extractIfUpdated(app, dir);
                File data = new File(app.getFilesDir(), "projects");
                data.mkdirs();
                Os.setenv("PORT", String.valueOf(PORT), true);
                Os.setenv("HOST", "127.0.0.1", true);
                Os.setenv("REFCUT_DATA", data.getAbsolutePath(), true);
                Os.setenv("FFMPEG", app.getApplicationInfo().nativeLibraryDir + "/libffmpeg.so", true);
                Os.setenv("REFCUT_NO_FFPROBE", "1", true);
                Os.setenv("TMPDIR", app.getCacheDir().getAbsolutePath(), true);
                Os.setenv("HOME", app.getFilesDir().getAbsolutePath(), true);
                int code = startNode(new String[]{"node", new File(dir, "server.js").getAbsolutePath()});
                Log.e(TAG, "Node exited with code " + code);
            } catch (Exception e) {
                Log.e(TAG, "Could not start Node", e);
            }
        }, "node", 16 * 1024 * 1024).start();
    }

    /** Blocks until the server accepts connections (or the timeout passes). */
    static boolean waitUntilReady(long timeoutMs) {
        long end = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < end) {
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress("127.0.0.1", PORT), 300);
                return true;
            } catch (IOException e) {
                try { Thread.sleep(200); } catch (InterruptedException ie) { return false; }
            }
        }
        return false;
    }

    // Re-copy the web app whenever the APK is updated.
    private static void extractIfUpdated(Context ctx, File dir) throws Exception {
        PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
        SharedPreferences prefs = ctx.getSharedPreferences("refcut", Context.MODE_PRIVATE);
        if (dir.exists() && prefs.getLong("assetsFrom", 0) == pi.lastUpdateTime) return;
        deleteRecursive(dir);
        copyAssets(ctx.getAssets(), "nodeapp", dir);
        prefs.edit().putLong("assetsFrom", pi.lastUpdateTime).apply();
    }

    private static void copyAssets(AssetManager am, String path, File dest) throws IOException {
        String[] children = am.list(path);
        if (children == null || children.length == 0) {
            dest.getParentFile().mkdirs();
            try (InputStream in = am.open(path); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        dest.mkdirs();
        for (String c : children) copyAssets(am, path + "/" + c, new File(dest, c));
    }

    private static void deleteRecursive(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        f.delete();
    }
}
