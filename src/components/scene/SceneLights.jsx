import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { THEME } from '../../config/theme.js';
import { useAppStore } from '../../state/useAppStore.js';

export function SceneLights() {
  const sunRef = useRef();
  const ambientRef = useRef();
  const hemiRef = useRef();
  const routeHour = useAppStore((state) => state.routeHour);

  useFrame(() => {
    const hour = routeHour ?? 7;
    const dayPhase = (hour - 6) / 14;
    const sunAngle = Math.PI * THREE.MathUtils.clamp(dayPhase, 0, 1);
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle) * 64;
    const sunZ = 28 - Math.cos(sunAngle) * 18;
    const intensity = 0.38 + sunY * 1.18;

    if (sunRef.current) {
      sunRef.current.position.set(sunX, 18 + sunY * 58, sunZ);
      sunRef.current.intensity += (intensity - sunRef.current.intensity) * 0.04;
      sunRef.current.color.set(hour < 8.5 || hour > 17 ? '#f2b36e' : THEME.sun);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity += ((0.28 + sunY * 0.28) - ambientRef.current.intensity) * 0.04;
    }
    if (hemiRef.current) {
      hemiRef.current.intensity += ((0.48 + sunY * 0.48) - hemiRef.current.intensity) * 0.04;
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.48} color="#dceef8" />
      <hemisphereLight ref={hemiRef} args={['#dceef8', '#163247', 0.9]} />
      <directionalLight
        ref={sunRef}
        castShadow
        position={[42, 58, 24]}
        intensity={1.18}
        color={THEME.sun}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Environment resolution={128}>
        <Lightformer form="ring" intensity={1.4} color="#f5d99b" scale={12} position={[0, 10, -20]} />
        <Lightformer form="rect" intensity={1.1} color="#8ed4e8" scale={[20, 8]} position={[-12, 8, 10]} />
      </Environment>
    </>
  );
}
