import * as THREE from 'three';
import { MAP_BOUNDS } from './landmarks.js';

const HEIGHT_SCALE = 0.0022;
const DEM_SIZE = 512;
const TERRAIN_SEGMENTS = 120;
const listeners = new Set();
let terrainState = {
  status: 'idle',
  geometry: null,
  texture: null,
  version: 0,
};
let heightMap = null;
let hmWidth = 0;
let hmHeight = 0;
let loadPromise = null;
let activeRouteCorridorKey = '';
let terrainLoadAttempt = 0;

function emit() {
  for (const listener of listeners) listener(terrainState);
}

function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

function lonLatToTileFloat(lon, lat, zoom) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

function demTileUrl(z, x, y) {
  return `/terrain-dem/${z}/${x}/${y}.png`;
}

function sampleHeight(u, v) {
  if (!heightMap) return 0;
  const x = u * (hmWidth - 1);
  const y = v * (hmHeight - 1);
  const x0 = Math.floor(x);
  const x1 = Math.min(x0 + 1, hmWidth - 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(y0 + 1, hmHeight - 1);
  const fx = x - x0;
  const fy = y - y0;
  const h00 = heightMap[y0 * hmWidth + x0];
  const h10 = heightMap[y0 * hmWidth + x1];
  const h01 = heightMap[y1 * hmWidth + x0];
  const h11 = heightMap[y1 * hmWidth + x1];
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

function sampleRawHeight(raw, width, height, x, y) {
  const sx = THREE.MathUtils.clamp(x, 0, width - 1);
  const sy = THREE.MathUtils.clamp(y, 0, height - 1);
  const x0 = Math.floor(sx);
  const x1 = Math.min(x0 + 1, width - 1);
  const y0 = Math.floor(sy);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = sx - x0;
  const fy = sy - y0;
  const h00 = raw[y0 * width + x0];
  const h10 = raw[y0 * width + x1];
  const h01 = raw[y1 * width + x0];
  const h11 = raw[y1 * width + x1];
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

function latAtV(v) {
  const mercMin = Math.log(Math.tan(Math.PI / 4 + (MAP_BOUNDS.latMin * Math.PI) / 360));
  const mercMax = Math.log(Math.tan(Math.PI / 4 + (MAP_BOUNDS.latMax * Math.PI) / 360));
  const merc = mercMin + (1 - v) * (mercMax - mercMin);
  return (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
}

function lonAtU(u) {
  return MAP_BOUNDS.lonMin + u * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
}

function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

const italyLandMasks = [
  [
    [6.62, 45.09], [7.05, 44.72], [7.48, 44.14], [8.16, 43.92], [8.95, 44.02],
    [9.72, 43.73], [10.31, 43.48], [10.72, 42.97], [11.1, 42.42], [11.58, 42.1],
    [12.13, 41.88], [12.72, 41.31], [13.41, 41.13], [14.1, 40.83], [14.73, 40.6],
    [15.14, 40.03], [15.64, 39.73], [16.08, 39.06], [16.56, 38.72], [16.91, 38.88],
    [17.18, 38.99], [16.57, 39.38], [16.51, 39.72], [16.95, 40.23], [17.78, 40.32],
    [18.48, 40.07], [18.51, 40.52], [17.93, 40.82], [17.29, 40.98], [16.72, 41.31],
    [16.08, 41.9], [15.42, 41.94], [14.91, 42.28], [14.2, 42.61], [13.77, 43.12],
    [13.53, 43.6], [13.67, 44.08], [13.3, 44.55], [12.86, 45.05], [13.07, 45.62],
    [12.57, 45.81], [12.1, 45.69], [11.45, 45.92], [10.78, 46.49], [10.1, 46.62],
    [9.42, 46.47], [8.74, 46.14], [8.11, 46.25], [7.52, 45.96], [7.05, 45.55],
  ],
  [
    [12.36, 38.2], [12.64, 37.72], [13.18, 37.5], [13.66, 37.34], [14.08, 37.08],
    [14.59, 36.72], [15.1, 36.7], [15.36, 37.1], [15.29, 37.48], [15.08, 37.82],
    [14.6, 38.02], [14.1, 38.1], [13.57, 38.18], [13.05, 38.18], [12.65, 38.14],
  ],
  [
    [8.13, 41.26], [8.2, 40.77], [8.37, 40.31], [8.47, 39.81], [8.39, 39.3],
    [8.55, 38.88], [8.85, 38.86], [9.17, 39.16], [9.55, 39.12], [9.7, 39.58],
    [9.63, 40.08], [9.76, 40.55], [9.55, 40.91], [9.17, 41.22], [8.64, 41.29],
  ],
  [
    [12.23, 45.56], [12.35, 45.47], [12.42, 45.34], [12.29, 45.22],
    [12.12, 45.31], [12.08, 45.45],
  ],
];

function isLikelyLand(lon, lat) {
  if (italyLandMasks.some((polygon) => pointInPolygon(lon, lat, polygon))) return true;
  if (lon >= 14.12 && lon <= 14.56 && lat >= 40.68 && lat <= 41.12) return true;
  return false;
}

function resampleRawToBounds(raw, rawWidth, rawHeight, tileMin, zoom) {
  const cropped = new Float32Array(DEM_SIZE * DEM_SIZE);
  const globalTileOriginX = tileMin.x * 256;
  const globalTileOriginY = tileMin.y * 256;

  for (let y = 0; y < DEM_SIZE; y += 1) {
    const v = y / (DEM_SIZE - 1);
    const lat = latAtV(v);
    for (let x = 0; x < DEM_SIZE; x += 1) {
      const u = x / (DEM_SIZE - 1);
      const lon = lonAtU(u);
      const tile = lonLatToTileFloat(lon, lat, zoom);
      const px = tile.x * 256 - globalTileOriginX;
      const py = tile.y * 256 - globalTileOriginY;
      cropped[y * DEM_SIZE + x] = sampleRawHeight(raw, rawWidth, rawHeight, px, py);
    }
  }

  return cropped;
}

function smoothHeightMap(source, width, height, passes = 2) {
  let input = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const output = new Float32Array(input.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let weightTotal = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const sx = THREE.MathUtils.clamp(x + ox, 0, width - 1);
            const sy = THREE.MathUtils.clamp(y + oy, 0, height - 1);
            const weight = ox === 0 && oy === 0 ? 4 : (ox === 0 || oy === 0 ? 2 : 1);
            total += input[sy * width + sx] * weight;
            weightTotal += weight;
          }
        }
        output[y * width + x] = total / weightTotal;
      }
    }
    input = output;
  }
  return input;
}

