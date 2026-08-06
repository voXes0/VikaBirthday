import * as THREE from 'three';


export const SKY_CONFIG = {
  skyColor: 0x2e3d63,
  horizonColor: 0xffdcb0,
  groundColor: 0x453a52,
  horizonHeight: -0.05,
  horizonSharpness: 0.35,
};

export const SUN_VISUAL_CONFIG = {
  discColor: 0xfff8ec,
  glowColor: 0xffdcb0,
  visualSize: 28,
  glowSize: 220,
  glowOpacity: 0.55,
  distance: 750,
};

export const MOON_VISUAL_CONFIG = {
  discColor: 0xc9c8d4,
  rimColor: 0xcdd8ff,
  craterColor: 0xc9c5da,
  glowColor: 0xaebeff,
  visualSize: 24,
  glowSize: 320,
  glowOpacity: 0.18,
  distance: 750,
};

export const STAR_CONFIG = {
  count: 1800,
  fieldRadius: 780,
  size: 1.6,
  baseOpacity: 0.45,
  fadeBandHeight: 0.22,
};

export const CLOUD_CONFIG = {
  count: 14,
  distance: 700,
  minAltitude01: 0.08,
  maxAltitude01: 0.4,
  minScale: 90,
  maxScale: 220,
  opacity: 0.5,
  litColor: 0xffe9c9,
  shadowColor: 0x4a4560,
  sunGlowColor: 0xfff2d6,
  sunGlowSharpness: 6,
  sunGlowStrength: 0.85,
  driftSpeed: 0.008,
  fastForwardMult: 1,
};

const DOME_RADIUS = 800;

