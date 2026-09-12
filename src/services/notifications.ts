import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Alert, DroneMission } from '../types';

/**
 * Local notifications for the deck's "Instant Alerts on Mobile App".
 *
 * These are scheduled on-device: the phone raises the alert as soon as the engine
 * finds a problem, with no push server in the loop. That keeps working when the
 * network is down, which is exactly when a farmer is most likely to miss a warning.
 */

let configured = false;

export function configureNotifications(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    // A dedicated high-importance channel so field alerts are not batched with chatter.
    Notifications.setNotificationChannelAsync('drikr-alerts', {
      name: 'Field alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C4382E',
    }).catch(() => undefined);
  }
}

export async function requestPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return Boolean(asked.granted);
  } catch {
    return false;
  }
}

function severityPrefix(severity: Alert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'Urgent';
    case 'high':
      return 'Action needed';
    case 'medium':
      return 'Watch';
    default:
      return 'Info';
  }
}

export async function notifyAlert(alert: Alert): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${severityPrefix(alert.severity)}: ${alert.title}`,
        body: `${alert.plotName} — ${alert.detail}`,
        data: { alertId: alert.id, plotId: alert.plotId, kind: 'alert' },
        ...(Platform.OS === 'android' ? { channelId: 'drikr-alerts' } : null),
      },
      trigger: null,
    });
  } catch {
    // Permission denied or unsupported in Expo Go — the in-app feed still shows it.
  }
}

/** Remind the farmer shortly before an autonomous spray begins. */
export async function scheduleMissionReminder(mission: DroneMission): Promise<void> {
  const fireAt = mission.scheduledAt - 15 * 60_000;
  if (fireAt <= Date.now() + 5000) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Drone ${mission.type === 'spray' ? 'spraying' : 'inspection'} starts in 15 minutes`,
        body: `${mission.plotName} — ${mission.areaAcres} acre${
          mission.payload ? `, ${mission.payload.litres} L` : ''
        }. Clear the field.`,
        data: { missionId: mission.id, kind: 'mission' },
        ...(Platform.OS === 'android' ? { channelId: 'drikr-alerts' } : null),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
    });
  } catch {
    /* ignore */
  }
}

export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* ignore */
  }
}
