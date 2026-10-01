package expo.modules.smsalert

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sends one alert as an ordinary SMS through the phone's default SIM.
 *
 * Returns null when the message was handed to the radio, or a short reason
 * code the app turns into a sentence in the farmer's language.
 */
class SmsAlertModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

    override fun definition() = ModuleDefinition {
        Name("SmsAlert")

        /** False on tablets and phones with no SIM slot. */
        Function("canSend") {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
        }

        Function("send") { number: String, text: String ->
            if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) return@Function "no_sim"
            if (context.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                return@Function "no_permission"
            }
            try {
                val sms: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    context.getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }
                // Indian-language text is UCS-2, 70 characters a part; the
                // manager splits and the receiving phone joins them back.
                val parts = sms.divideMessage(text)
                if (parts.size > 1) sms.sendMultipartTextMessage(number, null, parts, null, null)
                else sms.sendTextMessage(number, null, text, null, null)
                null
            } catch (e: Exception) {
                "failed"
            }
        }
    }
}
