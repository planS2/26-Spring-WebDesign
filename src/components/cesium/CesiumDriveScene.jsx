import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveRouteGeo } from '../../hooks/useActiveRouteGeo.js';
import { landmarks } from '../../data/landmarks.js';
import { useAppStore } from '../../state/useAppStore.js';

const CESIUM_VERSION = '1.142';
const DEV_CESIUM_BASE = '/node_modules/cesium/Build/Cesium/';
const PROD_CESIUM_BASE = '/cesium/';
const CDN_CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;
const START_PROGRESS = 0;
const UI_SYNC_INTERVAL_MS = 100;
const DISPLAY_ROUTE_MAX_POINTS = 12000;
const BASE_TIME_SCALE = 60;
const NORMAL_SPEED_KMH = 100;
const BOOST_SPEED_KMH = 175;
const ACTIVE_TRAIL_PROGRESS_WINDOW = 0.018;
const ITALY_VIEW_RECTANGLE = [6.2, 36.1, 19, 47.6];

let cesiumRuntimePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-cesium-runtime="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (window.Cesium) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.cesiumRuntime = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`无法加载 Cesium 脚本：${src}`));
    document.head.appendChild(script);
  });
}

function ensureStylesheet(href) {
  if (document.querySelector(`link[data-cesium-widgets="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.cesiumWidgets = href;
  document.head.appendChild(link);
}

async function loadCesiumRuntime() {
  if (window.Cesium) return window.Cesium;
  if (!cesiumRuntimePromise) {
    cesiumRuntimePromise = (async () => {
      const localBase = import.meta.env.DEV ? DEV_CESIUM_BASE : PROD_CESIUM_BASE;
      let cesiumBaseUrl = localBase;
      ensureStylesheet(`${localBase}Widgets/widgets.css`);
      try {
        await loadScript(`${localBase}Cesium.js`);
      } catch {
        cesiumBaseUrl = CDN_CESIUM_BASE;
        ensureStylesheet(`${CDN_CESIUM_BASE}Widgets/widgets.css`);
        await loadScript(`${CDN_CESIUM_BASE}Cesium.js`);
      }
      if (!window.Cesium) throw new Error('Cesium runtime loaded but window.Cesium is unavailable.');
      window.Cesium.buildModuleUrl.setBaseUrl(cesiumBaseUrl);
      return window.Cesium;
    })();
  }
  return cesiumRuntimePromise;
}

function routePositions(Cesium, points) {
  return points.map(({ lon, lat }) => Cesium.Cartesian3.fromDegrees(lon, lat));
}

function buildDisplayPoints(route) {
  if (route.points.length <= DISPLAY_ROUTE_MAX_POINTS) return route.points;
  const step = Math.ceil(route.points.length / DISPLAY_ROUTE_MAX_POINTS);
  return route.points.filter((_, index) => index % step === 0 || index === route.points.length - 1);
}

function routeHeading(Cesium, route, progress) {
  const current = route.sample(progress);
  const ahead = route.sample(Math.min(1, progress + Math.max(0.00008, 0.25 / route.totalKm)));
  const geodesic = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(current.lon, current.lat),
    Cesium.Cartographic.fromDegrees(ahead.lon, ahead.lat),
  );
  return geodesic.startHeading;
}

function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  return 6371.0088 * 2 * Math.asin(Math.sqrt(
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon,
  ));
}

function landmarkProgress(route, landmark) {
  let bestProgress = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 600; index += 1) {
    const progress = index / 600;
    const point = route.sample(progress);
    const distance = distanceKm(point, landmark);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = progress;
    }
  }
  return bestProgress;
}

function progressRangePositions(Cesium, route, startProgress, endProgress, count = 96) {
  const safeStart = Math.max(0, Math.min(1, startProgress));
  const safeEnd = Math.max(safeStart, Math.min(1, endProgress));
  return Array.from({ length: Math.max(2, count) }, (_, index) => {
    const fraction = index / (Math.max(2, count) - 1);
    const point = route.sample(safeStart + (safeEnd - safeStart) * fraction);
    return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 18);
  });
}

function rectangleForRoute(Cesium, route) {
  const lons = route.points.map((point) => point.lon);
  const lats = route.points.map((point) => point.lat);
  if (!lons.length || !lats.length) return Cesium.Rectangle.fromDegrees(...ITALY_VIEW_RECTANGLE);
  const west = Math.min(...lons) - 0.45;
  const south = Math.min(...lats) - 0.35;
  const east = Math.max(...lons) + 0.45;
  const north = Math.max(...lats) + 0.35;
  return Cesium.Rectangle.fromDegrees(west, south, east, north);
}

function formatSceneError(error) {
  if (!error) return 'Cesium scene failed to load.';
  return error instanceof Error ? error.message : String(error);
}

function addLandmarkEntity(Cesium, viewer, landmark, highlighted) {
  return viewer.entities.add({
    id: `landmark-${landmark.id}`,
    position: Cesium.Cartesian3.fromDegrees(landmark.lon, landmark.lat, 45),
    point: {
      pixelSize: highlighted ? 19 : 14,
      color: highlighted ? Cesium.Color.fromCssColorString('#f0d490') : Cesium.Color.fromCssColorString('#7ed8ff'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: highlighted ? 4 : 2,
      heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: landmark.name,
      font: highlighted ? '700 16px sans-serif' : '600 14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString('#17324b'),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -34),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 90000),
      scaleByDistance: new Cesium.NearFarScalar(2000, 1.1, 90000, 0.55),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function updateLandmarkHighlight(Cesium, landmarkEntities, activeId) {
  for (const [id, entity] of landmarkEntities) {
    const active = id === activeId;
    entity.point.pixelSize = active ? 19 : 14;
    entity.point.color = active ? Cesium.Color.fromCssColorString('#f0d490') : Cesium.Color.fromCssColorString('#7ed8ff');
    entity.point.outlineWidth = active ? 4 : 2;
    entity.label.font = active ? '700 16px sans-serif' : '600 14px sans-serif';
  }
}

async function createWorldTerrain(Cesium) {
  if (Cesium.createWorldTerrainAsync) {
    return Cesium.createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true });
  }
  if (Cesium.createWorldTerrain) return Cesium.createWorldTerrain({ requestWaterMask: true, requestVertexNormals: true });
  if (Cesium.CesiumTerrainProvider?.fromIonAssetId) return Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true });
  return undefined;
}

async function createWorldImagery(Cesium) {
  if (Cesium.createWorldImageryAsync) return Cesium.createWorldImageryAsync();
  if (Cesium.createWorldImagery) return Cesium.createWorldImagery();
  if (Cesium.IonImageryProvider?.fromAssetId) return Cesium.IonImageryProvider.fromAssetId(2);
  return undefined;
}

async function createOsmBuildings(Cesium) {
  if (Cesium.createOsmBuildingsAsync) return Cesium.createOsmBuildingsAsync();
  if (Cesium.createOsmBuildings) return Cesium.createOsmBuildings();
  if (Cesium.Cesium3DTileset?.fromIonAssetId) return Cesium.Cesium3DTileset.fromIonAssetId(96188);
  return null;
}

export function CesiumDriveScene({ isStarted }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const isStartedRef = useRef(isStarted);
  const route = useActiveRouteGeo();
  const displayPoints = useMemo(() => buildDisplayPoints(route), [route]);
  const [sceneError, setSceneError] = useState('');
  const [loadingLabel, setLoadingLabel] = useState('正在加载 Cesium 真实地图');
  const setCesiumStatus = useAppStore((state) => state.setCesiumStatus);

  useEffect(() => {
    isStartedRef.current = isStarted;
  }, [isStarted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let viewer = null;
    let tickRemove = null;
    let clickHandler = null;
    let buildings = null;
    let progress = START_PROGRESS;
    let previousProgress = START_PROGRESS;
    let speedKmh = 0;
    let targetSpeedKmh = 0;
    let lastTime = performance.now();
    let lastUiSync = 0;
    let handledJumpToken = useAppStore.getState().vehicleJumpRequest?.token ?? null;
    let currentCameraMode = null;
    let currentHighlightId = null;
    let focusedCameraId = null;
    let smoothedHeading = 0;
    const routeStops = route.routeIds.map((id) => landmarks.find((item) => item.id === id)).filter(Boolean);
    const indexedLandmarks = routeStops
      .map((landmark) => ({ id: landmark.id, landmark, progress: landmarkProgress(route, landmark) }))
      .sort((a, b) => a.progress - b.progress);

    function syncRouteState(Cesium, routeContextPoint, routeContextProgress) {
      const state = useAppStore.getState();
      const nearest = indexedLandmarks.reduce((best, item) => {
        const candidateDistance = Math.abs(item.progress - routeContextProgress);
        return candidateDistance < best.distance ? { ...item, distance: candidateDistance } : best;
      }, { id: null, landmark: null, distance: Number.POSITIVE_INFINITY });
      state.setNearbyLandmarkId(nearest.distance <= 0.025 ? nearest.id : null);
      const currentIndex = Math.max(0, indexedLandmarks.findIndex((item) => item.progress >= routeContextProgress - 0.002));
      state.setVehicleState({
        vehicleSpeed: Math.abs(speedKmh),
        vehicleSteer: 0,
        routeProgress: routeContextProgress,
        routeDay: Math.min(3, Math.floor(routeContextProgress * 3) + 1),
        routeHour: 7 + ((routeContextProgress * 36) % 12),
        routeContext: {
          point: { id: `cesium-${routeContextPoint.index}`, landmarkId: nearest.id, roadType: 'Cesium 真实地图' },
          segment: { id: 'cesium-route', type: 'scenic', speedLimit: NORMAL_SPEED_KMH, trafficState: 'normal' },
          profile: { label: 'Cesium 实景路线', surfaceLabel: 'World Terrain / OSM Buildings', color: '#7ed8ff' },
          currentStopId: indexedLandmarks[currentIndex]?.id ?? indexedLandmarks.at(-1)?.id ?? null,
        },
      });
    }

    async function initialize() {
      try {
        const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
        if (!token) {
          throw new Error('缺少 VITE_CESIUM_ION_TOKEN。请在 .env.local 中配置 Cesium ion token 后重新启动开发服务器。');
        }

        setSceneError('');
        setLoadingLabel('正在加载 Cesium runtime');
        setCesiumStatus({ terrain: 'loading', imagery: 'loading', buildings: 'loading', ready: false, error: '' });
        const Cesium = await loadCesiumRuntime();
        if (disposed) return;
        Cesium.Ion.defaultAccessToken = token;
        smoothedHeading = routeHeading(Cesium, route, START_PROGRESS);

        setLoadingLabel('正在加载全球影像与 World Terrain');
        viewer = new Cesium.Viewer(container, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          shouldAnimate: true,
          useBrowserRecommendedResolution: true,
        });
        viewerRef.current = viewer;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.00016;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 30;
        viewer.imageryLayers.removeAll();

        const [terrainProvider, imageryProvider] = await Promise.all([
          createWorldTerrain(Cesium),
          createWorldImagery(Cesium),
        ]);
        if (disposed) return;
        if (terrainProvider) viewer.terrainProvider = terrainProvider;
        if (imageryProvider) viewer.imageryLayers.addImageryProvider(imageryProvider);
        setCesiumStatus({ terrain: terrainProvider ? 'ready' : 'error', imagery: imageryProvider ? 'ready' : 'error' });

        setLoadingLabel('正在加载 OSM Buildings 与路线图层');
        try {
          buildings = await createOsmBuildings(Cesium);
          if (buildings && !disposed) {
            buildings.maximumScreenSpaceError = 28;
            viewer.scene.primitives.add(buildings);
            setCesiumStatus({ buildings: 'ready' });
          }
        } catch {
          setCesiumStatus({ buildings: 'error' });
        }

        const routeCartesian = routePositions(Cesium, displayPoints);
        const baseRoute = viewer.entities.add({
          id: 'route-unfinished',
          polyline: {
            positions: routeCartesian,
            width: 5,
            material: Cesium.Color.fromCssColorString('#91b8c7').withAlpha(0.52),
            clampToGround: true,
          },
        });
        const passedRoute = viewer.entities.add({
          id: 'route-finished',
          polyline: {
            positions: progressRangePositions(Cesium, route, 0, 0.0001, 2),
            width: 7,
            material: Cesium.Color.fromCssColorString('#f0b46a').withAlpha(0.96),
            clampToGround: true,
          },
        });
        const currentRoute = viewer.entities.add({
          id: 'route-current-segment',
          polyline: {
            positions: progressRangePositions(Cesium, route, 0, ACTIVE_TRAIL_PROGRESS_WINDOW, 32),
            width: 10,
            material: Cesium.Color.fromCssColorString('#7ed8ff').withAlpha(0.92),
            clampToGround: true,
          },
        });

        const first = route.sample(START_PROGRESS);
        const vehicle = viewer.entities.add({
          id: 'tour-vehicle',
          position: Cesium.Cartesian3.fromDegrees(first.lon, first.lat, 80),
          point: {
            pixelSize: 20,
            color: Cesium.Color.fromCssColorString('#ffcf73'),
            outlineColor: Cesium.Color.fromCssColorString('#1a2f45'),
            outlineWidth: 4,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: '导览车',
            font: '700 13px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#1a2f45'),
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -30),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        const landmarkEntities = new Map();
        routeStops.forEach((landmark, index) => {
          landmarkEntities.set(landmark.id, addLandmarkEntity(Cesium, viewer, landmark, index === 0));
        });

        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.position);
          const pickedId = picked?.id?.id;
          if (typeof pickedId === 'string' && pickedId.startsWith('landmark-')) {
            const landmarkId = pickedId.replace('landmark-', '');
            useAppStore.getState().jumpVehicleToLandmark(landmarkId);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        const routeRectangle = rectangleForRoute(Cesium, route);
        viewer.camera.flyTo({ destination: routeRectangle, duration: 1.1 });
        setCesiumStatus({ ready: true, error: '' });
        setLoadingLabel('');

        tickRemove = viewer.clock.onTick.addEventListener(() => {
          if (disposed || !viewer || viewer.isDestroyed()) return;
          const now = performance.now();
          const delta = Math.min((now - lastTime) / 1000, 0.08);
          lastTime = now;
          const state = useAppStore.getState();
          const inputForward = false;
          const inputBackward = false;
          const inputBoost = false;
          const routeLocked = state.focusPanelOpen || state.modelViewerOpen;
          const jumpRequest = state.vehicleJumpRequest;

          if (jumpRequest?.token && handledJumpToken !== jumpRequest.token) {
            const station = indexedLandmarks.find((item) => item.id === jumpRequest.landmarkId);
            progress = Math.max(0, Math.min(1, station?.progress ?? landmarkProgress(route, { lon: route.sample(0).lon, lat: route.sample(0).lat })));
            previousProgress = progress;
            speedKmh = 0;
            targetSpeedKmh = 0;
            handledJumpToken = jumpRequest.token;
            const target = station?.landmark ?? landmarks.find((item) => item.id === jumpRequest.landmarkId);
            if (target) {
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(target.lon, target.lat, 1800),
                orientation: { heading: routeHeading(Cesium, route, progress), pitch: Cesium.Math.toRadians(-48), roll: 0 },
                duration: 0.85,
              });
            }
          }

          if (!isStartedRef.current || routeLocked) {
            targetSpeedKmh = 0;
          } else if (state.autoDrive || inputForward) {
            targetSpeedKmh = inputBoost ? BOOST_SPEED_KMH : NORMAL_SPEED_KMH;
          } else if (inputBackward) {
            targetSpeedKmh = inputBoost ? -36 : -22;
          } else {
            targetSpeedKmh = 0;
          }

          const acceleration = Math.abs(targetSpeedKmh) > Math.abs(speedKmh) ? 44 : 58;
          const maxDelta = acceleration * delta;
          speedKmh += Math.max(-maxDelta, Math.min(maxDelta, targetSpeedKmh - speedKmh));
          if (Math.abs(speedKmh) < 0.05) speedKmh = 0;

          previousProgress = progress;
          progress = Math.max(0, Math.min(
            1,
            progress + (speedKmh / Math.max(route.distanceKm, 1) / 3600) * BASE_TIME_SCALE * (state.autoDrive ? state.guidePlaybackRate : 1) * delta,
          ));

          const crossedStop = indexedLandmarks.find((stop) => (
            state.autoDrive
            && previousProgress < stop.progress
            && progress >= stop.progress
            && !state.arrivedLandmarkIds.includes(stop.id)
            && state.arrivalNotice?.landmarkId !== stop.id
          ));
          if (crossedStop) {
            speedKmh = 0;
            targetSpeedKmh = 0;
            state.showArrivalNotice(crossedStop.id);
          }

          if (progress >= 1 && speedKmh > 0) {
            speedKmh = 0;
            state.setAutoDrive(false);
            state.setGuidedTourState({ guidedTourState: 'FINISHED' });
          }

          const point = route.sample(progress);
          const heading = routeHeading(Cesium, route, progress);
          const vehiclePosition = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 85);
          vehicle.position.setValue(vehiclePosition);
          passedRoute.polyline.positions.setValue(progressRangePositions(Cesium, route, 0, Math.max(progress, 0.0001), Math.max(2, Math.min(240, Math.ceil(progress * 180)))));
          currentRoute.polyline.positions.setValue(progressRangePositions(Cesium, route, progress, Math.min(1, progress + ACTIVE_TRAIL_PROGRESS_WINDOW), 36));

          const highlight = indexedLandmarks.reduce((best, item) => {
            const distance = Math.abs(item.progress - progress);
            return distance < best.distance ? { id: item.id, distance } : best;
          }, { id: null, distance: Number.POSITIVE_INFINITY });
          if (highlight.id !== currentHighlightId) {
            currentHighlightId = highlight.id;
            updateLandmarkHighlight(Cesium, landmarkEntities, currentHighlightId);
          }

          if (now - lastUiSync >= UI_SYNC_INTERVAL_MS) {
            lastUiSync = now;
            syncRouteState(Cesium, point, progress);
          }

          if (state.cameraMode !== currentCameraMode) {
            currentCameraMode = state.cameraMode;
            if (currentCameraMode === 'map') {
              viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
              viewer.camera.flyTo({ destination: routeRectangle, duration: 1.0 });
            }
          }

          if (state.cameraMode === 'free') {
            focusedCameraId = null;
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            return;
          }

          if (state.cameraMode === 'focus' && state.selectedLandmarkId) {
            const target = landmarks.find((item) => item.id === state.selectedLandmarkId);
            if (target && focusedCameraId !== state.selectedLandmarkId) {
              focusedCameraId = state.selectedLandmarkId;
              viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
              viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(target.lon, target.lat, 1600), duration: 0.9 });
            }
            return;
          }

          if (state.cameraMode === 'follow') {
            focusedCameraId = null;
            const headingDelta = Cesium.Math.negativePiToPi(heading - smoothedHeading);
            smoothedHeading += headingDelta * (1 - Math.exp(-delta * 1.6));
            const range = 2100 + Math.min(Math.abs(speedKmh) / BOOST_SPEED_KMH, 1) * 900;
            viewer.camera.lookAt(
              vehiclePosition,
              new Cesium.HeadingPitchRange(smoothedHeading, Cesium.Math.toRadians(-50), range),
            );
          }
        });
      } catch (error) {
        if (disposed) return;
        const message = formatSceneError(error);
        setSceneError(message);
        setLoadingLabel('');
        setCesiumStatus({ terrain: 'error', imagery: 'error', buildings: 'error', ready: false, error: message });
      }
    }

    initialize();

    return () => {
      disposed = true;
      if (tickRemove) tickRemove();
      if (clickHandler && !clickHandler.isDestroyed()) clickHandler.destroy();
      if (buildings?.isDestroyed && !buildings.isDestroyed()) buildings.trimLoadedTiles?.();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, [displayPoints, route, setCesiumStatus]);

  return (
    <div className="cesium-drive-scene">
      <div ref={containerRef} className="cesium-drive-scene__canvas" />
      {loadingLabel && !sceneError && (
        <div className="cesium-drive-scene__loading">
          <strong>{loadingLabel}</strong>
          <span>正在连接 Cesium ion、World Terrain、全球影像与 OSM Buildings</span>
        </div>
      )}
      {sceneError && (
        <div className="cesium-drive-scene__error">
          <strong>实景地图加载失败</strong>
          <span>{sceneError}</span>
        </div>
      )}
    </div>
  );
}
