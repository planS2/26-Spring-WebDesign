import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cartesian3,
  Cartographic,
  buildModuleUrl,
  Color,
  createOsmBuildingsAsync,
  createWorldImageryAsync,
  createWorldTerrainAsync,
  DistanceDisplayCondition,
  EllipsoidGeodesic,
  HeadingPitchRange,
  HeightReference,
  Ion,
  LabelStyle,
  Matrix4,
  Math as CesiumMath,
  NearFarScalar,
  Quaternion,
  Rectangle,
  sampleTerrainMostDetailed,
  Transforms,
  HeadingPitchRoll,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useKeyboardDrive } from '../../hooks/useKeyboardDrive.js';
import { useActiveRouteGeo } from '../../hooks/useActiveRouteGeo.js';
import { landmarks } from '../../data/landmarks.js';
import { useAppStore } from '../../state/useAppStore.js';

buildModuleUrl.setBaseUrl(import.meta.env.DEV ? '/node_modules/cesium/Build/Cesium/' : '/cesium/');

const START_PROGRESS = 0;
const UI_SYNC_INTERVAL_MS = 100;
const DISPLAY_ROUTE_MAX_POINTS = 12000;
const ROUTE_SIMPLIFY_TOLERANCE_DEGREES = 0.000045;
const PASSED_CHUNK_KM = 5;
const ACTIVE_TRAIL_UPDATE_KM = 0.4;
const NORMAL_SPEED_KMH = 100;
const BOOST_SPEED_KMH = 175;
const NORMAL_TIME_SCALE = 12;
const BOOST_TIME_SCALE = 24;
const BUILDING_CACHE_BYTES = 128 * 1024 * 1024;
const BUILDING_OVERFLOW_BYTES = 48 * 1024 * 1024;
const ITALY_RECTANGLE = Rectangle.fromDegrees(6.2, 36.1, 19, 47.6);
const tempGeodesic = new EllipsoidGeodesic();

function routePositions(points) {
  return points.map(({ lon, lat }) => Cartesian3.fromDegrees(lon, lat));
}

function pointToSegmentDistanceSquared(point, start, end) {
  const latitudeScale = Math.cos(CesiumMath.toRadians(point.lat));
  const segmentX = (end.lon - start.lon) * latitudeScale;
  const segmentY = end.lat - start.lat;
  const pointX = (point.lon - start.lon) * latitudeScale;
  const pointY = point.lat - start.lat;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return pointX * pointX + pointY * pointY;
  const fraction = Math.max(
    0,
    Math.min(1, (pointX * segmentX + pointY * segmentY) / segmentLengthSquared),
  );
  const dx = pointX - segmentX * fraction;
  const dy = pointY - segmentY * fraction;
  return dx * dx + dy * dy;
}

