package expo.modules.dronelink.core

import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot

/**
 * Drone telemetry: decoding, latest state, waypoint/hover tagging, CSV log.
 * Port of turbodrone's `utils/lw_pro_telemetry.py`; field layouts come from
 * disassembling the LW Pro app's `liblewei_uartprotol` (see turbodrone's
 * docs/research/lw_pro.md). Position, altitude, satellites and battery were
 * confirmed against a real DG600C outdoors on 2026-09-27.
 *
 * The CSV has the same columns as the laptop bridge's log, so the app's join
 * code reads either without caring which one produced it.
 */
class Telemetry(private val clock: () -> Double) {
    // Latest values; null until the frame carrying them has been seen.
    var latitude: Double? = null; private set
    var longitude: Double? = null; private set
    var altitudeM: Double? = null; private set
    var speedMs: Double? = null; private set
    var vspeedMs: Double? = null; private set
    var distanceHomeM: Double? = null; private set
    var yawDeg: Double? = null; private set
    var gpsSats: Int? = null; private set
    var gpsFine: Boolean? = null; private set
    var gpsAccuracy: Int? = null; private set
    var batteryPct: Int? = null; private set
    var batteryRaw: Int? = null; private set
    var flyState: String? = null; private set
    var hover = false; private set
    var waypoint = 0; private set

    private var longRange = false
    private var distShort: Double? = null
    private var distLong: Double? = null
    private val seen = HashMap<Int, Double>()

    /** Waypoints to tag against: (1-based index, lat, lon). */
    var waypointProvider: () -> List<Triple<Int, Double, Double>> = { emptyList() }

    // --- log ---
    private var logDir: File? = null
    private var logFile: File? = null
    private var writer: FileWriter? = null
    private var lastLog = Double.NEGATIVE_INFINITY
    var logRows = 0; private set

    fun startLog(dir: File?) { logDir = dir }
    fun logFile(): File? { writer?.flush(); return logFile }

    fun close() {
        try { writer?.close() } catch (_: Exception) {}
        writer = null; logDir = null
    }

    // ------------------------------------------------------------------ //
    fun onFrame(type: Int, body: ByteArray) {
        when (type) {
            0x8B -> if (body.size >= 12) decode8b(body) else return
            0x8C -> if (body.size >= 13) decode8c(body) else return
            0x8F -> if (body.size >= 7) decode8f(body) else return
            else -> return
        }
        val now = clock()
        seen[type] = now
        distanceHomeM = if (longRange) distLong else distShort
        if (type == 0x8C) { updateWaypoint(); logRow(now) }
    }

    /** parseHYGPSFlyinfo1: battery %, satellites, GPS-good flag, heading, lock state. */
    private fun decode8b(b: ByteArray) {
        val w = Packets.le64(b, 4)
        batteryPct = bits(w, 31, 7).toInt()
        gpsSats = bits(w, 58, 5).toInt()
        gpsFine = bits(w, 63, 1) == 1L
        yawDeg = Packets.le16(b, 4).toShort() / 100.0
        var s = bits(w, 43, 2).toInt()
        if (bits(w, 55, 1) == 1L) s = 9
        if (bits(w, 56, 1) == 1L) s = 8
        flyState = if (s == 3) "unknown" else FLY_STATES.getOrElse(s) { "state_$s" }
    }

    /** parseHYGPSFlyinfo2: position and motion. Longitude first, as in waypoint frames. */
    private fun decode8c(b: ByteArray) {
        longitude = Packets.le32(b, 0).toInt() / Packets.GPS_SCALE
        latitude = Packets.le32(b, 4).toInt() / Packets.GPS_SCALE
        val w = Packets.le32(b, 8)
        altitudeM = (bits(w, 0, 12) - 1000) / 10.0
        distShort = bits(w, 12, 13) / 10.0
        speedMs = bits(w, 25, 7) / 10.0
        vspeedMs = b[12] / 10.0
    }

