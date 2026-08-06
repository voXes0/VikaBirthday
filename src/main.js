import * as THREE from 'three';
import { buildSky, SKY_CONFIG, SUN_VISUAL_CONFIG, MOON_VISUAL_CONFIG, STAR_CONFIG, CLOUD_CONFIG } from './sky.js';
import { buildLighting, SUN_LIGHT_CONFIG, MOON_LIGHT_CONFIG, FILL_LIGHT_CONFIG, AMBIENT_LIGHT_CONFIG, CELESTIAL_PLACEMENT_CONFIG } from './lighting.js';
import { TIME_OF_DAY_CONFIG } from './time-of-day.js';
import {
  PRESETS, loadPresets, applyParentPreset, applyPreset, startPresetTransition,
  serializePreset, downloadPreset, currentCelestialDistance,
} from './presets.js';
import {
  computeCameraPath, computeCakePath, computeEyesPath, computeHorizonLook, createCameraDirector,
  FRAMING_CONFIG, ORBIT_CONFIG, CLIMB_CONFIG, DIRECTOR_CONFIG,
} from './camera-path.js';
import {
  buildPostprocessing, BLOOM_CONFIG, BLOOM_BROAD_CONFIG, GODRAYS_CONFIG, GRADE_CONFIG,
} from './postprocessing.js';
import { buildCandles, updateCandles, pickAndSnuffCandle, CANDLE_FLAME_CONFIG } from './candles.js';
import { buildLanterns, updateLanterns, launchLanterns, syncLanternUniforms, LANTERN_CONFIG, LANTERN_SKY_GLOW_CONFIG } from './lanterns.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';


const MODEL_PATH = '/models/scene.glb';

const DEV = import.meta.env.DEV;

const IS_MOBILE = (() => {
  try {
    return (
      /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    );
  } catch {
    return false;
  }
})();

const canvas = document.getElementById('scene-canvas');
const loadingScreen = document.getElementById('loading-screen');
const scrollTrack = document.getElementById('scroll-track');

const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingTipEl = document.getElementById('loading-tip');
const hintScrollEl = document.getElementById('hint-scroll');
const hintCandlesEl = document.getElementById('hint-candles');

const LOADING_TIPS = [
  'Включи звук:)',
  'Можно скроллить вперёд и назад',
];

let loadingProgress = 0; // 0..1, driven by GLTFLoader's onProgress
let loadingTipTimer = null;

function startLoadingTips() {
  if (!loadingTipEl || LOADING_TIPS.length === 0) return;
  let i = 0;
  const showNext = () => {
    loadingTipEl.classList.remove('visible');
    window.setTimeout(() => {
      loadingTipEl.textContent = LOADING_TIPS[i % LOADING_TIPS.length];
      loadingTipEl.classList.add('visible');
      i += 1;
    }, 400);
  };
  showNext();
  loadingTipTimer = window.setInterval(showNext, 4200);
}

function stopLoadingTips() {
  if (loadingTipTimer !== null) {
    window.clearInterval(loadingTipTimer);
    loadingTipTimer = null;
  }
}

function setLoadingProgress(t) {
  loadingProgress = Math.max(loadingProgress, Math.min(1, t));
  if (loadingBarFill) loadingBarFill.style.width = `${(loadingProgress * 100).toFixed(1)}%`;
}

startLoadingTips();

let viewportW = window.innerWidth;
let viewportH = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2e3d63);
const camera = new THREE.PerspectiveCamera(45, viewportW / viewportH, 0.1, 1000);

const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const lighting = buildLighting(scene, renderer);
const { sunLight, moonLight, fillLight, ambient, sunDirection, moonDirection, getSunAltitude01, recomputeSunAltitude01, setCelestialAngles, setTimeOfDay } = lighting;
const sky = buildSky(scene, sunDirection, moonDirection);
setTimeOfDay(TIME_OF_DAY_CONFIG.hours);

