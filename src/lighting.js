import * as THREE from 'three';
import { computeCelestial, TIME_OF_DAY_CONFIG } from './time-of-day.js';

export const SUN_LIGHT_CONFIG = {
  color: 0xfff0d9,
  intensity: 2.0,
  castShadow: true,
  shadowMapSize: 2048,
};

export const MOON_LIGHT_CONFIG = {
  color: 0xc7d6ff,
  intensity: 0.35,
  castShadow: true,
  shadowMapSize: 2048,
};

export const FILL_LIGHT_CONFIG = {
  color: 0x9fb0d9,
  intensity: 0.6,
  posX: -22,
  posY: 14,
  posZ: 18,
};

export const AMBIENT_LIGHT_CONFIG = {
  skyColor: 0x5c6aa8,
  groundColor: 0x453a52,
  intensity: 0.85,
};

export const SHADOW_FRUSTUM = {
  left: -35, right: 35, top: 35, bottom: -35,
  near: 1, far: 140,
};

export const CELESTIAL_PLACEMENT_CONFIG = {
  azimuthDeg: 135,
  altitudeDeg: 16.5,
  distance: 31.9,
};

export const EXPOSURE = 0.95;

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

export function buildLighting(scene, renderer, { lowQuality = false } = {}) {
  const sunLight = new THREE.DirectionalLight(SUN_LIGHT_CONFIG.color, SUN_LIGHT_CONFIG.intensity);
  sunLight.castShadow = SUN_LIGHT_CONFIG.castShadow;
  const moonLight = new THREE.DirectionalLight(MOON_LIGHT_CONFIG.color, MOON_LIGHT_CONFIG.intensity);
  moonLight.castShadow = MOON_LIGHT_CONFIG.castShadow;

  const shadowMapSizeFor = (cfg) => (lowQuality ? cfg.shadowMapSize / 2 : cfg.shadowMapSize);
  for (const [light, cfg] of [[sunLight, SUN_LIGHT_CONFIG], [moonLight, MOON_LIGHT_CONFIG]]) {
    const size = shadowMapSizeFor(cfg);
    light.shadow.mapSize.set(size, size);
    light.shadow.bias = -0.0015;
    const cam = light.shadow.camera;
    cam.left = SHADOW_FRUSTUM.left; cam.right = SHADOW_FRUSTUM.right;
    cam.top = SHADOW_FRUSTUM.top; cam.bottom = SHADOW_FRUSTUM.bottom;
    cam.near = SHADOW_FRUSTUM.near; cam.far = SHADOW_FRUSTUM.far;
    scene.add(light);
    scene.add(light.target);
  }

  const fillLight = new THREE.DirectionalLight(FILL_LIGHT_CONFIG.color, FILL_LIGHT_CONFIG.intensity);
  fillLight.position.set(FILL_LIGHT_CONFIG.posX, FILL_LIGHT_CONFIG.posY, FILL_LIGHT_CONFIG.posZ);
  fillLight.castShadow = false;
  scene.add(fillLight);
  scene.add(fillLight.target);

  const ambient = new THREE.HemisphereLight(
    AMBIENT_LIGHT_CONFIG.skyColor,
    AMBIENT_LIGHT_CONFIG.groundColor,
    AMBIENT_LIGHT_CONFIG.intensity
  );
  scene.add(ambient);

  renderer.toneMappingExposure = EXPOSURE;

  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();

  let _cachedAltitude01 = 0;
  function getSunAltitude01() {
    return _cachedAltitude01;
  }

  function setCelestialAngles(azimuthDeg, altitudeDeg, distance = CELESTIAL_PLACEMENT_CONFIG.distance) {
    CELESTIAL_PLACEMENT_CONFIG.azimuthDeg = azimuthDeg;
    CELESTIAL_PLACEMENT_CONFIG.altitudeDeg = altitudeDeg;
    CELESTIAL_PLACEMENT_CONFIG.distance = distance;

    const sunIsActive = altitudeDeg >= 0;
    const sunAlt = sunIsActive ? altitudeDeg : -altitudeDeg;
    const moonAlt = sunIsActive ? -altitudeDeg : altitudeDeg;

    const sunPos = anglesToXYZ(azimuthDeg, sunAlt, distance);
    sunLight.position.set(sunPos.x, sunPos.y, sunPos.z);
    sunLight.intensity = sunIsActive ? SUN_LIGHT_CONFIG.intensity : 0;
    sunLight.castShadow = sunIsActive && SUN_LIGHT_CONFIG.castShadow;
    sunDirection.set(sunPos.x, sunPos.y, sunPos.z).normalize();

    const moonPos = anglesToXYZ(azimuthDeg, moonAlt, distance);
    moonLight.position.set(moonPos.x, moonPos.y, moonPos.z);
    moonLight.intensity = sunIsActive ? 0 : MOON_LIGHT_CONFIG.intensity;
    moonLight.castShadow = !sunIsActive && MOON_LIGHT_CONFIG.castShadow;
    moonDirection.set(moonPos.x, moonPos.y, moonPos.z).normalize();

    _cachedAltitude01 = THREE.MathUtils.clamp(sunDirection.y, 0, 1);
  }

  function recomputeSunAltitude01() {
    const dist = sunLight.position.length();
    const rawAzimuthDeg = Math.atan2(sunLight.position.x, sunLight.position.z) * 180 / Math.PI;
    const azimuthDeg = (rawAzimuthDeg + 360) % 360;
    const altitudeDeg = Math.asin(THREE.MathUtils.clamp(sunLight.position.y / Math.max(dist, 1e-6), -1, 1)) * 180 / Math.PI;
    setCelestialAngles(azimuthDeg, altitudeDeg, dist);
    return _cachedAltitude01;
  }

  setCelestialAngles(
    CELESTIAL_PLACEMENT_CONFIG.azimuthDeg,
    CELESTIAL_PLACEMENT_CONFIG.altitudeDeg,
    CELESTIAL_PLACEMENT_CONFIG.distance
  );

  // Continuous day/night cycle: sun and moon are positioned independently
  // (each on its own 24h sine arc, see time-of-day.js) rather than the
  // sun/moon switch that setCelestialAngles above uses. Light intensity
  // cross-fades by each body's own altitude instead of hard-swapping, so
  // both can be lit near sunrise/sunset.
function setTimeOfDay(hours, config = TIME_OF_DAY_CONFIG) {
  const { sunDir, moonDir, sunAltitude01, moonAltitude01 } = computeCelestial(hours, config);

  sunLight.position.copy(sunDir).multiplyScalar(config.sunDistance);
  sunDirection.copy(sunDir);
  const sunFade = THREE.MathUtils.smoothstep(sunAltitude01, 0, 0.15);
  sunLight.intensity = SUN_LIGHT_CONFIG.intensity * sunFade;

  moonLight.position.copy(moonDir).multiplyScalar(config.moonDistance);
  moonDirection.copy(moonDir);
  const moonFade = THREE.MathUtils.smoothstep(moonAltitude01, 0, 0.15);
  moonLight.intensity = MOON_LIGHT_CONFIG.intensity * moonFade;

  // Only the dominant body casts a shadow -- halves shadow-pass draw calls
  // in the common case instead of rendering the scene into two shadow maps.
  sunLight.castShadow = SUN_LIGHT_CONFIG.castShadow && sunFade >= moonFade;
  moonLight.castShadow = MOON_LIGHT_CONFIG.castShadow && moonFade > sunFade;

  _cachedAltitude01 = sunAltitude01;
}
  return {
    sunLight, moonLight, fillLight, ambient,
    sunDirection, moonDirection,
    getSunAltitude01, recomputeSunAltitude01,
    setCelestialAngles, setTimeOfDay,
  };
}