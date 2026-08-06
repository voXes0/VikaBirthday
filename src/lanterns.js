import * as THREE from 'three';


export const LANTERN_CONFIG = {
  count: 60,
  rectFraction: 0.6,

  minDistanceMult: 1.15,
  maxDistanceMult: 2.4,

  spreadJitter: 0.6,

  wedgeHalfAngleDeg: 55,

  spawnHeightOffset: 0,
  spawnHeightJitter: 0.4,

  riseSpeed: 0.16,
  riseEaseDistance: 0.6,

  settleAltitudeDeg: 35,
  settleAltitudeMinDeg: 0,
  settleAltitudeMaxDeg: 90,
  settleHeightAt0: 0.8,
  settleHeightAt90: 3.2,
  settleHeightBandFrac: 0.18,
  verticalSpread: 1.6,

  centerLeadTime: 0.35,
  spreadDelayPerRadian: 1.4,
  spawnDelayJitter: 0.4,

  driftRadius: 0.55,
  driftSpeed: 0.35,
  swayAmount: 0.12,
  swaySpeed: 0.6,
  bobAmount: 0.08,
  bobSpeed: 0.5,
  idleBobAmount: 0.06,
  idleBobSpeed: 0.22,

  rectSize: { minW: 0.14, maxW: 0.22, minH: 0.22, maxH: 0.34, minD: 0.1, maxD: 0.16 },
  circSize: { minR: 0.09, maxR: 0.14, minH: 0.24, maxH: 0.36 },

  hotColor: 0xffdba3,
  coolColor: 0xff9a4d,
  emissiveIntensity: 2.4,

  flickerSpeed: 2.2,
  flickerAmount: 0.12,
};

export const LANTERN_SKY_GLOW_CONFIG = {
  enabled: true,
  color: 0xffb35c,
  maxIntensity: 0.5,
  fadeInDuration: 2.5,
  baseAngularRadiusDeg: 10,
  radiusPerSpreadUnit: 1.4,
  falloffPower: 1.6,
  densityFalloff: 0,
};

function makeLanternGradientTexture() {
  const w = 8;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const hot = new THREE.Color(LANTERN_CONFIG.hotColor);
  const cool = new THREE.Color(LANTERN_CONFIG.coolColor);
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = hot.clone().lerp(cool, t);
    grad.addColorStop(t, `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const LANTERN_VERTEX_SHADER =  `
  attribute float aFlickerSeed;
  varying vec2 vUv;
  varying float vFlickerSeed;
  void main() {
    vUv = uv;
    vFlickerSeed = aFlickerSeed;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const LANTERN_FRAGMENT_SHADER =  `
  uniform sampler2D uGradient;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uFlickerSpeed;
  uniform float uFlickerAmount;
  varying vec2 vUv;
  varying float vFlickerSeed;

  void main() {
    vec3 base = texture2D(uGradient, vUv).rgb;
    float n = sin(uTime * uFlickerSpeed + vFlickerSeed) * 0.5
      + sin(uTime * uFlickerSpeed * 2.3 + vFlickerSeed * 1.7) * 0.5;
    float flicker = 1.0 + n * uFlickerAmount;
    gl_FragColor = vec4(base * uIntensity * flicker, 1.0);
  }
`;

function buildLanternMaterial(gradientTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGradient: { value: gradientTexture },
      uIntensity: { value: LANTERN_CONFIG.emissiveIntensity },
      uTime: { value: 0 },
      uFlickerSpeed: { value: LANTERN_CONFIG.flickerSpeed },
      uFlickerAmount: { value: LANTERN_CONFIG.flickerAmount },
    },
    vertexShader: LANTERN_VERTEX_SHADER,
    fragmentShader: LANTERN_FRAGMENT_SHADER,
    toneMapped: false,
  });
}

function buildRectGeometry() {
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  geo.translate(0, 0.5, 0);
  remapUVsToHeight(geo);
  return geo;
}

function buildCircGeometry() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  geo.translate(0, 0.5, 0);
  remapUVsToHeight(geo);
  return geo;
}

function remapUVsToHeight(geo) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    uv.setY(i, THREE.MathUtils.clamp(y, 0, 1));
  }
  uv.needsUpdate = true;
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function altitudeToHeight(altitudeDeg, towerBottomY, towerHeight) {
  const cfg = LANTERN_CONFIG;
  const span = Math.max(cfg.settleAltitudeMaxDeg - cfg.settleAltitudeMinDeg, 0.0001);
  const t = THREE.MathUtils.clamp((altitudeDeg - cfg.settleAltitudeMinDeg) / span, 0, 1);
  const heightMult = THREE.MathUtils.lerp(cfg.settleHeightAt0, cfg.settleHeightAt90, t);
  return towerBottomY + heightMult * towerHeight;
}

