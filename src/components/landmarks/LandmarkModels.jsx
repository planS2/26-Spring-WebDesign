import { Clone, Html, useGLTF } from '@react-three/drei';
import { Component, useMemo } from 'react';
import * as THREE from 'three';
import { landmarks } from '../../data/landmarks.js';
import { worldPosToHeight } from '../../data/terrain.js';
import { useTerrainData } from '../../hooks/useTerrainData.js';
import { useAppStore } from '../../state/useAppStore.js';
import { travelLandmarkMeta } from '../../data/travelGuide.js';

function LoadedLandmarkModel({ landmark }) {
  const { scene } = useGLTF(landmark.modelPath);
  const fittedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = THREE.MathUtils.clamp(landmark.scale * 0.18, 0.85, 1.3);
    const fitScale = targetSize / maxDimension;

    clone.scale.setScalar(fitScale);
    clone.position.set(-center.x * fitScale, -box.min.y * fitScale, -center.z * fitScale);
    return clone;
  }, [landmark.scale, scene]);

  return <Clone object={fittedScene} castShadow receiveShadow />;
}

function MonumentLandmarkMarker({ landmark, highlighted }) {
  const color = {
    dome: '#c47b58',
    bridge: '#d7c2a2',
    cathedral: '#d9d2bd',
    ruins: '#b99b72',
    arena: '#c7a070',
    fountain: '#9fc5cf',
    palace: '#d6c4a8',
    tower: '#d7d0bd',
    temple: '#d2b98f',
    castle: '#b9a58a',
    coast: '#8fb9a7',
    lake: '#7eaec1',
    mountain: '#9a8f7c',
    village: '#d8c8a6',
  }[landmark.modelKind] ?? '#c7a070';
  const markerScale = highlighted ? 1.12 : 1;

  return (
    <group scale={markerScale}>
      <mesh castShadow receiveShadow position={[0, 0.055, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.11, 8]} />
        <meshStandardMaterial color="#d7c9aa" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.085, 0.11, 0.56, 10]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0, 0.66, 0]} rotation={[0, Math.PI / 4, 0]}>
        {['bridge', 'arena', 'fountain', 'lake'].includes(landmark.modelKind)
          ? <torusGeometry args={[0.13, 0.035, 8, 18]} />
          : ['tower', 'cathedral', 'dome', 'temple'].includes(landmark.modelKind)
            ? <coneGeometry args={[0.14, 0.24, 6]} />
            : <octahedronGeometry args={[0.15, 0]} />}
        <meshStandardMaterial color={highlighted ? '#f0d490' : color} emissive={highlighted ? '#c89545' : '#000000'} emissiveIntensity={highlighted ? 0.28 : 0} roughness={0.56} />
      </mesh>
    </group>
  );
}

class LandmarkModelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function LandmarkModel({ landmark }) {
  const selectLandmark = useAppStore((state) => state.selectLandmark);
  const language = useAppStore((state) => state.language);
  const nearbyLandmarkId = useAppStore((state) => state.nearbyLandmarkId);
  const guidedTourLandmarkId = useAppStore((state) => state.guidedTourLandmarkId);
  const activeRouteIds = useAppStore((state) => state.activeRouteIds);
  const routeProgress = useAppStore((state) => state.routeProgress);
  useTerrainData();
  const baseY = worldPosToHeight(landmark.position[0], landmark.position[2]);
  const displayName = travelLandmarkMeta[landmark.id]?.name?.[language] ?? landmark.name;
  const displayRouteIds = activeRouteIds.length ? activeRouteIds : ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'];
  const routeIndex = displayRouteIds.indexOf(landmark.id);
  const routeCount = displayRouteIds.length || 1;
  const estimatedCurrentIndex = Math.min(Math.floor(routeProgress * Math.max(routeCount - 1, 1)), routeCount - 1);
  const isRouteFocus = routeIndex === estimatedCurrentIndex || routeIndex === estimatedCurrentIndex + 1;
  const isActiveStop = landmark.id === nearbyLandmarkId || landmark.id === guidedTourLandmarkId;
  const isHighlighted = isActiveStop || isRouteFocus;

  return (
    <group position={[landmark.position[0], baseY, landmark.position[2]]} rotation={landmark.rotation} onClick={() => selectLandmark(landmark.id)}>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[landmark.triggerRadius * 0.34, landmark.triggerRadius * 0.42, 0.035, 8]} />
        <meshStandardMaterial color={isActiveStop ? '#d6c49a' : '#b8aa8a'} roughness={0.86} transparent opacity={isActiveStop ? 0.52 : 0.28} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[landmark.triggerRadius * 0.28, landmark.triggerRadius * 0.42, 64]} />
        <meshBasicMaterial color={isActiveStop ? '#f0d490' : '#7ed0e4'} transparent opacity={isActiveStop ? 0.44 : 0.22} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.38, 40]} />
        <meshBasicMaterial color={isActiveStop ? '#f0d490' : '#7ed0e4'} transparent opacity={isActiveStop ? 0.44 : 0.22} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      {landmark.modelPath ? (
        <LandmarkModelBoundary fallback={<MonumentLandmarkMarker landmark={landmark} highlighted={isHighlighted} />}>
          <LoadedLandmarkModel landmark={landmark} />
        </LandmarkModelBoundary>
      ) : <MonumentLandmarkMarker landmark={landmark} highlighted={isHighlighted} />}
      <pointLight position={[0, 0.75, 0]} color="#f0d490" distance={3.2} intensity={isHighlighted ? 0.32 : 0.08} />
      <mesh position={[0, 0.4, 0]} visible={false} onClick={() => selectLandmark(landmark.id)}>
        <cylinderGeometry args={[0.45, 0.45, 0.9, 16]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {isHighlighted && (
        <Html position={[0, 3.8, 0]} center distanceFactor={18} transform={false} sprite occlude={false}>
          <div className={`landmark-chip ${isActiveStop ? 'is-active' : ''}`}>
            {displayName}
          </div>
        </Html>
      )}
    </group>
  );
}

export function LandmarkModels() {
  const activeRouteIds = useAppStore((state) => state.activeRouteIds);
  const visibleLandmarks = useMemo(() => {
    const ids = activeRouteIds?.length ? new Set(activeRouteIds) : new Set(['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii']);
    return landmarks.filter((landmark) => ids.has(landmark.id));
  }, [activeRouteIds]);

  return (
    <group>
      {visibleLandmarks.map((landmark) => (
        <LandmarkModel key={landmark.id} landmark={landmark} />
      ))}
    </group>
  );
}

useGLTF.preload('/models/romes_colosseum.glb');
useGLTF.preload('/models/pisas_tower.glb');