const postprocessing = buildPostprocessing(renderer, scene, camera, { lowQuality: IS_MOBILE });

const CURRENT_PARENT_PRESET = 'default';

let currentVariant = 'day';
let activeTransition = null;
const presetCtx = { lighting, sky, postprocessing, renderer };
const presetConfigs = {
  LANTERN_CONFIG, LANTERN_SKY_GLOW_CONFIG, CANDLE_FLAME_CONFIG,
  FRAMING_CONFIG, ORBIT_CONFIG, CLIMB_CONFIG, DIRECTOR_CONFIG,
  SUN_LIGHT_CONFIG, MOON_LIGHT_CONFIG, FILL_LIGHT_CONFIG, AMBIENT_LIGHT_CONFIG,
  SKY_CONFIG, SUN_VISUAL_CONFIG, MOON_VISUAL_CONFIG, STAR_CONFIG, CLOUD_CONFIG,
  BLOOM_CONFIG, BLOOM_BROAD_CONFIG, GODRAYS_CONFIG, GRADE_CONFIG,
};

function setScenePreset(variantName) {
  const variant = PRESETS[CURRENT_PARENT_PRESET]?.timeOfDay?.[variantName];
  if (!variant) {
    console.warn(`setScenePreset: unknown time-of-day variant "${variantName}"`);
    return;
  }
  activeTransition = null;
  currentVariant = variantName;
  applyPreset(CURRENT_PARENT_PRESET, variantName, presetCtx, presetConfigs);
}

function transitionToPreset(variantName, durationSec = 3) {
  const variant = PRESETS[CURRENT_PARENT_PRESET]?.timeOfDay?.[variantName];
  if (!variant) {
    console.warn(`transitionToPreset: unknown time-of-day variant "${variantName}"`);
    return;
  }
  if (variantName === currentVariant && !activeTransition) return;
  const fromVariant = currentVariant;
  currentVariant = variantName;
  activeTransition = startPresetTransition(CURRENT_PARENT_PRESET, fromVariant, variantName, presetCtx, presetConfigs, durationSec);
}

function setTimeOfDayHours(hours) {
  TIME_OF_DAY_CONFIG.hours = hours;
  setTimeOfDay(hours);
}

if (typeof window !== 'undefined') {
  window.setScenePreset = setScenePreset;
  window.transitionToPreset = transitionToPreset;
  window.setTimeOfDayHours = setTimeOfDayHours;
}

const presetsReady = loadPresets().then(() => {
  applyParentPreset(CURRENT_PARENT_PRESET, presetConfigs);
  setScenePreset('day');
});

