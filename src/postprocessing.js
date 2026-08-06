import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';


export const BLOOM_CONFIG = {
  threshold: 0.85,
  strength: 0.55,
  radius: 0.35,
};

export const BLOOM_BROAD_CONFIG = {
  threshold: 0.7,
  strength: 0.35,
  radius: 0.85,
};

export const GODRAYS_CONFIG = {
  enabled: true,
  exposure: 0.35,
  decay: 0.97,
  density: 0.85,
  weight: 0.55,
  samples: 18,
  resScale: 0.25,
  sceneMask: 1.0,
};

export const GRADE_CONFIG = {
  warmTint: [1.06, 0.99, 0.88],
  coolTint: [0.86, 0.9, 1.08],
  splitBalance: 0.5,
  saturation: 1.18,
  contrast: 1.06,
  lift: 0.015,
  vignetteStrength: 0.38,
  vignetteSoftness: 0.65,
  chromaticAberration: 0.0004,
  grainStrength: 0.01,
};

export function buildPostprocessing(renderer, scene, camera, { lowQuality = false } = {}) {
  const maxSamples = renderer.capabilities.isWebGL2
    ? renderer.getContext().getParameter(renderer.getContext().MAX_SAMPLES)
    : 0;
  const msaaSamples = Math.min(2, maxSamples);

  const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      samples: msaaSamples,
      colorSpace: THREE.SRGBColorSpace,
    }
  );

  const composer = new EffectComposer(renderer, renderTarget);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const clampPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader:  `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader:  `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        bvec4 isBad = bvec4(
          !(texel.r <= 1e6) && !(texel.r >= -1e6),
          !(texel.g <= 1e6) && !(texel.g >= -1e6),
          !(texel.b <= 1e6) && !(texel.b >= -1e6),
          false
        );
        vec4 cleaned = vec4(
          isBad.r ? 0.0 : texel.r,
          isBad.g ? 0.0 : texel.g,
          isBad.b ? 0.0 : texel.b,
          texel.a
        );
        gl_FragColor = clamp(cleaned, 0.0, 64.0);
      }
    `,
  });
  composer.addPass(clampPass);

  const godraysResScale = GODRAYS_CONFIG.resScale;
  const godraysTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(window.innerWidth * godraysResScale)),
    Math.max(1, Math.round(window.innerHeight * godraysResScale)),
    { depthBuffer: false, stencilBuffer: false }
  );

  const godraysRaymarchMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uSunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
      uSunInView: { value: 0.0 },
      uDecay: { value: GODRAYS_CONFIG.decay },
      uDensity: { value: GODRAYS_CONFIG.density },
      uSceneMask: { value: GODRAYS_CONFIG.sceneMask },
    },
    defines: {
      NUM_SAMPLES: GODRAYS_CONFIG.samples,
    },
    vertexShader:  `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader:  `
      uniform sampler2D tDiffuse;
      uniform vec2 uSunScreenPos;
      uniform float uSunInView;
      uniform float uDecay;
      uniform float uDensity;
      uniform float uSceneMask;
      varying vec2 vUv;

      void main() {
        vec2 deltaUv = (vUv - uSunScreenPos) * uDensity / float(NUM_SAMPLES);
        vec2 sampleUv = vUv;
        float illumDecay = 1.0;
        float decaySum = 0.0;
        vec3 accum = vec3(0.0);

        for (int i = 0; i < NUM_SAMPLES; i++) {
          sampleUv -= deltaUv;
          vec3 samp = texture2D(tDiffuse, sampleUv).rgb;
          float lum = dot(samp, vec3(0.299, 0.587, 0.114));
          float mask = mix(1.0, smoothstep(0.75, 1.3, lum), uSceneMask);
          accum += samp * mask * illumDecay;
          decaySum += illumDecay;
          illumDecay *= uDecay;
        }

        // Normalize by the accumulated decay weight so total added energy is
        // bounded (independent of sample count / decay rate).
        accum /= max(decaySum, 0.0001);

        gl_FragColor = vec4(accum * uSunInView, 1.0);
      }
    `,
  });

  const _godraysScene = new THREE.Scene();
  const _godraysQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), godraysRaymarchMaterial);
  _godraysScene.add(_godraysQuad);
  const _godraysCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const godraysCompositePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tGodrays: { value: godraysTarget.texture },
      uExposure: { value: GODRAYS_CONFIG.exposure },
      uWeight: { value: GODRAYS_CONFIG.weight },
    },
    vertexShader:  `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader:  `
      uniform sampler2D tDiffuse;
      uniform sampler2D tGodrays;
      uniform float uExposure;
      uniform float uWeight;
      varying vec2 vUv;
      void main() {
        vec4 baseColor = texture2D(tDiffuse, vUv);
        vec3 rays = texture2D(tGodrays, vUv).rgb * uWeight * uExposure;
        gl_FragColor = vec4(baseColor.rgb + rays, baseColor.a);
      }
    `,
  });
  //composer.addPass(godraysCompositePass);

  const bloomResScale =  1;

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * bloomResScale, window.innerHeight * bloomResScale),
    BLOOM_CONFIG.strength,
    BLOOM_CONFIG.radius,
    BLOOM_CONFIG.threshold
  );
  composer.addPass(bloomPass);

  const broadResScale = bloomResScale *  0.25;
  const bloomBroadPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * broadResScale, window.innerHeight * broadResScale),
    BLOOM_BROAD_CONFIG.strength,
    BLOOM_BROAD_CONFIG.radius,
    BLOOM_BROAD_CONFIG.threshold
  );
  composer.addPass(bloomBroadPass);

  const gradePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uWarmTint: { value: new THREE.Vector3(...GRADE_CONFIG.warmTint) },
      uCoolTint: { value: new THREE.Vector3(...GRADE_CONFIG.coolTint) },
      uSplitBalance: { value: GRADE_CONFIG.splitBalance },
      uSaturation: { value: GRADE_CONFIG.saturation },
      uContrast: { value: GRADE_CONFIG.contrast },
      uLift: { value: GRADE_CONFIG.lift },
      uVignetteStrength: { value: GRADE_CONFIG.vignetteStrength },
      uVignetteSoftness: { value: GRADE_CONFIG.vignetteSoftness },
      uChromaticAberration: { value: GRADE_CONFIG.chromaticAberration },
      uGrainStrength: { value: GRADE_CONFIG.grainStrength },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader:  `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader:  `
      uniform sampler2D tDiffuse;
      uniform vec3 uWarmTint;
      uniform vec3 uCoolTint;
      uniform float uSplitBalance;
      uniform float uSaturation;
      uniform float uContrast;
      uniform float uLift;
      uniform float uVignetteStrength;
      uniform float uVignetteSoftness;
      uniform float uChromaticAberration;
      uniform float uGrainStrength;
      uniform float uTime;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        vec2 centered = vUv - 0.5;
        float dist = length(centered * vec2(uResolution.x / uResolution.y, 1.0));

        // Chromatic aberration: sample R/B slightly offset outward from center.
        vec2 caDir = centered * uChromaticAberration;
        float r = texture2D(tDiffuse, vUv - caDir).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv + caDir).b;
        vec3 color = vec3(r, g, b);

        // Lift shadows slightly (keeps blacks from crushing under heavy bloom).
        color = color + uLift * (1.0 - color);

        // Contrast around mid-grey.
        color = (color - 0.5) * uContrast + 0.5;

        // Split toning: warm highlights, cool shadows, driven by luminance.
        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        float toneMix = smoothstep(0.15, 0.85, lum);
        vec3 tint = mix(uCoolTint, uWarmTint, toneMix);
        color *= mix(vec3(1.0), tint, 0.6);

        // Saturation.
        float g2 = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(g2), color, uSaturation);

        // Vignette.
        float vig = smoothstep(uVignetteSoftness, uVignetteSoftness - 0.55, dist);
        color *= mix(1.0 - uVignetteStrength, 1.0, vig);

        // Film grain, animated.
        float grain = hash(vUv * uResolution.xy + uTime) - 0.5;
        color += grain * uGrainStrength;

        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `,
  });
  composer.addPass(gradePass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  function setSize(width, height) {
    composer.setSize(width, height);
    bloomPass.setSize(width * bloomResScale, height * bloomResScale);
    bloomBroadPass.setSize(width * broadResScale, height * broadResScale);
    godraysTarget.setSize(
      Math.max(1, Math.round(width * godraysResScale)),
      Math.max(1, Math.round(height * godraysResScale))
    );
    gradePass.uniforms.uResolution.value.set(width, height);
  }

  const _sunNdc = new THREE.Vector3();
  let _sunInView = 0;
  let _sunScreenX = 0.5;
  let _sunScreenY = 0.5;

  function updateSun(camera, sunWorldPosition) {
    if (!GODRAYS_CONFIG.enabled) {
      _sunInView = 0;
      return;
    }
    _sunNdc.copy(sunWorldPosition).project(camera);

    const behindCamera = _sunNdc.z > 1;
    _sunScreenX = (_sunNdc.x + 1) / 2;
    _sunScreenY = (_sunNdc.y + 1) / 2;

    const edge = Math.max(Math.abs(_sunNdc.x), Math.abs(_sunNdc.y));
    const edgeFade = 1.0 - THREE.MathUtils.smoothstep(edge, 0.85, 1.3);
    _sunInView = behindCamera ? 0 : edgeFade;
  }

  function renderGodrays() {
    const source = composer.readBuffer?.texture;
    if (!source) return;
    godraysRaymarchMaterial.uniforms.tDiffuse.value = source;
    godraysRaymarchMaterial.uniforms.uSunScreenPos.value.set(_sunScreenX, _sunScreenY);
    godraysRaymarchMaterial.uniforms.uSunInView.value = _sunInView;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(godraysTarget);
    renderer.render(_godraysScene, _godraysCamera);
    renderer.setRenderTarget(prevTarget);
  }

  function render(dt) {
    gradePass.uniforms.uTime.value += dt || 0.016;
    if (GODRAYS_CONFIG.enabled && _sunInView > 0.001) {
      renderGodrays();
    }
    composer.render();
  }

  return {
    composer,
    bloomPass,
    bloomBroadPass,
    godraysCompositePass,
    godraysUniforms: {
      exposure: godraysCompositePass.uniforms.uExposure,
      weight: godraysCompositePass.uniforms.uWeight,
      decay: godraysRaymarchMaterial.uniforms.uDecay,
      density: godraysRaymarchMaterial.uniforms.uDensity,
      sceneMask: godraysRaymarchMaterial.uniforms.uSceneMask,
    },
    gradePass,
    setSize,
    updateSun,
    render,
  };
}