package com.refcut.app;

import android.util.Log;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.ReturnCode;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;

/**
 * Android has no ffmpeg program the Node server can spawn, so this runs ffmpeg commands with FFmpegKit and
 * serves them on 127.0.0.1 (see runBridge in app/lib/ff.js). A per-launch token keeps other apps out.
 *
 * POST /run {"args": [...]} → "P <ms>\n" progress lines, then "E <escaped log>\n" and "X <exit code>\n".
 */
final class FfmpegBridge {
    private static final String TAG = "RefCutFfmpeg";
    static int port;
    static String token;

    static synchronized void start() throws IOException {
        if (port != 0) return;
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        token = sb.toString();
        ServerSocket ss = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        port = ss.getLocalPort();
        Thread t = new Thread(() -> {
            while (true) {
                try {
                    Socket s = ss.accept();
                    new Thread(() -> handle(s), "ffmpeg-req").start();
                } catch (IOException e) {
                    Log.e(TAG, "accept failed", e);
                }
            }
        }, "ffmpeg-bridge");
        t.setDaemon(true);
        t.start();
    }

    private static void handle(Socket s) {
        try (Socket sock = s) {
            InputStream in = sock.getInputStream();
            String head = readHead(in);
            int len = 0;
            String tok = "";
            for (String line : head.split("\r\n")) {
                int c = line.indexOf(':');
                if (c < 0) continue;
                String k = line.substring(0, c).trim().toLowerCase(Locale.ROOT), v = line.substring(c + 1).trim();
                if (k.equals("content-length")) len = Integer.parseInt(v);
                if (k.equals("x-token")) tok = v;
            }
            byte[] body = new byte[len];
            for (int off = 0; off < len; ) {
                int n = in.read(body, off, len - off);
                if (n < 0) throw new IOException("short body");
                off += n;
            }
            OutputStream out = sock.getOutputStream();
            if (!head.startsWith("POST /run ") || !token.equals(tok)) {
                out.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                return;
            }
            JSONArray a = new JSONObject(new String(body, StandardCharsets.UTF_8)).getJSONArray("args");
            String[] args = new String[a.length()];
            for (int i = 0; i < args.length; i++) args[i] = a.getString(i);

            out.write("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            CountDownLatch finished = new CountDownLatch(1);
            FFmpegSession session = FFmpegKit.executeWithArgumentsAsync(args, x -> finished.countDown(), null, stats -> {
                synchronized (out) {
                    try {
                        out.write(("P " + (long) stats.getTime() + "\n").getBytes(StandardCharsets.UTF_8));
                        out.flush();
                    } catch (IOException ignored) {
                        // client went away; the command still finishes
                    }
                }
            });
            finished.await();
            ReturnCode rc = session.getReturnCode();
            String logs = session.getAllLogsAsString(5000);
            synchronized (out) {
                out.write(("E " + escape(logs == null ? "" : logs) + "\n").getBytes(StandardCharsets.UTF_8));
                out.write(("X " + (rc == null ? -1 : rc.getValue()) + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (Exception e) {
            Log.e(TAG, "request failed", e);
        }
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int state = 0, c;
        while ((c = in.read()) >= 0) {
            buf.write(c);
            // stop after \r\n\r\n
            state = (c == '\r' && (state == 0 || state == 2)) ? state + 1 : (c == '\n' && (state == 1 || state == 3)) ? state + 1 : 0;
            if (state == 4) break;
            if (buf.size() > 16384) throw new IOException("header too large");
        }
        return buf.toString("UTF-8");
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\r", "").replace("\n", "\\n");
    }
}
