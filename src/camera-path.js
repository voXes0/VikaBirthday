import * as THREE from 'three';

export const FRAMING_CONFIG = {
  distanceMult: 0.3,

  sidestepMult: 2.0,

  shoulderOffset: -0.13,

  eyeStartT: 0.15,
  eyeRangeT: 0.75,
  lookStartT: 0.35,
  lookRangeT: 0.75,
};

export const ORBIT_CONFIG = {
  orbitAngle:  1.6581,
};

export const SPRING_CONFIG = {
  stiffness: 220,
};

export const CLIMB_CONFIG = {
  climbTopT: 0.55,
};

export const DIRECTOR_CONFIG = {
  climbEndScroll: 0.62,

  swingEndScroll: 0.78,

  // How fast the internal "committed" scroll cursor is allowed to move
  // toward the user's live scroll position, per second of scroll-progress
  // span (same units as climbEndScroll etc). This is what makes a fast
  // fling still play out as a real transition instead of jumping straight
  // to the end -- see createCameraDirector for how it's used.
  commitRate: 0.9,

  // Duration (seconds) of the tower<->cake swing tween. This is the whole
  // "how fast + when is it done" story now -- transitions are
  // fixed-duration tweens (easeInOutCubic), not springs, so there's no
  // separate rest-epsilon to tune: the gate that lets scroll advance to
  // the next segment opens exactly when the tween's own duration elapses.
  transitionDuration: 3.2,

  arcClearance: 1.5,

  cakeDistanceMult: 2.2,
  cakeEyeHeightT: 0.85,
  cakeLookHeightT: 0.45,

  eyesEndScroll: 0.92,

  eyesLookHeightT: 0.55,

  // Duration (seconds) of the cake-gaze <-> eyes-closeup tween.
  eyesTransitionDuration: 2.2,

  horizonEndScroll: 1.0,

  horizonLookDistance: 200,

  horizonLookRaise: 4,

  horizonLookSideOffset: 0,

  // Duration (seconds) of the eyes-closeup <-> horizon-gaze tween.
  horizonTransitionDuration: 1.4,

  faceHideEyesT: 0.75,

  faceShowEyesT: 0.25,

  minOrbitSweep: Math.PI * 0.5,
};

export function computeCameraPath(towerNode, sunDirection) {
  const box = new THREE.Box3().setFromObject(towerNode);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * FRAMING_CONFIG.distanceMult;

  const sunFlatDir = new THREE.Vector3(sunDirection.x, 0, sunDirection.z).normalize();
  const sidestepAxis = new THREE.Vector3(-sunFlatDir.z, 0, sunFlatDir.x);

  return {
    bottomY: box.min.y,
    topY: box.max.y,
    centerX: center.x,
    centerZ: center.z,
    radius,
    sidestepAxis,
    sunFlatDir,
  };
}

const _sideOffset = new THREE.Vector3();
const _straightLookPoint = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _rightAxis = new THREE.Vector3();

function computeClimbEyeAndLook(path, climbT, orbitAngle, outEye, outLook) {
  const { bottomY, topY, centerX, centerZ, radius, sidestepAxis } = path;
  const towerHeight = topY - bottomY;
  const {
    distanceMult, sidestepMult, shoulderOffset,
    eyeStartT, eyeRangeT, lookStartT, lookRangeT,
  } = FRAMING_CONFIG;

  const eyeY = bottomY + towerHeight * eyeStartT + towerHeight * eyeRangeT * climbT;
  const lookY = bottomY + towerHeight * lookStartT + towerHeight * lookRangeT * climbT;

  const sidestep = Math.max(size_or_radius(radius, distanceMult), 0.001) * sidestepMult;
  _sideOffset.copy(sidestepAxis).multiplyScalar(sidestep);

  outEye.set(centerX, eyeY, centerZ + radius).add(_sideOffset);
  _straightLookPoint.set(centerX, lookY, centerZ);

  if (orbitAngle !== 0) {
    rotateAroundY(outEye, centerX, eyeY, centerZ, orbitAngle);
    rotateAroundY(_straightLookPoint, centerX, lookY, centerZ, orbitAngle);
  }

  _forward.subVectors(_straightLookPoint, outEye);
  const eyeToSubjectDist = _forward.length();
  _forward.normalize();
  _rightAxis.crossVectors(_forward, _worldUp).normalize();

  outLook.copy(_straightLookPoint)
    .addScaledVector(_rightAxis, eyeToSubjectDist * shoulderOffset);
}