    /** parseHYGPSFlyinfo3B: battery raw, GPS accuracy, long-range distance. */
    private fun decode8f(b: ByteArray) {
        val w = Packets.le64(b, 0)
        batteryRaw = bits(w, 10, 12).toInt()
        gpsAccuracy = bits(w, 22, 10).toInt()
        longRange = bits(w, 40, 1) == 1L
        distLong = bits(w, 41, 13).toDouble()
    }

    fun hasFix(): Boolean = gpsFine == true && latitude.let { it != null && it != 0.0 } && longitude.let { it != null && it != 0.0 }

    /** Unlocked and off the ground: the only state a mission may start in. */
    fun airborne(): Boolean = (altitudeM ?: 0.0) > AIRBORNE_ALT_M && flyState != null && flyState != "locked"

    fun stale(): Boolean { val now = clock(); return seen.isEmpty() || seen.values.all { now - it > STALE_AFTER_S } }

    private fun updateWaypoint() {
        val fix = hasFix()
        hover = fix && (speedMs ?: 99.0) < HOVER_SPEED_MS && (altitudeM ?: 0.0) > AIRBORNE_ALT_M
        waypoint = 0
        if (!fix) return
        var best = WAYPOINT_RADIUS_M
        for ((i, la, lo) in waypointProvider()) {
            val d = distanceM(latitude!!, longitude!!, la, lo)
            if (d <= best) { best = d; waypoint = i }
        }
    }

    private fun logRow(now: Double) {
        val dir = logDir ?: return
        if (now - lastLog < LOG_MIN_INTERVAL_S) return
        if (writer == null) {
            try {
                dir.mkdirs()
                val f = File(dir, SimpleDateFormat("'flight-'yyyyMMdd-HHmmss'.csv'", Locale.US).format(Date((now * 1000).toLong())))
                writer = FileWriter(f)
                logFile = f
                writer!!.write(LOG_FIELDS.joinToString(",") + "\n")
            } catch (e: Exception) { logDir = null; return }
        }
        val cells = listOf(
            (now * 1000).toLong().toString(),
            "%.7f".format(Locale.US, latitude ?: 0.0), "%.7f".format(Locale.US, longitude ?: 0.0),
            num(altitudeM), num(speedMs), num(vspeedMs), num(distanceHomeM), num(yawDeg),
            gpsSats?.toString() ?: "", if (gpsFine == true) "1" else "0", gpsAccuracy?.toString() ?: "",
            batteryPct?.toString() ?: "", if (hover) "1" else "0", waypoint.toString(), flyState ?: "",
        )
        writer!!.write(cells.joinToString(",") + "\n")
        lastLog = now
        logRows++
        if (logRows % 25 == 0) writer!!.flush()
    }

    private fun num(v: Double?) = v?.toString() ?: ""

    companion object {
        val LOG_FIELDS = listOf(
            "time_ms", "latitude", "longitude", "altitude_m", "speed_ms", "vspeed_ms",
            "distance_home_m", "yaw_deg", "gps_sats", "gps_fine", "gps_accuracy",
            "battery_pct", "hover", "waypoint", "fly_state",
        )
        /** FlyInfo.FlySate, in the order the app maps it to the struct's state field. */
        val FLY_STATES = listOf(
            "locked", "unlocked", "unlocked_takeoff", "out_of_control", "one_key_home",
            "two_key_home", "returning_home", "low_power_landing", "landing", "taking_off",
            "calibrating", "error",
        )
        const val LOG_MIN_INTERVAL_S = 0.2
        const val STALE_AFTER_S = 3.0
        /** Half the scout spacing, so a photo is tagged with the spot it is over, not a neighbour. */
        const val WAYPOINT_RADIUS_M = 2.5
        const val HOVER_SPEED_MS = 0.5
        const val AIRBORNE_ALT_M = 1.0

        fun bits(v: Long, lo: Int, width: Int): Long = (v ushr lo) and ((1L shl width) - 1)

        fun distanceM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val k = PI / 180.0
            val x = (lon2 - lon1) * k * cos((lat1 + lat2) * k / 2.0)
            val y = (lat2 - lat1) * k
            return hypot(x, y) * 6_371_000.0
        }
    }
}
