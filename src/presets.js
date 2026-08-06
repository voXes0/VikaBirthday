import { TIME_OF_DAY_CONFIG } from './time-of-day.js';

export const PRESETS_URL = '/presets.json';

// Populated by loadPresets(). Shape:
// { <parentName>: { label, lanterns, hairPhysics, drag, candleFlame,
//     framing, orbit, climb, director, stars, clouds, godrays, shadow,
//     timeOfDay: { day: {...}, night: {...} } } }
export let PRESETS = {};

// Last celestial.distance value applied via applyPreset/startPresetTransition.
// TIME_OF_DAY_CONFIG.hours tracks the live hour the same way; this tracks the
// live distance, since nothing else in the app exposes it.
export let currentCelestialDistance = TIME_OF_DAY_CONFIG.sunDistance;

let loadPromise = null;

export function loadPresets(url = PRESETS_URL) {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`loadPresets: fetch failed (${res.status})`);
      return res.json();
    })
    .then((data) => {
      PRESETS = data;
      return PRESETS;
    })
    .catch((err) => {
      console.error('loadPresets: could not load presets from', url, err);
      PRESETS = {};
      throw err;
    });
  return loadPromise;
}

function resolveVariant(parentName, variantName) {
  const parent = PRESETS[parentName];
  if (!parent) {
    console.warn(`presets: unknown preset "${parentName}"`);
    return null;
  }
  const variant = parent.timeOfDay?.[variantName];
  if (!variant) {
    console.warn(`presets: unknown time-of-day variant "${variantName}" on preset "${parentName}"`);
    return null;
  }
  return variant;
}

// Applies the non-time-of-day (parent-level) values -- lanterns, hair
// physics, drag, candle flame, camera framing/director, and the fixed
// parts of stars/clouds/godrays/shadow -- to their live config objects.
// These don't vary between day/night, so they're applied once per
// preset switch rather than interpolated during a transition.
export function applyParentPreset(parentName, configs) {
  const parent = PRESETS[parentName];
  if (!parent) {
    console.warn(`applyParentPreset: unknown preset "${parentName}"`);
    return;
  }

  const {
    LANTERN_CONFIG, LANTERN_SKY_GLOW_CONFIG, HAIR_PHYSICS_CONFIG, DRAG_CONFIG, CANDLE_FLAME_CONFIG,
    FRAMING_CONFIG, ORBIT_CONFIG, CLIMB_CONFIG, DIRECTOR_CONFIG,
    STAR_CONFIG, CLOUD_CONFIG, GODRAYS_CONFIG,
  } = configs;

  if (LANTERN_CONFIG && parent.lanterns) Object.assign(LANTERN_CONFIG, parent.lanterns);
  if (LANTERN_SKY_GLOW_CONFIG && parent.lanternSkyGlow) Object.assign(LANTERN_SKY_GLOW_CONFIG, parent.lanternSkyGlow);
  if (HAIR_PHYSICS_CONFIG && parent.hairPhysics) Object.assign(HAIR_PHYSICS_CONFIG, parent.hairPhysics);
  if (DRAG_CONFIG && parent.drag) Object.assign(DRAG_CONFIG, parent.drag);
  if (CANDLE_FLAME_CONFIG && parent.candleFlame) Object.assign(CANDLE_FLAME_CONFIG, parent.candleFlame);
  if (FRAMING_CONFIG && parent.framing) Object.assign(FRAMING_CONFIG, parent.framing);
  if (ORBIT_CONFIG && parent.orbit) Object.assign(ORBIT_CONFIG, parent.orbit);
  if (CLIMB_CONFIG && parent.climb) Object.assign(CLIMB_CONFIG, parent.climb);
  if (DIRECTOR_CONFIG && parent.director) Object.assign(DIRECTOR_CONFIG, parent.director);
  if (STAR_CONFIG && parent.stars) Object.assign(STAR_CONFIG, parent.stars);
  if (CLOUD_CONFIG && parent.clouds) Object.assign(CLOUD_CONFIG, parent.clouds);
  if (GODRAYS_CONFIG && parent.godrays) {
    GODRAYS_CONFIG.enabled = parent.godrays.enabled;
    GODRAYS_CONFIG.samples = parent.godrays.samples;
    GODRAYS_CONFIG.resScale = parent.godrays.resScale;
  }
}

