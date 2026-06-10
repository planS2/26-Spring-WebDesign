import { Clone, Html, useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
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
    const targetSize = landmark.scale;
    const fitScale = targetSize / maxDimension;

    clone.scale.setScalar(fitScale);
    clone.position.set(-center.x * fitScale, -box.min.y * fitScale, -center.z * fitScale);
    return clone;
  }, [landmark.scale, scene]);

  return <Clone object={fittedScene} castShadow receiveShadow />;
}

function PlaceholderLandmarkModel({ landmark }) {
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

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[landmark.scale * 0.86, 0.7, landmark.scale * 0.54]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.03} />
      </mesh>
      {landmark.modelKind === 'dome' && (
        <mesh castShadow position={[0, 1.16, 0]}>
          <sphereGeometry args={[landmark.scale * 0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#b95f46" roughness={0.68} />
        </mesh>
      )}
      {landmark.modelKind === 'bridge' && (
        <mesh castShadow position={[0, 0.95, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[landmark.scale * 0.32, 0.18, 8, 18, Math.PI]} />
          <meshStandardMaterial color={color} roughness={0.66} />
        </mesh>
      )}
      {landmark.modelKind === 'arena' && (
        <>
          <mesh castShadow position={[0, 0.9, 0]}>
            <torusGeometry args={[landmark.scale * 0.38, 0.22, 12, 48]} />
            <meshStandardMaterial color={color} roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.92, 0]}>
            <torusGeometry args={[landmark.scale * 0.25, 0.05, 8, 48]} />
            <meshStandardMaterial color="#eadbbf" roughness={0.72} />
          </mesh>
        </>
      )}
      {landmark.modelKind === 'cathedral' && [ -1.8, 0, 1.8 ].map((x) => (
        <mesh key={x} castShadow position={[x, 1.3, 0]}>
          <coneGeometry args={[0.42, 1.9, 5]} />
          <meshStandardMaterial color="#eee4ce" roughness={0.62} />
        </mesh>
      ))}
      {landmark.modelKind === 'tower' && (
        <>
          <mesh castShadow position={[0, 2.15, 0]}>
            <cylinderGeometry args={[landmark.scale * 0.18, landmark.scale * 0.24, landmark.scale * 0.72, 12]} />
            <meshStandardMaterial color={color} roughness={0.64} />
          </mesh>
          <mesh castShadow position={[0, 4.55, 0]}>
            <coneGeometry args={[landmark.scale * 0.16, landmark.scale * 0.34, 12]} />
            <meshStandardMaterial color="#b98257" roughness={0.58} />
          </mesh>
        </>
      )}
      {landmark.modelKind === 'fountain' && (
        <>
          <mesh castShadow position={[0, 0.86, 0]}>
            <cylinderGeometry args={[landmark.scale * 0.38, landmark.scale * 0.42, 0.32, 32]} />
            <meshStandardMaterial color="#c8d6d7" roughness={0.42} />
          </mesh>
          <mesh position={[0, 1.12, 0]}>
            <cylinderGeometry args={[landmark.scale * 0.3, landmark.scale * 0.3, 0.08, 32]} />
            <meshStandardMaterial color="#72b9d3" emissive="#3f9fc0" emissiveIntensity={0.18} transparent opacity={0.72} />
          </mesh>
        </>
      )}
      {['palace', 'castle'].includes(landmark.modelKind) && [ -2.4, 2.4 ].map((x) => (
        <mesh key={x} castShadow position={[x, 1.45, 0]}>
          <cylinderGeometry args={[0.46, 0.54, 2.2, 10]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
      {landmark.modelKind === 'temple' && [ -2.2, -1.1, 0, 1.1, 2.2 ].map((x) => (
        <mesh key={x} castShadow position={[x, 1.12, -0.15]}>
          <cylinderGeometry args={[0.16, 0.18, 1.9, 10]} />
          <meshStandardMaterial color="#e5d2a7" roughness={0.78} />
        </mesh>
      ))}
      {landmark.modelKind === 'village' && [ -1.8, -0.55, 0.8, 2.0 ].map((x, index) => (
        <mesh key={x} castShadow position={[x, 1.15, (index % 2) * 0.7 - 0.25]}>
          <coneGeometry args={[0.5, 1.2, 12]} />
          <meshStandardMaterial color="#d8c8a6" roughness={0.72} />
        </mesh>
      ))}
      {['coast', 'lake', 'mountain'].includes(landmark.modelKind) && (
        <mesh castShadow position={[0, 1.35, 0]}>
          <coneGeometry args={[landmark.scale * 0.42, landmark.scale * 0.48, 6]} />
          <meshStandardMaterial color={color} roughness={0.84} />
        </mesh>
      )}
      {landmark.modelKind === 'ruins' && [ -2.1, -0.7, 0.8, 2.2 ].map((x, index) => (
        <mesh key={x} castShadow position={[x, 1 + (index % 2) * 0.22, -0.1]}>
          <cylinderGeometry args={[0.18, 0.22, 1.8 + (index % 2) * 0.35, 8]} />
          <meshStandardMaterial color="#d1b58d" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
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
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[landmark.triggerRadius * 0.24, 48]} />
        <meshBasicMaterial color="#f0d490" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      {landmark.modelPath ? <LoadedLandmarkModel landmark={landmark} /> : <PlaceholderLandmarkModel landmark={landmark} />}
      <pointLight position={[0, 4.8, 0]} color="#f0d490" distance={18} intensity={0.42} />
      <mesh position={[0, 2.8, 0]} visible={false} onClick={() => selectLandmark(landmark.id)}>
        <cylinderGeometry args={[landmark.triggerRadius * 0.45, landmark.triggerRadius * 0.45, 6, 20]} />
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
