import { useEffect, useState } from 'react';
import { getTerrainState, loadTerrainData, setTerrainRouteCorridor, subscribeTerrain } from '../data/terrain.js';
import { useActiveRoute3d } from './useActiveRoute3d.js';

export function useTerrainData() {
  const [terrain, setTerrain] = useState(() => getTerrainState());
  const activeRoute = useActiveRoute3d();

  useEffect(() => {
    const unsubscribe = subscribeTerrain(setTerrain);
    loadTerrainData();

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setTerrainRouteCorridor(activeRoute.curve.getPoints(activeRoute.source === 'routed' ? 240 : 120));
  }, [activeRoute]);

  return terrain;
}
