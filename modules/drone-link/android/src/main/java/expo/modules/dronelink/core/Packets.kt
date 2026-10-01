package expo.modules.dronelink.core

/**
 * Wire formats for Lewei "LW Pro" drones (Dynalog DR-DG600C).
 *
 * A direct port of turbodrone's `backend/utils/lw_pro_packets.py`, which was
 * reverse-engineered from the LW Pro 3.61 app and flown on the DG600C on
 * 2026-09-27. Byte layouts are documented in turbodrone's
 * `docs/research/lw_pro.md`; the unit tests use the same byte vectors as
 * turbodrone's, so the two implementations cannot drift apart silently.
 *
 * Pure Kotlin (no Android imports) so it compiles and tests on a plain JVM.
 *
 * Transport ("LW23" UDP, phone port 6000 <-> drone 192.168.0.1:40000):
 *
 *     63 63 TT 00 00 LL LL <payload>
 *
 * TT 0x01 heartbeat (both ways), 0x03 video chunk, 0x0a UART to the flight
 * controller, 0x0b UART from it. The flight controller speaks Lewei's HY GPS
 * protocol inside the UART payloads.
 */
object Packets {
    const val ENVELOPE_LEN = 7
    const val TYPE_HEARTBEAT = 0x01
    const val TYPE_VIDEO = 0x03
    const val TYPE_UART_TX = 0x0A
    const val TYPE_UART_RX = 0x0B

    const val VIDEO_HEADER_LEN = 0x36
    const val HY_RX_HEADER = 0x58
    const val HY_MAX_WAYPOINTS = 32
    const val GPS_SCALE = 10_000_000.0

    /** Telemetry type the flight controller uses to acknowledge a waypoint. */
    const val HY_RX_POINT_ACK = 0x84

    // Stick frame flag bits (app ControlPara bit -> wire bit).
    const val HY8_SPEED_HIGH = 0x10
    const val HY8_HEADLESS = 0x20
    const val HY8_HOVER = 0x80
    const val HY9_ACC_CALIBRATE = 0x01
    const val HY9_UNLOCK = 0x04
    const val HY9_TAKEOFF = 0x08
    const val HY9_LAND = 0x10
    const val HY9_RETURN_HOME = 0x20
    const val HY9_STOP = 0x40
    const val HY10_WAYPOINT = 0x02
    const val HY10_PTZ_V_NEG = 0x40
    const val HY10_PTZ_V_POS = 0x80
    const val HY11_JOYSTICK_ON = 0x01

    const val STICK_CENTER = 0x80
    const val DEFAULT_TRIM = 32

    /** Keeps the link (and the JPEG stream) alive; sent once a second. */
    val HEARTBEAT: ByteArray = bytes(0x63, 0x63, TYPE_HEARTBEAT, 0, 0, 0, 0)

    fun xor(data: ByteArray, from: Int = 0, to: Int = data.size): Int {
        var v = 0
        for (i in from until to) v = v xor (data[i].toInt() and 0xFF)
        return v
    }

    /** The 17-byte HY stick frame. Axes are raw bytes, centre 0x80. */
    fun buildHyControl(
        roll: Int = STICK_CENTER,
        pitch: Int = STICK_CENTER,
        throttle: Int = STICK_CENTER,
        yaw: Int = STICK_CENTER,
        flags8: Int = 0,
        flags9: Int = 0,
        flags10: Int = 0,
        flags11: Int = HY11_JOYSTICK_ON,
        aileronTrim: Int = DEFAULT_TRIM,
        elevatorTrim: Int = DEFAULT_TRIM,
    ): ByteArray {
        for (v in intArrayOf(roll, pitch, throttle, yaw)) require(v in 0..0xFF) { "axis out of range: $v" }
        val p = ByteArray(17)
        p[0] = 0x68; p[1] = 0x01; p[2] = 0x0D
        p[3] = roll.toByte(); p[4] = pitch.toByte(); p[5] = throttle.toByte(); p[6] = yaw.toByte()
        p[7] = ((aileronTrim and 0x3F) or ((elevatorTrim and 0x03) shl 6)).toByte()
        p[8] = (((elevatorTrim shr 2) and 0x0F) or (flags8 and 0xF0)).toByte()
        p[9] = (flags9 and 0xFF).toByte()
        p[10] = (flags10 and 0xFF).toByte()
        p[11] = (flags11 and 0xFF).toByte()
        p[16] = xor(p, 1, 16).toByte()
        return p
    }

