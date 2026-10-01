package expo.modules.dronelink

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import expo.modules.dronelink.core.LinkEngine
import java.io.File

/**
 * Foreground service that owns the drone link.
 *
 * The link must keep sending 25 frames a second for the whole flight. A plain
 * JS timer stops when the screen locks or the app is backgrounded; a
 * foreground service with a partial wake lock and a WiFi lock does not. If the
 * service itself dies, the drone stops hearing from the phone and falls back
 * on its own link-loss behaviour, which is the manufacturer's failsafe.
 *
 * The notification carries Hover and Land, so the flight can be stopped from
 * the lock screen without opening the app.
 */
class DroneLinkService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            updateNotification()
            handler.postDelayed(this, 2000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HOVER -> { engine?.hover(); return START_NOT_STICKY }
            ACTION_LAND -> { engine?.land(); return START_NOT_STICKY }
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
        }

        ensureChannel()
        val notification = buildNotification("Connecting to the drone...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        if (engine == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Drikr:DroneLink").apply { acquire(MAX_FLIGHT_SESSION_MS) }
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            wifiLock = wm.createWifiLock(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "Drikr:DroneLink"
            ).apply { acquire() }

            val wifi = wifiNetwork(this)
            val link = LinkEngine(
                dataDir = dataDir(this),
                socketFactory = { port -> LinkEngine.openSocket(port).also { s -> wifi?.bindSocket(s) } },
            )
            try {
                link.start()
                engine = link
            } catch (e: Exception) {
                lastError = e.message ?: e.toString()
                stopSelf()
                return START_NOT_STICKY
            }
        }
        handler.removeCallbacks(ticker)
        handler.post(ticker)
        // Not sticky: restarting a link to an aircraft on its own after the
        // system killed us would be a surprise, not a recovery.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        engine?.stop()
        engine = null
        try { wakeLock?.release() } catch (_: Exception) {}
        try { wifiLock?.release() } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun updateNotification() {
        val s = engine?.status() ?: return
        @Suppress("UNCHECKED_CAST")
        val t = s["telemetry"] as Map<String, Any?>
        val text = if (s["connected"] == true)
            "${t["fly_state"] ?: "?"} · ${t["battery_pct"] ?: "?"}% battery · ${t["gps_sats"] ?: 0} sats" +
                ((t["waypoint"] as? Int)?.takeIf { it > 0 }?.let { " · at stop $it" } ?: "")
        else "No signal from the drone - is the phone on its WiFi?"
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Drone link", NotificationManager.IMPORTANCE_LOW))
            }
        }
    }

    private fun action(action: String, code: Int): PendingIntent =
        PendingIntent.getService(this, code, Intent(this, DroneLinkService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun buildNotification(text: String): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("Drikr drone link")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Hover", action(ACTION_HOVER, 1)).build())
            .addAction(Notification.Action.Builder(null, "Land", action(ACTION_LAND, 2)).build())
            .addAction(Notification.Action.Builder(null, "Disconnect", action(ACTION_STOP, 3)).build())
            .build()
    }

    companion object {
        const val CHANNEL_ID = "drikr-drone-link"
        const val NOTIFICATION_ID = 4711
        const val ACTION_START = "expo.modules.dronelink.START"
        const val ACTION_HOVER = "expo.modules.dronelink.HOVER"
        const val ACTION_LAND = "expo.modules.dronelink.LAND"
        const val ACTION_STOP = "expo.modules.dronelink.STOP"
        /** Upper bound on the wake lock, so a forgotten session cannot drain the phone. */
        const val MAX_FLIGHT_SESSION_MS = 60L * 60L * 1000L

        @Volatile var engine: LinkEngine? = null
            private set
        @Volatile var lastError: String? = null

        fun dataDir(context: Context) = File(context.filesDir, "drone")

        /** The WiFi network, whether or not Android considers it the default. */
        @Suppress("DEPRECATION")
        fun wifiNetwork(context: Context): Network? {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            return cm.allNetworks.firstOrNull { cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
        }
    }
}