let debugGui = null;
if (DEV) {
  const { buildDebugGui } = await import('./gui.js');
  debugGui = buildDebugGui({
    skyUniforms: sky.dome.uniforms,
    SKY_CONFIG,
    sunLight,
    SUN_LIGHT_CONFIG,
    moonLight,
    MOON_LIGHT_CONFIG,
    fillLight,
    FILL_LIGHT_CONFIG,
    ambient,
    AMBIENT_LIGHT_CONFIG,
    renderer,
    sunVisual: sky.sun,
    SUN_VISUAL_CONFIG,
    moonVisual: sky.moon,
    MOON_VISUAL_CONFIG,
    starsUniforms: sky.stars.uniforms,
    STAR_CONFIG,
    FRAMING_CONFIG,
    ORBIT_CONFIG,
    CLIMB_CONFIG,
    DIRECTOR_CONFIG,
    bloomPass: postprocessing.bloomPass,
    BLOOM_CONFIG,
    bloomBroadPass: postprocessing.bloomBroadPass,
    BLOOM_BROAD_CONFIG,
    godraysUniforms: postprocessing.godraysUniforms,
    GODRAYS_CONFIG,
    gradePass: postprocessing.gradePass,
    GRADE_CONFIG,
    recomputeSunAltitude01,
    CELESTIAL_PLACEMENT_CONFIG,
    setCelestialAngles,
    TIME_OF_DAY_CONFIG,
    setTimeOfDay,
    CANDLE_FLAME_CONFIG,
    relightCandlesFn: () => {
      if (!candles) {
        console.warn('candles: not loaded yet.');
        return;
      }
      for (const flame of candles.flames) {
        flame.lit = true;
        flame.snuffing = false;
        flame.snuffStartTime = null;
        flame.mesh.visible = true;
        flame.light.intensity = CANDLE_FLAME_CONFIG.lightIntensity;
        flame.mat.uniforms.uOpacity.value = 1;
      }
      candles.snuffedCount = 0;
      candles.allSnuffed = false;
    },
    syncCandleFlameUniformsFn: () => {
      if (!candles) return;
      for (const flame of candles.flames) {
        const u = flame.mat.uniforms;
        u.uCoreColor.value.set(CANDLE_FLAME_CONFIG.coreColor);
        u.uMidColor.value.set(CANDLE_FLAME_CONFIG.midColor);
        u.uOuterColor.value.set(CANDLE_FLAME_CONFIG.outerColor);
        u.uCoreTightness.value = CANDLE_FLAME_CONFIG.coreTightness;
        u.uSwaySpeed.value = CANDLE_FLAME_CONFIG.swaySpeed;
        u.uSwayAmount.value = CANDLE_FLAME_CONFIG.swayAmount;
        flame.light.color.set(CANDLE_FLAME_CONFIG.lightColor);
        flame.light.distance = CANDLE_FLAME_CONFIG.lightDistance;
      }
    },
    LANTERN_CONFIG,
    LANTERN_SKY_GLOW_CONFIG,
    launchLanternsFn: () => {
      if (!lanterns) {
        console.warn('lanterns: not loaded yet.');
        return;
      }
      launchLanterns(lanterns, performance.now() / 1000);
    },
    syncLanternUniformsFn: () => syncLanternUniforms(lanterns),
    setScenePreset,
    transitionToPreset,
    currentPresetName: () => currentVariant,
    downloadPresetFn: () => {
      const inactiveVariantName = currentVariant === 'day' ? 'night' : 'day';
      const inactiveVariantData = PRESETS[CURRENT_PARENT_PRESET]?.timeOfDay?.[inactiveVariantName];
      downloadPreset(CURRENT_PARENT_PRESET, currentVariant, inactiveVariantData, {
        ...presetConfigs,
        exposure: renderer.toneMappingExposure,
        celestialHours: TIME_OF_DAY_CONFIG.hours,
        celestialDistance: currentCelestialDistance,
      });
    },
    unlockHorizonFn: () => {
      if (!cameraDirector) {
        console.warn('camera director: not loaded yet.');
        return;
      }
      cameraDirector.notifyCandlesSnuffed();
    },
  });
}

function resize() {
  viewportW = window.innerWidth;
  viewportH = window.innerHeight;
  renderer.setSize(viewportW, viewportH);
  camera.aspect = viewportW / viewportH;
  camera.updateProjectionMatrix();
  postprocessing.setSize(viewportW, viewportH);
}
window.addEventListener('resize', resize);

let towerModel = null;
let cameraPath = null;
let cameraDirector = null;
let candles = null;
let lanterns = null;
let faceNodes = [];
let atCake = false;
let atEyes = false;
let wasFaceHidden = false;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

function loadModel() {
  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_PATH,
      resolve,
      (event) => {
        // event.total is 0 when the server doesn't send a content-length
        // header -- fall back to a slow trickle so the bar still reads as
        // "making progress" instead of sitting at 0 the whole download.
        if (event.total) {
          setLoadingProgress((event.loaded / event.total) * 0.92);
        } else {
          setLoadingProgress(Math.min(0.92, loadingProgress + 0.01));
        }
      },
      reject
    );
  });
}

