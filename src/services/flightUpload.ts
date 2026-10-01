import AsyncStorage from '@react-native-async-storage/async-storage';
import NativeDroneLink from '../../modules/drone-link';
import { idToken } from '../config/firebase';
import { fetchDroneData } from './flightEvidence';
import { saveFlightRecord } from './sync';

/**
 * Drone photos to the cloud, for training the crop AI.
 *
 * Only with the farmer's consent (settings.sharePhotos === true). After a
 * flight, the best photo from each spot goes to drikr.vercel.app, which checks
 * the Firebase sign-in token and stores it in Vercel Blob; the flight's record
 * (photo links, GPS, crop, growth stage) goes to Firestore `flights/`. A flight
 * is uploaded once - the ids already sent are remembered on the phone - and a
 * flight that fails half way is simply tried again next time.
 */
const API = 'https://drikr.vercel.app/api/flight-photo';
const SENT_KEY = 'drikr:uploaded-flights';

export type UploadResult = 'sent' | 'already' | 'none' | 'failed';

async function sentIds(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SENT_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function uploadLastFlight(meta: { plotId?: string; crop?: string; stage?: string }): Promise<UploadResult> {
  if (!NativeDroneLink) return 'none';
  let photos;
  try {
    photos = (await fetchDroneData()).photos;
  } catch {
    return 'none';
  }
  // fetchDroneData loads the image of the one photo per spot it picked; send
  // those. Without a pick, fall back to the first eight photos taken.
  const withImage = photos.filter((p) => p.dataUri);
  const chosen = withImage.length ? withImage : photos.slice(0, 8);
  if (!chosen.length) return 'none';

  const flightId = `f-${chosen[0].timeMs}-${chosen[0].file}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  const done = await sentIds();
  if (done.includes(flightId)) return 'already';

  const token = await idToken();
  if (!token) return 'failed';

  const uploaded: { url: string; lat: number; lon: number; takenAt: number; spot: number }[] = [];
  for (const p of chosen) {
    const b64 = p.dataUri?.split(',')[1] ?? NativeDroneLink.readPhotoBase64(p.file);
    if (!b64) continue;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ flightId, spot: p.waypoint, lat: p.lat, lon: p.lon, takenAt: p.timeMs, image: b64 }),
      });
      if (!res.ok) return 'failed';
      const { url } = await res.json();
      if (typeof url !== 'string') return 'failed';
      uploaded.push({ url, lat: p.lat, lon: p.lon, takenAt: p.timeMs, spot: p.waypoint });
    } catch {
      return 'failed';
    }
  }
  if (!uploaded.length) return 'failed';

  const saved = await saveFlightRecord({ id: flightId, at: Date.now(), photos: uploaded, ...meta });
  if (!saved) return 'failed';
  await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...done, flightId].slice(-200)));
  return 'sent';
}
