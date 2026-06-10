import { useCallback, useLayoutEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell.jsx';
import { HomeShowcase } from './components/home/HomeShowcase.jsx';
import { CesiumDriveScene } from './components/cesium/CesiumDriveScene.jsx';
import { useAppStore } from './state/useAppStore.js';

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
      <CesiumDriveScene isStarted={isStarted} />
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