export function buildLanterns(scene, towerNode, spawnDirection) {
  towerNode.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(towerNode);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const towerHeight = size.y;
  const towerHalfExtent = Math.max(size.x, size.z) * 0.5;

  const dirX = spawnDirection ? spawnDirection.x : 0;
  const dirZ = spawnDirection ? spawnDirection.z : 1;
  const dirLen = Math.hypot(dirX, dirZ) || 1;
  const centerBearing = Math.atan2(dirX / dirLen, dirZ / dirLen);

  const cfg = LANTERN_CONFIG;
  const rectCount = Math.round(cfg.count * cfg.rectFraction);
  const circCount = cfg.count - rectCount;

  const gradientTexture = makeLanternGradientTexture();
  const rectMaterial = buildLanternMaterial(gradientTexture);
  const circMaterial = buildLanternMaterial(gradientTexture);

  const rectGeo = buildRectGeometry();
  const circGeo = buildCircGeometry();

  const rectMesh = new THREE.InstancedMesh(rectGeo, rectMaterial, Math.max(rectCount, 1));
  const circMesh = new THREE.InstancedMesh(circGeo, circMaterial, Math.max(circCount, 1));
  rectMesh.count = rectCount;
  circMesh.count = circCount;
  rectMesh.frustumCulled = false;
  circMesh.frustumCulled = false;
  rectMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  circMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  addFlickerAttribute(rectGeo, rectCount);
  addFlickerAttribute(circGeo, circCount);

  scene.add(rectMesh);
  scene.add(circMesh);

  const wedgeHalfAngle = cfg.wedgeHalfAngleDeg * (Math.PI / 180);
  const angleStep = cfg.count > 1 ? (wedgeHalfAngle * 2) / (cfg.count - 1) : 0;
  const centerIdx = Math.floor((cfg.count - 1) / 2);

  const lanterns = [];
  let rectIdx = 0;
  let circIdx = 0;
  for (let i = 0; i < cfg.count; i++) {
    const isRect = i < rectCount;

    const slotOffset = cfg.count > 1 ? -wedgeHalfAngle + i * angleStep : 0;
    const bearing = centerBearing + slotOffset + randRange(-angleStep, angleStep) * 0.5 * cfg.spreadJitter;
    const angularDistFromCenter = slotOffset;

    const distance = towerHalfExtent
      * randRange(cfg.minDistanceMult, cfg.maxDistanceMult);

    const baseX = center.x + Math.sin(bearing) * distance;
    const baseZ = center.z + Math.cos(bearing) * distance;
    const spawnY = box.min.y + cfg.spawnHeightOffset + randRange(0, cfg.spawnHeightJitter);

    const bandHeight = altitudeToHeight(cfg.settleAltitudeDeg, box.min.y, towerHeight) - box.min.y;
    const band = bandHeight * cfg.settleHeightBandFrac;
    const targetY = altitudeToHeight(cfg.settleAltitudeDeg, box.min.y, towerHeight)
      + randRange(-band, band)
      + randRange(-cfg.verticalSpread, cfg.verticalSpread);

    const scale = isRect
      ? new THREE.Vector3(
          randRange(cfg.rectSize.minW, cfg.rectSize.maxW),
          randRange(cfg.rectSize.minH, cfg.rectSize.maxH),
          randRange(cfg.rectSize.minD, cfg.rectSize.maxD),
        )
      : (() => {
          const r = randRange(cfg.circSize.minR, cfg.circSize.maxR);
          return new THREE.Vector3(r, randRange(cfg.circSize.minH, cfg.circSize.maxH), r);
        })();

    const spawnDelay = i === centerIdx
      ? cfg.centerLeadTime
      : cfg.centerLeadTime
        + Math.abs(angularDistFromCenter) * cfg.spreadDelayPerRadian
        + Math.random() * cfg.spawnDelayJitter;

    lanterns.push({
      isRect,
      instanceIdx: isRect ? rectIdx++ : circIdx++,
      baseX, baseZ,
      spawnY, targetY,
      currentY: spawnY,
      spawnDelay,
      phase: Math.random() * Math.PI * 2,
      driftFreqMult: randRange(0.8, 1.25),
      swayFreqMult: randRange(0.8, 1.25),
      bobFreqMult: randRange(0.8, 1.25),
      idleBobFreqMult: randRange(0.8, 1.25),
      rotY: Math.random() * Math.PI * 2,
      scale,
      settled: false,
    });
  }

  return {
    lanterns,
    rectMesh,
    circMesh,
    rectMaterial,
    circMaterial,
    rectGeo,
    circGeo,
    gradientTexture,
    launchTime: null,
    launched: false,
    glow: {
      active: false,
      center: new THREE.Vector3(),
      radius: 0,
      intensity: 0,
    },
  };
}

