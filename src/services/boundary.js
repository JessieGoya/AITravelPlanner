// Simple administrative boundary fetcher using Nominatim GeoJSON polygons
// Note: Subject to rate limits. Cache results in-memory to reduce requests.

const boundaryCache = new Map();

/**
 * Fetch administrative boundary GeoJSON for a place name.
 * Attempts Nominatim first; returns GeoJSON Feature or null if not found.
 * @param {string} placeName
 * @returns {Promise<GeoJSON.Feature|null>}
 */
export async function getAdministrativeBoundaryGeoJSON(placeName) {
  const key = (placeName || '').trim();
  if (!key) return null;
  if (boundaryCache.has(key)) return boundaryCache.get(key);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&q=${encodeURIComponent(
      key
    )}`;
    const resp = await fetch(url, {
      headers: {
        // Accept language can help disambiguate local names
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        // Note: User-Agent cannot be set in browser; Nominatim recommends proper UA.
        // We rely on browser default. Consider proxying if stricter compliance needed.
      },
    });
    if (!resp.ok) {
      boundaryCache.set(key, null);
      return null;
    }
    const data = await resp.json();
    if (!data || !Array.isArray(data.features) || data.features.length === 0) {
      boundaryCache.set(key, null);
      return null;
    }

    // Prefer boundary/administrative or place=city/county/state etc., fallback to first
    const preferred = data.features.find(
      (f) =>
        f &&
        f.properties &&
        (f.properties.category === 'boundary' ||
          f.properties.type === 'administrative' ||
          (f.properties.class === 'boundary' && f.properties.type === 'administrative'))
    );
    const feature = preferred || data.features[0];
    if (!feature || !feature.geometry) {
      boundaryCache.set(key, null);
      return null;
    }

    boundaryCache.set(key, feature);
    return feature;
  } catch {
    boundaryCache.set(key, null);
    return null;
  }
}


