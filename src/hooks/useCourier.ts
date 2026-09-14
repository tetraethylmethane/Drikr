import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { hasIngest } from '../config/env';
import { hasMasterAddress } from '../services/hardware';
import { CourierRun, runCourier } from '../services/courier';
import { setCourierRun } from '../store/slices/telemetrySlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { SensorNode } from '../types';

/**
 * Runs the phone-as-courier loop.
 *
 * The Master has no backhaul, so the phone is the transport: it collects
 * whenever it happens to be within WiFi range of the Master, and uploads
 * whenever it happens to have signal. Neither is predictable, which is why this
 * is a cheap poll rather than an event — the trigger is the farmer walking
 * around their own field, and nothing tells us when that happens.
 *
 * Mounted once, inside `useTelemetryEngine`, for the same reason that hook is:
 * two loops would collect the same readings twice. `courier.ts` holds a mutex as
 * well, so the farmer's "Sync now" tap cannot overlap a scheduled pass either.
 */

const COLLECT_EVERY_MS = 60_000;

/**
 * Maps a Master node label (S1, S2) to the plot that node sits in.
 *
 * This is the only place the two naming worlds meet. The Master knows LoRa
 * addresses; the app knows plots. Getting this wrong files a reading against
 * the wrong field, which is worse than not collecting it at all, so an unknown
 * label returns null and the reading is reported as unattributed instead of
 * guessed at.
 */
export function nodePlotResolver(nodes: SensorNode[]): (label: string) => string | null {
  const byLabel = new Map<string, string>();
  for (const n of nodes) {
    byLabel.set(n.label.toUpperCase(), n.plotId);
  }
  return (label: string) => byLabel.get(String(label).toUpperCase()) ?? null;
}

export function useCourier() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.farm.nodes);

  // Read through a ref so the interval below is not rebuilt every time node
  // health refreshes — the same trap `useTelemetryEngine` documents.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const sync = useCallback(
    async (force = false): Promise<CourierRun> => {
      const result = await runCourier(nodePlotResolver(nodesRef.current));
      // A scheduled pass that found no Master and had nothing to upload is the
      // normal case. Reporting it would re-render every screen once a minute to
      // say nothing happened.
      if (force || result.collect || result.upload) {
        dispatch(setCourierRun(result));
      }
      return result;
    },
    [dispatch]
  );

  useEffect(() => {
    // Nothing to courier in simulator mode: no Master to collect from and no
    // relay to push to.
    if (!hasMasterAddress() && !hasIngest()) return;

    let cancelled = false;
    const loop = () => {
      if (!cancelled) void sync();
    };

    loop();
    const id = setInterval(loop, COLLECT_EVERY_MS);
    // Coming back to the app is the strongest available hint that the phone has
    // moved — and moving is what makes a collect or an upload possible.
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') loop();
    });

    return () => {
      cancelled = true;
      clearInterval(id);
      appSub.remove();
    };
  }, [sync]);

  return sync;
}
