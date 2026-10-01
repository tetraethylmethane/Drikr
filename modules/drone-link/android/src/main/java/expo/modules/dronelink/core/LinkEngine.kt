package expo.modules.dronelink.core

import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException

/**
 * The phone's replacement for the turbodrone laptop: one UDP link to the
 * drone that keeps it alive, carries commands and waypoints, decodes its
 * telemetry, and keeps hover photos.
 *
 * Two threads:
 *  - rx: telemetry (-> Telemetry, Mission ACKs) and video (-> HoverCapture);
 *  - tx: every 40 ms (25 Hz, as the stock app) one stick frame, or the pending
 *    waypoint frame instead; a heartbeat once a second.
 *
 * The sticks are always centred. This link never pilots the aircraft: it holds
 * the connection open, and the flight controller flies its own GPS takeoff,
 * landing and waypoint mission. Commands are one-shot flag pulses, held for
 * [PULSE_FRAMES] frames because a single UDP datagram can be lost.
 *
 * Pure Kotlin + java.net so it runs (and is tested against a fake drone) on a
 * plain JVM. Android supplies [socketFactory] to bind the socket to the WiFi
 * network, which Android would otherwise route around because the drone's
 * WiFi has no internet.
 */
class LinkEngine(
    private val dataDir: File?,
    private val droneHost: String = DEFAULT_DRONE_HOST,
    private val dronePort: Int = DEFAULT_DRONE_PORT,
    private val localPort: Int = DEFAULT_LOCAL_PORT,
    private val socketFactory: (Int) -> DatagramSocket = { port -> openSocket(port) },
    val clock: () -> Double = { System.currentTimeMillis() / 1000.0 },
) {
    private val lock = Object()
    val telemetry = Telemetry(clock)
    val mission = Mission(clock)
    val capture = HoverCapture(telemetry, clock)
    private val assembler = Packets.FrameAssembler()

    private var socket: DatagramSocket? = null
    private var droneAddr: InetAddress? = null
    @Volatile private var running = false
    private var rxThread: Thread? = null
    private var txThread: Thread? = null

    private val pulses = ArrayDeque<IntArray>()       // [flags9 bits, frames left]
    private var hoverLeft = 0
    private var tiltState = 0                         // 0 none, 1 down, 2 up
    private var tiltUntil = 0.0
    private var lastHeartbeat = Double.NEGATIVE_INFINITY

    @Volatile var lastRx = 0.0; private set
    @Volatile var framesOk = 0; private set
    @Volatile var txFrames = 0; private set
    var onPhoto: ((File) -> Unit)? = null

    init {
        telemetry.waypointProvider = { mission.tagPoints() }
    }

    // ------------------------------------------------------------------ //
    fun start() {
        if (running) return
        val s = socketFactory(localPort)
        s.soTimeout = 1000
        s.receiveBufferSize = 4 shl 20
        socket = s
        droneAddr = InetAddress.getByName(droneHost)
        dataDir?.let { telemetry.startLog(File(it, "flight_logs")); capture.start(File(it, "photos")) }
        running = true
        lastRx = clock()
        rxThread = Thread(::rxLoop, "DroneLinkRx").apply { isDaemon = true; start() }
        txThread = Thread(::txLoop, "DroneLinkTx").apply { isDaemon = true; start() }
    }

    fun stop() {
        running = false
        try { socket?.close() } catch (_: Exception) {}
        rxThread?.join(1500); txThread?.join(1500)
        synchronized(lock) { telemetry.close(); capture.close() }
    }

    val isRunning get() = running

    /** Heard from the drone recently. */
    fun connected(): Boolean = running && framesOk + telemetryFrames > 0 && clock() - lastRx < LINK_TIMEOUT_S

    @Volatile private var telemetryFrames = 0

    // ------------------------------------------------------------------ //
    // Commands. Each returns null on success or a reason it was refused.
    // ------------------------------------------------------------------ //
    fun takeoff(): String? = synchronized(lock) {
        if (!connected()) return "Not connected to the drone"
        if (!telemetry.hasFix()) return "No GPS fix yet (${telemetry.gpsSats ?: 0} satellites)"
        if ((telemetry.batteryPct ?: 0) < MIN_TAKEOFF_BATTERY) return "Battery ${telemetry.batteryPct}% is below $MIN_TAKEOFF_BATTERY%"
        // A mission left FLYING puts pointFly in every frame, which stops the
        // drone unlocking - seen on the DG600C on 2026-09-27.
        if (mission.state == Mission.State.FLYING) mission.abort()
        pulses.clear()
        pulses.addLast(intArrayOf(Packets.HY9_UNLOCK, PULSE_FRAMES))
        pulses.addLast(intArrayOf(Packets.HY9_TAKEOFF, PULSE_FRAMES))
        null
    }

    fun land(): String? = synchronized(lock) {
        if (!connected()) return "Not connected to the drone"
        mission.abort()
        pulses.clear()
        pulses.addLast(intArrayOf(Packets.HY9_LAND, PULSE_FRAMES))
        null
    }

    /** Cancel the mission and hold position (the stock app's cancel button). */
    fun hover(): String? = synchronized(lock) {
        mission.abort()
        hoverLeft = PULSE_FRAMES
        null
    }

    fun returnHome(): String? = synchronized(lock) {
        if (!connected()) return "Not connected to the drone"
        mission.abort()
        pulses.clear()
        pulses.addLast(intArrayOf(Packets.HY9_RETURN_HOME, PULSE_FRAMES))
        null
    }

    fun uploadMission(points: List<Mission.Waypoint>): String? = synchronized(lock) {
        if (!connected()) return "Not connected to the drone"
        if (!telemetry.hasFix()) return "The drone has no GPS fix; waypoints are refused without one"
        try { mission.load(points); null } catch (e: IllegalArgumentException) { e.message }
    }

    fun startMission(): String? = synchronized(lock) {
        if (!telemetry.airborne()) return "Take off first (state ${telemetry.flyState}, altitude ${telemetry.altitudeM} m)"
        if (!mission.start()) return "Mission is not ready (state ${mission.state.wire})"
        null
    }

    /** Hold the camera tilt for [ms] (dir: TILT_DOWN, TILT_UP, TILT_STOP). */
    fun tiltCamera(dir: Int, ms: Int) = synchronized(lock) {
        tiltState = dir.coerceIn(0, 2)
        tiltUntil = clock() + ms.coerceIn(0, 5000) / 1000.0
    }

    // ------------------------------------------------------------------ //
    // Scout: one button flies a small grid of spots around the drone,
    // photographs each with the camera pointed down, and lands.
    //
    // Small on purpose: the DG600C's WiFi drops beyond a few tens of metres,
    // and it accepts only 8 stops per mission (seen 2026-09-29). Runs from the
    // tx loop, so it keeps going with the screen off. On any problem it hovers
    // and says why in plain words; a failed takeoff lands instead.
    //
    // A spot counts only when the drone holds within SCOUT_REACH_M of *that*
    // spot, in order: at 5 m spacing the nearest-waypoint tag alone cannot
    // tell neighbours apart. A spot it never gets close to is skipped once it
    // is clearly holding at the next one. Same logic as the laptop scout that
    // flew 6 of 8 spots on 2026-09-29.
    // ------------------------------------------------------------------ //
    enum class ScoutPhase(val wire: String) {
        IDLE("idle"), TAKING_OFF("taking_off"), SETTLING("settling"), UPLOADING("uploading"),
        FLYING("flying"), LANDING("landing"), DONE("done"), FAILED("failed"), CANCELLED("cancelled"),
    }

    var scoutPhase = ScoutPhase.IDLE; private set
    var scoutMessage: String? = null; private set
    var scoutSpots: List<Pair<Double, Double>> = emptyList(); private set
    /** Per spot: null = not yet, true = photographed, false = missed. */
    private var scoutResult = ArrayList<Boolean?>()
    private var scoutNext = 0
    private var scoutArrive = 0.0
    private var scoutSince = 0.0
    private var scoutRows = 2
    private var scoutCols = 4
    private var scoutSpacingM = 5.0
    private var scoutAltM = 5.0
    private var scoutHoldS = 5.0
    private var scoutLinkLostSince = 0.0

    val scoutReached get() = scoutResult.count { it == true }
    private val scoutTotal get() = scoutRows * scoutCols
    private val scoutActive
        get() = scoutPhase in setOf(ScoutPhase.TAKING_OFF, ScoutPhase.SETTLING, ScoutPhase.UPLOADING, ScoutPhase.FLYING, ScoutPhase.LANDING)

    fun startScout(rows: Int = 2, cols: Int = 4, spacingM: Double = 5.0, altitudeM: Double = 5.0, holdS: Double = 5.0): String? = synchronized(lock) {
        if (scoutActive) return "Scouting is already running."
        if (!connected()) return "The phone is not connected to the drone. Join the drone WiFi, then tap Connect."
        if (!telemetry.hasFix()) return "The drone is still finding its location (${telemetry.gpsSats ?: 0} satellites). Keep it in the open for a minute."
        if ((telemetry.batteryPct ?: 0) < SCOUT_MIN_BATTERY) return "Drone battery is ${telemetry.batteryPct}%. Charge it to at least $SCOUT_MIN_BATTERY% first."
        if (rows < 1 || cols < 1 || rows * cols > MAX_MISSION_STOPS) return "This drone can visit at most $MAX_MISSION_STOPS spots per flight."
        scoutRows = rows
        scoutCols = cols
        scoutSpacingM = spacingM.coerceIn(2.0, 20.0)
        scoutAltM = altitudeM.coerceIn(3.0, 20.0)
        scoutHoldS = holdS.coerceIn(2.0, 15.0)
        scoutSpots = emptyList()
        scoutResult = ArrayList()
        scoutNext = 0
        scoutArrive = 0.0
        scoutLinkLostSince = 0.0
        if (telemetry.airborne()) {
            setScout(ScoutPhase.SETTLING, "Getting ready in the air")
            tiltCamera(TILT_DOWN, SCOUT_TILT_MS)
        } else {
            takeoff()?.let { return it }
            setScout(ScoutPhase.TAKING_OFF, "Taking off")
        }
        null
    }

    fun cancelScout(): String? = synchronized(lock) {
        if (!scoutActive) return "Scouting is not running."
        hover()
        setScout(ScoutPhase.CANCELLED, "Stopped. The drone is waiting in the air - tap Land.")
        null
    }

    private fun setScout(p: ScoutPhase, msg: String) {
        scoutPhase = p
        scoutMessage = msg
        scoutSince = clock()
    }

    private fun scoutFail(msg: String, landToo: Boolean = false) {
        if (landToo) land() else if (telemetry.airborne()) hover()
        setScout(ScoutPhase.FAILED, msg)
    }

    private fun distTo(i: Int): Double {
        val lat = telemetry.latitude ?: return Double.MAX_VALUE
        val lon = telemetry.longitude ?: return Double.MAX_VALUE
        if (!telemetry.hasFix()) return Double.MAX_VALUE
        val (a, b) = scoutSpots[i]
        return Telemetry.distanceM(lat, lon, a, b)
    }

    /** Called under [lock] every tx tick. */
    private fun scoutTick(now: Double) {
        if (!scoutActive) return
        if (!connected()) {
            if (scoutLinkLostSince == 0.0) scoutLinkLostSince = now
            if (now - scoutLinkLostSince > SCOUT_LINK_LOSS_S) {
                setScout(ScoutPhase.FAILED, "Lost connection to the drone. Move closer to it - it will handle this by itself.")
            }
            return
        }
        scoutLinkLostSince = 0.0
        val age = now - scoutSince
        when (scoutPhase) {
            ScoutPhase.TAKING_OFF ->
                if (telemetry.airborne()) {
                    setScout(ScoutPhase.SETTLING, "Rising and pointing the camera down")
                    tiltCamera(TILT_DOWN, SCOUT_TILT_MS)
                } else if (age > SCOUT_TAKEOFF_TIMEOUT_S) {
                    scoutFail("The drone could not take off, so it is landing. Check the propellers and try again.", landToo = true)
                }
            ScoutPhase.SETTLING -> if (age >= SCOUT_SETTLE_S) {
                val lat = telemetry.latitude
                val lon = telemetry.longitude
                if (!telemetry.hasFix() || lat == null || lon == null) {
                    scoutFail("The drone lost its location. It is waiting in the air - tap Land.")
                    return
                }
                // Serpentine: rows go north, columns east, from where it hovers.
                val dLat = scoutSpacingM / 111_320.0
                val dLon = scoutSpacingM / (111_320.0 * Math.cos(Math.toRadians(lat)))
                val spots = ArrayList<Pair<Double, Double>>()
                for (r in 0 until scoutRows) {
                    val cs = if (r % 2 == 0) 0 until scoutCols else (scoutCols - 1 downTo 0)
                    for (c in cs) spots.add(lat + r * dLat to lon + c * dLon)
                }
                try {
                    mission.load(spots.map { (a, b) -> Mission.Waypoint(a, b, scoutAltM, SCOUT_SPEED_MS, scoutHoldS) })
                } catch (e: IllegalArgumentException) {
                    scoutFail("Could not plan the spots (${e.message}). The drone is waiting in the air - tap Land.")
                    return
                }
                scoutSpots = spots
                scoutResult = ArrayList<Boolean?>().apply { repeat(spots.size) { add(null) } }
                setScout(ScoutPhase.UPLOADING, "Planning ${spots.size} spots")
            }
            ScoutPhase.UPLOADING -> when (mission.state) {
                Mission.State.READY ->
                    if (mission.start()) setScout(ScoutPhase.FLYING, "Flying to spot 1 of $scoutTotal")
                    else scoutFail("The drone would not start. It is waiting in the air - tap Land.")
                Mission.State.FAILED -> scoutFail("The drone did not accept the plan. It is waiting in the air - tap Land.")
                else -> if (age > SCOUT_UPLOAD_TIMEOUT_S) scoutFail("The drone did not accept the plan in time. It is waiting in the air - tap Land.")
            }
            ScoutPhase.FLYING -> {
                val n = scoutSpots.size
                val k = scoutNext
                if (k < n) {
                    val holding = telemetry.hover && distTo(k) <= SCOUT_REACH_M
                    if (scoutArrive == 0.0 && !holding && k + 1 < n && telemetry.hover && distTo(k + 1) <= SCOUT_REACH_M) {
                        scoutResult[k] = false                        // never got close; it has moved on
                        scoutNext++
                        scoutMessage = "At spot ${scoutNext + 1} of $n - taking photos"
                        return
                    }
                    if (holding && scoutArrive == 0.0) {
                        scoutArrive = now
                        scoutResult[k] = true
                        scoutMessage = "At spot ${k + 1} of $n - taking photos"
                    }
                    if (scoutArrive > 0.0 && (!holding || now - scoutArrive >= scoutHoldS)) {
                        scoutNext++
                        scoutArrive = 0.0
                        if (scoutNext < n) scoutMessage = "Flying to spot ${scoutNext + 1} of $n"
                    }
                }
                if (scoutNext >= n) {
                    land()
                    setScout(ScoutPhase.LANDING, "All spots done - landing")
                } else if (age > SCOUT_FLY_TIMEOUT_PER_SPOT_S * n + 60) {
                    scoutFail("Took too long ($scoutReached of $n spots done). The drone is waiting in the air - tap Land.")
                }
            }
            ScoutPhase.LANDING ->
                if (telemetry.flyState == "locked") setScout(ScoutPhase.DONE, "Done! $scoutReached of ${scoutSpots.size} spots photographed.")
                else if (age > SCOUT_LAND_TIMEOUT_S) setScout(ScoutPhase.FAILED, "Landing not confirmed. Check the drone.")
            else -> {}
        }
    }

    fun scoutStatus(): Map<String, Any?> = mapOf(
        "phase" to scoutPhase.wire, "message" to scoutMessage, "active" to scoutActive,
        "reached" to scoutReached, "total" to (if (scoutSpots.isEmpty()) scoutTotal else scoutSpots.size),
        "spots" to scoutSpots.mapIndexed { i, (a, b) ->
            mapOf("spot" to i + 1, "latitude" to a, "longitude" to b,
                "result" to when (scoutResult.getOrNull(i)) { true -> "photographed"; false -> "missed"; else -> "pending" })
        },
    )

    // ------------------------------------------------------------------ //
    fun status(): Map<String, Any?> = synchronized(lock) {
        val t = telemetry
        mapOf(
            "connected" to connected(),
            "linkAgeMs" to ((clock() - lastRx) * 1000).toLong(),
            "videoFrames" to framesOk,
            "photos" to capture.saved,
            "mission" to mapOf(
                "state" to mission.state.wire, "waypoints" to mission.waypoints.size,
                "uploaded" to mission.ackedIndex + 1, "error" to mission.error,
            ),
            "telemetry" to mapOf(
                "latitude" to t.latitude, "longitude" to t.longitude, "altitude_m" to t.altitudeM,
                "speed_ms" to t.speedMs, "vspeed_ms" to t.vspeedMs, "distance_home_m" to t.distanceHomeM,
                "yaw_deg" to t.yawDeg, "gps_sats" to t.gpsSats, "gps_fine" to t.gpsFine, "gps_fix" to t.hasFix(),
                "gps_accuracy" to t.gpsAccuracy, "battery_pct" to t.batteryPct, "battery_raw" to t.batteryRaw,
                "fly_state" to t.flyState, "hover" to t.hover, "waypoint" to t.waypoint,
                "airborne" to t.airborne(), "stale" to t.stale(), "log_rows" to t.logRows,
            ),
            "scout" to scoutStatus(),
        )
    }

    // ------------------------------------------------------------------ //
    private fun rxLoop() {
        val buf = ByteArray(65535)
        val pkt = DatagramPacket(buf, buf.size)
        while (running) {
            try {
                pkt.setData(buf, 0, buf.size)
                socket?.receive(pkt) ?: break
            } catch (_: SocketTimeoutException) { continue } catch (_: Exception) { if (!running) break else continue }
            lastRx = clock()
            try { handle(buf, pkt.length) } catch (_: Exception) { /* one bad datagram must not end the link */ }
        }
    }

    private fun handle(d: ByteArray, len: Int) {
        when (Packets.envelopeType(d, len)) {
            Packets.TYPE_VIDEO -> {
                val chunk = Packets.parseVideoChunk(d, len) ?: return
                val jpeg = synchronized(lock) { assembler.push(chunk) } ?: return
                framesOk++
                val saved = synchronized(lock) { capture.onFrame(jpeg) }
                if (saved != null) onPhoto?.invoke(saved)
            }
            Packets.TYPE_UART_RX -> {
                val frames = Packets.hyFrames(d, Packets.ENVELOPE_LEN, len)
                synchronized(lock) {
                    for ((type, body) in frames) {
                        telemetryFrames++
                        mission.onTelemetry(type, body)
                        telemetry.onFrame(type, body)
                    }
                }
            }
        }
    }

    private fun txLoop() {
        var next = System.nanoTime()
        while (running) {
            try {
                val now = clock()
                if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_S) { send(Packets.HEARTBEAT); lastHeartbeat = now }
                send(Packets.wrapUart(nextFrame(now)))
                txFrames++
            } catch (_: Exception) { /* socket being replaced or closed */ }
            next += TX_PERIOD_NS
            val sleep = (next - System.nanoTime()) / 1_000_000
            if (sleep > 0) Thread.sleep(sleep) else next = System.nanoTime()
        }
    }

    /** The waypoint frame when one is due, else the stick frame with current flags. */
    fun nextFrame(now: Double): ByteArray = synchronized(lock) {
        scoutTick(now)
        mission.pendingFrame()?.let { return it }

        var flags9 = 0
        pulses.firstOrNull()?.let { p ->
            flags9 = p[0]
            if (p[1] <= 1) pulses.removeFirst() else p[1]--
        }
        var flags8 = 0
        if (hoverLeft > 0) { hoverLeft--; flags8 = flags8 or Packets.HY8_HOVER }
        var flags10 = 0
        if (mission.pointFly) flags10 = flags10 or Packets.HY10_WAYPOINT
        if (now < tiltUntil) {
            // Reversed on the DG600C: the PTZ "positive" flag points the camera
            // DOWN (probed on the ground 2026-09-29: frames before/after).
            if (tiltState == TILT_DOWN) flags10 = flags10 or Packets.HY10_PTZ_V_POS
            else if (tiltState == TILT_UP) flags10 = flags10 or Packets.HY10_PTZ_V_NEG
        }
        Packets.buildHyControl(flags8 = flags8, flags9 = flags9, flags10 = flags10)
    }

    private fun send(bytes: ByteArray) {
        socket?.send(DatagramPacket(bytes, bytes.size, droneAddr, dronePort))
    }

    companion object {
        const val DEFAULT_DRONE_HOST = "192.168.0.1"
        const val DEFAULT_DRONE_PORT = 40000
        const val DEFAULT_LOCAL_PORT = 6000
        const val PULSE_FRAMES = 12
        const val HEARTBEAT_INTERVAL_S = 1.0
        const val TX_PERIOD_NS = 40_000_000L          // 25 Hz
        const val LINK_TIMEOUT_S = 3.0
        const val MIN_TAKEOFF_BATTERY = 30

        // Scout.
        /** The DG600C acknowledged only 8 of a 9-stop upload (2026-09-29). */
        const val MAX_MISSION_STOPS = 8
        const val SCOUT_MIN_BATTERY = 50
        const val SCOUT_SPEED_MS = 1.5
        const val SCOUT_SETTLE_S = 3.5
        const val SCOUT_TILT_MS = 3000
        /** Half the default spacing: closer to this spot than to any neighbour. */
        const val SCOUT_REACH_M = 2.5
        const val SCOUT_TAKEOFF_TIMEOUT_S = 25.0
        const val SCOUT_UPLOAD_TIMEOUT_S = 20.0
        const val SCOUT_FLY_TIMEOUT_PER_SPOT_S = 30.0
        const val SCOUT_LAND_TIMEOUT_S = 60.0
        const val SCOUT_LINK_LOSS_S = 5.0

        /** tiltCamera directions. */
        const val TILT_STOP = 0
        const val TILT_DOWN = 1
        const val TILT_UP = 2

        /** Port 6000 like the stock app; any free port if it is taken (the drone answers either). */
        fun openSocket(port: Int): DatagramSocket =
            try { DatagramSocket(null).apply { reuseAddress = true; bind(java.net.InetSocketAddress(port)) } }
            catch (_: Exception) { DatagramSocket() }
    }
}

/** The most recent flight's files, whether or not a link is running. */
class FlightFiles(private val dataDir: File) {
    fun latestLog(): File? = File(dataDir, "flight_logs").listFiles { f -> f.name.endsWith(".csv") }?.maxByOrNull { it.name }
    fun latestPhotoDir(): File? = File(dataDir, "photos").listFiles { f -> f.isDirectory }?.maxByOrNull { it.name }
    fun photo(name: String): File? {
        if (!HoverCapture.NAME.matches(name)) return null
        return latestPhotoDir()?.let { File(it, name) }?.takeIf { it.isFile }
    }
}
