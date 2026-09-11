import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeProfile, createEstimator, integrateMeasuredWheels,
  observePass, observeBoundary, scoreRay, getCell, cellCoords,
  positionError
} from '../model-core.mjs';

const exactProfile = {
  driftPct: 0, seed: 1, wheelBase: 0.5,
  leftScale: 1, rightScale: 1, slipSigma: 0
};

test('equal wheel travel moves straight', () => {
  const e = createEstimator({ profile: exactProfile });
  integrateMeasuredWheels(e, 2, 2);
  assert.ok(Math.abs(e.x - 2) < 1e-12);
  assert.ok(Math.abs(e.y) < 1e-12);
  assert.ok(Math.abs(e.heading) < 1e-12);
});

test('opposite wheel travel turns in place', () => {
  const e = createEstimator({ profile: exactProfile });
  integrateMeasuredWheels(e, -0.25, 0.25);
  assert.ok(Math.hypot(e.x, e.y) < 1e-12);
  assert.ok(Math.abs(e.heading - 1) < 1e-12);
});

test('memory-only ignores blade current when updating utility', () => {
  const a = createEstimator({ profile: exactProfile, useMotor: false });
  const b = createEstimator({ profile: exactProfile, useMotor: false });
  observePass(a, 0.0);
  observePass(b, 1.0);
  assert.deepEqual([...a.cells], [...b.cells]);
});

test('motor-enabled learner propagates high-load hint to unknown neighbours', () => {
  const e = createEstimator({ profile: exactProfile, useMotor: true });
  observePass(e, 1.0);
  const [gx, gy] = cellCoords(e);
  const neighbour = getCell(e, gx + 1, gy, false);
  assert.ok(neighbour);
  assert.ok(neighbour.grassHint > 0.5);
});

test('observed boundary penalizes only the estimated map', () => {
  const e = createEstimator({ profile: exactProfile, useMotor: false });
  const before = scoreRay(e, 0);
  observeBoundary(e, 0.72);
  const after = scoreRay(e, 0);
  assert.ok(after < before);
});

test('motor observation never changes estimated pose', () => {
  const a = createEstimator({ x: 2, y: -1, heading: 0.4, profile: exactProfile, useMotor: false });
  const b = createEstimator({ x: 2, y: -1, heading: 0.4, profile: exactProfile, useMotor: true });
  observePass(a, 0);
  observePass(b, 1);
  assert.equal(positionError(a, b.x, b.y), 0);
  assert.equal(a.heading, b.heading);
});

test('profile stays inside requested permanent wheel-bias envelope', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const p = makeProfile({ driftPct: 3, seed });
    assert.ok(p.leftScale >= 0.97 && p.leftScale <= 1.03);
    assert.ok(p.rightScale >= 0.97 && p.rightScale <= 1.03);
  }
});
