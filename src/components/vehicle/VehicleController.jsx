import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useKeyboardDrive } from '../../hooks/useKeyboardDrive.js';
import { useTerrainData } from '../../hooks/useTerrainData.js';
import { useActiveRoute3d } from '../../hooks/useActiveRoute3d.js';
import { useAppStore } from '../../state/useAppStore.js';
import { landmarks } from '../../data/landmarks.js';
import { getRouteProfile } from '../../data/routes.js';
import { buildRouteHeightProfile, worldPosToRouteHeight } from '../../data/terrain.js';

const START_PROGRESS = 0;
const BASE_CLEARANCE = 0.22;
const VEHICLE_TUNING = {
  simulationTimeScale: 1680,
  displaySpeedMultiplier: 4.2,
  exhibitionTargetMultiplier: 1.34,
  maxSpeed: 132,
  maxReverseKmh: 24,
  acceleration: 82,
  brakeDeceleration: 66,
  turnSpeedFactor: 2.8,
  lookAheadDistance: 0.012,
  stopDistance: 22,
  poiApproachDistance: 72,
  poiCruiseFactor: 0.7,
  focusSpeedKmh: 8,
  focusDurationSec: 5.2,
  resumeClearanceDistance: 46,
  maxSteerRatePerSec: 2.6,
  maxSteerAngle: 0.42,
};
const GUIDED_TOUR_STATES = {
  IDLE: 'IDLE',
  DRIVING: 'DRIVING',
  APPROACH_POI: 'APPROACH_POI',
  FOCUS_POI: 'FOCUS_POI',
  RESUME: 'RESUME',
  FINISHED: 'FINISHED',
};
const SIMULATED_DAYS = 3;
const wheelOffsets = [
  [-0.82, 0.2, 1.22],
  [0.82, 0.2, 1.22],
  [-0.82, 0.2, -1.22],
  [0.82, 0.2, -1.22],
];
const currentPoint = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const tangentPoint = new THREE.Vector3();
const aheadTangent = new THREE.Vector3();
const flatTangent = new THREE.Vector3();
const flatAheadTangent = new THREE.Vector3();
const reverseTangent = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);
const samplePoint = new THREE.Vector3();
const landmarkPoint = new THREE.Vector3();

