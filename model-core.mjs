export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function gaussian(rand) {
  const u1 = Math.max(1e-12, rand());
  const u2 = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function makeProfile({
  driftPct = 2,
  seed = 1,
  wheelBase = 0.48,
} = {}) {
  const r = mulberry32(seed);
  const maxBias = Math.max(0, driftPct) / 100;
  const leftScale = 1 + (r() * 2 - 1) * maxBias;
  const rightScale = 1 + (r() * 2 - 1) * maxBias;
  const slipSigma = 0.0015 + maxBias * 0.22;
  const gyroBias = (r() * 2 - 1) * (0.0015 + maxBias * 0.012);
  const gyroNoise = 0.0025 + maxBias * 0.010;
  return {
    driftPct, seed, wheelBase,
    leftScale, rightScale, slipSigma,
    gyroBias, gyroNoise,
  };
}

export function createEstimator({
  x = 0,
  y = 0,
  heading = 0,
  cellSize = 0.72,
  profile = makeProfile(),
  useMotor = false,
} = {}) {
  return {
    x, y, heading: wrapAngle(heading),
    cellSize,
    profile: { ...profile },
    useMotor,
    rng: mulberry32(profile.seed),
    cells: new Map(),
    distanceMeasured: 0,
    slipEvents: 0,
    lastSlipScore: 0,
    poseCorrections: 0,
    correctionDistance: 0,
  };
}

export function cellCoords(est, x = est.x, y = est.y) {
  return [Math.floor(x / est.cellSize), Math.floor(y / est.cellSize)];
}

export function cellKey(gx, gy) {
  return `${gx},${gy}`;
}

export function getCell(est, gx, gy, create = false) {
  const k = cellKey(gx, gy);
  let c = est.cells.get(k);
  if (!c && create) {
    c = { visits: 0, grassHint: 0.5, loadEMA: 0, blocked: 0 };
    est.cells.set(k, c);
  }
  return c;
}

export function measureWheels(est, leftTrue, rightTrue) {
  const { leftScale = 1, rightScale = 1, slipSigma = 0 } = est.profile;
  const r = est.rng;
  const leftNoise = Math.abs(leftTrue) * slipSigma * gaussian(r);
  const rightNoise = Math.abs(rightTrue) * slipSigma * gaussian(r);
  return [
    leftTrue * leftScale + leftNoise,
    rightTrue * rightScale + rightNoise,
  ];
}

export function measureGyro(est, trueDeltaTheta, dt = 1) {
  const { gyroBias = 0, gyroNoise = 0 } = est.profile;
  const t = Math.max(1e-4, dt);
  return trueDeltaTheta + gyroBias * t + gyroNoise * Math.sqrt(t) * gaussian(est.rng);
}

export function integrateMeasuredWheels(est, leftMeasured, rightMeasured) {
  const b = est.profile.wheelBase;
  const ds = (leftMeasured + rightMeasured) / 2;
  const dtheta = (rightMeasured - leftMeasured) / b;
  const mid = est.heading + dtheta / 2;
  est.x += ds * Math.cos(mid);
  est.y += ds * Math.sin(mid);
  est.heading = wrapAngle(est.heading + dtheta);
  est.distanceMeasured += Math.abs(ds);
  return est;
}

export function integrateMeasuredWheelGyro(
  est,
  leftMeasured,
  rightMeasured,
  gyroDelta,
  {
    gyroWeight = 0.78,
    slipGyroWeight = 0.96,
    slipThreshold = 0.055,
  } = {},
) {
  const b = est.profile.wheelBase;
  const ds = (leftMeasured + rightMeasured) / 2;
  const wheelDelta = (rightMeasured - leftMeasured) / b;
  const disagreement = Math.abs(wheelDelta - gyroDelta);
  const slipping = disagreement > slipThreshold;
  const g = slipping ? slipGyroWeight : gyroWeight;
  const dtheta = (1 - g) * wheelDelta + g * gyroDelta;
  const mid = est.heading + dtheta / 2;

  est.x += ds * Math.cos(mid);
  est.y += ds * Math.sin(mid);
  est.heading = wrapAngle(est.heading + dtheta);
  est.distanceMeasured += Math.abs(ds);
  est.lastSlipScore = disagreement;
  if (slipping) est.slipEvents += 1;

  return { est, slipping, disagreement, wheelDelta, gyroDelta, fusedDelta: dtheta };
}

export function integrateTrueWheelMotion(est, leftTrue, rightTrue) {
  const [l, r] = measureWheels(est, leftTrue, rightTrue);
  return integrateMeasuredWheels(est, l, r);
}

export function integrateTrueWheelGyroMotion(
  est,
  leftTrue,
  rightTrue,
  trueDeltaTheta,
  dt = 1,
  options = {},
) {
  const [l, r] = measureWheels(est, leftTrue, rightTrue);
  const gyro = measureGyro(est, trueDeltaTheta, dt);
  return integrateMeasuredWheelGyro(est, l, r, gyro, options);
}

export function observePass(est, motorNorm = 0) {
  const [gx, gy] = cellCoords(est);
  const c = getCell(est, gx, gy, true);
  c.visits += 1;

  if (est.useMotor) {
    const n = clamp(motorNorm, 0, 1);
    c.loadEMA = c.visits === 1 ? n : c.loadEMA * 0.72 + n * 0.28;
    c.grassHint = Math.min(c.grassHint, 0.08);

    for (let yy = gy - 1; yy <= gy + 1; yy++) {
      for (let xx = gx - 1; xx <= gx + 1; xx++) {
        if (xx === gx && yy === gy) continue;
        const ncell = getCell(est, xx, yy, true);
        if (ncell.visits === 0) {
          ncell.grassHint = Math.max(ncell.grassHint, 0.35 + 0.55 * n);
        }
      }
    }
  }
  return c;
}

export function observeBoundary(est, ahead = 0.62) {
  const x = est.x + Math.cos(est.heading) * ahead;
  const y = est.y + Math.sin(est.heading) * ahead;
  const [gx, gy] = cellCoords(est, x, y);
  const c = getCell(est, gx, gy, true);
  c.blocked += 1;
  return c;
}

function expectedMotorAtCell(est, gx, gy) {
  const c = getCell(est, gx, gy, false);
  if (!c) return 0.58;
  if (c.blocked) return 0.50;
  if (c.visits > 0) return clamp(0.05 + c.loadEMA * 0.18, 0.05, 0.28);
  return clamp(c.grassHint, 0.18, 0.95);
}

export function correctPoseFromMotor(est, motorNorm, {
  radiusCells = 1,
  gain = 0.18,
  minImprovement = 0.10,
  shiftPenalty = 0.11,
} = {}) {
  if (!est.useMotor) return { corrected: false, distance: 0 };
  const obs = clamp(motorNorm, 0, 1);
  const [gx0, gy0] = cellCoords(est);
  const currentExpected = expectedMotorAtCell(est, gx0, gy0);
  const currentCost = Math.abs(currentExpected - obs);
  let best = { gx: gx0, gy: gy0, cost: currentCost };

  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      const gx = gx0 + dx, gy = gy0 + dy;
      const expected = expectedMotorAtCell(est, gx, gy);
      const cost = Math.abs(expected - obs) + shiftPenalty * Math.hypot(dx, dy);
      if (cost < best.cost) best = { gx, gy, cost };
    }
  }

  if (currentCost - best.cost < minImprovement || (best.gx === gx0 && best.gy === gy0)) {
    return { corrected: false, distance: 0 };
  }

  const tx = (best.gx + 0.5) * est.cellSize;
  const ty = (best.gy + 0.5) * est.cellSize;
  const ox = est.x, oy = est.y;
  est.x += (tx - est.x) * gain;
  est.y += (ty - est.y) * gain;
  const d = Math.hypot(est.x - ox, est.y - oy);
  est.poseCorrections += 1;
  est.correctionDistance += d;
  return { corrected: true, distance: d, gx: best.gx, gy: best.gy };
}