    /**
     * One 16-byte waypoint upload frame. Resolution 0.1 m and 0.1 m/s; field
     * widths index 5 bits, altitude 12, speed 7, stay 8 - values past them do
     * not fit in the packet, so they are refused rather than wrapped.
     */
    fun buildHyWaypoint(index: Int, latitude: Double, longitude: Double, altitudeM: Double, speedMs: Double, stayS: Double): ByteArray {
        require(index in 0 until HY_MAX_WAYPOINTS) { "waypoint index out of range: $index" }
        val alt = (altitudeM * 10).toInt()
        val speed = (speedMs * 10).toInt()
        val stay = stayS.toInt()
        require(alt in 0..0xFFF) { "altitude out of range: $altitudeM m" }
        require(speed in 0..0x7F) { "speed out of range: $speedMs m/s" }
        require(stay in 0..0xFF) { "stay time out of range: $stayS s" }

        val packed = (index and 0x1F).toLong() or (alt.toLong() shl 5) or (speed.toLong() shl 17) or (stay.toLong() shl 24)
        val p = ByteArray(16)
        p[0] = 0x68; p[1] = 0x04; p[2] = 0x0C
        putLE32(p, 3, (longitude * GPS_SCALE).toInt().toLong())
        putLE32(p, 7, (latitude * GPS_SCALE).toInt().toLong())
        putLE32(p, 11, packed)
        p[15] = xor(p, 1, 15).toByte()
        return p
    }

    /** Wrap flight-controller UART bytes for the WiFi module (type 0x0a). */
    fun wrapUart(uart: ByteArray): ByteArray {
        require(uart.size <= 1400) { "UART payload too large" }
        val out = ByteArray(ENVELOPE_LEN + uart.size)
        out[0] = 0x63; out[1] = 0x63; out[2] = TYPE_UART_TX.toByte()
        out[5] = (uart.size and 0xFF).toByte(); out[6] = ((uart.size shr 8) and 0xFF).toByte()
        System.arraycopy(uart, 0, out, ENVELOPE_LEN, uart.size)
        return out
    }

    fun envelopeType(datagram: ByteArray, length: Int = datagram.size): Int? {
        if (length < ENVELOPE_LEN || datagram[0] != 0x63.toByte() || datagram[1] != 0x63.toByte()) return null
        return datagram[2].toInt() and 0xFF
    }

    class VideoChunk(val frameId: Long, val frameSize: Int, val width: Int, val height: Int, val encryption: Int, val index: Int, val total: Int, val payload: ByteArray)

    fun parseVideoChunk(d: ByteArray, length: Int = d.size): VideoChunk? {
        if (length < VIDEO_HEADER_LEN || envelopeType(d, length) != TYPE_VIDEO) return null
        val frameId = le32(d, 0x08)
        val frameSize = le32(d, 0x0C).toInt()
        val width = le16(d, 0x1C)
        val height = le16(d, 0x1E)
        val index = le16(d, 0x30)
        val total = le16(d, 0x32)
        val len = le16(d, 0x34)
        if (index < 1 || total < 1 || index > total || VIDEO_HEADER_LEN + len > length) return null
        return VideoChunk(frameId, frameSize, width, height, d[0x29].toInt() and 0xFF, index, total,
            d.copyOfRange(VIDEO_HEADER_LEN, VIDEO_HEADER_LEN + len))
    }

    /** Reassembles JPEG frames from video chunks; keeps one frame in flight. */
    class FrameAssembler {
        private var frameId: Long? = null
        private var total = 0
        private var frameSize = 0
        private val parts = HashMap<Int, ByteArray>()
        var dropped = 0
            private set

        fun push(c: VideoChunk): ByteArray? {
            if (c.frameId != frameId) {
                if (frameId != null && parts.isNotEmpty()) dropped++
                frameId = c.frameId; total = c.total; frameSize = c.frameSize; parts.clear()
            }
            parts[c.index] = c.payload
            if (parts.size != total) return null
            val out = java.io.ByteArrayOutputStream(frameSize)
            for (i in 1..total) out.write(parts[i] ?: return null)
            frameId = null; parts.clear()
            val data = out.toByteArray()
            if (data.size != frameSize) { dropped++; return null }
            return data
        }
    }

    /** Each checksum-valid HY telemetry frame `58 TT LL <body> XX` as (type, body). */
    fun hyFrames(uart: ByteArray, from: Int = 0, to: Int = uart.size): List<Pair<Int, ByteArray>> {
        val out = ArrayList<Pair<Int, ByteArray>>()
        var i = from
        while (i + 4 <= to) {
            if ((uart[i].toInt() and 0xFF) != HY_RX_HEADER) { i++; continue }
            val type = uart[i + 1].toInt() and 0xFF
            val len = uart[i + 2].toInt() and 0xFF
            val end = i + 3 + len
            if (end >= to) break
            if (xor(uart, i + 1, end) == (uart[end].toInt() and 0xFF)) {
                out.add(type to uart.copyOfRange(i + 3, end))
                i = end + 1
            } else i++
        }
        return out
    }

    // --- little-endian helpers ---
    fun le16(b: ByteArray, o: Int): Int = (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8)
    fun le32(b: ByteArray, o: Int): Long =
        (b[o].toLong() and 0xFF) or ((b[o + 1].toLong() and 0xFF) shl 8) or ((b[o + 2].toLong() and 0xFF) shl 16) or ((b[o + 3].toLong() and 0xFF) shl 24)
    fun le64(b: ByteArray, o: Int, n: Int = 8): Long {
        var v = 0L
        for (k in 0 until n) if (o + k < b.size) v = v or ((b[o + k].toLong() and 0xFF) shl (8 * k))
        return v
    }
    fun putLE32(b: ByteArray, o: Int, v: Long) { for (k in 0..3) b[o + k] = ((v shr (8 * k)) and 0xFF).toByte() }
    fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }
}