export function VehicleController({ bodyRef, drivingEnabled, initialLandmarkId }) {
  const controls = useKeyboardDrive();
  const terrain = useTerrainData();
  const activeRoute = useActiveRoute3d();
  const setCameraMode = useAppStore((state) => state.setCameraMode);
  const setNearbyLandmarkId = useAppStore((state) => state.setNearbyLandmarkId);
  const setVehicleState = useAppStore((state) => state.setVehicleState);
  const selectLandmark = useAppStore((state) => state.selectLandmark);
  const clearGuidedTourFocus = useAppStore((state) => state.clearGuidedTourFocus);
  const setGuidedTourState = useAppStore((state) => state.setGuidedTourState);
  const autoDrive = useAppStore((state) => state.autoDrive);
  const setAutoDrive = useAppStore((state) => state.setAutoDrive);
  const focusPanelOpen = useAppStore((state) => state.focusPanelOpen);
  const modelViewerOpen = useAppStore((state) => state.modelViewerOpen);
  const tourResetToken = useAppStore((state) => state.tourResetToken);
  const arrivedLandmarkIds = useAppStore((state) => state.arrivedLandmarkIds);
  const arrivalNotice = useAppStore((state) => state.arrivalNotice);
  const showArrivalNotice = useAppStore((state) => state.showArrivalNotice);
  const cameraMode = useAppStore((state) => state.cameraMode);
  const tourSpeedMultiplier = useAppStore((state) => state.tourSpeedMultiplier);
  const routeJumpRequest = useAppStore((state) => state.routeJumpRequest);
  const progressRef = useRef(START_PROGRESS);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const steerRef = useRef(0);
  const initializedTargetRef = useRef(null);
  const poseYawRef = useRef(Number.NaN);
  const guidedTourStateRef = useRef(GUIDED_TOUR_STATES.IDLE);
  const focusedLandmarkIdRef = useRef(null);
  const focusTimerRef = useRef(0);
  const visitedLandmarksRef = useRef(new Set());
  const previousProgressRef = useRef(START_PROGRESS);
  const handledJumpTokenRef = useRef(null);

  const routeCurve = useMemo(() => {
    const sampledPoints = activeRoute.curve.getPoints(activeRoute.source === 'osrm' ? 420 : 180);
    const roadProfile = buildRouteHeightProfile(sampledPoints, { clearance: 0.22, maxGrade: 0.025, smoothPasses: 2 });

    const terrainAwarePoints = sampledPoints.map((point, index) => new THREE.Vector3(
      point.x,
      roadProfile[index] + BASE_CLEARANCE,
      point.z,
    ));
    return new THREE.CatmullRomCurve3(terrainAwarePoints, false, 'centripetal', 0.08);
  }, [activeRoute, terrain.version]);

  const stationTriggers = useMemo(() => {
    const routeStopIds = activeRoute.routeIds.length
      ? activeRoute.routeIds
      : ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'];

    return routeStopIds
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .map((id) => ({ id, progress: getInitialProgress(id, routeCurve) }))
      .sort((a, b) => a.progress - b.progress);
  }, [activeRoute.routeIds, routeCurve]);

  useFrame((_, delta) => {
    const vehicle = bodyRef.current;
    if (!vehicle) return;

    const routeSignature = activeRoute.points.map((point) => `${point.x.toFixed(2)},${point.z.toFixed(2)}`).join('|');
    const routeInitKey = `${initialLandmarkId ?? 'start'}-${tourResetToken}-${terrain.version}-${activeRoute.source}-${routeSignature}`;
    if (initializedTargetRef.current !== routeInitKey) {
      progressRef.current = getInitialProgress(initialLandmarkId, routeCurve);
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      steerRef.current = 0;
      poseYawRef.current = Number.NaN;
      guidedTourStateRef.current = GUIDED_TOUR_STATES.IDLE;
      focusedLandmarkIdRef.current = null;
      focusTimerRef.current = 0;
      visitedLandmarksRef.current = new Set();
      previousProgressRef.current = progressRef.current;
      initializedTargetRef.current = routeInitKey;
      applyCurvePose(vehicle, routeCurve, progressRef.current, 0, poseYawRef, delta);
      setNearbyLandmarkId(getNearbyLandmarkId(currentPoint.x, currentPoint.z));
      setGuidedTourState(getGuidedTourPayload(GUIDED_TOUR_STATES.IDLE));
      setVehicleState({ vehicleSpeed: 0, vehicleSteer: 0, routeContext: getRouteContext(progressRef.current, activeRoute, routeCurve), ...getRouteTimeline(progressRef.current) });
    }

    if (routeJumpRequest?.token && handledJumpTokenRef.current !== routeJumpRequest.token) {
      const jumpProgress = getInitialProgress(routeJumpRequest.landmarkId, routeCurve);
      progressRef.current = THREE.MathUtils.clamp(jumpProgress, 0, 1);
      previousProgressRef.current = progressRef.current;
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      steerRef.current = 0;
      poseYawRef.current = Number.NaN;
      handledJumpTokenRef.current = routeJumpRequest.token;
      applyCurvePose(vehicle, routeCurve, progressRef.current, 0, poseYawRef, delta);
      setNearbyLandmarkId(routeJumpRequest.landmarkId);
      setVehicleState({
        vehicleSpeed: 0,
        vehicleSteer: 0,
        routeContext: getRouteContext(progressRef.current, activeRoute, routeCurve),
        ...getRouteTimeline(progressRef.current),
      });
      if (progressRef.current >= 0.999) {
        guidedTourStateRef.current = GUIDED_TOUR_STATES.FINISHED;
        setGuidedTourState(getGuidedTourPayload(GUIDED_TOUR_STATES.FINISHED, routeJumpRequest.landmarkId, '路线导览完成'));
      }
      return;
    }

    if (!drivingEnabled) {
      progressRef.current = getInitialProgress(initialLandmarkId, routeCurve);
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      steerRef.current = 0;
      poseYawRef.current = Number.NaN;
      guidedTourStateRef.current = GUIDED_TOUR_STATES.IDLE;
      focusedLandmarkIdRef.current = null;
      focusTimerRef.current = 0;
      previousProgressRef.current = progressRef.current;
      setAutoDrive(false);
      setNearbyLandmarkId(initialLandmarkId ?? null);
      clearGuidedTourFocus();
      setGuidedTourState(getGuidedTourPayload(GUIDED_TOUR_STATES.IDLE));
      setVehicleState({ vehicleSpeed: 0, vehicleSteer: 0, routeContext: getRouteContext(progressRef.current, activeRoute, routeCurve), ...getRouteTimeline(progressRef.current) });
      applyCurvePose(vehicle, routeCurve, progressRef.current, 0, poseYawRef, delta);
      return;
    }

    const routeLocked = focusPanelOpen || modelViewerOpen;
    const routeContext = getRouteContext(progressRef.current, activeRoute, routeCurve);
    const routeSpeedFactor = THREE.MathUtils.clamp(routeContext.profile.speedFactor, 0.2, 1.08);
    const input = controls.current;
    const hasManualInput = input.forward || input.backward;
    if (routeLocked || (hasManualInput && autoDrive)) {
      setAutoDrive(false);
    }

    const nearbyLandmark = getNearbyLandmarkInfo(currentPoint.x, currentPoint.z);
    const routeStopIds = activeRoute.routeIds.length
      ? activeRoute.routeIds
      : ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'];
    // 到站检测：只对当前路线站点触发一次，到站后暂停并交给 UI 卡片继续。
    const shouldShowArrival = Boolean(
      autoDrive
      && !routeLocked
      && nearbyLandmark
      && routeStopIds.includes(nearbyLandmark.id)
      && nearbyLandmark.distance <= Math.max(nearbyLandmark.landmarkTriggerRadius, VEHICLE_TUNING.stopDistance)
      && !arrivedLandmarkIds.includes(nearbyLandmark.id)
      && arrivalNotice?.landmarkId !== nearbyLandmark.id,
    );
    if (shouldShowArrival) {
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      showArrivalNotice(nearbyLandmark.id);
    }

    const activeGuidePoi = nearbyLandmark && !visitedLandmarksRef.current.has(nearbyLandmark.id)
      ? nearbyLandmark
      : null;

    updateGuidedTourState({
      activeGuidePoi,
      autoDrive,
      clearGuidedTourFocus,
      delta,
      focusedLandmarkIdRef,
      focusTimerRef,
      guidedTourStateRef,
      routeLocked,
      selectLandmark,
      setCameraMode,
      setGuidedTourState,
      speedKmh: Math.abs(speedRef.current),
      visitedLandmarksRef,
    });

    if (routeLocked) {
      targetSpeedRef.current = 0;
    } else if (autoDrive) {
      targetSpeedRef.current = routeContext.segment.speedLimit * routeSpeedFactor * VEHICLE_TUNING.exhibitionTargetMultiplier;
    } else {
      let targetKmh = 0;
      if (input.forward) targetKmh += routeContext.segment.speedLimit * routeSpeedFactor * VEHICLE_TUNING.exhibitionTargetMultiplier * (input.boost ? 1.35 : 1);
      if (input.backward) targetKmh -= VEHICLE_TUNING.maxReverseKmh;
      targetSpeedRef.current = targetKmh;
    }

    if (activeGuidePoi && autoDrive && !routeLocked && guidedTourStateRef.current !== GUIDED_TOUR_STATES.RESUME) {
      if (nearbyLandmark.distance <= VEHICLE_TUNING.stopDistance) {
        targetSpeedRef.current = 0;
      } else if (nearbyLandmark.distance <= VEHICLE_TUNING.poiApproachDistance) {
        const poiSlowdown = THREE.MathUtils.clamp(
          (nearbyLandmark.distance - VEHICLE_TUNING.stopDistance) / (VEHICLE_TUNING.poiApproachDistance - VEHICLE_TUNING.stopDistance),
          0.16,
          1,
        );
        targetSpeedRef.current *= VEHICLE_TUNING.poiCruiseFactor * poiSlowdown;
      }
    }
    targetSpeedRef.current = THREE.MathUtils.clamp(targetSpeedRef.current, -VEHICLE_TUNING.maxReverseKmh, VEHICLE_TUNING.maxSpeed);

    const maxDelta = (Math.abs(targetSpeedRef.current) > Math.abs(speedRef.current)
      ? VEHICLE_TUNING.acceleration
      : VEHICLE_TUNING.brakeDeceleration) * delta;
    speedRef.current = THREE.MathUtils.clamp(targetSpeedRef.current, speedRef.current - maxDelta, speedRef.current + maxDelta);
    if (Math.abs(speedRef.current) < 0.05) speedRef.current = 0;

    const progressDelta = (speedRef.current / Math.max(activeRoute.distanceKm ?? activeRoute.distance ?? activeRoute.totalDistanceKm ?? 1, 1) / 3600)
      * VEHICLE_TUNING.simulationTimeScale * tourSpeedMultiplier * delta;

    // 使用 delta time 推进路线进度，并始终限制在 0-1，避免不同帧率或自动巡航导致越界。
    const nextProgress = THREE.MathUtils.clamp(progressRef.current + progressDelta, 0, 1);
    progressRef.current = nextProgress;

    const arrivalByProgress = getRouteArrivalByProgress({
      arrivalNotice,
      arrivedLandmarkIds,
      currentProgress: progressRef.current,
      previousProgress: previousProgressRef.current,
      stationTriggers,
    });
    if (autoDrive && !routeLocked && arrivalByProgress) {
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      showArrivalNotice(arrivalByProgress.id);
    }
    previousProgressRef.current = progressRef.current;

    if (progressRef.current >= 1 && speedRef.current > 0) {
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      if (autoDrive) setAutoDrive(false);
      guidedTourStateRef.current = GUIDED_TOUR_STATES.FINISHED;
      setGuidedTourState(getGuidedTourPayload(GUIDED_TOUR_STATES.FINISHED));
    }

    const targetSteer = applyCurvePose(vehicle, routeCurve, progressRef.current, speedRef.current, poseYawRef, delta);
    const steerDeltaCap = VEHICLE_TUNING.maxSteerRatePerSec * delta;
    steerRef.current = THREE.MathUtils.clamp(targetSteer, steerRef.current - steerDeltaCap, steerRef.current + steerDeltaCap);
    setNearbyLandmarkId(nearbyLandmark?.id ?? null);
    setVehicleState({
      vehicleSpeed: Math.abs(speedRef.current),
      vehicleSteer: steerRef.current,
      routeContext: getRouteContext(progressRef.current, activeRoute, routeCurve),
      routeProgress: progressRef.current,
      ...getRouteTimeline(progressRef.current),
    });

    if (speedRef.current !== 0 && !routeLocked && guidedTourStateRef.current !== GUIDED_TOUR_STATES.FOCUS_POI && cameraMode !== 'free') setCameraMode('follow');
  });

  return null;
}