export function applyPreset(parentName, variantName, { lighting, sky, postprocessing, renderer }, configs) {
  const preset = resolveVariant(parentName, variantName);
  if (!preset) return;

  const {
    SUN_LIGHT_CONFIG, MOON_LIGHT_CONFIG, FILL_LIGHT_CONFIG, AMBIENT_LIGHT_CONFIG,
    SKY_CONFIG, SUN_VISUAL_CONFIG, MOON_VISUAL_CONFIG, STAR_CONFIG, CLOUD_CONFIG,
    BLOOM_CONFIG, BLOOM_BROAD_CONFIG, GODRAYS_CONFIG, GRADE_CONFIG,
  } = configs;

  Object.assign(SUN_LIGHT_CONFIG, preset.sunLight);
  Object.assign(MOON_LIGHT_CONFIG, preset.moonLight);
  TIME_OF_DAY_CONFIG.hours = preset.celestial.hours;
  currentCelestialDistance = preset.celestial.distance;
  lighting.setTimeOfDay(preset.celestial.hours, {
    ...TIME_OF_DAY_CONFIG,
    sunDistance: preset.celestial.distance,
    moonDistance: preset.celestial.distance,
  });

  lighting.fillLight.color.set(preset.fill.color);
  lighting.fillLight.intensity = preset.fill.intensity;
  lighting.fillLight.position.set(preset.fill.posX, preset.fill.posY, preset.fill.posZ);
  Object.assign(FILL_LIGHT_CONFIG, preset.fill);

  lighting.ambient.color.set(preset.ambient.skyColor);
  lighting.ambient.groundColor.set(preset.ambient.groundColor);
  lighting.ambient.intensity = preset.ambient.intensity;
  Object.assign(AMBIENT_LIGHT_CONFIG, preset.ambient);

  renderer.toneMappingExposure = preset.exposure;

  sky.dome.uniforms.uSkyColor.value.set(preset.sky.skyColor);
  sky.dome.uniforms.uHorizonColor.value.set(preset.sky.horizonColor);
  sky.dome.uniforms.uGroundColor.value.set(preset.sky.groundColor);
  sky.dome.uniforms.uHorizonHeight.value = preset.sky.horizonHeight;
  sky.dome.uniforms.uHorizonSharpness.value = preset.sky.horizonSharpness;
  Object.assign(SKY_CONFIG, preset.sky);

  sky.sun.discMat.color.set(preset.sunVisual.discColor);
  sky.sun.glowMat.color.set(preset.sunVisual.glowColor);
  sky.sun.glowMat.opacity = preset.sunVisual.glowOpacity;
  Object.assign(SUN_VISUAL_CONFIG, {
    discColor: preset.sunVisual.discColor,
    glowColor: preset.sunVisual.glowColor,
    glowOpacity: preset.sunVisual.glowOpacity,
  });

  sky.moon.discMat.color.set(preset.moonVisual.discColor);
  sky.moon.glowMat.color.set(preset.moonVisual.glowColor);
  sky.moon.glowMat.opacity = preset.moonVisual.glowOpacity;
  Object.assign(MOON_VISUAL_CONFIG, {
    discColor: preset.moonVisual.discColor,
    glowColor: preset.moonVisual.glowColor,
    glowOpacity: preset.moonVisual.glowOpacity,
  });

  sky.stars.uniforms.uFadeBandHeight.value = preset.stars.fadeBandHeight;
  STAR_CONFIG.baseOpacity = preset.stars.baseOpacity;
  STAR_CONFIG.fadeBandHeight = preset.stars.fadeBandHeight;

  CLOUD_CONFIG.litColor = preset.clouds.litColor;
  CLOUD_CONFIG.shadowColor = preset.clouds.shadowColor;
  CLOUD_CONFIG.opacity = preset.clouds.opacity;
  sky.clouds.litColor.set(preset.clouds.litColor);
  sky.clouds.shadowColor.set(preset.clouds.shadowColor);
  for (const c of sky.clouds.sprites) {
    c.sprite.material.opacity = preset.clouds.opacity;
  }

  postprocessing.bloomPass.threshold = preset.bloom.threshold;
  postprocessing.bloomPass.strength = preset.bloom.strength;
  postprocessing.bloomPass.radius = preset.bloom.radius;
  Object.assign(BLOOM_CONFIG, preset.bloom);

  postprocessing.bloomBroadPass.threshold = preset.bloomBroad.threshold;
  postprocessing.bloomBroadPass.strength = preset.bloomBroad.strength;
  postprocessing.bloomBroadPass.radius = preset.bloomBroad.radius;
  Object.assign(BLOOM_BROAD_CONFIG, preset.bloomBroad);

  const gr = postprocessing.godraysUniforms;
  gr.exposure.value = preset.godrays.exposure;
  gr.weight.value = preset.godrays.weight;
  gr.decay.value = preset.godrays.decay;
  gr.density.value = preset.godrays.density;
  gr.sceneMask.value = preset.godrays.sceneMask;
  Object.assign(GODRAYS_CONFIG, preset.godrays);

  const gu = postprocessing.gradePass.uniforms;
  gu.uWarmTint.value.set(...preset.grade.warmTint);
  gu.uCoolTint.value.set(...preset.grade.coolTint);
  gu.uSaturation.value = preset.grade.saturation;
  gu.uContrast.value = preset.grade.contrast;
  gu.uLift.value = preset.grade.lift;
  gu.uVignetteStrength.value = preset.grade.vignetteStrength;
  gu.uVignetteSoftness.value = preset.grade.vignetteSoftness;
  gu.uChromaticAberration.value = preset.grade.chromaticAberration;
  gu.uGrainStrength.value = preset.grade.grainStrength;
  Object.assign(GRADE_CONFIG, preset.grade);
}