// presetsReady typically resolves fast relative to the model download, so
// it's given a small fixed share of the bar rather than its own tracked
// progress -- just enough that the bar doesn't stall visibly on it.
presetsReady.then(() => setLoadingProgress(Math.max(loadingProgress, 0.06)));

Promise.all([presetsReady, loadModel()]).then(
  ([, gltf]) => {
    towerModel = gltf.scene;
    towerModel.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    scene.add(towerModel);

    const TOWER_NODE_NAME = 'Sketchfab_model';
    const towerNode = towerModel.getObjectByName(TOWER_NODE_NAME);
    if (!towerNode) {
      console.warn(
        `Could not find a node named "${TOWER_NODE_NAME}" in the loaded model ` 
      );
    }

    cameraPath = computeCameraPath(towerNode || towerModel, sunDirection);

    const CAKE_NODE_NAME = 'Birthday_Cake';
    const cakeNode = towerModel.getObjectByName(CAKE_NODE_NAME);
    if (!cakeNode) {
      console.warn(
        `Could not find a node named "${CAKE_NODE_NAME}" in the loaded model`
      );
    }
    const cakePath = cakeNode ? computeCakePath(cakeNode, cameraPath) : null;

    const EYES_NODE_NAME = 'Object_12001';
    const eyesNode = towerModel.getObjectByName(EYES_NODE_NAME);
    if (!eyesNode) {
      console.warn(
        `Could not find a node named "${EYES_NODE_NAME}" in the loaded model`
      );
    }
    const eyesPath = eyesNode ? computeEyesPath(eyesNode, cakePath) : null;

    // Lanterns spawn in a wedge facing the same direction the camera looks
    // once it settles into the horizon gaze (see camera-path.js), so they
    // rise into view in front of the viewer rather than around the tower.
    // eyesPath is static once the model loads, so this direction never
    // changes during a session.
    let lanternSpawnDir = null;
    if (eyesPath) {
      const horizonLook = new THREE.Vector3();
      computeHorizonLook(eyesPath, horizonLook);
      lanternSpawnDir = new THREE.Vector3(
        horizonLook.x - eyesPath.eyeX, 0, horizonLook.z - eyesPath.eyeZ
      );
    }
    lanterns = buildLanterns(scene, towerNode || towerModel, lanternSpawnDir);

    const FACE_NODE_NAMES = ['Object_6001', 'Object_8001', 'Object_10001', 'Object_12001', 'Object_18001'];
    faceNodes = [];
    for (const name of FACE_NODE_NAMES) {
      const node = towerModel.getObjectByName(name);
      if (!node) {
        console.warn(`Could not find a node named "${name}" in the loaded model`);
        continue;
      }
      faceNodes.push(node);
    }

    cameraDirector = createCameraDirector(cameraPath, cakePath, eyesPath);

    candles = buildCandles(scene, towerModel, () => {
      cameraDirector?.notifyCandlesSnuffed();
      if (lanterns) launchLanterns(lanterns, performance.now() / 1000);
      transitionToPreset('night', DIRECTOR_CONFIG.horizonTransitionDuration);
    }, audioListener);

    sunLight.target.position.set(cameraPath.centerX, cameraPath.bottomY, cameraPath.centerZ);
    sunLight.target.updateMatrixWorld();
    moonLight.target.position.set(cameraPath.centerX, cameraPath.bottomY, cameraPath.centerZ);
    moonLight.target.updateMatrixWorld();

    setLoadingProgress(1);
    stopLoadingTips();
    loadingScreen.classList.add('hidden');
    canvas.classList.add('ready');
    scrollTo(0, getMaxScroll());
    requestAnimationFrame(frame);
  },
  (error) => {
    console.error('Scene failed to load:', error);
    stopLoadingTips();
    if (loadingTipEl) {
      loadingTipEl.textContent = 'could not load the scene';
      loadingTipEl.classList.add('visible');
    }
  }
);

let scrollProgress = 0;
let rawProgress = 0;
let scrollLocked = false;

