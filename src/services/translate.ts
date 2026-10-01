/**
 * Community-post translation through Bhashini, via drikr.vercel.app.
 *
 * The site holds the Bhashini credentials; the app never sees them. Until the
 * site is configured, `translationReady()` is false and no Translate link is
 * shown, so this ships safely before the key exists and switches itself on
 * after.
 */
const API = 'https://drikr.vercel.app/api/translate';

let ready: Promise<boolean> | null = null;
const cache = new Map<string, string>();

export function translationReady(): Promise<boolean> {
  ready ??= fetch(API)
    .then((r) => r.json())
    .then((j) => Boolean(j?.ready))
    .catch(() => {
      // Offline now is not offline forever: ask again next time.
      ready = null;
      return false;
    });
  return ready;
}

/** The translated text, or null when it could not be translated. */
export async function translateText(text: string, source: string, target: string): Promise<string | null> {
  if (source === target) return text;
  const key = `${source}>${target}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [text.slice(0, 1200)], source, target }),
    });
    if (!res.ok) return null;
    const out = (await res.json())?.translations?.[0];
    if (typeof out !== 'string' || !out) return null;
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}