function getRouteArrivalByProgress({ arrivalNotice, arrivedLandmarkIds, currentProgress, previousProgress, stationTriggers }) {
  const ARRIVAL_PROGRESS_WINDOW = 0.012;
  return stationTriggers.find((station) => {
    if (!station?.id || arrivedLandmarkIds.includes(station.id) || arrivalNotice?.landmarkId === station.id) return false;
    const crossedStation = previousProgress <= station.progress && currentProgress >= station.progress;
    const nearStation = Math.abs(currentProgress - station.progress) <= ARRIVAL_PROGRESS_WINDOW;
    return crossedStation || nearStation;
  }) ?? null;
}

function getRouteTimeline(progress) {
  const dayProgress = THREE.MathUtils.clamp(progress, 0, 0.9999) * SIMULATED_DAYS;
  const routeDay = Math.floor(dayProgress) + 1;
  const localDayProgress = dayProgress % 1;
  return {
    routeProgress: progress,
    routeDay,
    routeHour: 7 + localDayProgress * 12,
  };
}

function getGuidedTourPoi(landmarkId) {
  const landmark = landmarks.find((item) => item.id === landmarkId);
  if (!landmark) return null;
  return {
    id: landmark.id,
    name: landmark.name,
    position: landmark.position,
    landmarkTriggerRadius: landmark.triggerRadius,
    triggerRadius: Math.max(landmark.triggerRadius, VEHICLE_TUNING.poiApproachDistance),
    focusDuration: VEHICLE_TUNING.focusDurationSec,
    introText: `${landmark.name} ahead`,
    outroText: `Leaving ${landmark.name}`,
    cameraPreset: 'focus',
    audioKey: `guide-${landmark.id}`,
  };
}

