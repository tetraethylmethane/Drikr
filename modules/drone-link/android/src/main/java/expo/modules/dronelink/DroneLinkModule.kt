package expo.modules.dronelink

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.os.Build
import android.util.Base64
import expo.modules.dronelink.core.FlightFiles
import expo.modules.dronelink.core.Mission
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS face of the phone-side drone link. Every command returns null on success
 * or a sentence saying why it was refused, which the app shows as-is.
 */
class DroneLinkModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

    override fun definition() = ModuleDefinition {
        Name("DroneLink")

        /** Start the foreground service and the link. The phone must be on the drone's WiFi. */
        Function("start") {
            if (DroneLinkService.engine != null) return@Function true
            DroneLinkService.lastError = null
            val intent = Intent(context, DroneLinkService::class.java).setAction(DroneLinkService.ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
            true
        }

        Function("stop") {
            context.stopService(Intent(context, DroneLinkService::class.java))
        }

        Function("status") {
            DroneLinkService.engine?.status()?.plus("running" to true)
                ?: mapOf("running" to false, "connected" to false, "error" to DroneLinkService.lastError)
        }

        // Not `engine?.x() ?: ...`: a successful command returns null, which
        // the elvis would turn into "not running".
        Function("takeoff") { command { it.takeoff() } }
        Function("land") { command { it.land() } }
        Function("hover") { command { it.hover() } }
        Function("returnHome") { command { it.returnHome() } }
        Function("startMission") { command { it.startMission() } }

        /** One button: take off, photograph a rows x cols grid of spots spacingM apart, land. */
        Function("startScout") { rows: Int, cols: Int, spacingM: Double ->
            command { it.startScout(rows, cols, spacingM) }
        }
        Function("cancelScout") { command { it.cancelScout() } }

        /** points: [{latitude, longitude, altitudeM, speedMs, stayS}] */
        Function("uploadMission") { points: List<Map<String, Any?>> ->
            val engine = DroneLinkService.engine ?: return@Function "The drone link is not running"
            val wps = points.map {
                Mission.Waypoint(
                    latitude = (it["latitude"] as Number).toDouble(),
                    longitude = (it["longitude"] as Number).toDouble(),
                    altitudeM = (it["altitudeM"] as? Number)?.toDouble() ?: 10.0,
                    speedMs = (it["speedMs"] as? Number)?.toDouble() ?: 2.0,
                    stayS = (it["stayS"] as? Number)?.toDouble() ?: 0.0,
                )
            }
            engine.uploadMission(wps)
        }

        /** dir: 1 down, 2 up, 0 stop; held for ms (max 5 s). */
        Function("tiltCamera") { dir: Int, ms: Int ->
            DroneLinkService.engine?.tiltCamera(dir, ms) != null
        }

        // --- The last flight's files, readable after the link has stopped. ---
        Function("readFlightLog") { FlightFiles(DroneLinkService.dataDir(context)).latestLog()?.readText() }

        Function("readPhotoIndex") {
            FlightFiles(DroneLinkService.dataDir(context)).latestPhotoDir()?.let { java.io.File(it, "index.csv") }
                ?.takeIf { it.isFile }?.readText()
        }

        Function("readPhotoBase64") { name: String ->
            FlightFiles(DroneLinkService.dataDir(context)).photo(name)?.readBytes()?.let { Base64.encodeToString(it, Base64.NO_WRAP) }
        }

        /**
         * Route this app's traffic (including fetch) over WiFi even though the
         * WiFi has no internet. Needed to reach the AS7343 pod at 192.168.4.1,
         * which Android would otherwise send over mobile data.
         */
        Function("bindProcessToWifi") { enable: Boolean ->
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            if (!enable) { cm.bindProcessToNetwork(null); return@Function true }
            val wifi = DroneLinkService.wifiNetwork(context) ?: return@Function false
            cm.bindProcessToNetwork(wifi)
        }
    }

    private inline fun command(block: (expo.modules.dronelink.core.LinkEngine) -> String?): String? {
        val engine = DroneLinkService.engine ?: return "The drone link is not running"
        return block(engine)
    }
}