const _climbEye = new THREE.Vector3();
const _climbLook = new THREE.Vector3();
const _result = { cameraProgress: 0, cameraVel: 0 };

export function updateCameraPath(camera, path, scrollProgress, cameraProgress, cameraVel, dt) {
  const stiffness = SPRING_CONFIG.stiffness;
  const damping = 2 * Math.sqrt(stiffness);
  const force = (scrollProgress - cameraProgress) * stiffness - cameraVel * damping;
  cameraVel += force * dt;
  cameraProgress += cameraVel * dt;

  computeClimbEyeAndLook(path, cameraProgress, ORBIT_CONFIG.orbitAngle, _climbEye, _climbLook);
  camera.position.copy(_climbEye);
  camera.lookAt(_climbLook);

  _result.cameraProgress = cameraProgress;
  _result.cameraVel = cameraVel;
  return _result;
}

function rotateAroundY(point, pivotX, pivotY, pivotZ, angle) {
  const dx = point.x - pivotX;
  const dz = point.z - pivotZ;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  point.x = pivotX + dx * cos - dz * sin;
  point.z = pivotZ + dx * sin + dz * cos;
  point.y = pivotY + (point.y - pivotY);
}

function size_or_radius(radiusAfterMult, distanceMult) {
  return radiusAfterMult / Math.max(distanceMult, 0.0001);
}