function getGuidedTourPayload(guidedTourState, guidedTourLandmarkId = null, guidedTourMessage = '') {
  return { guidedTourState, guidedTourLandmarkId, guidedTourMessage };
}

function transitionGuidedTour({
  clearGuidedTourFocus,
  focusedLandmarkIdRef,
  focusTimerRef,
  guidedTourLandmarkId = null,
  guidedTourMessage = '',
  guidedTourState,
  guidedTourStateRef,
  selectLandmark,
  setCameraMode,
  setGuidedTourState,
}) {
  if (guidedTourStateRef.current === guidedTourState && focusedLandmarkIdRef.current === guidedTourLandmarkId) return;
  guidedTourStateRef.current = guidedTourState;
  focusedLandmarkIdRef.current = guidedTourLandmarkId;
  focusTimerRef.current = 0;

  if (guidedTourState === GUIDED_TOUR_STATES.FOCUS_POI && guidedTourLandmarkId) {
    selectLandmark(guidedTourLandmarkId);
  }
  if (guidedTourState === GUIDED_TOUR_STATES.RESUME || guidedTourState === GUIDED_TOUR_STATES.DRIVING) {
    clearGuidedTourFocus();
    setCameraMode('follow');
  }

  setGuidedTourState(getGuidedTourPayload(guidedTourState, guidedTourLandmarkId, guidedTourMessage));
}

