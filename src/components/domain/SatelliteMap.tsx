import React, { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import { GeoPoint } from '../../types';

/**
 * Tap-a-corner satellite map.
 *
 * Leaflet inside a WebView, not `react-native-maps`, for one decisive reason:
 * react-native-maps needs a Google Maps API key on Android, and creating one
 * needs a Google Cloud billing account — the same card-on-file requirement we
 * deliberately avoided for the telemetry relay. Leaflet with Esri's World
 * Imagery needs no key and no account.
 *
 * Caveat worth stating: Esri's imagery is free to use but not licensed for
 * arbitrary commercial redistribution. Fine for a prototype and for a farmer
 * locating their own field; revisit before this ships as a paid product.
 *
 * The WebView is a hard dependency on internet access — tiles come off the
 * network and there is no offline cache. That is exactly why this is an
 * *alternative* to the GPS method rather than a replacement: a farmer standing
 * in a field with no bars gets a blank grey square here, and a working GPS fix
 * there.
 */

/**
 * `react-native-webview` is a native module, so the import throws in any app
 * binary built before it was added. Requiring it lazily means the GPS path
 * keeps working in the current build and the map path can say why it cannot —
 * rather than the whole screen failing to mount.
 */
function loadWebView(): React.ComponentType<Record<string, unknown>> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-webview').WebView;
  } catch {
    return null;
  }
}

export function satelliteMapAvailable(): boolean {
  return loadWebView() !== null;
}

function pageHtml(center: GeoPoint, picked: GeoPoint[], labels: string[]): string {
  const markers = picked
    .map(
      (p, i) => `
      L.marker([${p.lat}, ${p.lon}], {icon: numIcon(${JSON.stringify(labels[i] ?? String(i + 1))})})
        .addTo(map);`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#E8EDE9; }
  .num {
    background:#1B4332; color:#fff; border:2px solid #fff; border-radius:50%;
    width:26px; height:26px; line-height:22px; text-align:center;
    font: 700 13px system-ui, sans-serif; box-shadow:0 1px 4px rgba(0,0,0,.4);
  }
  .hint {
    position:absolute; left:8px; right:8px; bottom:8px; z-index:500;
    background:rgba(20,40,29,.86); color:#fff; padding:7px 10px; border-radius:8px;
    font:500 12px system-ui, sans-serif; text-align:center;
  }
  .err { padding:16px; font:500 13px system-ui, sans-serif; color:#14281D; }
</style>
</head>
<body>
<div id="map"></div>
<div class="hint" id="hint">Pinch to zoom until you can see your field, then tap the corner</div>
<script>
  function numIcon(t) {
    return L.divIcon({ className:'', html:'<div class="num">'+t+'</div>',
      iconSize:[26,26], iconAnchor:[13,13] });
  }
  function post(o) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o));
  }
  try {
    var map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([${center.lat}, ${center.lon}], 17);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 21, attribution: 'Esri, Maxar, Earthstar Geographics' }
    ).addTo(map);

    ${markers}

    map.on('click', function (e) {
      post({ type:'pick', lat: e.latlng.lat, lon: e.latlng.lng, zoom: map.getZoom() });
    });

    // Tiles failing is the common case on a weak connection, and a silent grey
    // square looks like a broken app rather than a missing network.
    var failed = 0;
    map.eachLayer(function (l) {
      if (l.on) l.on('tileerror', function () {
        failed++;
        if (failed === 6) post({ type:'tileerror' });
      });
    });

    post({ type:'ready' });
  } catch (err) {
    document.body.innerHTML = '<div class="err">Map could not load: ' + err.message + '</div>';
    post({ type:'error', message: String(err && err.message) });
  }
</script>
</body>
</html>`;
}

export function SatelliteMap({
  center,
  picked,
  labels,
  onPick,
  onTileError,
  height = 320,
}: {
  center: GeoPoint;
  /** Corners already chosen, drawn as numbered pins. */
  picked: GeoPoint[];
  labels: string[];
  onPick: (p: GeoPoint) => void;
  onTileError?: () => void;
  height?: number;
}) {
  const WebView = useMemo(loadWebView, []);
  // The HTML is rebuilt when a pin is added, which remounts the map. Keeping
  // the ref lets us avoid rebuilding for anything that is not a pin change.
  const lastHtml = useRef<string>('');

  if (!WebView) {
    return (
      <View style={[s.fallback, { height }]}>
        <Text style={s.fallbackText}>
          The map needs a newer version of the app. Use “Walk to two corners” for now, or install
          the latest build.
        </Text>
      </View>
    );
  }

  const html = pageHtml(center, picked, labels);
  lastHtml.current = html;

  return (
    <View style={[s.wrap, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: colors.surfaceSunken }}
        javaScriptEnabled
        domStorageEnabled
        // Leaflet's zoom controls and pinch handling need these; without them
        // the map renders but cannot be zoomed to where a field is visible.
        scalesPageToFit={false}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as {
              type: string;
              lat?: number;
              lon?: number;
            };
            if (msg.type === 'pick' && typeof msg.lat === 'number' && typeof msg.lon === 'number') {
              onPick({ lat: msg.lat, lon: msg.lon });
            } else if (msg.type === 'tileerror') {
              onTileError?.();
            }
          } catch {
            // A message we do not understand is not worth crashing a screen for.
          }
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  fallback: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  fallbackText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
