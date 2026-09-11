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
  return { driftPct, seed, wheelBase, leftScale, rightScale, slipSigma };
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
  const { leftScale, rightScale, slipSigma } = est.profile;
  const r = est.rng;
  const leftNoise = Math.abs(leftTrue) * slipSigma * gaussian(r);
  const rightNoise = Math.abs(rightTrue) * slipSigma * gaussian(r);
  return [
    leftTrue * leftScale + leftNoise,
    rightTrue * rightScale + rightNoise,
  ];
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

export function integrateTrueWheelMotion(est, leftTrue, rightTrue) {
  const [l, r] = measureWheels(est, leftTrue, rightTrue);
  return integrateMeasuredWheels(est, l, r);
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
} = {}) {
  if (!relativeAngles.length) throw new Error('relativeAngles must not be empty');
  if (exploration > 0 && random() < exploration) {
    return relativeAngles[Math.floor(random() * relativeAngles.length)];
  }

  let best = relativeAngles[0];
  let bestScore = -Infinity;
  for (const a of relativeAngles) {
    const s = scoreRay(est, a, scoreOptions) + (random() - 0.5) * 0.08;
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
