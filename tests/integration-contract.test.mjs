import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const patch = readFileSync(new URL('../engine-5.txt', import.meta.url), 'utf8');

function bodyBetween(startMarker, endMarker) {
  const start = patch.indexOf(startMarker);
  const end = patch.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `missing ${startMarker}`);
  return patch.slice(start, end);
}

test('adaptive turn planner has no access to true lawn geometry', () => {
  const chooser = bodyBetween('chooseAdaptiveTurn = function', '\n};');
  assert.doesNotMatch(chooser, /\bsafeAt\b|\bpointInPoly\b|\bstraightInside\b|\bbounds\b|\bpoly\b/);
});

test('ray scoring delegates only to learned estimator state', () => {
  const scorer = bodyBetween('adaptiveRayScore = function', '\n};');
  assert.match(scorer, /Core\.scoreRay\(w\.learn/);
  assert.doesNotMatch(scorer, /\bsafeAt\b|\bpointInPoly\b|\bstraightInside\b/);
});

test('physical boundary check remains in motion layer, not planner', () => {
  const stepper = bodyBetween('stepRandom = function', '\n};');
  assert.match(stepper, /safeAt\(nx,ny,w\.poly,w\.bodyR\)/);
  assert.match(stepper, /observeLearnedBoundary\(w\)/);
});

test('sensor ablation explicitly gives models 2 and 3 the same profile and start', () => {
  const rebuild = bodyBetween('rebuild = function', '\n};');
  assert.match(rebuild, /configureEstimator\(mem,\{start,heading,profile,useMotor:false\}\)/);
  assert.match(rebuild, /configureEstimator\(motor,\{start,heading,profile,useMotor:true\}\)/);
});
