import * as THREE from 'three';

// Single source of truth for where the sun and moon sit in the sky.
// hours: 0-24, continuous. 12 = solar noon (sun at peak altitude),
// 0/24 = solar midnight (moon at peak altitude, since moonOffsetHours = 12).
export const TIME_OF_DAY_CONFIG = {
  hours: 8,
  // Fixed "which way the scene faces" -- shared by sun and moon, does NOT
  // change over the course of a day.
  sceneAzimuthDeg: 138,
  // How far apart the sun and moon are in the 24h cycle. 12 puts them
  // opposite each other (one peaks when the other troughs).
  moonOffsetHours: 12,
  sunPeakAltitudeDeg: 60,
  moonPeakAltitudeDeg: 60,
  sunDistance: 31.9,
  moonDistance: 31.9,
};

function anglesToXYZ(azimuthDeg, altitudeDeg, distance) {
  const az = azimuthDeg * (Math.PI / 180);
  const alt = altitudeDeg * (Math.PI / 180);
  const horizontal = Math.cos(alt) * distance;
  return {
    x: Math.sin(az) * horizontal,
    y: Math.sin(alt) * distance,
    z: Math.cos(az) * horizontal,
  };
}

// Sine arc over 24h: peaks (+peakDeg) at hours === phaseHours, troughs
// (-peakDeg) 12h later, continuous everywhere else.
function altitudeForHours(hours, phaseHours, peakDeg) {
  const t = ((hours - phaseHours) / 24) * Math.PI * 2;
  return Math.cos(t) * peakDeg;
}

// Computes sun and moon direction vectors plus altitudes for a given
// time-of-day. Pure function of (hours, config) -- no THREE scene access,
// no side effects, so it's cheap to call from the GUI, main.js, or presets.js.
export function computeCelestial(hours, config = TIME_OF_DAY_CONFIG) {
  const {
    sceneAzimuthDeg, moonOffsetHours,
    sunPeakAltitudeDeg, moonPeakAltitudeDeg,
    sunDistance, moonDistance,
  } = config;

  const sunAltitudeDeg = altitudeForHours(hours, 12, sunPeakAltitudeDeg);
  const moonAltitudeDeg = altitudeForHours(hours, 12 - moonOffsetHours, moonPeakAltitudeDeg);

  const sunPos = anglesToXYZ(sceneAzimuthDeg, sunAltitudeDeg, sunDistance);
  const moonPos = anglesToXYZ(sceneAzimuthDeg, moonAltitudeDeg, moonDistance);

  const sunDir = new THREE.Vector3(sunPos.x, sunPos.y, sunPos.z).normalize();
  const moonDir = new THREE.Vector3(moonPos.x, moonPos.y, moonPos.z).normalize();

  return {
    sunDir, moonDir,
    sunPos, moonPos,
    sunAltitudeDeg, moonAltitudeDeg,
    sunAltitude01: THREE.MathUtils.clamp(sunDir.y, 0, 1),
    moonAltitude01: THREE.MathUtils.clamp(moonDir.y, 0, 1),
  };
}
