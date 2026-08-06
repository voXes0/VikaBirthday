import * as THREE from 'three';

const CANDLE_NAMES = ['candle', 'candle001', 'candle002'];

export const CANDLE_FLAME_CONFIG = {
  flameHeight: 0.11,
  flameWidth: 0.032,

  coreColor: 0xfff6d5,
  midColor: 0xffb347,
  outerColor: 0xff7a1a,
  coreTightness: 0.55,

  swaySpeed: 3.0,
  swayAmount: 0.04,

  lightColor: 0xffa64d,
  lightIntensity: 0.5,
  lightDistance: 0.2,
  flickerSpeed: 14,
  flickerAmount: 0.25,

  wickOffset: 0.01,

  pickRadius: 0.09,
};

export const CANDLE_SOUNDTRACK_CONFIG = {
  url: '/audio/soundtrack.mp3',
  volume: 0.6,
  loop: true,
};

export const CANDLE_AMBIENT_CONFIG = {
  snuff: {
    url: '/audio/snuff.wav',
    volume: 0.8,
  },
};

function findCandleNodes(root) {
  const nodes = [];
  for (const name of CANDLE_NAMES) {
    const node = root.getObjectByName(name);
    if (!node) {
      console.warn(`candles: could not find a node named "${name}" in the loaded model`);
      continue;
    }
    nodes.push({ name, node });
  }
  return nodes;
}

function buildFlameGeometry() {
  const { flameHeight, flameWidth } = CANDLE_FLAME_CONFIG;
  const planeA = new THREE.PlaneGeometry(flameWidth, flameHeight, 1, 12);
  planeA.translate(0, flameHeight / 2, 0);

  const planeB = planeA.clone();
  planeB.rotateY(Math.PI / 2);

  return mergePlaneGeometries([planeA, planeB]);
}

function mergePlaneGeometries(geometries) {
  const merged = new THREE.BufferGeometry();
  const attrNames = ['position', 'normal', 'uv'];
  const arrays = {};
  for (const name of attrNames) arrays[name] = [];
  const indices = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    for (const name of attrNames) {
      arrays[name].push(geo.attributes[name].array);
    }
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + vertexOffset);
    vertexOffset += geo.attributes.position.count;
    geo.dispose();
  }

  for (const name of attrNames) {
    const itemSize = name === 'uv' ? 2 : 3;
    const combined = new Float32Array(
      arrays[name].reduce((sum, a) => sum + a.length, 0)
    );
    let offset = 0;
    for (const a of arrays[name]) {
      combined.set(a, offset);
      offset += a.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(combined, itemSize));
  }
  merged.setIndex(indices);
  return merged;
}