function smoothstep01(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpHexColor(hexA, hexB, t, out) {
  const ca = (hexA >> 16) & 255, cb = (hexB >> 16) & 255;
  const ga = (hexA >> 8) & 255, gb = (hexB >> 8) & 255;
  const ba = hexA & 255, bb = hexB & 255;
  out.setRGB(
    lerp(ca, cb, t) / 255,
    lerp(ga, gb, t) / 255,
    lerp(ba, bb, t) / 255,
    'srgb'
  );
  return out;
}

export function startPresetTransition(parentName, fromVariant, toVariant, ctx, configs, durationSec = 3) {
  const from = resolveVariant(parentName, fromVariant);
  const to = resolveVariant(parentName, toVariant);
  if (!from || !to) {
    return { update: () => false };
  }

  const { lighting, sky, postprocessing, renderer } = ctx;
  const {
    SUN_LIGHT_CONFIG, MOON_LIGHT_CONFIG,
    FILL_LIGHT_CONFIG, AMBIENT_LIGHT_CONFIG, SKY_CONFIG,
    SUN_VISUAL_CONFIG, MOON_VISUAL_CONFIG, STAR_CONFIG, CLOUD_CONFIG,
    BLOOM_CONFIG, BLOOM_BROAD_CONFIG, GODRAYS_CONFIG, GRADE_CONFIG,
  } = configs;

  const baseFastForwardMult = CLOUD_CONFIG.fastForwardMult;
  const TRANSITION_CLOUD_FAST_FORWARD = 18;

  const _sunColor = new (lighting.sunLight.color.constructor)();
  const _moonColor = new (lighting.moonLight.color.constructor)();
  let elapsed = 0;

  function update(dt) {
    elapsed += dt;
    const t = durationSec > 0 ? elapsed / durationSec : 1;
    const e = smoothstep01(t);

    // Shortest-path lerp around the 24h clock, so a transition never takes
    // the "long way around" through the rest of the day just because the
    // raw hour values happen to lerp that way.
    function lerpHoursShortest(fromHours, toHours, t) {
      let delta = toHours - fromHours;
      delta = ((delta + 12) % 24 + 24) % 24 - 12;
      return (((fromHours + delta * t) % 24) + 24) % 24;
    }

    // Base intensities that setTimeOfDay's altitude fade multiplies against.
    // Set these before calling setTimeOfDay so the fade this frame uses
    // this frame's lerped value, not last frame's.
    SUN_LIGHT_CONFIG.intensity = lerp(from.sunLight.intensity, to.sunLight.intensity, e);
    MOON_LIGHT_CONFIG.intensity = lerp(from.moonLight.intensity, to.moonLight.intensity, e);

    const celestialHours = lerpHoursShortest(from.celestial.hours, to.celestial.hours, e);
    TIME_OF_DAY_CONFIG.hours = celestialHours;
    const celestialDistance = lerp(from.celestial.distance, to.celestial.distance, e);
    currentCelestialDistance = celestialDistance;
    lighting.setTimeOfDay(celestialHours, {
      ...TIME_OF_DAY_CONFIG,
      sunDistance: celestialDistance,
      moonDistance: celestialDistance,
    });

    lerpHexColor(from.sunLight.color, to.sunLight.color, e, _sunColor);
    lighting.sunLight.color.copy(_sunColor);

    lerpHexColor(from.moonLight.color, to.moonLight.color, e, _moonColor);
    lighting.moonLight.color.copy(_moonColor);

    lerpHexColor(from.ambient.skyColor, to.ambient.skyColor, e, lighting.ambient.color);
    lerpHexColor(from.ambient.groundColor, to.ambient.groundColor, e, lighting.ambient.groundColor);
    lighting.ambient.intensity = lerp(from.ambient.intensity, to.ambient.intensity, e);
    Object.assign(AMBIENT_LIGHT_CONFIG, {
      intensity: lighting.ambient.intensity,
    });

    lerpHexColor(from.fill.color, to.fill.color, e, lighting.fillLight.color);
    lighting.fillLight.intensity = lerp(from.fill.intensity, to.fill.intensity, e);
    lighting.fillLight.position.set(
      lerp(from.fill.posX, to.fill.posX, e),
      lerp(from.fill.posY, to.fill.posY, e),
      lerp(from.fill.posZ, to.fill.posZ, e)
    );
    Object.assign(FILL_LIGHT_CONFIG, {
      intensity: lighting.fillLight.intensity,
      posX: lighting.fillLight.position.x,
      posY: lighting.fillLight.position.y,
      posZ: lighting.fillLight.position.z,
    });

    renderer.toneMappingExposure = lerp(from.exposure, to.exposure, e);

    lerpHexColor(from.sky.skyColor, to.sky.skyColor, e, sky.dome.uniforms.uSkyColor.value);
    lerpHexColor(from.sky.horizonColor, to.sky.horizonColor, e, sky.dome.uniforms.uHorizonColor.value);
    lerpHexColor(from.sky.groundColor, to.sky.groundColor, e, sky.dome.uniforms.uGroundColor.value);
    sky.dome.uniforms.uHorizonHeight.value = lerp(from.sky.horizonHeight, to.sky.horizonHeight, e);
    sky.dome.uniforms.uHorizonSharpness.value = lerp(from.sky.horizonSharpness, to.sky.horizonSharpness, e);
    Object.assign(SKY_CONFIG, {
      horizonHeight: sky.dome.uniforms.uHorizonHeight.value,
      horizonSharpness: sky.dome.uniforms.uHorizonSharpness.value,
    });

    lerpHexColor(from.sunVisual.discColor, to.sunVisual.discColor, e, sky.sun.discMat.color);
    lerpHexColor(from.sunVisual.glowColor, to.sunVisual.glowColor, e, sky.sun.glowMat.color);
    SUN_VISUAL_CONFIG.glowOpacity = lerp(from.sunVisual.glowOpacity, to.sunVisual.glowOpacity, e);

    lerpHexColor(from.moonVisual.discColor, to.moonVisual.discColor, e, sky.moon.discMat.color);
    lerpHexColor(from.moonVisual.glowColor, to.moonVisual.glowColor, e, sky.moon.glowMat.color);
    MOON_VISUAL_CONFIG.glowOpacity = lerp(from.moonVisual.glowOpacity, to.moonVisual.glowOpacity, e);

    sky.stars.uniforms.uFadeBandHeight.value = lerp(from.stars.fadeBandHeight, to.stars.fadeBandHeight, e);
    STAR_CONFIG.baseOpacity = lerp(from.stars.baseOpacity, to.stars.baseOpacity, e);
    STAR_CONFIG.fadeBandHeight = sky.stars.uniforms.uFadeBandHeight.value;

    lerpHexColor(from.clouds.litColor, to.clouds.litColor, e, sky.clouds.litColor);
    lerpHexColor(from.clouds.shadowColor, to.clouds.shadowColor, e, sky.clouds.shadowColor);
    CLOUD_CONFIG.opacity = lerp(from.clouds.opacity, to.clouds.opacity, e);
    const sweepEnvelope = Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
    CLOUD_CONFIG.fastForwardMult = lerp(baseFastForwardMult, TRANSITION_CLOUD_FAST_FORWARD, sweepEnvelope);

    postprocessing.bloomPass.threshold = lerp(from.bloom.threshold, to.bloom.threshold, e);
    postprocessing.bloomPass.strength = lerp(from.bloom.strength, to.bloom.strength, e);
    postprocessing.bloomPass.radius = lerp(from.bloom.radius, to.bloom.radius, e);
    Object.assign(BLOOM_CONFIG, {
      threshold: postprocessing.bloomPass.threshold,
      strength: postprocessing.bloomPass.strength,
      radius: postprocessing.bloomPass.radius,
    });

    postprocessing.bloomBroadPass.threshold = lerp(from.bloomBroad.threshold, to.bloomBroad.threshold, e);
    postprocessing.bloomBroadPass.strength = lerp(from.bloomBroad.strength, to.bloomBroad.strength, e);
    postprocessing.bloomBroadPass.radius = lerp(from.bloomBroad.radius, to.bloomBroad.radius, e);
    Object.assign(BLOOM_BROAD_CONFIG, {
      threshold: postprocessing.bloomBroadPass.threshold,
      strength: postprocessing.bloomBroadPass.strength,
      radius: postprocessing.bloomBroadPass.radius,
    });

    const gr = postprocessing.godraysUniforms;
    gr.exposure.value = lerp(from.godrays.exposure, to.godrays.exposure, e);
    gr.weight.value = lerp(from.godrays.weight, to.godrays.weight, e);
    gr.decay.value = lerp(from.godrays.decay, to.godrays.decay, e);
    gr.density.value = lerp(from.godrays.density, to.godrays.density, e);
    gr.sceneMask.value = lerp(from.godrays.sceneMask, to.godrays.sceneMask, e);
    Object.assign(GODRAYS_CONFIG, {
      exposure: gr.exposure.value,
      weight: gr.weight.value,
      decay: gr.decay.value,
      density: gr.density.value,
      sceneMask: gr.sceneMask.value,
    });

    const gu = postprocessing.gradePass.uniforms;
    gu.uWarmTint.value.set(
      lerp(from.grade.warmTint[0], to.grade.warmTint[0], e),
      lerp(from.grade.warmTint[1], to.grade.warmTint[1], e),
      lerp(from.grade.warmTint[2], to.grade.warmTint[2], e)
    );
    gu.uCoolTint.value.set(
      lerp(from.grade.coolTint[0], to.grade.coolTint[0], e),
      lerp(from.grade.coolTint[1], to.grade.coolTint[1], e),
      lerp(from.grade.coolTint[2], to.grade.coolTint[2], e)
    );
    gu.uSaturation.value = lerp(from.grade.saturation, to.grade.saturation, e);
    gu.uContrast.value = lerp(from.grade.contrast, to.grade.contrast, e);
    gu.uLift.value = lerp(from.grade.lift, to.grade.lift, e);
    gu.uVignetteStrength.value = lerp(from.grade.vignetteStrength, to.grade.vignetteStrength, e);
    gu.uVignetteSoftness.value = lerp(from.grade.vignetteSoftness, to.grade.vignetteSoftness, e);
    gu.uChromaticAberration.value = lerp(from.grade.chromaticAberration, to.grade.chromaticAberration, e);
    gu.uGrainStrength.value = lerp(from.grade.grainStrength, to.grade.grainStrength, e);
    Object.assign(GRADE_CONFIG, {
      saturation: gu.uSaturation.value,
      contrast: gu.uContrast.value,
      lift: gu.uLift.value,
      vignetteStrength: gu.uVignetteStrength.value,
      vignetteSoftness: gu.uVignetteSoftness.value,
      chromaticAberration: gu.uChromaticAberration.value,
      grainStrength: gu.uGrainStrength.value,
    });

    if (t >= 1) {
      applyPreset(parentName, toVariant, ctx, configs);
      CLOUD_CONFIG.fastForwardMult = baseFastForwardMult;
      return false;
    }
    return true;
  }

  return { update };
}

// Builds a full preset document (same shape as presets.json) from the
// current live config values, for the GUI's download button. The
// currently-active time-of-day variant is read straight from live
// config; the other variant is passed in as-is (its last-applied data)
// so downloading mid-session doesn't lose the other variant's tuning.
export function serializePreset(parentName, activeVariantName, inactiveVariantData, configs) {
  const {
    LANTERN_CONFIG, LANTERN_SKY_GLOW_CONFIG, HAIR_PHYSICS_CONFIG, DRAG_CONFIG, CANDLE_FLAME_CONFIG,
    FRAMING_CONFIG, ORBIT_CONFIG, CLIMB_CONFIG, DIRECTOR_CONFIG,
    STAR_CONFIG, CLOUD_CONFIG, GODRAYS_CONFIG,
    SUN_LIGHT_CONFIG, MOON_LIGHT_CONFIG, FILL_LIGHT_CONFIG, AMBIENT_LIGHT_CONFIG,
    SKY_CONFIG, SUN_VISUAL_CONFIG, MOON_VISUAL_CONFIG,
    BLOOM_CONFIG, BLOOM_BROAD_CONFIG, GRADE_CONFIG,
    exposure, celestialHours, celestialDistance,
  } = configs;

  const activeVariant = {
    celestial: { hours: celestialHours, distance: celestialDistance },
    sunLight: { ...SUN_LIGHT_CONFIG },
    moonLight: { ...MOON_LIGHT_CONFIG },
    fill: { ...FILL_LIGHT_CONFIG },
    ambient: { ...AMBIENT_LIGHT_CONFIG },
    exposure,
    sky: { ...SKY_CONFIG },
    sunVisual: { ...SUN_VISUAL_CONFIG },
    moonVisual: { ...MOON_VISUAL_CONFIG },
    stars: { baseOpacity: STAR_CONFIG.baseOpacity, fadeBandHeight: STAR_CONFIG.fadeBandHeight },
    clouds: { litColor: CLOUD_CONFIG.litColor, shadowColor: CLOUD_CONFIG.shadowColor, opacity: CLOUD_CONFIG.opacity },
    bloom: { ...BLOOM_CONFIG },
    bloomBroad: { ...BLOOM_BROAD_CONFIG },
    godrays: {
      exposure: GODRAYS_CONFIG.exposure, weight: GODRAYS_CONFIG.weight,
      decay: GODRAYS_CONFIG.decay, density: GODRAYS_CONFIG.density, sceneMask: GODRAYS_CONFIG.sceneMask,
    },
    grade: { ...GRADE_CONFIG },
  };

  const timeOfDay = {
    [activeVariantName]: activeVariant,
    [activeVariantName === 'day' ? 'night' : 'day']: inactiveVariantData,
  };

  return {
    [parentName]: {
      label: PRESETS[parentName]?.label || parentName,
      lanterns: { ...LANTERN_CONFIG },
      lanternSkyGlow: { ...LANTERN_SKY_GLOW_CONFIG },
      hairPhysics: { ...HAIR_PHYSICS_CONFIG },
      drag: { ...DRAG_CONFIG },
      candleFlame: { ...CANDLE_FLAME_CONFIG },
      framing: { ...FRAMING_CONFIG },
      orbit: { ...ORBIT_CONFIG },
      climb: { ...CLIMB_CONFIG },
      director: { ...DIRECTOR_CONFIG },
      stars: { count: STAR_CONFIG.count, fieldRadius: STAR_CONFIG.fieldRadius, size: STAR_CONFIG.size },
      clouds: {
        count: CLOUD_CONFIG.count, distance: CLOUD_CONFIG.distance,
        minAltitude01: CLOUD_CONFIG.minAltitude01, maxAltitude01: CLOUD_CONFIG.maxAltitude01,
        minScale: CLOUD_CONFIG.minScale, maxScale: CLOUD_CONFIG.maxScale,
        sunGlowColor: CLOUD_CONFIG.sunGlowColor, sunGlowSharpness: CLOUD_CONFIG.sunGlowSharpness,
        sunGlowStrength: CLOUD_CONFIG.sunGlowStrength, driftSpeed: CLOUD_CONFIG.driftSpeed,
      },
      godrays: { enabled: GODRAYS_CONFIG.enabled, samples: GODRAYS_CONFIG.samples, resScale: GODRAYS_CONFIG.resScale },
      shadow: PRESETS[parentName]?.shadow || { sunMapSize: 2048, moonMapSize: 2048 },
      timeOfDay,
    },
  };
}

export function downloadPreset(parentName, activeVariantName, inactiveVariantData, configs, filename = 'presets.json') {
  const doc = serializePreset(parentName, activeVariantName, inactiveVariantData, configs);
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
