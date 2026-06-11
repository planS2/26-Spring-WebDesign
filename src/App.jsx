import { Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AppShell } from './components/layout/AppShell.jsx';
import { HomeShowcase } from './components/home/HomeShowcase.jsx';
import { useAppStore } from './state/useAppStore.js';
import { SceneLights } from './components/scene/SceneLights.jsx';
import { MapSurface } from './components/scene/MapSurface.jsx';
import { GroundPlane } from './components/scene/GroundPlane.jsx';
import { RoadRibbon } from './components/scene/RoadRibbon.jsx';
import { LandmarkModels } from './components/landmarks/LandmarkModels.jsx';
import { FollowCamera } from './components/camera/FollowCamera.jsx';
import { VehicleChassis, VehicleController } from './components/vehicle/VehicleController.jsx';

function DriveScene({ isStarted, driveEntry }) {
  const vehicleRef = useRef(null);

  return (
    <Canvas shadows dpr={[1, 1.7]} camera={{ position: [0, 175, 145], fov: 42, near: 0.01, far: 500 }}>
      <color attach="background" args={['#07111d']} />
      <fog attach="fog" args={['#07111d', 45, 210]} />
      <SceneLights />
      <Suspense fallback={null}>
        <MapSurface />
        <GroundPlane />
        <RoadRibbon />
        <LandmarkModels />
        <VehicleChassis bodyRef={vehicleRef} />
      </Suspense>
      <VehicleController bodyRef={vehicleRef} drivingEnabled={isStarted} driveEntry={driveEntry} />
      <FollowCamera targetRef={vehicleRef} />
    </Canvas>
  );
}

function DriveExperience({ onClose, driveEntry }) {
  const [isStarted, setIsStarted] = useState(driveEntry?.mode === 'route-start');
  const handleStart = useCallback(() => setIsStarted(true), []);
  const clearLandmark = useAppStore((state) => state.clearLandmark);
  const setCameraMode = useAppStore((state) => state.setCameraMode);

  useLayoutEffect(() => {
    setIsStarted(driveEntry?.mode === 'route-start');
    clearLandmark();
    setCameraMode(driveEntry?.mode === 'route-start' ? 'follow' : 'map');
  }, [clearLandmark, driveEntry, setCameraMode]);

  return (
    <AppShell isStarted={isStarted} onStart={handleStart} onClose={onClose}>
      <DriveScene isStarted={isStarted} driveEntry={driveEntry} />
    </AppShell>
  );
}

export default function App() {
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveEntry, setDriveEntry] = useState(null);

  const handleOpenDrive = useCallback(() => {
    setDriveEntry({ mode: 'route-start' });
    setDriveOpen(true);
  }, []);

  const handleCloseDrive = useCallback(() => {
    setDriveOpen(false);
    setDriveEntry(null);
    window.requestAnimationFrame(() => {
      const home = document.getElementById('home-hero');
      if (home) home.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0, left: 0 });
    });
  }, []);

  return (
    <>
      <HomeShowcase onOpenDrive={handleOpenDrive} />
      {driveOpen && <DriveExperience onClose={handleCloseDrive} driveEntry={driveEntry} />}
    </>
  );
}
