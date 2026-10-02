import { Linking } from 'react-native';
import { tr } from '../i18n/tr';
import { Alert } from '../types';

/**
 * Telling the family by SMS - with one tap, and no SMS permission.
 *
 * The app used to send SMS itself, which needs SEND_SMS. For an APK installed
 * from a website, Google Play Protect treats that permission as a fraud signal
 * and blocks the install outright ("App blocked to protect your device"), and
 * Google Play bans it for anything that is not an SMS app. So the app now opens
 * the phone's own SMS app with the alert already written and the saved numbers
 * filled in; the farmer only presses Send. It costs one SMS from their pack.
 */

export const MAX_SMS_NUMBERS = 3;

/** Digits only, with India's +91 assumed for a bare 10-digit number. */
export function normaliseNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const bare = digits.replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(bare)) return `+91${bare}`;
  return null;
}

/** The SMS text for one alert, short enough for a keypad phone. */
export function familyAlertText(alert: Alert): string {
  const prefix = alert.severity === 'critical' ? tr('notify.urgent') : tr('notify.action');
  return `Drikr - ${prefix}: ${alert.title} (${alert.plotName}). ${alert.detail}`.slice(0, 300);
}

export function testText(): string {
  return `Drikr: ${tr('sms.testBody')}`;
}

/** Opens the SMS app ready to send. False when the phone has no SMS app. */
export async function composeSms(numbers: string[], text: string): Promise<boolean> {
  const to = numbers.slice(0, MAX_SMS_NUMBERS).join(',');
  try {
    await Linking.openURL(`sms:${to}?body=${encodeURIComponent(text)}`);
    return true;
  } catch {
    return false;
  }
}
