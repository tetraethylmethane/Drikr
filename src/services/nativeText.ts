import { tr } from '../i18n/tr';

/**
 * The drone module speaks English (it is Kotlin, tested on its own on the JVM,
 * and has no access to the app's languages). Its sentences are a small fixed
 * set, so they are matched here and replaced with the farmer's language.
 * Anything unrecognised is shown as it came, which beats showing nothing.
 */
const TABLE: Array<[RegExp, string, (m: RegExpMatchArray) => Record<string, unknown>]> = [
  [/^The drone link is not running$/, 'native.notRunning', () => ({})],
  [/^Not connected to the drone$/, 'native.notConnected', () => ({})],
  [/^No GPS fix yet \((\d+) satellites\)$/, 'native.noFix', (m) => ({ sats: m[1] })],
  [/^Battery (\S+)% is below (\d+)%$/, 'native.batteryLow', (m) => ({ pct: m[1], min: m[2] })],
  [/^The drone has no GPS fix; waypoints are refused without one$/, 'native.noFixUpload', () => ({})],
  [/^Take off first/, 'native.takeoffFirst', () => ({})],
  [/^Mission is not ready/, 'native.missionNotReady', () => ({})],
  [/^Scouting is already running\.$/, 'native.scoutRunning', () => ({})],
  [/^The phone is not connected to the drone\./, 'native.scoutNotConnected', () => ({})],
  [/^The drone is still finding its location \((\d+) satellites\)/, 'native.scoutNoFix', (m) => ({ sats: m[1] })],
  [/^Drone battery is (\S+)%\. Charge it to at least (\d+)% first\.$/, 'native.scoutBattery', (m) => ({ pct: m[1], min: m[2] })],
  [/^This drone can visit at most (\d+) spots per flight\.$/, 'native.maxSpots', (m) => ({ n: m[1] })],
  [/^Scouting is not running\.$/, 'native.scoutNotRunning', () => ({})],
  [/^Lost connection to the drone/, 'native.lostLink', () => ({})],
  [/^The drone could not take off/, 'native.noTakeoff', () => ({})],
  [/^The drone lost its location/, 'native.lostFix', () => ({})],
  [/^Could not plan the spots/, 'native.planFailed', () => ({})],
  [/^The drone would not start/, 'native.wouldNotStart', () => ({})],
  [/^The drone did not accept the plan in time/, 'native.planTimeout', () => ({})],
  [/^The drone did not accept the plan/, 'native.planRejected', () => ({})],
  [/^Took too long \((\d+) of (\d+) spots done\)/, 'native.tooLong', (m) => ({ done: m[1], total: m[2] })],
  [/^Landing not confirmed/, 'native.landUnconfirmed', () => ({})],
  [/^No signal from the drone/, 'native.noSignal', () => ({})],
  [/^At spot (\d+) of (\d+) - taking photos$/, 'native.atSpot', (m) => ({ n: m[1], total: m[2] })],
  [/^Getting ready in the air$/, 'native.gettingReady', () => ({})],
];

export function localizeNative(message: string): string {
  for (const [re, key, params] of TABLE) {
    const m = message.match(re);
    if (m) return tr(key, params(m));
  }
  return message;
}
