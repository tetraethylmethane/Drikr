package expo.modules.dronelink.core

/**
 * Waypoint upload / run state machine. Port of turbodrone's
 * `utils/lw_pro_mission.py`, flown on the DG600C on 2026-09-27.
 *
 * The flight controller takes one waypoint frame at a time and acknowledges it
 * with telemetry `58 84 <index>`; the current index is re-sent every 200 ms
 * until then. Once the last point is acknowledged the mission is READY, and
 * start() raises the pointFly flag in every stick frame.
 *
 * Not thread-safe on its own: LinkEngine calls it under its lock. The clock is
 * injected so tests can drive time.
 */
class Mission(private val clock: () -> Double) {
    enum class State(val wire: String) { IDLE("idle"), UPLOADING("uploading"), READY("ready"), FLYING("flying"), FAILED("failed") }

    data class Waypoint(val latitude: Double, val longitude: Double, val altitudeM: Double = 10.0, val speedMs: Double = 2.0, val stayS: Double = 0.0)

    var state = State.IDLE
        private set
    var waypoints: List<Waypoint> = emptyList()
        private set
    var sendIndex = 0
        private set
    var ackedIndex = -1
        private set
    var error: String? = null
        private set

    private var lastSend = Double.NEGATIVE_INFINITY
    private var uploadStarted = 0.0

    fun load(points: List<Waypoint>) {
        require(points.isNotEmpty()) { "a mission needs at least one waypoint" }
        require(points.size <= Packets.HY_MAX_WAYPOINTS) { "at most ${Packets.HY_MAX_WAYPOINTS} waypoints are supported" }
        // Build every frame up front so bad values fail here, not mid-upload.
        points.forEachIndexed { i, w -> Packets.buildHyWaypoint(i, w.latitude, w.longitude, w.altitudeM, w.speedMs, w.stayS) }
        waypoints = points.toList()
        state = State.UPLOADING
        sendIndex = 0; ackedIndex = -1; error = null
        lastSend = Double.NEGATIVE_INFINITY
        uploadStarted = clock()
    }

    /** The waypoint frame to send on this tick, or null. */
    fun pendingFrame(): ByteArray? {
        if (state != State.UPLOADING) return null
        val now = clock()
        if (now - uploadStarted > UPLOAD_TIMEOUT_S) { fail("flight controller did not acknowledge the waypoints"); return null }
        if (now - lastSend < RESEND_INTERVAL_S) return null
        val w = waypoints[sendIndex]
        lastSend = now
        return Packets.buildHyWaypoint(sendIndex, w.latitude, w.longitude, w.altitudeM, w.speedMs, w.stayS)
    }

    fun onTelemetry(type: Int, body: ByteArray) {
        if (type != Packets.HY_RX_POINT_ACK || body.isEmpty() || state != State.UPLOADING) return
        val acked = body[0].toInt() and 0xFF
        if (acked < sendIndex) return            // stale ACK for a point already passed
        ackedIndex = acked
        uploadStarted = clock()
        if (acked >= waypoints.size - 1) state = State.READY
        else { sendIndex = acked + 1; lastSend = Double.NEGATIVE_INFINITY }
    }

    fun start(): Boolean {
        if (state != State.READY) return false
        state = State.FLYING
        return true
    }

    fun abort() {
        state = State.IDLE
        sendIndex = 0; ackedIndex = -1
        lastSend = Double.NEGATIVE_INFINITY
    }

    fun fail(reason: String) { state = State.FAILED; error = reason }

    val pointFly get() = state == State.FLYING

    /** 1-based (index, lat, lon) to tag positions against, once the FC holds the mission. */
    fun tagPoints(): List<Triple<Int, Double, Double>> =
        if (state == State.READY || state == State.FLYING) waypoints.mapIndexed { i, w -> Triple(i + 1, w.latitude, w.longitude) } else emptyList()

    companion object {
        const val RESEND_INTERVAL_S = 0.2
        const val UPLOAD_TIMEOUT_S = 15.0
    }
}
