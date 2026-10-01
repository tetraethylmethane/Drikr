package expo.modules.dronelink.core

import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Keeps camera frames while the drone holds at a mission waypoint, at most one
 * per [intervalS]. Port of turbodrone's `utils/lw_pro_capture.py`: the DG600C's
 * camera is only reachable as its 720p JPEG stream, so a "photo" is a kept
 * frame. Writes `<time_ms>_wp<NN>.jpg` plus `index.csv`
 * (time_ms, waypoint, latitude, longitude, altitude_m, file), the same format
 * as the laptop bridge.
 */
class HoverCapture(private val telemetry: Telemetry, private val clock: () -> Double, private val intervalS: Double = 1.0) {
    private var root: File? = null
    var sessionDir: File? = null; private set
    private var index: FileWriter? = null
    private var last = Double.NEGATIVE_INFINITY
    var saved = 0; private set

    fun start(dir: File?) { root = dir }

    fun close() {
        try { index?.close() } catch (_: Exception) {}
        index = null; root = null
    }

    fun onFrame(jpeg: ByteArray): File? {
        val r = root ?: return null
        if (!telemetry.hasFix() || !telemetry.hover || telemetry.waypoint == 0) return null
        val now = clock()
        if (now - last < intervalS) return null
        if (index == null) {
            try {
                val dir = File(r, SimpleDateFormat("'flight-'yyyyMMdd-HHmmss", Locale.US).format(Date((now * 1000).toLong())))
                dir.mkdirs()
                index = FileWriter(File(dir, "index.csv")).also { it.write("time_ms,waypoint,latitude,longitude,altitude_m,file\n") }
                sessionDir = dir
            } catch (e: Exception) { root = null; return null }
        }
        val timeMs = (now * 1000).toLong()
        val name = "%d_wp%02d.jpg".format(Locale.US, timeMs, telemetry.waypoint)
        val file = File(sessionDir, name)
        try { file.writeBytes(jpeg) } catch (e: Exception) { return null }
        index!!.write("%d,%d,%.7f,%.7f,%s,%s\n".format(Locale.US, timeMs, telemetry.waypoint,
            telemetry.latitude ?: 0.0, telemetry.longitude ?: 0.0, telemetry.altitudeM?.toString() ?: "", name))
        index!!.flush()
        last = now
        saved++
        return file
    }

    /** A file in this session, or null. Refuses anything path-like. */
    fun photo(name: String): File? {
        val dir = sessionDir ?: return null
        if (!NAME.matches(name)) return null
        return File(dir, name).takeIf { it.isFile }
    }

    companion object { val NAME = Regex("^\\d{10,16}_wp\\d{2}\\.jpg$") }
}