function updateGuidedTourState({
  activeGuidePoi,
  autoDrive,
  clearGuidedTourFocus,
  delta,
  focusedLandmarkIdRef,
  focusTimerRef,
  guidedTourStateRef,
  routeLocked,
  selectLandmark,
  setCameraMode,
  setGuidedTourState,
  speedKmh,
  visitedLandmarksRef,
}) {
  const transition = (guidedTourState, guidedTourLandmarkId = null, guidedTourMessage = '') => transitionGuidedTour({
    clearGuidedTourFocus,
    focusedLandmarkIdRef,
    focusTimerRef,
    guidedTourLandmarkId,
    guidedTourMessage,
    guidedTourState,
    guidedTourStateRef,
    selectLandmark,
    setCameraMode,
    setGuidedTourState,
  });

  if (routeLocked) {
    transition(GUIDED_TOUR_STATES.IDLE);
    return;
  }

  if (!autoDrive) {
    if (activeGuidePoi && activeGuidePoi.distance <= activeGuidePoi.landmarkTriggerRadius) {
      transition(GUIDED_TOUR_STATES.APPROACH_POI, activeGuidePoi.id, activeGuidePoi.introText);
      return;
    }
    transition(GUIDED_TOUR_STATES.DRIVING);
    return;
  }

  if (guidedTourStateRef.current === GUIDED_TOUR_STATES.FOCUS_POI) {
    focusTimerRef.current += delta;
    if (focusTimerRef.current >= (activeGuidePoi?.focusDuration ?? VEHICLE_TUNING.focusDurationSec)) {
      if (focusedLandmarkIdRef.current) visitedLandmarksRef.current.add(focusedLandmarkIdRef.current);
      transition(GUIDED_TOUR_STATES.RESUME, focusedLandmarkIdRef.current, activeGuidePoi?.outroText ?? '继续导览');
    }
    return;
  }

  if (guidedTourStateRef.current === GUIDED_TOUR_STATES.RESUME) {
    if (!activeGuidePoi || activeGuidePoi.id !== focusedLandmarkIdRef.current) {
      transition(GUIDED_TOUR_STATES.DRIVING);
    }
    return;
  }

  if (activeGuidePoi) {
    if (activeGuidePoi.distance <= VEHICLE_TUNING.stopDistance && speedKmh <= VEHICLE_TUNING.focusSpeedKmh) {
      transition(GUIDED_TOUR_STATES.FOCUS_POI, activeGuidePoi.id, activeGuidePoi.introText);
      return;
    }
    if (activeGuidePoi.distance <= activeGuidePoi.triggerRadius) {
      transition(GUIDED_TOUR_STATES.APPROACH_POI, activeGuidePoi.id, activeGuidePoi.introText);
      return;
    }
  }

  transition(GUIDED_TOUR_STATES.DRIVING);
}