function loadDemTile(z, tx, ty) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutHandle);
      resolve(result);
    };
    const timeoutHandle = window.setTimeout(() => finish(null), 4500);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      const out = new Float32Array(img.width * img.height);
      for (let i = 0; i < out.length; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        out[i] = (r * 256 + g + b / 256) - 32768;
      }
      finish({ data: out, width: img.width, height: img.height, tx, ty });
    };
    img.onerror = () => finish(null);
    img.src = demTileUrl(z, tx, ty);
  });
}

function buildStylizedTexture(heightData, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#94cae8');
  ocean.addColorStop(0.45, '#6eafd4');
  ocean.addColorStop(1, '#4f89b8');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  let maxH = 1;
  for (let i = 0; i < heightData.length; i += 1) maxH = Math.max(maxH, heightData[i]);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const h = heightData[i] / maxH;
      const p = i * 4;

      const u = x / Math.max(width - 1, 1);
      const v = y / Math.max(height - 1, 1);
      const land = isLikelyLand(lonAtU(u), latAtV(v));

      if (!land) {
        data[p] = 104;
        data[p + 1] = 162;
        data[p + 2] = 198;
        data[p + 3] = 255;
        continue;
      }

      const contour = Math.abs(((h * 20) % 1) - 0.5);
      const contourBand = contour < 0.05 ? 1 : 0;
      data[p] = Math.min(255, 76 + h * 62 + contourBand * 22);
      data[p + 1] = Math.min(255, 132 + h * 54 + contourBand * 14);
      data[p + 2] = Math.min(255, 94 + h * 34);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sampleTerrainGridVertex(col, row) {
  const u = THREE.MathUtils.clamp(col / TERRAIN_SEGMENTS, 0, 1);
  const v = THREE.MathUtils.clamp(row / TERRAIN_SEGMENTS, 0, 1);
  return isLikelyLand(lonAtU(u), latAtV(v)) ? sampleHeight(u, v) : 0;
}

function buildGeometry() {
  const segments = TERRAIN_SEGMENTS;
  const geometry = new THREE.PlaneGeometry(MAP_BOUNDS.worldWidth, MAP_BOUNDS.worldSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const width = segments + 1;
  for (let i = 0; i < positions.count; i += 1) {
    const col = i % width;
    const row = Math.floor(i / width);
    const u = col / segments;
    const v = row / segments;
    positions.setY(i, sampleTerrainGridVertex(col, row));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function loadTerrainData() {
  if (terrainState.status === 'ready') return Promise.resolve(terrainState);
  if (loadPromise) return loadPromise;

  terrainState = { ...terrainState, status: 'loading' };
  emit();

  loadPromise = (async () => {
    terrainLoadAttempt += 1;
    const zoom = 6;
    const tileMin = lonLatToTile(MAP_BOUNDS.lonMin, MAP_BOUNDS.latMax, zoom);
    const tileMax = lonLatToTile(MAP_BOUNDS.lonMax, MAP_BOUNDS.latMin, zoom);
    const tcX = tileMax.x - tileMin.x + 1;
    const tcY = tileMax.y - tileMin.y + 1;
    const tilePx = 256;

    const results = await Promise.all(
      Array.from({ length: tcX * tcY }, (_, index) => {
        const tx = tileMin.x + (index % tcX);
        const ty = tileMin.y + Math.floor(index / tcX);
        return loadDemTile(zoom, tx, ty);
      }),
    );
    const loadedResults = results.filter(Boolean);

    const rawWidth = tcX * tilePx;
    const rawHeight = tcY * tilePx;
    const raw = new Float32Array(rawWidth * rawHeight);

    for (const result of loadedResults) {
      if (!result) continue;
      const offX = (result.tx - tileMin.x) * tilePx;
      const offY = (result.ty - tileMin.y) * tilePx;
      for (let row = 0; row < result.height; row += 1) {
        for (let col = 0; col < result.width; col += 1) {
          raw[(offY + row) * rawWidth + (offX + col)] = result.data[row * result.width + col];
        }
      }
    }

    hmWidth = DEM_SIZE;
    hmHeight = DEM_SIZE;
    const hasUsableDemCoverage = loadedResults.length >= Math.ceil(results.length * 0.8);
    if (hasUsableDemCoverage) {
      const croppedRaw = resampleRawToBounds(raw, rawWidth, rawHeight, tileMin, zoom);
      heightMap = new Float32Array(croppedRaw.length);
      for (let i = 0; i < croppedRaw.length; i += 1) {
        heightMap[i] = Math.max(0, croppedRaw[i]) * HEIGHT_SCALE;
      }
      heightMap = smoothHeightMap(heightMap, hmWidth, hmHeight, 1);
    } else {
      heightMap = null;
      terrainState = {
        ...terrainState,
        status: 'error',
        source: 'unavailable',
        loadedTileCount: loadedResults.length,
        loadAttempt: terrainLoadAttempt,
      };
      loadPromise = null;
      emit();
      return terrainState;
    }

    terrainState = {
      status: 'ready',
      geometry: buildGeometry(),
      texture: buildStylizedTexture(heightMap, hmWidth, hmHeight),
      version: terrainState.version + 1,
      source: 'dem',
      loadedTileCount: loadedResults.length,
      loadAttempt: terrainLoadAttempt,
    };
    loadPromise = null;
    emit();
    return terrainState;
  })();

  return loadPromise;
}

export function subscribeTerrain(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTerrainState() {
  return terrainState;
}

export function setTerrainRouteCorridor(points) {
  const nextKey = points?.length >= 2
    ? `${points.length}:${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const point = points[Math.min(points.length - 1, Math.round((points.length - 1) * ratio))];
      return `${point.x.toFixed(2)},${point.z.toFixed(2)}`;
    }).join(':')}`
    : '';
  if (nextKey === activeRouteCorridorKey) return;

  activeRouteCorridorKey = nextKey;
}

export function worldPosToHeight(worldX, worldZ) {
  const u = THREE.MathUtils.clamp(worldX / MAP_BOUNDS.worldWidth + 0.5, 0, 1);
  const v = THREE.MathUtils.clamp(worldZ / MAP_BOUNDS.worldSize + 0.5, 0, 1);
  if (!isLikelyLand(lonAtU(u), latAtV(v))) return 0;
  return sampleHeight(u, v);
}

export function worldPosToRenderedHeight(worldX, worldZ) {
  const u = THREE.MathUtils.clamp(worldX / MAP_BOUNDS.worldWidth + 0.5, 0, 1);
  const v = THREE.MathUtils.clamp(worldZ / MAP_BOUNDS.worldSize + 0.5, 0, 1);
  const gridX = u * TERRAIN_SEGMENTS;
  const gridZ = v * TERRAIN_SEGMENTS;
  const x0 = Math.floor(gridX);
  const x1 = Math.min(x0 + 1, TERRAIN_SEGMENTS);
  const z0 = Math.floor(gridZ);
  const z1 = Math.min(z0 + 1, TERRAIN_SEGMENTS);
  const fx = gridX - x0;
  const fz = gridZ - z0;
  const h00 = sampleTerrainGridVertex(x0, z0);
  const h10 = sampleTerrainGridVertex(x1, z0);
  const h01 = sampleTerrainGridVertex(x0, z1);
  const h11 = sampleTerrainGridVertex(x1, z1);

  // PlaneGeometry uses triangles (top-left, bottom-left, top-right) and
  // (bottom-left, bottom-right, top-right). Match those faces exactly.
  if (fx + fz <= 1) {
    return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  }
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

export function sampleRoadSurface(worldX, worldZ, tangentX, tangentZ, halfWidth, clearance) {
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  const tx = tangentX / tangentLength;
  const tz = tangentZ / tangentLength;
  const nx = -tz;
  const nz = tx;
  const leftX = worldX - nx * halfWidth;
  const leftZ = worldZ - nz * halfWidth;
  const rightX = worldX + nx * halfWidth;
  const rightZ = worldZ + nz * halfWidth;
  const centerHeight = worldPosToHeight(worldX, worldZ) + clearance;
  const leftHeight = worldPosToHeight(leftX, leftZ) + clearance;
  const rightHeight = worldPosToHeight(rightX, rightZ) + clearance;

  return {
    centerHeight,
    left: new THREE.Vector3(leftX, leftHeight, leftZ),
    right: new THREE.Vector3(rightX, rightHeight, rightZ),
    roll: Math.atan2(rightHeight - leftHeight, Math.max(halfWidth * 2, Number.EPSILON)),
  };
}

export function worldPosToRouteHeight(worldX, worldZ, footprint = 4.5) {
  const offsets = [
    [0, 0, 4],
    [footprint, 0, 2],
    [-footprint, 0, 2],
    [0, footprint, 2],
    [0, -footprint, 2],
    [footprint * 0.7, footprint * 0.7, 1],
    [-footprint * 0.7, footprint * 0.7, 1],
    [footprint * 0.7, -footprint * 0.7, 1],
    [-footprint * 0.7, -footprint * 0.7, 1],
  ];

  let total = 0;
  let weightTotal = 0;
  for (const [offsetX, offsetZ, weight] of offsets) {
    total += worldPosToHeight(worldX + offsetX, worldZ + offsetZ) * weight;
    weightTotal += weight;
  }
  return total / weightTotal;
}

export function worldPosToRouteSafeHeight(worldX, worldZ, footprint = 4.5) {
  const offsets = [
    [0, 0],
    [footprint, 0],
    [-footprint, 0],
    [0, footprint],
    [0, -footprint],
    [footprint * 0.7, footprint * 0.7],
    [-footprint * 0.7, footprint * 0.7],
    [footprint * 0.7, -footprint * 0.7],
    [-footprint * 0.7, -footprint * 0.7],
  ];

  let maxHeight = worldPosToHeight(worldX, worldZ);
  for (const [offsetX, offsetZ] of offsets) {
    maxHeight = Math.max(maxHeight, worldPosToHeight(worldX + offsetX, worldZ + offsetZ));
  }

  return Math.max(worldPosToRouteHeight(worldX, worldZ, footprint), maxHeight);
}

export function buildRouteHeightProfile(points, {
  footprint = 4.5,
  clearance = 0.28,
  maxGrade = 0.018,
  smoothPasses = 3,
  followTerrain = false,
} = {}) {
  if (points.length === 0) return [];

  if (followTerrain) {
    return points.map((point) => worldPosToRouteHeight(point.x, point.z, footprint) + clearance);
  }

  const safeHeights = points.map((point) => worldPosToRouteSafeHeight(point.x, point.z, footprint) + clearance);
  let profile = smoothHeightSamples(safeHeights, 10, smoothPasses)
    .map((height, index) => Math.max(height, safeHeights[index]));

  // Build a road deck profile instead of a terrain-following line. Peaks become
  // long ramps while smaller terrain noise is absorbed by embankment/viaduct.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let index = profile.length - 2; index >= 0; index -= 1) {
      const maxDelta = horizontalDistance(points[index], points[index + 1]) * maxGrade;
      profile[index] = Math.max(profile[index], profile[index + 1] - maxDelta, safeHeights[index]);
    }

    for (let index = 1; index < profile.length; index += 1) {
      const maxDelta = horizontalDistance(points[index - 1], points[index]) * maxGrade;
      profile[index] = Math.max(profile[index], profile[index - 1] - maxDelta, safeHeights[index]);
    }

    profile = smoothHeightSamples(profile, 8, 1)
      .map((height, index) => Math.max(height, safeHeights[index]));
  }

  return profile;
}

export function buildSemanticRouteHeightProfile(points, getSegmentAtProgress, {
  footprint = 5.5,
  clearance = 0.16,
} = {}) {
  if (points.length === 0) return [];

  const terrainTrend = smoothHeightSamples(
    points.map((point) => worldPosToRouteHeight(point.x, point.z, footprint)),
    34,
    5,
  );
  const phaseByStyle = {
    flat: 0.2,
    rolling: 1.4,
    mountainPass: 2.8,
    tunnel: 3.3,
  };

  const heights = points.map((point, index) => {
    const progress = points.length <= 1 ? 0 : index / (points.length - 1);
    const segment = getSegmentAtProgress(progress);
    const style = segment?.profile?.elevationStyle ?? 'rolling';
    const segmentStart = segment?.startProgress ?? 0;
    const segmentEnd = segment?.endProgress ?? 1;
    const segmentRange = Math.max(segmentEnd - segmentStart, 0.001);
    const localProgress = THREE.MathUtils.clamp((progress - segmentStart) / segmentRange, 0, 1);
    const ramp = Math.sin(localProgress * Math.PI);
    const longWave = Math.sin((progress * Math.PI * 5.5) + (phaseByStyle[style] ?? 0));

    let height;

    if (style === 'mountainPass') {
      height = terrainTrend[index] + clearance + 0.18 * ramp + longWave * 0.025;
    } else if (style === 'tunnel') {
      height = terrainTrend[index] + clearance * 0.72 + longWave * 0.01;
    } else if (style === 'flat') {
      height = terrainTrend[index] + clearance + longWave * 0.008;
    } else {
      height = terrainTrend[index] + clearance + longWave * 0.018;
    }

    return style === 'tunnel' ? height : Math.max(height, terrainTrend[index] + clearance * 0.8);
  });

  return smoothHeightSamples(heights, 14, 3).map((height, index) => {
    const progress = points.length <= 1 ? 0 : index / (points.length - 1);
    const segment = getSegmentAtProgress(progress);
    const style = segment?.profile?.elevationStyle ?? 'rolling';
    return style === 'tunnel' ? height : Math.max(height, terrainTrend[index] + clearance * 0.75);
  });
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function smoothHeightSamples(source, radius, passes) {
  let heights = source;
  for (let pass = 0; pass < passes; pass += 1) {
    heights = heights.map((_, index) => {
      let total = 0;
      let weightTotal = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleIndex = THREE.MathUtils.clamp(index + offset, 0, heights.length - 1);
        const weight = radius + 1 - Math.abs(offset);
        total += heights[sampleIndex] * weight;
        weightTotal += weight;
      }
      return total / weightTotal;
    });
  }
  return heights;
}
