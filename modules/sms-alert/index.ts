import { requireOptionalNativeModule } from 'expo';

/**
 * Field alerts as plain SMS from the farmer's own SIM (Android only).
 * Null in Expo Go and on iOS, where the feature is simply not offered.
 */
interface SmsAlertNative {
  canSend(): boolean;
  /** null on success, else 'no_sim' | 'no_permission' | 'failed'. */
  send(number: string, text: string): string | null;
}

export const SmsAlert = requireOptionalNativeModule<SmsAlertNative>('SmsAlert');