function getRouteContext(progress, activeRoute, curve) {
  const safeProgress = THREE.MathUtils.clamp(progress, 0, 1);
  const routePoint = activeRoute.pointAtProgress(safeProgress);
  const curvatureSpeedFactor = getCurvatureSpeedFactor(safeProgress, curve ?? activeRoute.curve);
  const point = {
    id: `route-${routePoint.index}`,
    landmarkId: null,
    roadType: activeRoute.source === 'osrm' ? '实景道路' : '规划路线',
  };
  const segment = {
    id: activeRoute.source === 'osrm' ? 'osrm-road' : 'planned-road',
    type: activeRoute.source === 'osrm' ? 'motorway' : 'scenic',
    trafficState: 'normal',
    speedLimit: activeRoute.source === 'osrm' ? 90 : 70,
    profile: {
      label: activeRoute.source === 'osrm' ? '道路路线' : '规划路线',
      surfaceLabel: activeRoute.source === 'osrm' ? '地图道路' : '导览路径',
      speedFactor: 0.9,
      roughness: activeRoute.source === 'osrm' ? 0.018 : 0.032,
      turnLean: 0.92,
      curveIntensity: 0.7,
      elevationStyle: 'rolling',
      color: '#6b7f84',
    },
  };
  return {
    point,
    segment: {
      ...segment,
      speedLimit: segment.speedLimit * curvatureSpeedFactor,
    },
    profile: getRouteProfile(segment),
  };
}

function getCurvatureSpeedFactor(progress, curve) {
  if (!curve) return 1;
  curve.getTangentAt(progress, tangentPoint);
  curve.getTangentAt(THREE.MathUtils.clamp(progress + VEHICLE_TUNING.lookAheadDistance * 0.66, 0, 1), aheadTangent);
  flatTangent.copy(tangentPoint).setY(0).normalize();
  flatAheadTangent.copy(aheadTangent).setY(0).normalize();
  if (flatTangent.lengthSq() === 0 || flatAheadTangent.lengthSq() === 0) return 1;
  const turnAngle = flatTangent.angleTo(flatAheadTangent);
  return THREE.MathUtils.clamp(1 - turnAngle * VEHICLE_TUNING.turnSpeedFactor, 0.42, 1);
}

function getInitialProgress(initialLandmarkId, curve) {
  if (!initialLandmarkId) return START_PROGRESS;
  const landmark = landmarks.find((item) => item.id === initialLandmarkId);
  if (!landmark) return START_PROGRESS;

  landmarkPoint.set(
    landmark.position[0],
    worldPosToRouteHeight(landmark.position[0], landmark.position[2]) + BASE_CLEARANCE,
    landmark.position[2],
  );

  let closestProgress = START_PROGRESS;
  let closestDistance = Number.POSITIVE_INFINITY;
  const samples = 320;
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    curve.getPointAt(progress, samplePoint);
    const distance = samplePoint.distanceTo(landmarkPoint);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestProgress = progress;
    }
  }
  return closestProgress;
}