function buildDome() {
  const uniforms = {
    uSkyColor: { value: new THREE.Color(SKY_CONFIG.skyColor) },
    uHorizonColor: { value: new THREE.Color(SKY_CONFIG.horizonColor) },
    uGroundColor: { value: new THREE.Color(SKY_CONFIG.groundColor) },
    uHorizonHeight: { value: SKY_CONFIG.horizonHeight },
    uHorizonSharpness: { value: SKY_CONFIG.horizonSharpness },
    uGlowColor: { value: new THREE.Color(0xffb35c) },
    uGlowDir: { value: new THREE.Vector3(0, 0, 1) },
    uGlowAngularRadius: { value: 0.0 },
    uGlowIntensity: { value: 0.0 },
    uGlowFalloffPower: { value: 1.6 },
  };

  const geometry = new THREE.SphereGeometry(DOME_RADIUS, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    vertexShader:  `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader:  `
      uniform vec3 uSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      uniform float uHorizonHeight;
      uniform float uHorizonSharpness;
      uniform vec3 uGlowColor;
      uniform vec3 uGlowDir;
      uniform float uGlowAngularRadius;
      uniform float uGlowIntensity;
      uniform float uGlowFalloffPower;
      varying vec3 vWorldPos;

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y - uHorizonHeight;

        float k = 1.0 / max(uHorizonSharpness, 0.001);
        float above = smoothstep(0.0, k * 0.5, h);
        float below = smoothstep(0.0, k * 0.5, -h);

        vec3 color = uHorizonColor;
        color = mix(color, uSkyColor, above);
        color = mix(color, uGroundColor, below);

        // Lanterns lighting up the sky: soft additive patch centered on
        // the lantern cluster's direction from camera, sized by its
        // current angular radius (which already reflects the wedge
        // spread/jitter/vertical-spread on the JS side) and faded by
        // uGlowIntensity as they launch and thin out.
        float angleDeg = acos(clamp(dot(dir, uGlowDir), -1.0, 1.0)) * 57.29578;
        float glowFalloff = 1.0 - smoothstep(0.0, uGlowAngularRadius, angleDeg);
        glowFalloff = pow(glowFalloff, uGlowFalloffPower);
        color += uGlowColor * glowFalloff * uGlowIntensity;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -5;
  return { mesh, uniforms };
}

function buildSunVisual() {
  const discGeo = new THREE.CircleGeometry(SUN_VISUAL_CONFIG.visualSize, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: SUN_VISUAL_CONFIG.discColor,
    fog: false,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.renderOrder = -2;

  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const glowMat = new THREE.MeshBasicMaterial({
    color: SUN_VISUAL_CONFIG.glowColor,
    transparent: true,
    opacity: SUN_VISUAL_CONFIG.glowOpacity,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    map: makeRadialGradientTexture(),
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.scale.setScalar(SUN_VISUAL_CONFIG.glowSize);
  glow.renderOrder = -3;

  const group = new THREE.Group();
  group.add(glow, disc);

  return { group, disc, glow, discMat, glowMat };
}

function makeMoonTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  ctx.fillStyle = '#f5f3ff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const craters = [
    { x: 0.36, y: 0.32, r: 0.16, a: 0.22 },
    { x: 0.62, y: 0.28, r: 0.10, a: 0.16 },
    { x: 0.50, y: 0.52, r: 0.20, a: 0.20 },
    { x: 0.30, y: 0.62, r: 0.11, a: 0.15 },
    { x: 0.68, y: 0.60, r: 0.14, a: 0.18 },
    { x: 0.44, y: 0.72, r: 0.08, a: 0.14 },
    { x: 0.72, y: 0.42, r: 0.07, a: 0.12 },
  ];
  for (const c of craters) {
    const px = c.x * size;
    const py = c.y * size;
    const pr = c.r * size;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, `rgba(150,148,175,${c.a})`);
    grad.addColorStop(0.7, `rgba(150,148,175,${c.a * 0.5})`);
    grad.addColorStop(1, 'rgba(150,148,175,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
  rim.addColorStop(0, 'rgba(205,216,255,0)');
  rim.addColorStop(1, 'rgba(205,216,255,0.35)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMoonVisual() {
  const discGeo = new THREE.CircleGeometry(MOON_VISUAL_CONFIG.visualSize, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: MOON_VISUAL_CONFIG.discColor,
    map: makeMoonTexture(),
    transparent: true,
    fog: false,
    depthWrite: false,
    depthTest: true,
    toneMapped: true,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.renderOrder = -2;

  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const glowMat = new THREE.MeshBasicMaterial({
    color: MOON_VISUAL_CONFIG.glowColor,
    transparent: true,
    opacity: MOON_VISUAL_CONFIG.glowOpacity,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: true,
    blending: THREE.AdditiveBlending,
    map: makeRadialGradientTexture(),
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.scale.setScalar(MOON_VISUAL_CONFIG.glowSize);
  glow.renderOrder = -3;

  const group = new THREE.Group();
  group.add(glow, disc);

  return { group, disc, glow, discMat, glowMat };
}

function makeRadialGradientTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildStars() {
  const { count, fieldRadius, size } = STAR_CONFIG;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(1 - v);
    const y = Math.abs(Math.cos(phi));
    const r = Math.sqrt(1 - y * y);
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);

    positions[i * 3 + 0] = x * fieldRadius;
    positions[i * 3 + 1] = y * fieldRadius;
    positions[i * 3 + 2] = z * fieldRadius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const uniforms = {
    uOpacity: { value: STAR_CONFIG.baseOpacity },
    uFadeBandHeight: { value: STAR_CONFIG.fadeBandHeight },
    uSize: { value: size },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    vertexShader:  `
      uniform float uSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (300.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader:  `
      uniform float uOpacity;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float alpha = smoothstep(0.5, 0.1, d) * uOpacity;
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = -4;
  return { points, uniforms };
}

function makeCloudTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const blobs = [
    { x: 0.5, y: 0.55, r: 0.34 },
    { x: 0.32, y: 0.6, r: 0.24 },
    { x: 0.68, y: 0.6, r: 0.26 },
    { x: 0.42, y: 0.42, r: 0.22 },
    { x: 0.6, y: 0.44, r: 0.2 },
  ];

  for (const b of blobs) {
    const cx = b.x * size;
    const cy = b.y * size;
    const r = b.r * size;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildClouds() {
  const cloudTexture = makeCloudTexture();
  const group = new THREE.Group();
  const sprites = [];

  for (let i = 0; i < CLOUD_CONFIG.count; i++) {
    const material = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: CLOUD_CONFIG.opacity,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      color: 0xffffff,
    });
    const sprite = new THREE.Sprite(material);
    const scale = THREE.MathUtils.lerp(CLOUD_CONFIG.minScale, CLOUD_CONFIG.maxScale, Math.random());
    sprite.scale.set(scale * 1.6, scale, 1);

    const bearing = Math.random() * Math.PI * 2;
    const altitude01 = THREE.MathUtils.lerp(
      CLOUD_CONFIG.minAltitude01, CLOUD_CONFIG.maxAltitude01, Math.random()
    );
    const y = Math.sin(altitude01 * Math.PI * 0.5) * CLOUD_CONFIG.distance;
    const flatR = Math.cos(altitude01 * Math.PI * 0.5) * CLOUD_CONFIG.distance;

    sprites.push({ sprite, bearing, altitude01, y, flatR });
    group.add(sprite);
  }

  group.renderOrder = -1;
  return { group, sprites };
}

export function buildSky(scene, sunDirection, moonDirection) {
  const dome = buildDome();
  const sun = buildSunVisual();
  const moon = buildMoonVisual();
  const stars = buildStars();
  const clouds = buildClouds();

  scene.add(dome.mesh);
  scene.add(sun.group);
  scene.add(moon.group);
  scene.add(stars.points);
  scene.add(clouds.group);


  const _sunWorldPos = new THREE.Vector3();
  const _moonWorldPos = new THREE.Vector3();
  const litColor = new THREE.Color(CLOUD_CONFIG.litColor);
  const shadowColor = new THREE.Color(CLOUD_CONFIG.shadowColor);
  const sunGlowColor = new THREE.Color(CLOUD_CONFIG.sunGlowColor);
  const _tmpColor = new THREE.Color();
  const _cloudPos = new THREE.Vector3();
  const _cloudDirFlat = new THREE.Vector3();
  const _sunDirFlat = new THREE.Vector3();
  const _cloudDir3D = new THREE.Vector3();
  const _glowDir = new THREE.Vector3();

  const VISIBILITY_FADE_BAND = 0.06;

  function update(camera, sunDir, sunAltitude01, dt = 0, lanternGlow = null) {
    const camPos = camera.position;

    dome.mesh.position.copy(camPos);
    stars.points.position.copy(camPos);
    clouds.group.position.copy(camPos);

    _sunWorldPos.copy(sunDir).multiplyScalar(SUN_VISUAL_CONFIG.distance).add(camPos);
    sun.group.position.copy(_sunWorldPos);
    sun.disc.lookAt(camPos);
    sun.glow.lookAt(camPos);
    const sunVisibility = THREE.MathUtils.clamp(sunDir.y / VISIBILITY_FADE_BAND, 0, 1);
    sun.group.visible = sunVisibility > 0.001;
    sun.glowMat.opacity = SUN_VISUAL_CONFIG.glowOpacity * sunVisibility;

    _moonWorldPos.copy(moonDirection).multiplyScalar(MOON_VISUAL_CONFIG.distance).add(camPos);
    moon.group.position.copy(_moonWorldPos);
    moon.disc.lookAt(camPos);
    moon.glow.lookAt(camPos);
    const moonVisibility = THREE.MathUtils.clamp(moonDirection.y / VISIBILITY_FADE_BAND, 0, 1);
    moon.group.visible = moonVisibility > 0.001;
    moon.glowMat.opacity = MOON_VISUAL_CONFIG.glowOpacity * moonVisibility;

    const fadeBand = Math.max(stars.uniforms.uFadeBandHeight.value, 0.001);
    const starVisibility = 1.0 - THREE.MathUtils.clamp(sunAltitude01 / fadeBand, 0, 1);
    const starOpacity = starVisibility * STAR_CONFIG.baseOpacity;
    stars.uniforms.uOpacity.value = starOpacity;
    stars.points.visible = starOpacity > 0.001;

    const drift = CLOUD_CONFIG.driftSpeed * CLOUD_CONFIG.fastForwardMult * dt;
    _sunDirFlat.set(sunDir.x, 0, sunDir.z).normalize();
    for (const c of clouds.sprites) {
      c.bearing += drift;
      const cosB = Math.cos(c.bearing);
      const sinB = Math.sin(c.bearing);
      _cloudPos.set(cosB * c.flatR, c.y, sinB * c.flatR).add(camPos);
      c.sprite.position.copy(_cloudPos);

      _cloudDirFlat.set(cosB, 0, sinB);
      const facingSun = THREE.MathUtils.clamp(_cloudDirFlat.dot(_sunDirFlat), 0, 1);
      _tmpColor.copy(shadowColor).lerp(litColor, facingSun);

      _cloudDir3D.copy(_cloudPos).sub(camPos).normalize();
      const sunProximity = Math.pow(
        THREE.MathUtils.clamp(_cloudDir3D.dot(sunDir), 0, 1),
        CLOUD_CONFIG.sunGlowSharpness
      );
      _tmpColor.lerp(sunGlowColor, sunProximity * CLOUD_CONFIG.sunGlowStrength);
      c.sprite.material.color.copy(_tmpColor);
      c.sprite.material.opacity = CLOUD_CONFIG.opacity * (1 + sunProximity * 0.35);
    }

    const du = dome.uniforms;
    if (lanternGlow && lanternGlow.active && lanternGlow.intensity > 0.001) {
      _glowDir.copy(lanternGlow.center).sub(camPos).normalize();
      du.uGlowDir.value.copy(_glowDir);
      du.uGlowAngularRadius.value = lanternGlow.radius;
      du.uGlowIntensity.value = lanternGlow.intensity;
      if (lanternGlow.color !== undefined) du.uGlowColor.value.set(lanternGlow.color);
      if (lanternGlow.falloffPower !== undefined) du.uGlowFalloffPower.value = lanternGlow.falloffPower;
    } else {
      du.uGlowIntensity.value = lanternGlow ? lanternGlow.intensity : 0;
    }
  }

  return {
    dome, sun, moon, stars,
    clouds: { ...clouds, litColor, shadowColor, sunGlowColor },
    moonDirection,
    update,
  };
}