const FLAME_VERTEX_SHADER =  `
  uniform float uTime;
  uniform float uSwaySpeed;
  uniform float uSwayAmount;
  uniform float uPhase;
  varying float vHeightT;
  varying vec2 vUv;

  void main() {
    vHeightT = position.y / uMaxHeight;
    vUv = uv;

    vec3 pos = position;
    // Sway grows toward the tip (base stays pinned to the wick) and uses
    // two offset sine waves so the motion doesn't read as a metronome.
    float sway = sin(uTime * uSwaySpeed + uPhase) * 0.6
      + sin(uTime * uSwaySpeed * 1.9 + uPhase * 1.7) * 0.4;
    float bend = vHeightT * vHeightT;
    pos.x += sway * uSwayAmount * bend;
    pos.z += cos(uTime * uSwaySpeed * 0.7 + uPhase) * uSwayAmount * 0.5 * bend;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FLAME_FRAGMENT_SHADER =  `
  uniform vec3 uCoreColor;
  uniform vec3 uMidColor;
  uniform vec3 uOuterColor;
  uniform float uCoreTightness;
  uniform float uOpacity;
  varying float vHeightT;
  varying vec2 vUv;

  void main() {
    // UV-space teardrop mask: rises quickly near the base, peaks a little
    // above it, then decays smoothly all the way to a true point at the
    // tip. Verified numerically to reach exactly 0 at h=1 -- an earlier
    // version plateaued at ~38% width even at the very top, which read as
    // a blunt/rounded tip rather than a proper flame taper.
    float h = clamp(vHeightT, 0.0, 1.0);
    float rise = smoothstep(0.0, 0.18, h);
    float decay = pow(1.0 - h, 1.3);
    float widthEnvelope = rise * decay;
    float xFromCenter = abs(vUv.x - 0.5) * 2.0; // 0 at center, 1 at plane edge
    float dist = xFromCenter / max(widthEnvelope, 0.001);

    // Silhouette falloff: mostly solid out to dist ~0.55, THEN a fairly
    // quick drop to the edge. A wide gradual fade here (the previous
    // version faded from 0.15 all the way to 1.0) is what read as soft
    // fluff/feathering instead of a flame with an actual defined shape --
    // fire has translucent edges, but the silhouette itself still needs to
    // be legible as a tongue of flame, not a formless glow.
    float mask = 1.0 - smoothstep(0.25, 0.95, dist);
    mask *= 1.0 - smoothstep(0.88, 1.0, vHeightT); // soften just the very tip

    // Core: small, bright, and sharply falling off -- this is what anchors
    // the read as "fire" rather than "soft shape". Tightly clustered near
    // the base/center and raised to a high power so it reads as a hot spot
    // rather than a gradient.
    float coreFalloff = 1.0 - smoothstep(0.0, mix(0.7, 0.12, uCoreTightness), vHeightT);
    float core = (1.0 - smoothstep(0.0, 0.5, dist)) * coreFalloff;
    core = clamp(core, 0.0, 1.0);
    core = pow(core, 3.0);

    // Body color ramps from outer (edge/tip) through mid to core, with most
    // of the transition compressed close to the core so the mid-tone band
    // reads as a ring around the hot spot rather than smearing everywhere.
    float bodyT = clamp(1.0 - dist, 0.0, 1.0);
    vec3 color = mix(uOuterColor, uMidColor, smoothstep(0.25, 0.75, bodyT));
    color = mix(color, uCoreColor, core);

    // Alpha follows the silhouette mask directly (not a flat plateau) so
    // the flame actually has a shape -- brighter/more opaque near the core,
    // properly translucent (not just uniformly dim) toward the edges.
    float alpha = uOpacity * mask * mix(0.55, 1.0, core);

    gl_FragColor = vec4(color, alpha);
  }
`;

function buildFlameVisual(scene, candleNode, listener) {
  candleNode.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(candleNode);
  const size = box.getSize(new THREE.Vector3());
  const topWorld = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.max.y,
    (box.min.z + box.max.z) / 2
  );

  const group = new THREE.Group();
  group.position.copy(topWorld);
  group.position.y += CANDLE_FLAME_CONFIG.wickOffset;
  scene.add(group);

  const { flameHeight, flameWidth, swaySpeed, swayAmount, coreTightness } = CANDLE_FLAME_CONFIG;
  const geo = buildFlameGeometry();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: Math.random() * Math.PI * 2 },
      uSwaySpeed: { value: swaySpeed },
      uSwayAmount: { value: swayAmount },
      uCoreColor: { value: new THREE.Color(CANDLE_FLAME_CONFIG.coreColor) },
      uMidColor: { value: new THREE.Color(CANDLE_FLAME_CONFIG.midColor) },
      uOuterColor: { value: new THREE.Color(CANDLE_FLAME_CONFIG.outerColor) },
      uCoreTightness: { value: coreTightness },
      uOpacity: { value: 1.0 },
    },
    vertexShader: `#define uMaxHeight ${flameHeight.toFixed(6)}\n${FLAME_VERTEX_SHADER}`,
    fragmentShader: FLAME_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  group.add(mesh);

  const light = new THREE.PointLight(
    CANDLE_FLAME_CONFIG.lightColor,
    CANDLE_FLAME_CONFIG.lightIntensity,
    CANDLE_FLAME_CONFIG.lightDistance
  );
  light.position.y += flameHeight * 0.4;
  group.add(light);

  return {
    group, mesh, mat, light,
    flickerSeed: Math.random() * 1000,
    boundsSize: size,
  };
}

const _sharedAudioLoader = new THREE.AudioLoader();

function buildGlobalLoop(listener, { url, volume, loop }, label) {
  if (!listener) return null;

  const sound = new THREE.Audio(listener);
  sound.setLoop(loop);
  sound.setVolume(volume);

  _sharedAudioLoader.load(
    url,
    (buffer) => {
      sound.setBuffer(buffer);
      if (sound.userData.playPending) {
        sound.userData.playPending = false;
        sound.play();
      }
    },
    undefined,
    (error) => {
      console.warn(`candles: failed to load ${label} "${url}"`, error);
    }
  );

  return sound;
}

function buildSoundtrack(listener) {
  return buildGlobalLoop(listener, CANDLE_SOUNDTRACK_CONFIG, 'soundtrack');
}

