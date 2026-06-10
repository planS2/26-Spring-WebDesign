import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_BOUNDS } from '../../data/landmarks.js';
import { worldPosToHeight } from '../../data/terrain.js';
import { useActiveRoute3d } from '../../hooks/useActiveRoute3d.js';
import { useTerrainData } from '../../hooks/useTerrainData.js';
import { useAppStore } from '../../state/useAppStore.js';

const LOCAL_PATCH_SIZE = 4.5;
const LOCAL_PATCH_SEGMENTS = 144;
const PATCH_PROGRESS_STEP = 0.00075;

function buildLocalTerrainGeometry(centerX, centerZ) {
  const geometry = new THREE.PlaneGeometry(
    LOCAL_PATCH_SIZE,
    LOCAL_PATCH_SIZE,
    LOCAL_PATCH_SEGMENTS,
    LOCAL_PATCH_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let index = 0; index < positions.count; index += 1) {
    const worldX = centerX + positions.getX(index);
    const worldZ = centerZ + positions.getZ(index);
    positions.setY(index, worldPosToHeight(worldX, worldZ));
    uvs.setXY(
      index,
      THREE.MathUtils.clamp(worldX / MAP_BOUNDS.worldWidth + 0.5, 0, 1),
      THREE.MathUtils.clamp(1 - (worldZ / MAP_BOUNDS.worldSize + 0.5), 0, 1),
    );
  }

  positions.needsUpdate = true;
  uvs.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function MapSurface() {
  const terrain = useTerrainData();
  const activeRoute = useActiveRoute3d();
  const cameraMode = useAppStore((state) => state.cameraMode);
  const routeProgress = useAppStore((state) => state.routeProgress);
  const patchProgress = Math.round(routeProgress / PATCH_PROGRESS_STEP) * PATCH_PROGRESS_STEP;

  const localPatch = useMemo(() => {
    if (cameraMode === 'map') return null;
    const center = activeRoute.curve.getPointAt(
      THREE.MathUtils.clamp(patchProgress, 0, 1),
      new THREE.Vector3(),
    );
    return buildLocalTerrainGeometry(center.x, center.z);
  }, [activeRoute.signature, cameraMode, patchProgress, terrain.status, terrain.version]);

  if (cameraMode === 'map') {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
        <planeGeometry args={[MAP_BOUNDS.worldWidth, MAP_BOUNDS.worldSize, 1, 1]} />
        <meshBasicMaterial map={terrain.texture ?? null} color={terrain.texture ? '#d9e5e2' : '#82a978'} />
      </mesh>
    );
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} renderOrder={-2}>
        <planeGeometry args={[260, 260, 1, 1]} />
        <meshStandardMaterial color="#23455d" roughness={1} />
      </mesh>
      {terrain.status === 'ready' && localPatch && (
        <mesh geometry={localPatch} receiveShadow renderOrder={0}>
          <meshBasicMaterial
            map={terrain.texture}
            color="#ffffff"
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