function getMaxScroll() {
  return scrollTrack.offsetHeight - window.innerHeight;
}

// Scroll gating lives entirely inside the camera director (see
// createCameraDirector's committedScroll cursor in camera-path.js): it
// reads the user's live scroll position every frame and decides for
// itself how much of it to actually act on, holding still mid-transition
// so a fast fling or continued scrolling can only ever queue up "how far
// to go next," never skip or interrupt a transition in progress. So this
// function just reports the raw position -- no separate smoothing/rate
// limiting layer here, since stacking one on top of the director's own
// gating made the two hard to reason about together.
function readScrollProgress() {
  const max = getMaxScroll();
  const clampedY = Math.min(max, Math.max(0, window.scrollY));
  const raw = max > 0 ? clampedY / max : 0;
  rawProgress = 1 - raw;
  scrollProgress = rawProgress;
}

// Control hints: "scroll to navigate" shows only during the tower-climb
// phase (3rd-person), and only until the user has actually scrolled once
// -- no point nagging after they've clearly got it. "tap the candles"
// shows whenever the camera is settled at the cake in first-person,
// regardless of scroll history, since it's a standing invitation rather
// than a one-time tutorial.
let hasScrolled = false;
let hintScrollVisible = false;
let hintCandlesVisible = false;

function setHintVisible(el, visible, currentFlag) {
  if (visible === currentFlag) return currentFlag;
  el.classList.toggle('visible', visible);
  return visible;
}

function updateControlHints(phase, atEyesNow) {
  if (!hasScrolled && rawProgress > 0.002) hasScrolled = true;

  const showScrollHint = phase === 'climb' && !hasScrolled;
  hintScrollVisible = setHintVisible(hintScrollEl, showScrollHint, hintScrollVisible);

  const showCandlesHint = atEyesNow;
  hintCandlesVisible = setHintVisible(hintCandlesEl, showCandlesHint, hintCandlesVisible);
}

function updateCamera(dt) {
  if (!cameraDirector) return;
  const status = cameraDirector.update(camera, rawProgress, dt);
  atCake = status.atCake;
  atEyes = status.atEyes;

  if (status.faceHidden !== wasFaceHidden) {
    wasFaceHidden = status.faceHidden;
    for (const node of faceNodes) {
      node.visible = !status.faceHidden;
    }
  }

  scrollLocked = status.scrollLocked;
  updateControlHints(status.phase, status.atEyes);
}

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const _sunWorldPos = new THREE.Vector3();

function pointerToNDC(e) {
  pointerNDC.x = (e.clientX / viewportW) * 2 - 1;
  pointerNDC.y = -(e.clientY / viewportH) * 2 + 1;
}

canvas.addEventListener('pointerdown', (e) => {
  if (flycamActive) return;

  if (candles && atEyes) {
    pointerToNDC(e);
    raycaster.setFromCamera(pointerNDC, camera);
    const snuffedName = pickAndSnuffCandle(candles, raycaster.ray);
    if (snuffedName) {
      e.preventDefault();
      return;
    }
  }
});

let flycamActive = false;
let updateFlycam = () => {};