function applyCurvePose(vehicle, curve, progress, speed, poseYawRef, delta) {
  const safeProgress = THREE.MathUtils.clamp(progress, 0, 1);
  curve.getPointAt(safeProgress, currentPoint);
  // 小车朝向直接取路线切线，并向前采样一小段用于计算转向角。
  curve.getTangentAt(safeProgress, tangentPoint);
  curve.getTangentAt(THREE.MathUtils.clamp(safeProgress + VEHICLE_TUNING.lookAheadDistance, 0, 1), aheadTangent);

  flatTangent.copy(tangentPoint).setY(0).normalize();
  if (flatTangent.lengthSq() === 0) return 0;

  if (speed >= 0) {
    lookTarget.copy(currentPoint).add(flatTangent);
  } else {
    reverseTangent.copy(flatTangent).multiplyScalar(-1);
    lookTarget.copy(currentPoint).add(reverseTangent);
  }

  vehicle.position.copy(currentPoint);
  const targetYaw = Math.atan2(lookTarget.x - currentPoint.x, lookTarget.z - currentPoint.z);
  if (!Number.isFinite(poseYawRef.current)) poseYawRef.current = targetYaw;
  poseYawRef.current = THREE.MathUtils.damp(poseYawRef.current, targetYaw, 8.6, delta);
  vehicle.rotation.set(0, poseYawRef.current, 0);

  flatAheadTangent.copy(aheadTangent).setY(0).normalize();
  if (flatAheadTangent.lengthSq() === 0) return 0;

  const turnAngle = flatTangent.angleTo(flatAheadTangent);
  const turnSign = Math.sign(flatTangent.clone().cross(flatAheadTangent).dot(upAxis)) || 0;
  return THREE.MathUtils.clamp(turnAngle * turnSign * 4.5, -VEHICLE_TUNING.maxSteerAngle, VEHICLE_TUNING.maxSteerAngle);
}

function getNearbyLandmarkId(x, z) {
  return getNearbyLandmarkInfo(x, z)?.id ?? null;
}

function getNearbyLandmarkInfo(x, z) {
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const landmark of landmarks) {
    const dx = landmark.position[0] - x;
    const dz = landmark.position[2] - z;
    const distance = Math.hypot(dx, dz);
    const guideTriggerRadius = Math.max(landmark.triggerRadius, VEHICLE_TUNING.poiApproachDistance);
    if (distance <= guideTriggerRadius && distance < closestDistance) {
      closest = landmark.id;
      closestDistance = distance;
    }
  }
  if (!closest) return null;
  return { ...getGuidedTourPoi(closest), distance: closestDistance };
}