export function scoreRay(est, relativeAngle, {
  maxDistance = 4.2,
  step = 0.36,
  motorWeight = 0.55,
} = {}) {
  const h = est.heading + relativeAngle;
  let score = 0;
  let lastKey = null;

  for (let d = 0.45; d <= maxDistance + 1e-9; d += step) {
    const x = est.x + Math.cos(h) * d;
    const y = est.y + Math.sin(h) * d;
    const [gx, gy] = cellCoords(est, x, y);
    const k = cellKey(gx, gy);
    if (k === lastKey) continue;
    lastKey = k;

    const c = getCell(est, gx, gy, false);
    if (c?.blocked) {
      score -= 5 + Math.min(3, c.blocked);
      break;
    }

    const visits = c?.visits ?? 0;
    score += visits === 0 ? 1.0 : Math.max(-0.30, 0.12 - 0.13 * visits);

    if (est.useMotor) {
      const hint = c?.grassHint ?? 0.5;
      score += motorWeight * (hint - 0.5);
    }
  }
  return score;
}

export function chooseTurn(est, relativeAngles, {
  exploration = 0,
  random = Math.random,
  scoreOptions = {},
  turnPenalty = 0,
} = {}) {
  if (!relativeAngles.length) throw new Error('relativeAngles must not be empty');
  if (exploration > 0 && random() < exploration) {
    return relativeAngles[Math.floor(random() * relativeAngles.length)];
  }

  let best = relativeAngles[0];
  let bestScore = -Infinity;
  for (const a of relativeAngles) {
    const s = scoreRay(est, a, scoreOptions)
      - Math.abs(a) * turnPenalty
      + (random() - 0.5) * 0.08;
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}

export function positionError(est, trueX, trueY) {
  return Math.hypot(est.x - trueX, est.y - trueY);
}
