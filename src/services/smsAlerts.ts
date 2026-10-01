import { PermissionsAndroid, Platform } from 'react-native';
import { SmsAlert } from '../../modules/sms-alert';
import { tr } from '../i18n/tr';
import { Alert } from '../types';

/**
 * Urgent alerts as ordinary SMS, sent from the farmer's own SIM.
 *
 * No gateway and no paid Firebase plan: the phone that raised the alert sends
 * it, so the cost is one SMS from the farmer's pack (most Indian plans include
 * 100 a day). It reaches the people the farmer chose - family, a field worker,
 * a keypad phone with no internet - even when they never open the app.
 */

/** Only alerts worth interrupting someone for. */
const SMS_SEVERITIES = new Set<Alert['severity']>(['critical', 'high']);
export const MAX_SMS_NUMBERS = 3;

export function smsAvailable(): boolean {
  return Platform.OS === 'android' && !!SmsAlert && SmsAlert.canSend();
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!smsAvailable()) return false;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/** Digits only, with India's +91 assumed for a bare 10-digit number. */
export function normaliseNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const bare = digits.replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(bare)) return `+91${bare}`;
  return null;
}

function alertText(alert: Alert): string {
  const prefix = alert.severity === 'critical' ? tr('notify.urgent') : tr('notify.action');
  return `Drikr - ${prefix}: ${alert.title} (${alert.plotName}). ${alert.detail}`.slice(0, 300);
}

/** Send to every saved number. Returns the first failure reason, if any. */
export function sendSms(numbers: string[], text: string): string | null {
  if (!smsAvailable() || !SmsAlert) return 'no_sim';
  let failure: string | null = null;
  for (const n of numbers.slice(0, MAX_SMS_NUMBERS)) {
    const r = SmsAlert.send(n, text);
    if (r && !failure) failure = r;
  }
  return failure;
}

export function smsAlerts(alerts: Alert[], numbers: string[]): void {
  if (!numbers.length || !smsAvailable()) return;
  for (const a of alerts) {
    if (SMS_SEVERITIES.has(a.severity)) sendSms(numbers, alertText(a));
  }
}

export function testText(): string {
  return `Drikr: ${tr('sms.testBody')}`;
}