export function disposeLanterns(scene, lanterns) {
  if (!lanterns) return;
  scene.remove(lanterns.rectMesh);
  scene.remove(lanterns.circMesh);
  lanterns.rectGeo.dispose();
  lanterns.circGeo.dispose();
  lanterns.rectMaterial.dispose();
  lanterns.circMaterial.dispose();
  lanterns.gradientTexture.dispose();
}

export function syncLanternUniforms(lanterns) {
  if (!lanterns) return;
  for (const mat of [lanterns.rectMaterial, lanterns.circMaterial]) {
    mat.uniforms.uIntensity.value = LANTERN_CONFIG.emissiveIntensity;
    mat.uniforms.uFlickerSpeed.value = LANTERN_CONFIG.flickerSpeed;
    mat.uniforms.uFlickerAmount.value = LANTERN_CONFIG.flickerAmount;
  }
}

function addFlickerAttribute(geo, count) {
  const arr = new Float32Array(Math.max(count, 1));
  geo.setAttribute('aFlickerSeed', new THREE.InstancedBufferAttribute(arr, 1));
}

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _glowSum = new THREE.Vector3();

export function launchLanterns(lanterns, elapsedTime) {
  if (!lanterns) return;
  lanterns.launched = true;
  lanterns.launchTime = elapsedTime;

  const rectSeeds = lanterns.rectMesh.geometry.attributes.aFlickerSeed;
  const circSeeds = lanterns.circMesh.geometry.attributes.aFlickerSeed;

  for (const l of lanterns.lanterns) {
    l.currentY = l.spawnY;
    l.settled = false;

    const target = l.isRect ? rectSeeds : circSeeds;
    target.array[l.instanceIdx] = l.phase;

    _pos.set(l.baseX, l.currentY, l.baseZ);
    _euler.set(0, l.rotY, 0);
    _quat.setFromEuler(_euler);
    _matrix.compose(_pos, _quat, l.scale);
    if (l.isRect) {
      lanterns.rectMesh.setMatrixAt(l.instanceIdx, _matrix);
    } else {
      lanterns.circMesh.setMatrixAt(l.instanceIdx, _matrix);
    }
  }
  rectSeeds.needsUpdate = true;
  circSeeds.needsUpdate = true;
  lanterns.rectMesh.instanceMatrix.needsUpdate = true;
  lanterns.circMesh.instanceMatrix.needsUpdate = true;
}

const RISE_SETTLE_EPSILON = 0.01;

