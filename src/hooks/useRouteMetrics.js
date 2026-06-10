import { useQuery } from '@tanstack/react-query';
import { travelLandmarkMeta } from '../data/travelGuide.js';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const DRIVABLE_ACCESS_POINTS = {
  milan_duomo: { lon: 9.1954, lat: 45.4614 },
  venice_rialto: { lon: 12.3181, lat: 45.4379 },
  florence_duomo: { lon: 11.248, lat: 43.7765 },
  pisa: { lon: 10.3913, lat: 43.7229 },
  colosseum: { lon: 12.4923, lat: 41.8892 },
  pompeii: { lon: 14.4987, lat: 40.7497 },
};

function osrmUrl(coords) {
  const encoded = coords.map((c) => `${c.lon},${c.lat}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${encoded}?overview=full&geometries=geojson&annotations=false&steps=false`;
}

export async function fetchRouteMetrics(routeIds) {
  const coords = routeIds
    .map((id) => DRIVABLE_ACCESS_POINTS[id] ?? travelLandmarkMeta[id])
    .filter(Boolean)
    .map((m) => ({ lon: m.lon, lat: m.lat }));

  if (coords.length < 2) {
    return { mode: 'osrm', distanceKm: 0, durationHours: 0 };
  }

  try {
    const backendResponse = await fetch(`${API_BASE_URL}/api/routes/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: coords }),
    });
    if (backendResponse.ok) {
      const route = await backendResponse.json();
      if (route?.geometryCoordinates?.length) {
        return {
          mode: route.provider ?? 'backend',
          distanceKm: route.distanceKm,
          durationHours: route.durationHours,
          geometryCoordinates: route.geometryCoordinates,
        };
      }
    }
  } catch {
    // Local development can run without the backend; use the public OSM router below.
  }

  const response = await fetch(osrmUrl(coords), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Failed to load OSRM metrics');
  const json = await response.json();
  const route = json.routes?.[0];
  if (!route) throw new Error('No OSRM route');

  return {
    mode: 'osrm',
    distanceKm: Number((route.distance / 1000).toFixed(1)),
    durationHours: Number((route.duration / 3600).toFixed(2)),
    geometryCoordinates: route.geometry?.coordinates ?? [],
  };
}

export function useRouteMetrics(routeIds) {
  const keyIds = (routeIds ?? []).filter(Boolean);

  return useQuery({
    queryKey: ['route-metrics', keyIds],
    queryFn: () => fetchRouteMetrics(keyIds),
    enabled: keyIds.length >= 2,
    staleTime: 10 * 60 * 1000,
  });
}