function buildSnuffSound(listener) {
  if (!listener) return null;
  const { url, volume } = CANDLE_AMBIENT_CONFIG.snuff;

  const sound = new THREE.Audio(listener);
  sound.setLoop(false);
  sound.setVolume(volume);

  _sharedAudioLoader.load(
    url,
    (buffer) => sound.setBuffer(buffer),
    undefined,
    (error) => {
      console.warn(`candles: failed to load snuff sound "${url}"`, error);
    }
  );

  return sound;
}

function playOneShot(sound) {
  if (!sound) return;
  if (!sound.buffer) return; // not loaded yet -- a missed snuff cue is fine, unlike the soundtrack cue
  if (sound.isPlaying) sound.stop();
  sound.play();
}

export function buildCandles(scene, towerModel, onAllSnuffed, listener) {
  const candleNodes = findCandleNodes(towerModel);

  const flames = candleNodes.map(({ name, node }) => {
    const visual = buildFlameVisual(scene, node, listener);
    if (visual.boundsSize.length() < 0.001) {
      console.warn(
        `candles: node "${name}" has a near-zero bounding box -- flame position may be wrong. ` +
        `Check that the mesh actually has geometry/is visible at load time.`
      );
    }
    return { name, node, lit: true, snuffing: false, snuffStartTime: null, ...visual };
  });

  const soundtrack = buildSoundtrack(listener);
  const snuffSound = buildSnuffSound(listener);

  return {
    flames,
    snuffedCount: 0,
    allSnuffed: false,
    onAllSnuffed: onAllSnuffed || null,
    soundtrack,
    snuffSound,
  };
}

const SNUFF_FADE_DURATION = 0.28;

export function updateCandles(candles, elapsedTime) {
  if (!candles) return;

  for (const flame of candles.flames) {
    const stillSnuffing = flame.snuffing;
    if (stillSnuffing && flame.snuffStartTime === null) {
      flame.snuffStartTime = elapsedTime;
    }

    if (!flame.lit && !stillSnuffing) continue;

    const { flickerSpeed, flickerAmount, lightIntensity } = CANDLE_FLAME_CONFIG;
    const n = Math.sin(elapsedTime * flickerSpeed + flame.flickerSeed) * 0.5
      + Math.sin(elapsedTime * flickerSpeed * 2.3 + flame.flickerSeed) * 0.5;
    const flicker = 1 + n * flickerAmount;
    flame.mat.uniforms.uTime.value = elapsedTime;

    if (stillSnuffing) {
      const t = Math.min(1, (elapsedTime - flame.snuffStartTime) / SNUFF_FADE_DURATION);
      const fade = 1 - t;
      flame.mat.uniforms.uOpacity.value = fade;
      flame.light.intensity = lightIntensity * flicker * fade;
      if (t >= 1) {
        flame.snuffing = false;
        flame.mesh.visible = false;
        flame.light.intensity = 0;
      }
    } else {
      flame.light.intensity = lightIntensity * flicker;
    }
  }
}

function snuffFlame(flame) {
  if (!flame.lit) return;
  flame.lit = false;
  flame.snuffing = true;
  flame.snuffStartTime = null;
}

const _flameWorldPos = new THREE.Vector3();
export function pickAndSnuffCandle(candles, ray) {
  if (!candles) return null;

  let closest = null;
  let closestDist = Infinity;

  for (const flame of candles.flames) {
    if (!flame.lit) continue;
    flame.group.getWorldPosition(_flameWorldPos);
    const dist = ray.distanceToPoint(_flameWorldPos);
    if (dist <= CANDLE_FLAME_CONFIG.pickRadius && dist < closestDist) {
      closest = flame;
      closestDist = dist;
    }
  }

  if (!closest) return null;

  snuffFlame(closest);
  candles.snuffedCount += 1;
  playOneShot(candles.snuffSound);

  if (candles.snuffedCount >= candles.flames.length && !candles.allSnuffed) {
    candles.allSnuffed = true;
    onAllCandlesSnuffed(candles);
  }

  return closest.name;
}

function onAllCandlesSnuffed(candles) {
  const sound = candles.soundtrack;
  if (sound) {
    if (sound.buffer) {
      sound.play();
    } else {
      // Buffer may still be loading (e.g. slow connection right as the
      // last candle is snuffed) -- flag it so buildSoundtrack's loader
      // callback plays it the moment the buffer lands, instead of
      // silently dropping the cue.
      sound.userData.playPending = true;
    }
  }
  candles.onAllSnuffed?.();
}