export function VehicleChassis({ bodyRef }) {
  const rootRef = useRef();
  const trailRef = useRef();
  const headLightRef = useRef();
  const frontLeftRef = useRef();
  const frontRightRef = useRef();
  const rearLeftRef = useRef();
  const rearRightRef = useRef();
  const vehicleSpeed = useAppStore((state) => state.vehicleSpeed);
  const tourSpeedMultiplier = useAppStore((state) => state.tourSpeedMultiplier);
  const vehicleSteer = useAppStore((state) => state.vehicleSteer);
  const routeContext = useAppStore((state) => state.routeContext);
  const autoDrive = useAppStore((state) => state.autoDrive);
  const wheelSpin = useRef(0);

  useFrame((_, delta) => {
    wheelSpin.current += vehicleSpeed * Math.max(tourSpeedMultiplier, 1) * delta * 0.045;
    const speedRatio = Math.min(vehicleSpeed / 130, 1);
    const roughness = routeContext?.profile?.roughness ?? 0.08;
    const turnLean = routeContext?.profile?.turnLean ?? 1;
    const bodyLean = -vehicleSteer * turnLean * Math.min(0.22 + speedRatio * 0.14, 0.34);
    const bodyPitch = -speedRatio * 0.03 + (autoDrive ? -0.005 : 0);

    if (rootRef.current) {
      rootRef.current.rotation.z += (bodyLean - rootRef.current.rotation.z) * 0.12;
      rootRef.current.rotation.x += (bodyPitch - rootRef.current.rotation.x) * 0.08;
      const roadBuzz = (
        Math.sin(wheelSpin.current * 0.36) * 0.006
        + Math.sin(wheelSpin.current * 0.74 + 1.7) * 0.003
      ) * roughness * Math.min(speedRatio + 0.2, 1);
      rootRef.current.position.y += (roadBuzz - rootRef.current.position.y) * 0.055;
    }

    if (trailRef.current) {
      const trailScale = 0.35 + speedRatio * 1.35;
      trailRef.current.scale.z += (trailScale - trailRef.current.scale.z) * 0.12;
      trailRef.current.position.z += ((-2.35 - speedRatio * 1.1) - trailRef.current.position.z) * 0.12;
      trailRef.current.material.opacity += ((vehicleSpeed > 0.6 ? 0.34 : 0.08) - trailRef.current.material.opacity) * 0.08;
    }

    if (headLightRef.current) {
      headLightRef.current.intensity += ((vehicleSpeed > 0.4 ? 1.55 : 0.72) - headLightRef.current.intensity) * 0.1;
    }

    for (const wheel of [rearLeftRef.current, rearRightRef.current]) {
      if (!wheel) continue;
      wheel.rotation.x = wheelSpin.current;
    }
    for (const wheel of [frontLeftRef.current, frontRightRef.current]) {
      if (!wheel) continue;
      wheel.rotation.x = wheelSpin.current;
      wheel.rotation.y += (vehicleSteer * 0.72 - wheel.rotation.y) * 0.14;
    }
  });

  return (
    <group ref={bodyRef} scale={0.18}>
      <group ref={rootRef}>
        <mesh position={[0, 0.08, -0.18]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.85, 32]} />
          <meshBasicMaterial color="#263341" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <mesh castShadow position={[0, 0.58, -0.02]}>
          <boxGeometry args={[2.16, 0.46, 4.12]} />
          <meshStandardMaterial color={autoDrive ? '#d29b62' : '#b87452'} roughness={0.48} metalness={0.16} />
        </mesh>
        <mesh castShadow position={[0, 1.06, -0.16]}>
          <boxGeometry args={[1.62, 0.54, 2.02]} />
          <meshStandardMaterial color="#c48a63" roughness={0.46} metalness={0.06} />
        </mesh>
        <mesh castShadow position={[0, 0.84, 0.22]}>
          <boxGeometry args={[1.48, 0.34, 1.48]} />
          <meshStandardMaterial color="#dfe8ef" roughness={0.2} metalness={0.1} opacity={0.75} transparent />
        </mesh>
        <mesh castShadow position={[0, 0.32, 1.82]}>
          <boxGeometry args={[1.68, 0.16, 0.12]} />
          <meshStandardMaterial color="#fff0c9" emissive="#f8dc9b" emissiveIntensity={0.42} />
        </mesh>
        <pointLight ref={headLightRef} position={[0, 0.55, 2.35]} color="#ffe6a8" distance={13} intensity={0.8} />
        <mesh position={[0, 0.3, -2.18]}>
          <boxGeometry args={[1.45, 0.1, 0.08]} />
          <meshStandardMaterial color="#d35b52" emissive="#d35b52" emissiveIntensity={0.55} />
        </mesh>
        <mesh ref={trailRef} position={[0, 0.16, -2.35]}>
          <planeGeometry args={[1.8, 2.8]} />
          <meshBasicMaterial color="#78bdd0" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        {wheelOffsets.map((offset, index) => {
          const ref = [frontLeftRef, frontRightRef, rearLeftRef, rearRightRef][index];
          return (
            <group key={offset.join('-')} ref={ref} position={offset}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.34, 0.34, 0.26, 20]} />
                <meshStandardMaterial color="#1c2233" roughness={0.84} />
              </mesh>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.16, 0.16, 0.28, 20]} />
                <meshStandardMaterial color="#e8e0d0" roughness={0.32} metalness={0.2} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}