if (DEV) {
  const flycamKeys = {};
  const flycamMoveSpeed = 3;
  const flycamLookSpeed = 0.003;
  let flycamYaw = 0;
  let flycamPitch = 0;
  let flycamDragging = false;
  let flycamLastMouseX = 0;
  let flycamLastMouseY = 0;

  const flycamReadout = document.createElement('div');
  flycamReadout.style.cssText = `
    position: fixed; top: 10px; left: 10px; z-index: 50;
    font: 11px monospace; color: #0f0; background: rgba(0,0,0,0.7);
    padding: 8px 10px; border-radius: 4px; white-space: pre;
    pointer-events: none; display: none;
  `;
  document.body.appendChild(flycamReadout);

  window.addEventListener('keydown', (e) => {
    flycamKeys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'f') {
      flycamActive = !flycamActive;
      flycamReadout.style.display = flycamActive ? 'block' : 'none';
      if (flycamActive) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        flycamYaw = Math.atan2(dir.x, dir.z);
        flycamPitch = Math.asin(dir.y);
      }
    }
    if (e.key.toLowerCase() === 'p' && flycamActive) {
      const p = camera.position;
      console.log(
        `Camera snapshot:\n` +
        `position: new THREE.Vector3(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})\n` +
        `yaw: ${flycamYaw.toFixed(3)}  pitch: ${flycamPitch.toFixed(3)}\n` +
        `(relative to model bounds -- bottomY=${cameraPath?.bottomY.toFixed(3)}, topY=${cameraPath?.topY.toFixed(3)}, centerX=${cameraPath?.centerX.toFixed(3)}, centerZ=${cameraPath?.centerZ.toFixed(3)})`
      );
    }
  });
  window.addEventListener('keyup', (e) => { flycamKeys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (!flycamActive) return;
    flycamDragging = true;
    flycamLastMouseX = e.clientX;
    flycamLastMouseY = e.clientY;
  });
  window.addEventListener('mouseup', () => { flycamDragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!flycamActive || !flycamDragging) return;
    const dx = e.clientX - flycamLastMouseX;
    const dy = e.clientY - flycamLastMouseY;
    flycamLastMouseX = e.clientX;
    flycamLastMouseY = e.clientY;
    flycamYaw -= dx * flycamLookSpeed;
    flycamPitch -= dy * flycamLookSpeed;
    flycamPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, flycamPitch));
  });

  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _lookTarget = new THREE.Vector3();

  updateFlycam = function updateFlycam(dt) {
    if (!flycamActive) return;

    _forward.set(
      Math.sin(flycamYaw) * Math.cos(flycamPitch),
      Math.sin(flycamPitch),
      Math.cos(flycamYaw) * Math.cos(flycamPitch)
    );
    _right.set(Math.cos(flycamYaw), 0, -Math.sin(flycamYaw));

    const speed = flycamMoveSpeed * (flycamKeys['shift'] ? 3 : 1) * dt;
    if (flycamKeys['w']) camera.position.addScaledVector(_forward, speed);
    if (flycamKeys['s']) camera.position.addScaledVector(_forward, -speed);
    if (flycamKeys['a']) camera.position.addScaledVector(_right, -speed);
    if (flycamKeys['d']) camera.position.addScaledVector(_right, speed);
    if (flycamKeys['e']) camera.position.addScaledVector(_up, speed);
    if (flycamKeys['q']) camera.position.addScaledVector(_up, -speed);

    _lookTarget.copy(camera.position).add(_forward);
    camera.lookAt(_lookTarget);

    const p = camera.position;
    flycamReadout.textContent =
      `FREE-FLY CAM (F to toggle off)\n` +
      `WASD move, QE up/down, Shift=fast\n` +
      `drag mouse to look, P to log values\n\n` +
      `pos:   ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}\n` +
      `yaw:   ${flycamYaw.toFixed(2)}\n` +
      `pitch: ${flycamPitch.toFixed(2)}`;
  };
}

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  readScrollProgress();

  if (flycamActive) {
    updateFlycam(dt);
  } else {
    updateCamera(dt);
  }

  if (activeTransition && !activeTransition.update(dt)) {
    activeTransition = null;
  } else if (!activeTransition) {
    setTimeOfDay(TIME_OF_DAY_CONFIG.hours);
  }
  updateCandles(candles, now / 1000);
  updateLanterns(lanterns, now / 1000, dt);

  sky.update(camera, sunDirection, getSunAltitude01(), dt, lanterns?.glow);

  _sunWorldPos.copy(sunDirection).multiplyScalar(SUN_VISUAL_CONFIG.distance).add(camera.position);
  postprocessing.updateSun(camera, _sunWorldPos);

  postprocessing.render(dt);

  requestAnimationFrame(frame);
}

resize();