function simplifyRoutePoints(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;

  while (stack.length) {
    const [startIndex, endIndex] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = toleranceSquared;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointToSegmentDistanceSquared(
        points[index],
        points[startIndex],
        points[endIndex],
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0) {
      keep[furthestIndex] = 1;
      stack.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function buildDisplayPoints(route) {
  if (route.points.length <= DISPLAY_ROUTE_MAX_POINTS) return route.points;
  let tolerance = ROUTE_SIMPLIFY_TOLERANCE_DEGREES;
  let simplified = simplifyRoutePoints(route.points, tolerance);
  while (simplified.length > DISPLAY_ROUTE_MAX_POINTS) {
    tolerance *= 1.35;
    simplified = simplifyRoutePoints(route.points, tolerance);
  }
  return simplified;
}

function distanceKm(a, b) {
  tempGeodesic.setEndPoints(
    Cartographic.fromDegrees(a.lon, a.lat),
    Cartographic.fromDegrees(b.lon, b.lat),
  );
  return tempGeodesic.surfaceDistance / 1000;
}

function formatSceneError(error) {
  if (!error) return 'Cesium scene failed to load.';
  return error instanceof Error ? error.message : String(error);
}

function routeHeading(route, progress) {
  const current = route.sample(progress);
  const lookAheadProgress = Math.min(1, progress + Math.max(0.00008, 0.25 / route.totalKm));
  const ahead = route.sample(lookAheadProgress);
  tempGeodesic.setEndPoints(
    Cartographic.fromDegrees(current.lon, current.lat),
    Cartographic.fromDegrees(ahead.lon, ahead.lat),
  );
  return tempGeodesic.startHeading;
}

function landmarkProgress(route, landmark) {
  let bestProgress = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 500; index += 1) {
    const progress = index / 500;
    const point = route.sample(progress);
    const dx = (point.lon - landmark.lon) * Math.cos(CesiumMath.toRadians(landmark.lat));
    const dy = point.lat - landmark.lat;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = progress;
    }
  }
  return bestProgress;
}

function getVisibleLandmarks(indexedLandmarks, progress) {
  if (!indexedLandmarks.length) return [];
  let nextIndex = indexedLandmarks.findIndex((item) => item.progress >= progress - 0.003);
  if (nextIndex < 0) nextIndex = indexedLandmarks.length - 1;
  return indexedLandmarks
    .filter((_, index) => Math.abs(index - nextIndex) <= 1)
    .map((item) => item.landmark);
}

function getStreamingPressure(queue, wasPaused) {
  const paused = wasPaused ? queue > 70 : queue > 120;
  if (paused) return { level: 'critical', factor: 0, paused: true };
  if (queue > 55) return { level: 'high', factor: 0.3, paused: false };
  if (queue > 18) return { level: 'medium', factor: 0.65, paused: false };
  return { level: 'low', factor: 1, paused: false };
}

function addLandmarkEntity(viewer, landmark, highlighted) {
  const common = {
    id: `landmark-${landmark.id}`,
    position: Cartesian3.fromDegrees(landmark.lon, landmark.lat),
    point: {
      pixelSize: highlighted ? 18 : 13,
      color: highlighted ? Color.fromCssColorString('#f0d490') : Color.fromCssColorString('#d8c09a'),
      outlineColor: Color.WHITE,
      outlineWidth: 3,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: landmark.name,
      font: '600 15px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#18324a'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: { x: 0, y: -32 },
      distanceDisplayCondition: new DistanceDisplayCondition(0, 28000),
      scaleByDistance: new NearFarScalar(1500, 1.1, 28000, 0.55),
      disableDepthTestDistance: 16000,
    },
  };

  if (landmark.modelPath) {
    return viewer.entities.add({
      ...common,
      model: {
        uri: landmark.modelPath,
        minimumPixelSize: highlighted ? 74 : 48,
        maximumScale: 180,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        runAnimations: false,
        color: Color.WHITE,
      },
    });
  }

  return viewer.entities.add(common);
}

export function CesiumDriveScene({ isStarted }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const isStartedRef = useRef(isStarted);
  const route = useActiveRouteGeo();
  const controls = useKeyboardDrive();
  const [streamingState, setStreamingState] = useState({
    queue: 0,
    level: 'low',
    paused: false,
  });
  const [sceneError, setSceneError] = useState('');
  const cesiumReady = useAppStore((state) => state.cesiumStatus.ready);
  const routeKey = `${route.signature}-${useAppStore((state) => state.tourResetToken)}`;
  const setCesiumStatus = useAppStore((state) => state.setCesiumStatus);
  const displayPoints = useMemo(() => buildDisplayPoints(route), [route]);
  const routeCartesian = useMemo(() => routePositions(displayPoints), [displayPoints]);

  useEffect(() => {
    isStartedRef.current = isStarted;
  }, [isStarted]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let disposed = false;
    let tickRemove = null;
    let buildings = null;
    let currentTileQueue = 0;
    const viewer = new Viewer(containerRef.current, {
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
    viewer.resolutionScale = window.innerWidth < 900 ? 0.78 : 0.9;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.maximumScreenSpaceError = 5;
    viewer.scene.globe.tileCacheSize = 70;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.preloadSiblings = false;
    viewer.scene.globe.loadingDescendantLimit = 20;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00018;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 12;
    viewer.imageryLayers.removeAll();

    const removeTileListener = viewer.scene.globe.tileLoadProgressEvent.addEventListener((count) => {
      currentTileQueue = count;
    });
    const removeRenderErrorListener = viewer.scene.renderError.addEventListener((_scene, error) => {
      if (!disposed) setSceneError(formatSceneError(error));
    });

    async function initialize() {
      try {
        const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
        if (!token) throw new Error('VITE_CESIUM_ION_TOKEN is not configured.');
        Ion.defaultAccessToken = token;
        setCesiumStatus({ terrain: 'loading', imagery: 'loading', buildings: 'loading', ready: false, error: '' });

        const [terrainProvider, imageryProvider] = await Promise.all([
          createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true }),
          createWorldImageryAsync(),
        ]);
        if (disposed) return;
        viewer.terrainProvider = terrainProvider;
        viewer.imageryLayers.addImageryProvider(imageryProvider);
        setCesiumStatus({ terrain: 'ready', imagery: 'ready' });

        const first = route.sample(START_PROGRESS);
        const sampled = await sampleTerrainMostDetailed(terrainProvider, [
          Cartographic.fromDegrees(first.lon, first.lat),
        ]);
        if (disposed) return;
        const startHeight = Number.isFinite(sampled[0]?.height) ? sampled[0].height : 0;

        try {
          buildings = await createOsmBuildingsAsync({
            cacheBytes: BUILDING_CACHE_BYTES,
            maximumCacheOverflowBytes: BUILDING_OVERFLOW_BYTES,
            maximumScreenSpaceError: 30,
            dynamicScreenSpaceError: true,
            dynamicScreenSpaceErrorFactor: 36,
            progressiveResolutionHeightFraction: 0.2,
            foveatedScreenSpaceError: true,
            foveatedConeSize: 0.15,
            foveatedTimeDelay: 0.6,
            cullRequestsWhileMoving: true,
            cullRequestsWhileMovingMultiplier: 80,
            preloadFlightDestinations: true,
          });
          if (!disposed) {
            viewer.scene.primitives.add(buildings);
            setCesiumStatus({ buildings: 'ready' });
          }
        } catch {
          if (!disposed) setCesiumStatus({ buildings: 'error' });
        }

        viewer.entities.add({
          id: 'route-base',
          polyline: {
            positions: routeCartesian,
            width: 6,
            material: Color.fromCssColorString('#f3e9c2').withAlpha(0.9),
            clampToGround: true,
          },
        });
        const activePassedRoute = viewer.entities.add({
          id: 'route-passed-active',
          polyline: {
            positions: routeCartesian.slice(0, 2),
            width: 6,
            material: Color.fromCssColorString('#d66f4d').withAlpha(0.96),
            clampToGround: true,
          },
        });
        const initialPosition = Cartesian3.fromDegrees(first.lon, first.lat, startHeight + 0.65);
        const initialOrientation = Transforms.headingPitchRollQuaternion(
          initialPosition,
          new HeadingPitchRoll(routeHeading(route, 0), 0, 0),
        );
        const vehicle = viewer.entities.add({
          id: 'tour-vehicle',
          position: initialPosition,
          orientation: initialOrientation,
          model: {
            uri: '/models/low-poly_truck_car_drifter.glb',
            scale: 0.18,
            minimumPixelSize: 18,
            maximumScale: 1.4,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
          },
        });

        const indexedLandmarks = route.routeIds
          .map((id) => landmarks.find((item) => item.id === id))
          .filter(Boolean)
          .map((landmark) => ({
            landmark,
            id: landmark.id,
            progress: landmarkProgress(route, landmark),
          }))
          .sort((a, b) => a.progress - b.progress);
        const landmarkEntities = new Map();
        const scratchPosition = new Cartesian3();
        const scratchOrientation = new Quaternion();
        const scratchHpr = new HeadingPitchRoll();
        let progress = START_PROGRESS;
        let previousProgress = START_PROGRESS;
        let furthestProgress = START_PROGRESS;
        let speedKmh = 0;
        let targetSpeedKmh = 0;
        let effectiveTimeScale = 0;
        let lastTime = performance.now();
        let lastUiSync = 0;
        let lastTrailDistanceKm = -ACTIVE_TRAIL_UPDATE_KM;
        let completedChunkCount = 0;
        let lastLandmarkKey = '';
        let smoothedHeading = routeHeading(route, progress);
        let smoothedRange = 1500;
        let mapModeApplied = false;
        let focusModeId = null;
        let previousCameraMode = 'follow';
        let pressure = getStreamingPressure(0, false);

        const positionsForProgressRange = (startProgress, endProgress) => {
          const distanceKm = Math.max(0, endProgress - startProgress) * route.totalKm;
          const pointCount = Math.max(2, Math.min(160, Math.ceil(distanceKm / 0.04) + 1));
          return Array.from({ length: pointCount }, (_, index) => {
            const fraction = pointCount === 1 ? 0 : index / (pointCount - 1);
            const point = route.sample(
              startProgress + (endProgress - startProgress) * fraction,
            );
            return Cartesian3.fromDegrees(point.lon, point.lat);
          });
        };

        const updatePassedRoute = () => {
          const passedDistanceKm = furthestProgress * route.totalKm;
          const requiredCompletedChunks = Math.floor(passedDistanceKm / PASSED_CHUNK_KM);
          while (completedChunkCount < requiredCompletedChunks) {
            const startProgress = (completedChunkCount * PASSED_CHUNK_KM) / route.totalKm;
            const endProgress = Math.min(1, ((completedChunkCount + 1) * PASSED_CHUNK_KM) / route.totalKm);
            const entity = viewer.entities.add({
              id: `route-passed-${completedChunkCount}`,
              polyline: {
                positions: positionsForProgressRange(startProgress, endProgress),
                width: 6,
                material: Color.fromCssColorString('#d66f4d').withAlpha(0.96),
                clampToGround: true,
              },
            });
            completedChunkCount += 1;
          }

          if (
            passedDistanceKm - lastTrailDistanceKm >= ACTIVE_TRAIL_UPDATE_KM
            || furthestProgress >= 1
          ) {
            lastTrailDistanceKm = passedDistanceKm;
            const activeStartProgress = Math.min(
              furthestProgress,
              (completedChunkCount * PASSED_CHUNK_KM) / route.totalKm,
            );
            activePassedRoute.polyline.positions.setValue(
              positionsForProgressRange(activeStartProgress, furthestProgress),
            );
          }
        };

        const applyLandmarks = (cameraMode) => {
          const visible = cameraMode === 'map'
            ? indexedLandmarks.map((item) => item.landmark)
            : getVisibleLandmarks(indexedLandmarks, progress);
          const key = visible.map((item) => item.id).join('|');
          if (key === lastLandmarkKey) return;
          lastLandmarkKey = key;
          const visibleIds = new Set(visible.map((item) => item.id));
          for (const [id, entity] of landmarkEntities) {
            if (!visibleIds.has(id)) {
              viewer.entities.remove(entity);
              landmarkEntities.delete(id);
            }
          }
          visible.forEach((landmark, index) => {
            if (!landmarkEntities.has(landmark.id)) {
              landmarkEntities.set(landmark.id, addLandmarkEntity(viewer, landmark, index === 1));
            }
          });
        };

        applyLandmarks(useAppStore.getState().cameraMode);
        setCesiumStatus({ ready: true });

        tickRemove = viewer.clock.onTick.addEventListener(() => {
          if (disposed) return;
          const now = performance.now();
          const delta = Math.min((now - lastTime) / 1000, 0.08);
          lastTime = now;
          const state = useAppStore.getState();
          const routeLocked = state.focusPanelOpen || state.modelViewerOpen;
          const input = controls.current;
          const hasManualInput = input.forward || input.backward;
          if (routeLocked || (hasManualInput && state.autoDrive)) state.setAutoDrive(false);

          if (!isStartedRef.current || routeLocked || !state.cesiumStatus.ready) {
            targetSpeedKmh = 0;
          } else if (state.autoDrive || input.forward) {
            targetSpeedKmh = input.boost ? BOOST_SPEED_KMH : NORMAL_SPEED_KMH;
          } else if (input.backward) {
            targetSpeedKmh = input.boost ? -36 : -22;
          } else {
            targetSpeedKmh = 0;
          }

          const acceleration = Math.abs(targetSpeedKmh) > Math.abs(speedKmh)
            ? input.boost ? 90 : 40
            : 52;
          const maxDelta = acceleration * delta;
          speedKmh += Math.max(-maxDelta, Math.min(maxDelta, targetSpeedKmh - speedKmh));
          if (Math.abs(speedKmh) < 0.05) speedKmh = 0;

          const buildingQueue = buildings
            ? (buildings.statistics?.numberOfPendingRequests ?? 0)
              + (buildings.statistics?.numberOfTilesProcessing ?? 0)
            : 0;
          pressure = getStreamingPressure(currentTileQueue + buildingQueue, pressure.paused);
          const requestedTimeScale = input.boost ? BOOST_TIME_SCALE : NORMAL_TIME_SCALE;
          const targetTimeScale = requestedTimeScale * pressure.factor;
          effectiveTimeScale += (targetTimeScale - effectiveTimeScale) * (1 - Math.exp(-delta * 0.8));
          if (pressure.paused && effectiveTimeScale < 0.15) effectiveTimeScale = 0;

          previousProgress = progress;
          progress = Math.max(0, Math.min(
            1,
            progress + (speedKmh / Math.max(route.distanceKm, 1) / 3600) * effectiveTimeScale * delta,
          ));
          furthestProgress = Math.max(furthestProgress, progress);
          if (progress >= 1 && speedKmh > 0) {
            speedKmh = 0;
            state.setAutoDrive(false);
            state.setGuidedTourState({ guidedTourState: 'FINISHED' });
          }

          const point = route.sample(progress);
          const heading = routeHeading(route, progress);
          Cartesian3.fromDegrees(point.lon, point.lat, 0.65, undefined, scratchPosition);
          scratchHpr.heading = heading;
          scratchHpr.pitch = 0;
          scratchHpr.roll = 0;
          Transforms.headingPitchRollQuaternion(
            scratchPosition,
            scratchHpr,
            undefined,
            undefined,
            scratchOrientation,
          );
          vehicle.position.setValue(scratchPosition);
          vehicle.orientation.setValue(scratchOrientation);

          updatePassedRoute();
          applyLandmarks(state.cameraMode);

          const crossedStop = indexedLandmarks.find((stop) => (
            previousProgress < stop.progress
            && progress >= stop.progress
            && !state.arrivedLandmarkIds.includes(stop.id)
          ));
          if (state.autoDrive && crossedStop) {
            speedKmh = 0;
            state.showArrivalNotice(crossedStop.id);
          }

          if (now - lastUiSync >= UI_SYNC_INTERVAL_MS) {
            lastUiSync = now;
            const combinedQueue = currentTileQueue + buildingQueue;
            setStreamingState((current) => (
              current.queue === combinedQueue
              && current.level === pressure.level
              && current.paused === pressure.paused
                ? current
                : { queue: combinedQueue, level: pressure.level, paused: pressure.paused }
            ));

            const settled = Math.abs(speedKmh) < 1 || state.cameraMode === 'focus';
            viewer.scene.globe.maximumScreenSpaceError = pressure.level === 'critical'
              ? 7
              : settled ? 2.75 : 5;
            if (buildings) {
              buildings.maximumScreenSpaceError = pressure.level === 'critical'
                ? 42
                : settled ? 20 : 30;
            }

            const currentIndex = Math.max(
              0,
              Math.min(route.routeIds.length - 1, Math.floor(progress * route.routeIds.length)),
            );
            let nearbyLandmark = null;
            let nearbyDistance = Number.POSITIVE_INFINITY;
            for (const { landmark } of indexedLandmarks) {
              const candidateDistance = distanceKm(point, landmark);
              if (candidateDistance < nearbyDistance) {
                nearbyDistance = candidateDistance;
                nearbyLandmark = landmark;
              }
            }
            state.setNearbyLandmarkId(nearbyDistance <= 5 ? nearbyLandmark?.id ?? null : null);
            state.setVehicleState({
              vehicleSpeed: Math.abs(speedKmh),
              vehicleSteer: 0,
              routeProgress: progress,
              routeDay: Math.min(3, Math.floor(progress * 3) + 1),
              routeHour: 7 + (progress * 36 % 12),
              routeContext: {
                point: { id: `cesium-${point.index}`, roadType: '真实道路' },
                segment: { id: 'cesium-route', type: 'scenic', speedLimit: 110, trafficState: 'normal' },
                profile: { label: 'Cesium 实景路线', surfaceLabel: '地形贴合道路', color: '#59666b' },
                currentStopId: route.routeIds[currentIndex],
              },
            });
          }

          if (state.cameraMode !== previousCameraMode) {
            if (buildings && (state.cameraMode === 'map' || previousCameraMode === 'map')) {
              buildings.trimLoadedTiles();
            }
            previousCameraMode = state.cameraMode;
          }

          if (state.cameraMode === 'map') {
            if (!mapModeApplied) {
              mapModeApplied = true;
              focusModeId = null;
              viewer.camera.lookAtTransform(Matrix4.IDENTITY);
              viewer.camera.flyTo({ destination: ITALY_RECTANGLE, duration: 1.2 });
            }
            return;
          }

          mapModeApplied = false;
          if (state.cameraMode === 'focus' && state.selectedLandmarkId) {
            if (focusModeId !== state.selectedLandmarkId) {
              focusModeId = state.selectedLandmarkId;
              viewer.camera.lookAtTransform(Matrix4.IDENTITY);
              const landmark = landmarks.find((item) => item.id === state.selectedLandmarkId);
              if (landmark) {
                viewer.camera.flyTo({
                  destination: Cartesian3.fromDegrees(landmark.lon, landmark.lat, 1300),
                  duration: 1.2,
                });
              }
            }
            return;
          }
          focusModeId = null;
          if (state.cameraMode === 'free') {
            viewer.camera.lookAtTransform(Matrix4.IDENTITY);
            return;
          }

          const speedRatio = Math.min(Math.abs(speedKmh) / BOOST_SPEED_KMH, 1);
          const headingDelta = CesiumMath.negativePiToPi(heading - smoothedHeading);
          smoothedHeading += headingDelta * (1 - Math.exp(-delta * 0.65));
          const targetRange = 2100 + speedRatio * 900;
          smoothedRange += (targetRange - smoothedRange) * (1 - Math.exp(-delta * 0.55));
          viewer.camera.lookAt(
            scratchPosition,
            new HeadingPitchRange(smoothedHeading, CesiumMath.toRadians(-52), smoothedRange),
          );
        });
      } catch (error) {
        if (disposed) return;
        const message = formatSceneError(error);
        setSceneError(message);
        setCesiumStatus({
          terrain: 'error',
          imagery: 'error',
          buildings: 'error',
          ready: false,
          error: message,
        });
      }
    }

    initialize();
    return () => {
      disposed = true;
      if (tickRemove) tickRemove();
      removeTileListener();
      removeRenderErrorListener();
      if (buildings && !buildings.isDestroyed()) buildings.trimLoadedTiles();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [controls, route, routeCartesian, routeKey, setCesiumStatus]);

  const showInitialLoading = !sceneError && !cesiumReady;
  const showStreamingPause = !sceneError && cesiumReady && streamingState.paused;

  return (
    <div className="cesium-drive-scene">
      <div ref={containerRef} className="cesium-drive-scene__canvas" />
      {(showInitialLoading || showStreamingPause) && (
        <div className={`cesium-drive-scene__loading ${showStreamingPause ? 'is-streaming' : ''}`}>
          <strong>{showStreamingPause ? '正在加载前方地图' : '正在加载意大利地形'}</strong>
          <span>
            {streamingState.queue > 0
              ? `剩余 ${streamingState.queue} 个地图资源`
              : '正在连接 Cesium ion'}
          </span>
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
