import { useMemo } from 'react';
import * as THREE from 'three';
import { landmarks, lngLatToWorld } from '../data/landmarks.js';
import { useAppStore } from '../state/useAppStore.js';

function coordinatesToWorldPoints(coordinates) {
  return coordinates
    .filter((coord) => Array.isArray(coord) && Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
    .map(([lon, lat]) => {
      const [x, y, z] = lngLatToWorld(lon, lat);
      return new THREE.Vector3(x, y, z);
    });
}

function routeIdsToWorldPoints(routeIds) {
  return routeIds
    .map((id) => landmarks.find((landmark) => landmark.id === id))
    .filter(Boolean)
    .map((landmark) => new THREE.Vector3(landmark.position[0], 0, landmark.position[2]));
}

function orientPointsToFirstStop(points, routeIds) {
  if (points.length < 2 || routeIds.length === 0) return points;
  const firstStop = landmarks.find((landmark) => landmark.id === routeIds[0]);
  if (!firstStop) return points;
  const stopPoint = new THREE.Vector3(firstStop.position[0], 0, firstStop.position[2]);
  const startDistance = points[0].distanceToSquared(stopPoint);
  const endDistance = points[points.length - 1].distanceToSquared(stopPoint);
  return endDistance < startDistance ? [...points].reverse() : points;
}

function cumulativeDistances(points) {
  if (points.length === 0) return [0];
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances[index] = distances[index - 1] + points[index].distanceTo(points[index - 1]);
  }
  return distances;
}

export class DistancePolylineCurve3 extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points;
    this.distances = cumulativeDistances(points);
    this.totalDistance = this.distances[this.distances.length - 1] || 1;
  }

  getPoint(t, target = new THREE.Vector3()) {
    if (this.points.length === 0) return target.set(0, 0, 0);
    if (this.points.length === 1) return target.copy(this.points[0]);

    const distance = THREE.MathUtils.clamp(t, 0, 1) * this.totalDistance;
    let low = 0;
    let high = this.distances.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.distances[mid] < distance) low = mid + 1;
      else high = mid;
    }

    const endIndex = THREE.MathUtils.clamp(low, 1, this.points.length - 1);
    const startIndex = endIndex - 1;
    const startDistance = this.distances[startIndex];
    const segmentDistance = Math.max(this.distances[endIndex] - startDistance, Number.EPSILON);
    return target.lerpVectors(
      this.points[startIndex],
      this.points[endIndex],
      (distance - startDistance) / segmentDistance,
    );
  }

  getPointAt(u, target) {
    return this.getPoint(u, target);
  }

  getTangent(t, target = new THREE.Vector3()) {
    const delta = 1 / Math.max(this.points.length * 2, 2000);
    const before = this.getPoint(Math.max(0, t - delta), new THREE.Vector3());
    const after = this.getPoint(Math.min(1, t + delta), new THREE.Vector3());
    return target.subVectors(after, before).normalize();
  }

  getTangentAt(u, target) {
    return this.getTangent(u, target);
  }
}

export function useActiveRoute3d() {
  const routeIds = useAppStore((state) => state.activeRouteIds);
  const geometryCoordinates = useAppStore((state) => state.activeRouteGeometryCoordinates);
  const distanceKm = useAppStore((state) => state.activeRouteDistanceKm);

  return useMemo(() => {
    let points = coordinatesToWorldPoints(geometryCoordinates);
    const source = points.length >= 2 ? 'osrm' : 'waypoints';
    const effectiveRouteIds = routeIds.length
      ? routeIds
      : ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'];

    if (points.length < 2) points = routeIdsToWorldPoints(routeIds);
    if (points.length < 2) points = routeIdsToWorldPoints(effectiveRouteIds);
    points = orientPointsToFirstStop(points, effectiveRouteIds);

    const curve = new DistancePolylineCurve3(points);
    const distances = cumulativeDistances(points);
    const worldDistance = distances[distances.length - 1] || 1;
    const fallbackDistanceKm = Math.max(worldDistance * 6.2, 1);
    const signatureSamples = [0, 0.25, 0.5, 0.75, 1]
      .map((progress) => curve.getPointAt(progress, new THREE.Vector3()))
      .map((point) => `${point.x.toFixed(2)},${point.z.toFixed(2)}`)
      .join('|');

    return {
      curve,
      points,
      routeIds,
      source: source === 'osrm' ? 'routed' : source,
      signature: `${points.length}:${signatureSamples}`,
      distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : fallbackDistanceKm,
      progressAtIndex(index) {
        if (points.length <= 1) return 0;
        return distances[index] / worldDistance;
      },
      pointAtProgress(progress) {
        const clamped = THREE.MathUtils.clamp(progress, 0, 0.9999);
        const index = Math.min(Math.floor(clamped * (points.length - 1)), points.length - 2);
        return { index, point: points[index] };
      },
    };
  }, [distanceKm, geometryCoordinates, routeIds]);
}
