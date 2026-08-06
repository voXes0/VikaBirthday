import GUI from 'lil-gui';

export function buildDebugGui({
  skyUniforms, SKY_CONFIG,
  sunLight, SUN_LIGHT_CONFIG,
  moonLight, MOON_LIGHT_CONFIG,
  fillLight, FILL_LIGHT_CONFIG,
  ambient, AMBIENT_LIGHT_CONFIG,
  renderer,
  sunVisual, SUN_VISUAL_CONFIG,
  moonVisual, MOON_VISUAL_CONFIG,
  starsUniforms, STAR_CONFIG,
  FRAMING_CONFIG, ORBIT_CONFIG, CLIMB_CONFIG, DIRECTOR_CONFIG,
  bloomPass, BLOOM_CONFIG,
  bloomBroadPass, BLOOM_BROAD_CONFIG,
  godraysUniforms, GODRAYS_CONFIG,
  gradePass, GRADE_CONFIG,
  recomputeSunAltitude01,
  CELESTIAL_PLACEMENT_CONFIG, setCelestialAngles,
  TIME_OF_DAY_CONFIG, setTimeOfDay,
  CANDLE_FLAME_CONFIG, relightCandlesFn, syncCandleFlameUniformsFn,
  LANTERN_CONFIG, LANTERN_SKY_GLOW_CONFIG, launchLanternsFn, syncLanternUniformsFn,
  setScenePreset, transitionToPreset, currentPresetName,
  downloadPresetFn,
  unlockHorizonFn,
}) {
  const gui = new GUI({ title: 'Scene (tuning only -- remove before ship)' });

  if (setScenePreset) {
    const presetFolder = gui.addFolder('Scene preset');
    const presetHolder = { preset: currentPresetName ? currentPresetName() : 'day' };
    const refreshAll = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());
    presetFolder.add(presetHolder, 'preset', ['day', 'night'])
      .name('day / night')
      .onChange((v) => {
        if (transitionToPreset) {
          transitionToPreset(v);
        } else {
          setScenePreset(v);
        }
        refreshAll();
      });
    presetFolder.open();
  }

  let celestialPosControllers = [];
  if (setTimeOfDay && TIME_OF_DAY_CONFIG) {
    const celestialPosFolder = gui.addFolder('Time of day (sun & moon share this)');
    const applyHours = () => setTimeOfDay(TIME_OF_DAY_CONFIG.hours);
    celestialPosControllers = [
      celestialPosFolder.add(TIME_OF_DAY_CONFIG, 'hours', 0, 24, 0.05)
        .name('hours (12 = noon, 0/24 = midnight)')
        .onChange(applyHours),
      celestialPosFolder.add(TIME_OF_DAY_CONFIG, 'sceneAzimuthDeg', 0, 360, 1)
        .name('scene azimuth (compass °)')
        .onChange(applyHours),
      celestialPosFolder.add(TIME_OF_DAY_CONFIG, 'sunPeakAltitudeDeg', 0, 90, 0.5)
        .name('sun peak altitude °')
        .onChange(applyHours),
      celestialPosFolder.add(TIME_OF_DAY_CONFIG, 'moonPeakAltitudeDeg', 0, 90, 0.5)
        .name('moon peak altitude °')
        .onChange(applyHours),
    ];
    celestialPosFolder.open();
  }

  const syncCelestialPosDisplay = () => celestialPosControllers.forEach((c) => c.updateDisplay());

  const celestialRawFolder = gui.addFolder('Celestial position (raw XYZ, advanced)');
  const rawXYZHolder = { posX: sunLight.position.x, posY: sunLight.position.y, posZ: sunLight.position.z };
  const applyRawXYZ = () => {
    sunLight.position.set(rawXYZHolder.posX, rawXYZHolder.posY, rawXYZHolder.posZ);
    recomputeSunAltitude01?.();
    syncCelestialPosDisplay();
  };
  celestialRawFolder.add(rawXYZHolder, 'posX', -50, 50, 0.1).onChange(applyRawXYZ);
  celestialRawFolder.add(rawXYZHolder, 'posY', -50, 50, 0.1).onChange(applyRawXYZ);
  celestialRawFolder.add(rawXYZHolder, 'posZ', -50, 50, 0.1).onChange(applyRawXYZ);
  celestialRawFolder.close();

  // Note: intensity/castShadow here set the *base* values that setTimeOfDay
  // cross-fades from each frame -- they no longer poke sunLight/moonLight
  // directly, since under the continuous cycle "currently nonzero" isn't a
  // meaningful on/off gate any more (intensity is a fractional fade near
  // sunrise/sunset, not a switch).
  const sunFolder = gui.addFolder('Sun (key light)');
  sunFolder.addColor(SUN_LIGHT_CONFIG, 'color').onChange((v) => sunLight.color.set(v));
  sunFolder.add(SUN_LIGHT_CONFIG, 'intensity', 0, 20, 0.1);
  sunFolder.add(SUN_LIGHT_CONFIG, 'castShadow');
  sunFolder.open();

  const moonFolder = gui.addFolder('Moon (key light)');
  if (moonLight && MOON_LIGHT_CONFIG) {
    moonFolder.addColor(MOON_LIGHT_CONFIG, 'color').onChange((v) => moonLight.color.set(v));
    moonFolder.add(MOON_LIGHT_CONFIG, 'intensity', 0, 20, 0.1);
    moonFolder.add(MOON_LIGHT_CONFIG, 'castShadow');
    moonFolder.open();
  }

  const fillFolder = gui.addFolder('Fill light (shadow softening)');
  fillFolder.addColor(FILL_LIGHT_CONFIG, 'color').onChange((v) => fillLight.color.set(v));
  fillFolder.add(FILL_LIGHT_CONFIG, 'intensity', 0, 3, 0.01).onChange((v) => { fillLight.intensity = v; });
  fillFolder.add(FILL_LIGHT_CONFIG, 'posX', -50, 50, 0.1).onChange((v) => { fillLight.position.x = v; });
  fillFolder.add(FILL_LIGHT_CONFIG, 'posY', -50, 50, 0.1).onChange((v) => { fillLight.position.y = v; });
  fillFolder.add(FILL_LIGHT_CONFIG, 'posZ', -50, 50, 0.1).onChange((v) => { fillLight.position.z = v; });

  const ambientFolder = gui.addFolder('Ambient (hemisphere)');
  ambientFolder.addColor(AMBIENT_LIGHT_CONFIG, 'skyColor').onChange((v) => ambient.color.set(v));
  ambientFolder.addColor(AMBIENT_LIGHT_CONFIG, 'groundColor').onChange((v) => ambient.groundColor.set(v));
  ambientFolder.add(AMBIENT_LIGHT_CONFIG, 'intensity', 0, 5, 0.01).onChange((v) => { ambient.intensity = v; });
  ambientFolder.open();

  const exposureHolder = { exposure: renderer.toneMappingExposure };
  gui.add(exposureHolder, 'exposure', 0, 3, 0.01)
    .name('tone mapping exposure')
    .onChange((v) => { renderer.toneMappingExposure = v; });

  const skyFolder = gui.addFolder('Sky (gradient)');
  skyFolder.addColor(SKY_CONFIG, 'skyColor').name('zenith').onChange((v) => skyUniforms.uSkyColor.value.set(v));
  skyFolder.addColor(SKY_CONFIG, 'horizonColor').name('horizon').onChange((v) => skyUniforms.uHorizonColor.value.set(v));
  skyFolder.addColor(SKY_CONFIG, 'groundColor').name('ground haze').onChange((v) => skyUniforms.uGroundColor.value.set(v));
  skyFolder.add(SKY_CONFIG, 'horizonHeight', -0.5, 0.5, 0.001).onChange((v) => { skyUniforms.uHorizonHeight.value = v; });
  skyFolder.add(SKY_CONFIG, 'horizonSharpness', 0.02, 1.5, 0.01).onChange((v) => { skyUniforms.uHorizonSharpness.value = v; });
  skyFolder.open();

  const sunVisualFolder = gui.addFolder('Sun (visual disc/glow)');
  sunVisualFolder.addColor(SUN_VISUAL_CONFIG, 'discColor').onChange((v) => sunVisual.discMat.color.set(v));
  sunVisualFolder.addColor(SUN_VISUAL_CONFIG, 'glowColor').onChange((v) => sunVisual.glowMat.color.set(v));
  sunVisualFolder.add(SUN_VISUAL_CONFIG, 'visualSize', 5, 150, 1).onChange((v) => {
    sunVisual.disc.geometry.dispose();
    sunVisual.disc.geometry = new (sunVisual.disc.geometry.constructor)(v, 32);
  });
  sunVisualFolder.add(SUN_VISUAL_CONFIG, 'glowSize', 20, 600, 1).onChange((v) => { sunVisual.glow.scale.setScalar(v); });
  sunVisualFolder.add(SUN_VISUAL_CONFIG, 'glowOpacity', 0, 1, 0.01).onChange((v) => { sunVisual.glowMat.opacity = v; });

  const moonVisualFolder = gui.addFolder('Moon (visual disc + halo glow)');
  if (moonVisual && MOON_VISUAL_CONFIG) {
    moonVisualFolder.addColor(MOON_VISUAL_CONFIG, 'discColor').onChange((v) => moonVisual.discMat.color.set(v));
    moonVisualFolder.addColor(MOON_VISUAL_CONFIG, 'glowColor').name('halo color').onChange((v) => moonVisual.glowMat.color.set(v));
    moonVisualFolder.add(MOON_VISUAL_CONFIG, 'visualSize', 5, 150, 1).onChange((v) => {
      moonVisual.disc.geometry.dispose();
      moonVisual.disc.geometry = new (moonVisual.disc.geometry.constructor)(v, 32);
    });
    moonVisualFolder.add(MOON_VISUAL_CONFIG, 'glowSize', 20, 600, 1).name('halo size').onChange((v) => { moonVisual.glow.scale.setScalar(v); });
    moonVisualFolder.add(MOON_VISUAL_CONFIG, 'glowOpacity', 0, 1, 0.01).name('halo opacity').onChange((v) => { moonVisual.glowMat.opacity = v; });
    moonVisualFolder.open();
  }

  const bloomFolder = gui.addFolder('Bloom (sun glow)');
  bloomFolder.add(BLOOM_CONFIG, 'threshold', 0, 1.5, 0.01).name('tight: threshold').onChange((v) => { bloomPass.threshold = v; });
  bloomFolder.add(BLOOM_CONFIG, 'strength', 0, 3, 0.01).name('tight: strength').onChange((v) => { bloomPass.strength = v; });
  bloomFolder.add(BLOOM_CONFIG, 'radius', 0, 1, 0.01).name('tight: radius').onChange((v) => { bloomPass.radius = v; });
  if (bloomBroadPass && BLOOM_BROAD_CONFIG) {
    bloomFolder.add(BLOOM_BROAD_CONFIG, 'threshold', 0, 1.5, 0.01).name('broad: threshold').onChange((v) => { bloomBroadPass.threshold = v; });
    bloomFolder.add(BLOOM_BROAD_CONFIG, 'strength', 0, 3, 0.01).name('broad: strength').onChange((v) => { bloomBroadPass.strength = v; });
    bloomFolder.add(BLOOM_BROAD_CONFIG, 'radius', 0, 1, 0.01).name('broad: radius').onChange((v) => { bloomBroadPass.radius = v; });
  }
  bloomFolder.open();

  if (godraysUniforms && GODRAYS_CONFIG) {
    const godraysFolder = gui.addFolder('God rays');
    godraysFolder.add(GODRAYS_CONFIG, 'enabled');
    godraysFolder.add(GODRAYS_CONFIG, 'exposure', 0, 1.5, 0.01).onChange((v) => { godraysUniforms.exposure.value = v; });
    godraysFolder.add(GODRAYS_CONFIG, 'weight', 0, 1.5, 0.01).onChange((v) => { godraysUniforms.weight.value = v; });
    godraysFolder.add(GODRAYS_CONFIG, 'decay', 0.8, 0.995, 0.001).onChange((v) => { godraysUniforms.decay.value = v; });
    godraysFolder.add(GODRAYS_CONFIG, 'density', 0.2, 1.5, 0.01).onChange((v) => { godraysUniforms.density.value = v; });
    godraysFolder.add(GODRAYS_CONFIG, 'sceneMask', 0, 1, 0.01).name('scene luminance mask').onChange((v) => { godraysUniforms.sceneMask.value = v; });
    godraysFolder.open();
  }

  if (gradePass && GRADE_CONFIG) {
    const gradeFolder = gui.addFolder('Color grade / vignette / grain');
    gradeFolder.add(GRADE_CONFIG, 'saturation', 0, 2.5, 0.01).onChange((v) => { gradePass.uniforms.uSaturation.value = v; });
    gradeFolder.add(GRADE_CONFIG, 'contrast', 0.5, 1.8, 0.01).onChange((v) => { gradePass.uniforms.uContrast.value = v; });
    gradeFolder.add(GRADE_CONFIG, 'lift', -0.2, 0.2, 0.005).onChange((v) => { gradePass.uniforms.uLift.value = v; });
    gradeFolder.add(GRADE_CONFIG, 'vignetteStrength', 0, 1, 0.01).onChange((v) => { gradePass.uniforms.uVignetteStrength.value = v; });
    gradeFolder.add(GRADE_CONFIG, 'vignetteSoftness', 0.1, 1.5, 0.01).onChange((v) => { gradePass.uniforms.uVignetteSoftness.value = v; });
    gradeFolder.add(GRADE_CONFIG, 'chromaticAberration', 0, 0.01, 0.0002).onChange((v) => { gradePass.uniforms.uChromaticAberration.value = v; });
    gradeFolder.add(GRADE_CONFIG, 'grainStrength', 0, 0.15, 0.001).onChange((v) => { gradePass.uniforms.uGrainStrength.value = v; });
    gradeFolder.open();
  }

  const starsFolder = gui.addFolder('Stars');
  starsFolder.add(STAR_CONFIG, 'baseOpacity', 0, 1, 0.01).name('base opacity');
  starsFolder.add(starsUniforms.uFadeBandHeight, 'value', 0.02, 1, 0.01).name('fade band height');

  const framingFolder = gui.addFolder('Camera framing');
  framingFolder.add(FRAMING_CONFIG, 'distanceMult', 0.3, 3, 0.01).name('distance');
  framingFolder.add(FRAMING_CONFIG, 'sidestepMult', -2, 2, 0.01).name('rig sidestep (world, usually 0)');
  framingFolder.add(FRAMING_CONFIG, 'shoulderOffset', -1, 1, 0.01).name('shoulder offset (+ = tower left)');
  const orbitHolder = { orbitDegrees: THREE_RAD2DEG(ORBIT_CONFIG.orbitAngle) };
  framingFolder.add(orbitHolder, 'orbitDegrees', -180, 180, 1)
    .name('orbit around tower')
    .onChange((v) => { ORBIT_CONFIG.orbitAngle = v * (Math.PI / 180); });
  if (CLIMB_CONFIG) {
    framingFolder.add(CLIMB_CONFIG, 'climbTopT', 0.5, 1, 0.01).name('climb top (1 = roofline)');
  }
  framingFolder.open();

  if (DIRECTOR_CONFIG) {
    const cakeFolder = gui.addFolder('Cake cinematic (swing-to-cake)');
    cakeFolder.add(DIRECTOR_CONFIG, 'climbEndScroll', 0.1, 0.95, 0.01).name('climb ends / swing starts (scroll)');
    cakeFolder.add(DIRECTOR_CONFIG, 'swingEndScroll', 0.1, 0.98, 0.01).name('swing ends / eyes starts (scroll)');
    cakeFolder.add(DIRECTOR_CONFIG, 'commitRate', 0.05, 3, 0.05).name('scroll commit rate (per sec)');
    cakeFolder.add(DIRECTOR_CONFIG, 'transitionDuration', 0.3, 8, 0.1).name('swing duration (sec)');
    cakeFolder.add(DIRECTOR_CONFIG, 'arcClearance', 0, 10, 0.1).name('arc clearance from tower');
    const sweepHolder = { minSweepDegrees: THREE_RAD2DEG(DIRECTOR_CONFIG.minOrbitSweep) };
    cakeFolder.add(sweepHolder, 'minSweepDegrees', 0, 180, 1)
      .name('min orbit sweep (deg)')
      .onChange((v) => { DIRECTOR_CONFIG.minOrbitSweep = v * (Math.PI / 180); });
    cakeFolder.add(DIRECTOR_CONFIG, 'cakeDistanceMult', 0.5, 6, 0.05).name('cake shot distance');
    cakeFolder.add(DIRECTOR_CONFIG, 'cakeEyeHeightT', -0.5, 2, 0.01).name('cake eye height');
    cakeFolder.add(DIRECTOR_CONFIG, 'cakeLookHeightT', -0.5, 2, 0.01).name('cake look height');
    cakeFolder.open();

    const eyesFolder = gui.addFolder('First-person (ungated -- swing/eyes cinematic)');
    eyesFolder.add(DIRECTOR_CONFIG, 'eyesEndScroll', 0.1, 1, 0.01).name('eyes ends / horizon starts (scroll)');
    eyesFolder.add(DIRECTOR_CONFIG, 'eyesTransitionDuration', 0.3, 8, 0.1).name('cake-gaze -> eyes duration (sec)');
    eyesFolder.add(DIRECTOR_CONFIG, 'eyesLookHeightT', -0.5, 2, 0.01).name('gaze target height (on cake)');
    eyesFolder.add(DIRECTOR_CONFIG, 'faceHideEyesT', 0, 1, 0.01).name('face hides at (fwd swing %)');
    eyesFolder.add(DIRECTOR_CONFIG, 'faceShowEyesT', 0, 1, 0.01).name('face shows at (reverse swing %)');
    eyesFolder.open();

    const horizonFolder = gui.addFolder('First-person: horizon gaze (candles-snuffed)');
    horizonFolder.add(DIRECTOR_CONFIG, 'horizonEndScroll', 0.1, 1, 0.01).name('horizon ends at (scroll)');
    horizonFolder.add(DIRECTOR_CONFIG, 'horizonTransitionDuration', 0.1, 5, 0.05).name('cake-gaze -> horizon swing duration (sec)');
    horizonFolder.add(DIRECTOR_CONFIG, 'horizonLookDistance', 10, 500, 5).name('look distance');
    horizonFolder.add(DIRECTOR_CONFIG, 'horizonLookRaise', 0, 30, 0.5).name('look raise above eye height');
    horizonFolder.add(DIRECTOR_CONFIG, 'horizonLookSideOffset', -180, 180, 1).name('look offset (+ = right, - = left)');
    if (unlockHorizonFn) {
      horizonFolder.add({ unlock: unlockHorizonFn }, 'unlock').name('force-unlock + engage (debug)');
    }
    horizonFolder.open();
  }

  if (CANDLE_FLAME_CONFIG) {
    const candleFolder = gui.addFolder('Candles');
    const sync = () => syncCandleFlameUniformsFn?.();
    candleFolder.addColor(CANDLE_FLAME_CONFIG, 'coreColor').name('core color (hot)').onChange(sync);
    candleFolder.addColor(CANDLE_FLAME_CONFIG, 'midColor').name('mid color').onChange(sync);
    candleFolder.addColor(CANDLE_FLAME_CONFIG, 'outerColor').name('outer color').onChange(sync);
    candleFolder.add(CANDLE_FLAME_CONFIG, 'coreTightness', 0, 1, 0.01).name('core tightness').onChange(sync);
    candleFolder.addColor(CANDLE_FLAME_CONFIG, 'lightColor').name('light color').onChange(sync);
    candleFolder.add(CANDLE_FLAME_CONFIG, 'lightIntensity', 0, 5, 0.05).name('light intensity');
    candleFolder.add(CANDLE_FLAME_CONFIG, 'lightDistance', 0.05, 3, 0.05).name('light distance').onChange(sync);
    candleFolder.add(CANDLE_FLAME_CONFIG, 'flickerSpeed', 0, 40, 0.5).name('flicker speed');
    candleFolder.add(CANDLE_FLAME_CONFIG, 'flickerAmount', 0, 1, 0.01).name('flicker amount');
    candleFolder.add(CANDLE_FLAME_CONFIG, 'swaySpeed', 0, 10, 0.1).name('sway speed').onChange(sync);
    candleFolder.add(CANDLE_FLAME_CONFIG, 'swayAmount', 0, 0.3, 0.005).name('sway amount').onChange(sync);
    candleFolder.add(CANDLE_FLAME_CONFIG, 'pickRadius', 0.02, 0.5, 0.01).name('click pick radius');
    if (relightCandlesFn) {
      candleFolder.add({ relight: relightCandlesFn }, 'relight').name('relight all (debug)');
    }
    candleFolder.open();
  }

  if (LANTERN_CONFIG) {
    const lanternFolder = gui.addFolder('Lanterns (sky release)');
    lanternFolder.add(LANTERN_CONFIG, 'wedgeHalfAngleDeg', 5, 180, 1).name('wedge half-angle (deg)');
    lanternFolder.add(LANTERN_CONFIG, 'verticalSpread', 0, 5, 0.05).name('vertical spread');
    lanternFolder.add(LANTERN_CONFIG, 'spawnHeightOffset', -2, 5, 0.05).name('spawn height offset');
    lanternFolder.add(LANTERN_CONFIG, 'spawnHeightJitter', 0, 2, 0.01).name('spawn height jitter');
    lanternFolder.add(LANTERN_CONFIG, 'riseSpeed', 0, 2, 0.01).name('rise speed');
    lanternFolder.add(LANTERN_CONFIG, 'riseEaseDistance', 0, 3, 0.01).name('rise ease distance');
    lanternFolder.add(LANTERN_CONFIG, 'driftRadius', 0, 2, 0.01).name('drift radius');
    lanternFolder.add(LANTERN_CONFIG, 'driftSpeed', 0, 2, 0.01).name('drift speed');
    lanternFolder.add(LANTERN_CONFIG, 'swayAmount', 0, 0.5, 0.005).name('sway amount');
    lanternFolder.add(LANTERN_CONFIG, 'swaySpeed', 0, 3, 0.01).name('sway speed');
    lanternFolder.add(LANTERN_CONFIG, 'bobAmount', 0, 0.3, 0.005).name('bob amount');
    lanternFolder.add(LANTERN_CONFIG, 'bobSpeed', 0, 2, 0.01).name('bob speed');
    const syncEmissive = () => syncLanternUniformsFn?.();
    lanternFolder.add(LANTERN_CONFIG, 'emissiveIntensity', 0, 6, 0.05).name('glow intensity').onChange(syncEmissive);
    lanternFolder.add(LANTERN_CONFIG, 'flickerSpeed', 0, 10, 0.1).name('flicker speed').onChange(syncEmissive);
    lanternFolder.add(LANTERN_CONFIG, 'flickerAmount', 0, 0.5, 0.01).name('flicker amount').onChange(syncEmissive);
    if (launchLanternsFn) {
      lanternFolder.add({ launch: launchLanternsFn }, 'launch').name('launch lanterns');
    }
    lanternFolder.open();

    if (LANTERN_SKY_GLOW_CONFIG) {
      const glowFolder = lanternFolder.addFolder('Sky glow');
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'enabled').name('enabled');
      glowFolder.addColor(
        { color: '#' + LANTERN_SKY_GLOW_CONFIG.color.toString(16).padStart(6, '0') },
        'color'
      ).name('color').onChange((hex) => {
        LANTERN_SKY_GLOW_CONFIG.color = parseInt(hex.replace('#', ''), 16);
      });
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'maxIntensity', 0, 2, 0.01).name('max intensity');
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'fadeInDuration', 0.1, 10, 0.1).name('fade duration (s)');
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'baseAngularRadiusDeg', 0, 60, 1).name('base radius (deg)');
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'radiusPerSpreadUnit', 0, 5, 0.05).name('radius per spread unit');
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'falloffPower', 0.5, 6, 0.1).name('falloff power');
      glowFolder.add(LANTERN_SKY_GLOW_CONFIG, 'densityFalloff', 0, 2, 0.01).name('density falloff');
    }
  }

  if (downloadPresetFn) {
    gui.add({ download: downloadPresetFn }, 'download').name('Download preset (JSON)');
  }

  return gui;
}

function THREE_RAD2DEG(radians) {
  return radians * (180 / Math.PI);
}