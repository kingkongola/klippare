import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, createEstimator, integrateMeasuredWheels,
  observePass, scoreRay
} from '../model-core.mjs';

const exact = {
  driftPct: 0, seed: 7, wheelBase: 0.48,
  leftScale: 1, rightScale: 1, slipSigma: 0
};

test('PBT: equal wheel increments preserve heading for arbitrary distances', () => {
  const r = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const d = (r() * 2 - 1) * 3;
    const h = (r() * 2 - 1) * Math.PI;
    const e = createEstimator({ heading: h, profile: exact });
    integrateMeasuredWheels(e, d, d);
    assert.ok(Math.abs(e.heading - h) < 1e-10);
    assert.ok(Math.abs(Math.hypot(e.x, e.y) - Math.abs(d)) < 1e-10);
  }
});

test('PBT: symmetric opposite wheel increments have zero translation', () => {
  const r = mulberry32(54321);
  for (let i = 0; i < 1000; i++) {
    const d = (r() * 2 - 1) * 0.7;
    const x0 = (r()*2-1)*10;
    const y0 = (r()*2-1)*10;
    const e = createEstimator({ x: x0, y: y0, heading: (r() * 2 - 1) * Math.PI, profile: exact });
    integrateMeasuredWheels(e, -d, d);
    assert.ok(Math.abs(e.x - x0) < 1e-10);
    assert.ok(Math.abs(e.y - y0) < 1e-10);
  }
});

test('PBT: revisiting every cell on a ray cannot improve memory-only score', () => {
  const r = mulberry32(888);
  for (let trial = 0; trial < 300; trial++) {
    const angle = (r() * 2 - 1) * Math.PI;
    const e = createEstimator({ heading: angle, profile: exact, useMotor: false, cellSize: 0.5 });
    const rel = (r() * 2 - 1) * 2.5;
    const before = scoreRay(e, rel, { maxDistance: 4, step: 0.25 });
    const h = e.heading + rel;
    for (let d = 0.45; d <= 4; d += 0.25) {
      e.x = Math.cos(h) * d;
      e.y = Math.sin(h) * d;
      observePass(e, r());
    }
    e.x = 0; e.y = 0; e.heading = angle;
    const after = scoreRay(e, rel, { maxDistance: 4, step: 0.25 });
    assert.ok(after <= before + 1e-9);
  }
});

test('PBT: scoreRay always returns a finite score for sparse arbitrary maps', () => {
  const r = mulberry32(999);
  for (let trial = 0; trial < 500; trial++) {
    const e = createEstimator({
      x: (r()*2-1)*20, y: (r()*2-1)*20,
      heading: (r()*2-1)*Math.PI,
      profile: exact, useMotor: r() > 0.5,
      cellSize: 0.4 + r()
    });
    for (let j = 0; j < 30; j++) {
      e.x += (r()*2-1)*0.7;
      e.y += (r()*2-1)*0.7;
      observePass(e, r());
    }
    const s = scoreRay(e, (r()*2-1)*Math.PI);
    assert.ok(Number.isFinite(s));
  }
});