export function computeCakePath(cakeNode, towerPath) {
  const box = new THREE.Box3().setFromObject(cakeNode);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const cakeRadius = Math.max(size.x, size.z, 0.001);
  const cakeHeight = Math.max(size.y, 0.001);

  const dx = center.x - towerPath.centerX;
  const dz = center.z - towerPath.centerZ;
  const bearing = Math.atan2(dx, dz);

  return {
    centerX: center.x,
    centerY: center.y,
    centerZ: center.z,
    baseY: box.min.y,
    topY: box.max.y,
    cakeRadius,
    cakeHeight,
    bearing,
  };
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function computeEyesPath(eyesNode, cakePath) {
  eyesNode.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(eyesNode);
  const center = box.getCenter(new THREE.Vector3());

  return {
    eyeX: center.x,
    eyeY: center.y,
    eyeZ: center.z,
    lookX: cakePath ? cakePath.centerX : center.x,
    lookY: cakePath ? cakePath.baseY + cakePath.cakeHeight * DIRECTOR_CONFIG.eyesLookHeightT : center.y,
    lookZ: cakePath ? cakePath.centerZ : center.z,
  };
}

export function computeHorizonLook(eyesPath, outLook) {
  const { horizonLookDistance, horizonLookRaise, horizonLookSideOffset } = DIRECTOR_CONFIG;
  const dx = eyesPath.lookX - eyesPath.eyeX;
  const dz = eyesPath.lookZ - eyesPath.eyeZ;
  const flatDist = Math.sqrt(dx * dx + dz * dz);
  const dirX = flatDist > 0.0001 ? dx / flatDist : 0;
  const dirZ = flatDist > 0.0001 ? dz / flatDist : 1;
  const rightX = dirZ;
  const rightZ = -dirX;

  outLook.set(
    eyesPath.eyeX + dirX * horizonLookDistance + rightX * horizonLookSideOffset,
    eyesPath.eyeY + horizonLookRaise,
    eyesPath.eyeZ + dirZ * horizonLookDistance + rightZ * horizonLookSideOffset,
  );
}

function smoothstep01(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

const _cakeEye = new THREE.Vector3();
const _cakeLook = new THREE.Vector3();
const _dirEye = new THREE.Vector3();
const _dirLook = new THREE.Vector3();
const _horizonLook = new THREE.Vector3();

function computeCakeEyeAndLook(cakePath, outEye, outLook) {
  const { centerX, centerY, centerZ, baseY, cakeRadius, cakeHeight, bearing } = cakePath;
  const { cakeDistanceMult, cakeEyeHeightT, cakeLookHeightT } = DIRECTOR_CONFIG;

  const dist = cakeRadius * cakeDistanceMult;
  const dirX = Math.sin(bearing);
  const dirZ = Math.cos(bearing);

  outEye.set(
    centerX + dirX * dist,
    baseY + cakeHeight * cakeEyeHeightT,
    centerZ + dirZ * dist,
  );
  outLook.set(
    centerX,
    baseY + cakeHeight * cakeLookHeightT,
    centerZ,
  );
  void centerY;
}

function computeCakeEyeCylindrical(cakePath, towerPath) {
  const dist = cakePath.cakeRadius * DIRECTOR_CONFIG.cakeDistanceMult;
  const eyeX = cakePath.centerX + Math.sin(cakePath.bearing) * dist;
  const eyeZ = cakePath.centerZ + Math.cos(cakePath.bearing) * dist;
  const eyeY = cakePath.baseY + cakePath.cakeHeight * DIRECTOR_CONFIG.cakeEyeHeightT;

  const dx = eyeX - towerPath.centerX;
  const dz = eyeZ - towerPath.centerZ;
  return {
    angle: Math.atan2(dx, dz),
    radiusFromTower: Math.sqrt(dx * dx + dz * dz),
    y: eyeY,
  };
}

const _trueStartEye = new THREE.Vector3();
const _trueStartLook = new THREE.Vector3();

function computeArcSweepEye(towerPath, cakeCyl, orbitAngle, eased, outEye) {
  computeClimbEyeAndLook(towerPath, CLIMB_CONFIG.climbTopT, orbitAngle, _trueStartEye, _trueStartLook);

  const startDx = _trueStartEye.x - towerPath.centerX;
  const startDz = _trueStartEye.z - towerPath.centerZ;
  const startAngle = Math.atan2(startDx, startDz);
  const startRadius = Math.sqrt(startDx * startDx + startDz * startDz);

  let deltaAngle = wrapAngle(cakeCyl.angle - startAngle);
  const angle = startAngle + deltaAngle * eased;

  const minRadius = towerPath.radius + DIRECTOR_CONFIG.arcClearance;
  const endRadius = cakeCyl.radiusFromTower;
  const straightRadius = startRadius + (endRadius - startRadius) * eased;
  const bulge = Math.sin(eased * Math.PI);
  const radius = Math.max(straightRadius, minRadius * bulge + straightRadius * (1 - bulge));

  const y = _trueStartEye.y + (cakeCyl.y - _trueStartEye.y) * eased;

  outEye.set(
    towerPath.centerX + Math.sin(angle) * radius,
    y,
    towerPath.centerZ + Math.cos(angle) * radius,
  );
}

export function createCameraDirector(towerPath, cakePath, eyesPath) {
  const PHASE_CLIMB = 'climb';
  const PHASE_SWING = 'swing';
  const PHASE_EYES = 'eyes';
  const PHASE_HORIZON = 'horizon';

  // The committed scroll cursor is the *only* thing that ever drives a
  // segment's blend target. Raw live scroll (rawScrollProgress) is always
  // read, but it only pulls the cursor forward/backward while the segment
  // the cursor currently sits in is at rest (its blend spring has actually
  // reached 0 or 1 and stopped moving). While a segment is mid-transition,
  // the cursor holds still -- further scroll input has zero effect on the
  // camera until the current transition finishes, so a fast fling or
  // continued scrolling mid-autocomplete can only ever queue up "how far
  // the user wants to go next," never skip or interrupt the transition
  // that's currently playing.
  let committedScroll = 0;

  let phase = PHASE_CLIMB;
  let climbProgress = 0;
  let climbVel = 0;

  // Linear progress (0..1) per segment -- the actual stepped/stored state.
  // easeInOutCubic(t) is applied at each render/status call site to get the
  // visual blend; t itself stays linear so rest-checks (t === 0 or 1) are
  // exact rather than asymptotic.
  let cakeT = 0;
  let eyesT = 0;
  let horizonT = 0;

  let horizonUnlocked = false;
  let pendingAutoEngageHorizon = false;

  // Once the candles are snuffed, the camera is force-jumped into
  // PHASE_HORIZON regardless of where the user's real scroll position
  // (rawScrollProgress) actually is -- see notifyCandlesSnuffed below.
  // That jump only touches committedScroll/phase/horizonT; it never moves
  // the user's actual scrollbar. So the moment horizonT finishes tweening
  // and the rest-gate reopens, committedScroll is free to chase
  // rawScrollProgress again -- and rawScrollProgress is usually still
  // sitting wherever it was when the candles went out (well below
  // eyesEndScroll), which yanks the camera straight back out of horizon
  // with no scroll input from the user at all.
  //
  // committedScrollFloor fixes that: once set, the rest-gate below treats
  // it as a lower bound on committedScroll, so the auto-engaged horizon
  // view can't be dragged back down by a stale rawScrollProgress. The
  // floor is released the moment the user actually scrolls back past it
  // themselves (rawScrollProgress drops below the floor), so a real,
  // deliberate scroll-away still works exactly as before -- this only
  // stops the *phantom* snap-back that happens with no scroll at all.
  let committedScrollFloor = 0;

  let faceHidden = false;

  let orbitSweep = 0;
  const cakeCyl = cakePath ? computeCakeEyeCylindrical(cakePath, towerPath) : null;
  if (cakeCyl) {
    let sweep = wrapAngle(cakeCyl.angle - 0);
    const floor = DIRECTOR_CONFIG.minOrbitSweep;
    if (Math.abs(sweep) < floor) {
      sweep = sweep < 0 ? -floor : floor;
    }
    orbitSweep = sweep;
  }

  const status = {
    phase: PHASE_CLIMB, climbProgress: 0, cakeBlend: 0, eyesBlend: 0, horizonBlend: 0,
    atCake: false, atEyes: false, atHorizon: false,
    inFirstPerson: false,
    faceHidden: false,
    scrollLocked: false,
  };

  function renderSwingFrame(camera, eased) {
    computeClimbEyeAndLook(towerPath, CLIMB_CONFIG.climbTopT, ORBIT_CONFIG.orbitAngle + eased * orbitSweep, _trueStartEye, _dirLook);

    if (cakeCyl) {
      computeArcSweepEye(towerPath, cakeCyl, ORBIT_CONFIG.orbitAngle, eased, _dirEye);
      computeCakeEyeAndLook(cakePath, _cakeEye, _cakeLook);
      _dirLook.lerp(_cakeLook, eased);
    } else {
      _dirEye.copy(_trueStartEye);
    }

    camera.position.copy(_dirEye);
    camera.lookAt(_dirLook);
  }

  function renderEyesFrame(camera, eased) {
    computeCakeEyeAndLook(cakePath, _cakeEye, _cakeLook);
    _dirEye.set(
      _cakeEye.x + (eyesPath.eyeX - _cakeEye.x) * eased,
      _cakeEye.y + (eyesPath.eyeY - _cakeEye.y) * eased,
      _cakeEye.z + (eyesPath.eyeZ - _cakeEye.z) * eased,
    );
    _dirLook.set(
      _cakeLook.x + (eyesPath.lookX - _cakeLook.x) * eased,
      _cakeLook.y + (eyesPath.lookY - _cakeLook.y) * eased,
      _cakeLook.z + (eyesPath.lookZ - _cakeLook.z) * eased,
    );
    camera.position.copy(_dirEye);
    camera.lookAt(_dirLook);
  }

  // Interpolates the *angle* (yaw + pitch) of the gaze from the near
  // cake-look-point to the far horizon-look-point, rather than lerping
  // the two lookAt points themselves in world space. The two points sit
  // at very different distances from the eye (cake: close; horizon:
  // horizonLookDistance out), so a straight-line spatial lerp between
  // them sweeps the angle non-uniformly -- huge angular change near the
  // start (the interpolated point is still close to the eye, so small
  // spatial steps are large angular steps) and almost none near the end
  // (the point is already far away, so it can move a lot in space for a
  // tiny angular change). That non-uniform angle-vs-t is what read as
  // unnatural -- a person tilting their gaze up moves through pitch at
  // roughly constant angular rate, not along a straight spatial path
  // between two points at different depths. Interpolating yaw/pitch
  // directly (each driven 1:1 by `eased`) fixes that.
  function renderHorizonFrame(camera, eased) {
    computeHorizonLook(eyesPath, _horizonLook);
    camera.position.set(eyesPath.eyeX, eyesPath.eyeY, eyesPath.eyeZ);

    const dxA = eyesPath.lookX - eyesPath.eyeX;
    const dyA = eyesPath.lookY - eyesPath.eyeY;
    const dzA = eyesPath.lookZ - eyesPath.eyeZ;
    const distA = Math.sqrt(dxA * dxA + dyA * dyA + dzA * dzA) || 1;

    const dxB = _horizonLook.x - eyesPath.eyeX;
    const dyB = _horizonLook.y - eyesPath.eyeY;
    const dzB = _horizonLook.z - eyesPath.eyeZ;
    const distB = Math.sqrt(dxB * dxB + dyB * dyB + dzB * dzB) || 1;

    const yawA = Math.atan2(dxA, dzA);
    const pitchA = Math.asin(Math.max(-1, Math.min(1, dyA / distA)));
    const yawB = Math.atan2(dxB, dzB);
    const pitchB = Math.asin(Math.max(-1, Math.min(1, dyB / distB)));

    // Shortest-path yaw delta so the sweep never goes the long way around.
    let yawDelta = yawB - yawA;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    const yaw = yawA + yawDelta * eased;
    const pitch = pitchA + (pitchB - pitchA) * eased;

    const cosPitch = Math.cos(pitch);
    const dirX = Math.sin(yaw) * cosPitch;
    const dirY = Math.sin(pitch);
    const dirZ = Math.cos(yaw) * cosPitch;

    const lookDist = distA + (distB - distA) * eased;
    _dirLook.set(
      eyesPath.eyeX + dirX * lookDist,
      eyesPath.eyeY + dirY * lookDist,
      eyesPath.eyeZ + dirZ * lookDist,
    );
    camera.lookAt(_dirLook);
  }

  function notifyCandlesSnuffed() {
    if (!eyesPath || horizonUnlocked) return;
    horizonUnlocked = true;
    pendingAutoEngageHorizon = true;
    // Pin the floor immediately (not just when the pending flag is
    // consumed) so there's no gap frame where the rest-gate could act on
    // the old, unfloored committedScroll before phase actually flips.
    committedScrollFloor = DIRECTOR_CONFIG.eyesEndScroll;
  }

  function isAtRest(blend, target) {
    return blend === (target === 1 ? 1 : 0);
  }

  // easeInOutCubic: symmetric accel-in / decel-out. easeOutQuint (the
  // previous curve) has a derivative that's heavily front-loaded --
  // 1-(1-t)^5 covers ~85% of its motion in the first half of the
  // duration and crawls through the back half, which reads exactly like
  // a spring settling to rest even though it's a fixed-duration tween.
  // easeInOutCubic spends comparable time accelerating and decelerating,
  // so motion still finishes with intent (no asymptotic tail) but
  // doesn't front-load into a long slow crawl at the end.
  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Advances a segment's linear progress `t` (0..1) by a fixed rate
  // derived from `duration`, toward whichever binary endpoint `target`
  // currently is (`target` is only ever 0 or 1: gating means a segment is
  // either "not entered yet" or "committed to fully," never a partial
  // value to chase mid-flight). Returns the updated `t`. Callers apply
  // easeInOutCubic(t) separately to get the actual render blend -- keeping
  // `t` itself linear/exact is what makes the rest gate below safe to
  // check as a strict equality: a tween actually reaches t===0/1 in
  // finite time (unlike a spring's asymptotic approach), so "physically
  // done" and "looks done" are the same moment. No perceptual-vs-physical
  // gap to tune around, and no early phase-advance popping the camera
  // partway through motion.
  //
  // Reversing direction just moves `t` the other way along the same
  // curve -- no snapping, no restart, so a scroll-back mid-transition
  // stays continuous.
  function stepTween(t, target, duration, dt) {
    const dir = target === 1 ? 1 : -1;
    const rate = duration > 0 ? dt / duration : 1;
    t += dir * rate;
    return Math.max(0, Math.min(1, t));
  }

  function update(camera, rawScrollProgress, dt) {
    const {
      climbEndScroll, swingEndScroll, eyesEndScroll,
      transitionDuration, eyesTransitionDuration, commitRate,
      faceHideEyesT, faceShowEyesT,
    } = DIRECTOR_CONFIG;

    // Is the segment currently playing at rest? Only the active phase's
    // own progress matters -- e.g. while in PHASE_SWING, cakeT gates
    // further commit; other segments' progress is settled by construction
    // (force-set to 0/1 on phase transitions below) so it never
    // spuriously blocks anything. Exact equality is safe here because
    // stepTween actually reaches 0/1 in finite time -- see stepTween.
    let currentBlendAtRest;
    if (phase === PHASE_CLIMB) {
      // Climb has no discrete rest gate of its own -- it's a continuous
      // approach within the tower, not a hop between two fixed camera
      // setups -- so the committed cursor is always free to move within
      // climb's own span. It only pauses at the climb/swing boundary,
      // handled by the cakeT rest-check once phase advances to swing.
      currentBlendAtRest = true;
    } else if (phase === PHASE_SWING) {
      currentBlendAtRest = isAtRest(cakeT, committedScroll >= climbEndScroll ? 1 : 0);
    } else if (phase === PHASE_EYES) {
      currentBlendAtRest = isAtRest(eyesT, committedScroll >= swingEndScroll ? 1 : 0);
    } else {
      currentBlendAtRest = isAtRest(horizonT, committedScroll >= eyesEndScroll ? 1 : 0);
    }

    // Release the floor the moment the user's actual scroll shows genuine
    // intent to leave: once rawScrollProgress itself has dropped below
    // the floor, honoring that is exactly "the user scrolled away," which
    // should always win. Checking rawScrollProgress here (not
    // committedScroll) means this can only be released by real input,
    // never by the rest-gate's own step below.
    if (committedScrollFloor > 0 && rawScrollProgress < committedScrollFloor) {
      committedScrollFloor = 0;
    }

    if (currentBlendAtRest) {
      const maxStep = commitRate * dt;
      const delta = rawScrollProgress - committedScroll;
      if (Math.abs(delta) <= maxStep) {
        committedScroll = rawScrollProgress;
      } else {
        committedScroll += Math.sign(delta) * maxStep;
      }
    }
    committedScroll = Math.max(committedScrollFloor, Math.min(1, committedScroll));

    const climbTarget = Math.max(0, Math.min(1, committedScroll / Math.max(climbEndScroll, 0.0001)));

    if (phase === PHASE_CLIMB) {
      const stiffness = SPRING_CONFIG.stiffness;
      const damping = 2 * Math.sqrt(stiffness);
      const force = (climbTarget - climbProgress) * stiffness - climbVel * damping;
      climbVel += force * dt;
      climbProgress += climbVel * dt;

      computeClimbEyeAndLook(towerPath, climbProgress * CLIMB_CONFIG.climbTopT, ORBIT_CONFIG.orbitAngle, _dirEye, _dirLook);
      camera.position.copy(_dirEye);
      camera.lookAt(_dirLook);

      // Advance only once the climb has actually arrived at the top --
      // renderSwingFrame always starts its arc from the fixed
      // CLIMB_CONFIG.climbTopT position, so entering PHASE_SWING before
      // climbProgress has settled there would pop the camera in one frame.
      if (cakePath && committedScroll >= climbEndScroll && climbProgress >= 0.995) {
        phase = PHASE_SWING;
      }
    } else if (phase === PHASE_SWING) {
      const target = committedScroll >= climbEndScroll ? 1 : 0;
      cakeT = stepTween(cakeT, target, transitionDuration, dt);

      renderSwingFrame(camera, easeInOutCubic(cakeT));

      if (target === 0 && cakeT === 0) {
        phase = PHASE_CLIMB;
        // Hand off continuously: renderSwingFrame at cakeT===0 renders the
        // tower-top position, so climb must resume from the top (1), not
        // the base (0) -- otherwise the very next frame snaps down to the
        // base and re-climbs, which is the reported base-then-jump-to-top
        // pop.
        climbProgress = 1;
        climbVel = 0;
      } else if (eyesPath && target === 1 && cakeT === 1) {
        phase = PHASE_EYES;
      }
    } else if (phase === PHASE_EYES) {
      const target = committedScroll >= swingEndScroll ? 1 : 0;
      eyesT = stepTween(eyesT, target, eyesTransitionDuration, dt);

      renderEyesFrame(camera, easeInOutCubic(eyesT));

      if (target === 0 && eyesT === 0) {
        phase = PHASE_SWING;
        cakeT = 1;
      } else if (pendingAutoEngageHorizon) {
        // One-shot: the moment candles are snuffed, jump straight into
        // PHASE_HORIZON in this same frame, regardless of where scroll
        // currently sits or whether eyesT had already finished tweening.
        //
        // This used to just bump committedScroll and eyesT and wait for a
        // later frame's "target === 1 && eyesT === 1" check to notice and
        // flip phase. That's fragile in two ways: (1) if eyesT was still
        // mid-flight when the candles were snuffed, the rest-gate up top
        // can resync committedScroll back down to a low rawScrollProgress
        // before eyesT actually lands on exactly 1, reversing the tween
        // before the check ever passes; and (2) even patching that by
        // clamping committedScroll's floor once horizonUnlocked is set
        // still breaks things, because that floor has no way to
        // distinguish "just-triggered, hasn't caught up yet" from "player
        // deliberately scrolling backward out of horizon afterward" -- it
        // blocks both. Committing the phase change directly, in the same
        // frame the flag is consumed, sidesteps both problems: nothing is
        // left pending for a later frame to race against, and normal
        // scroll-driven eyes<->horizon crossings afterward are handled by
        // PHASE_HORIZON's own target===0 branch below exactly like any
        // other boundary, with no special-casing needed.
        pendingAutoEngageHorizon = false;
        eyesT = 1;
        committedScroll = Math.max(committedScroll, eyesEndScroll);
        phase = PHASE_HORIZON;
        horizonT = 0;
      } else if (horizonUnlocked && target === 1 && eyesT === 1) {
        // Ordinary scroll-driven crossing, available for the rest of the
        // session once horizonUnlocked is set -- symmetric with every
        // other boundary. Previously this was gated on
        // pendingAutoEngageHorizon itself, which is cleared after the
        // first auto-engage, so scrolling eyes -> horizon -> eyes -> back
        // to horizon had no trigger left and was permanently stuck.
        phase = PHASE_HORIZON;
      }
    } else if (phase === PHASE_HORIZON) {
      const target = committedScroll >= eyesEndScroll ? 1 : 0;
      horizonT = stepTween(horizonT, target, DIRECTOR_CONFIG.horizonTransitionDuration, dt);

      renderHorizonFrame(camera, easeInOutCubic(horizonT));

      if (target === 0 && horizonT === 0) {
        phase = PHASE_EYES;
        eyesT = 1;
      }
    }

    const cakeBlend = easeInOutCubic(cakeT);
    const eyesBlend = easeInOutCubic(eyesT);
    const horizonBlend = easeInOutCubic(horizonT);

    status.phase = phase;
    status.climbProgress = climbProgress;
    status.cakeBlend = cakeBlend;
    status.eyesBlend = eyesBlend;
    status.horizonBlend = horizonBlend;
    status.atCake = phase === PHASE_SWING && cakeBlend > 0.94;
    status.atEyes = phase === PHASE_EYES && eyesBlend > 0.94;
    status.atHorizon = phase === PHASE_HORIZON && horizonBlend > 0.94;
    status.inFirstPerson = phase === PHASE_EYES || phase === PHASE_HORIZON;

    if (!faceHidden && eyesBlend >= faceHideEyesT) {
      faceHidden = true;
    } else if (faceHidden && eyesBlend <= faceShowEyesT) {
      faceHidden = false;
    }
    status.faceHidden = faceHidden;

    // scrollLocked tells the caller (main.js) whether the driven scroll
    // value should stop chasing raw scroll -- true whenever the current
    // segment is mid-transition, i.e. exactly the frames where this
    // director is ignoring further scroll input.
    status.scrollLocked = !currentBlendAtRest;

    return status;
  }

  return { update, notifyCandlesSnuffed };
}