export function updateLanterns(lanterns, elapsedTime, dt) {
  if (!lanterns || !lanterns.launched) return;
  const cfg = LANTERN_CONFIG;

  lanterns.rectMaterial.uniforms.uTime.value = elapsedTime;
  lanterns.circMaterial.uniforms.uTime.value = elapsedTime;

  let rectDirty = false;
  let circDirty = false;

  _glowSum.set(0, 0, 0);
  let activeCount = 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const l of lanterns.lanterns) {
    const tSinceLaunch = elapsedTime - lanterns.launchTime;
    if (tSinceLaunch < l.spawnDelay) continue;

    const t = tSinceLaunch - l.spawnDelay;

    if (!l.settled) {
      const remaining = l.targetY - l.currentY;
      const dir = Math.sign(remaining);
      const distAbs = Math.abs(remaining);
      const easeT = THREE.MathUtils.clamp(distAbs / Math.max(cfg.riseEaseDistance, 0.0001), 0, 1);
      const easedSpeed = cfg.riseSpeed * (easeT * easeT * (3 - 2 * easeT));
      const step = dir * Math.min(easedSpeed * dt, distAbs);
      l.currentY += step;

      if (Math.abs(l.targetY - l.currentY) < RISE_SETTLE_EPSILON) {
        l.currentY = l.targetY;
        l.settled = true;
      }
    }

    const driftT = t * cfg.driftSpeed * l.driftFreqMult + l.phase;
    const driftX = Math.sin(driftT) * cfg.driftRadius;
    const driftZ = Math.cos(driftT * 0.7) * cfg.driftRadius;

    const swayT = t * cfg.swaySpeed * l.swayFreqMult + l.phase * 1.3;
    const tiltX = Math.sin(swayT) * cfg.swayAmount;
    const tiltZ = Math.cos(swayT * 0.8) * cfg.swayAmount;

    const bobT = t * cfg.bobSpeed * l.bobFreqMult + l.phase * 0.6;
    const bob = Math.sin(bobT) * cfg.bobAmount;

    const idleBobT = t * cfg.idleBobSpeed * l.idleBobFreqMult + l.phase * 0.9;
    const idleBob = Math.sin(idleBobT) * cfg.idleBobAmount;

    const worldX = l.baseX + driftX;
    const worldY = l.currentY + bob + idleBob;
    const worldZ = l.baseZ + driftZ;

    _pos.set(worldX, worldY, worldZ);
    _euler.set(tiltX, l.rotY, tiltZ);
    _quat.setFromEuler(_euler);
    _matrix.compose(_pos, _quat, l.scale);

    if (l.isRect) {
      lanterns.rectMesh.setMatrixAt(l.instanceIdx, _matrix);
      rectDirty = true;
    } else {
      lanterns.circMesh.setMatrixAt(l.instanceIdx, _matrix);
      circDirty = true;
    }

    // Every spawned (even still-rising) lantern contributes to the sky
    // glow -- both its position (for the centroid) and its spread (for
    // the glow radius), so the lit patch already reflects the wedge's
    // jitter and vertical spread rather than a tight point that only
    // matches the final settled cluster.
    _glowSum.x += worldX;
    _glowSum.y += worldY;
    _glowSum.z += worldZ;
    activeCount++;
    if (worldX < minX) minX = worldX;
    if (worldX > maxX) maxX = worldX;
    if (worldY < minY) minY = worldY;
    if (worldY > maxY) maxY = worldY;
    if (worldZ < minZ) minZ = worldZ;
    if (worldZ > maxZ) maxZ = worldZ;
  }

  if (rectDirty) lanterns.rectMesh.instanceMatrix.needsUpdate = true;
  if (circDirty) lanterns.circMesh.instanceMatrix.needsUpdate = true;

  updateLanternSkyGlow(lanterns, activeCount, _glowSum, minX, maxX, minY, maxY, minZ, maxZ, dt);
}

function updateLanternSkyGlow(lanterns, activeCount, sum, minX, maxX, minY, maxY, minZ, maxZ, dt) {
  const glowCfg = LANTERN_SKY_GLOW_CONFIG;
  const glow = lanterns.glow;
  if (!glow) return;

  if (!glowCfg.enabled || activeCount === 0) {
    glow.active = false;
    glow.intensity = Math.max(0, glow.intensity - dt / Math.max(glowCfg.fadeInDuration, 0.0001));
    return;
  }

  glow.active = true;
  glow.center.set(sum.x / activeCount, sum.y / activeCount, sum.z / activeCount);
  glow.color = glowCfg.color;
  glow.falloffPower = glowCfg.falloffPower;

  // Spread = half the bounding extent across all three axes, averaged --
  // a rough "how wide is this cluster" measure that grows with wedge
  // angle, distance jitter, and vertical spread alike, so the glow patch
  // naturally scales with however spread-out the lanterns currently are.
  const spread = ((maxX - minX) + (maxY - minY) + (maxZ - minZ)) / 6;
  glow.radius = glowCfg.baseAngularRadiusDeg + spread * glowCfg.radiusPerSpreadUnit;

  const fadeStep = dt / Math.max(glowCfg.fadeInDuration, 0.0001);
  // densityFalloff > 0 makes wider-spread clusters dimmer even at the
  // same lantern count -- so a bigger, tighter huddle is needed to reach
  // the same brightness as a small tight one. 0 disables the penalty.
  const densityPenalty = 1 / (1 + spread * glowCfg.densityFalloff);
  const targetIntensity = glowCfg.maxIntensity
    * Math.min(1, activeCount / Math.max(1, LANTERN_CONFIG.count * 0.3))
    * densityPenalty;
  if (glow.intensity < targetIntensity) {
    glow.intensity = Math.min(targetIntensity, glow.intensity + fadeStep);
  } else {
    glow.intensity = Math.max(targetIntensity, glow.intensity - fadeStep);
  }
}