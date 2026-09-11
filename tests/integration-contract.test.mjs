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

test('Monte Carlo compares all four strategies in every trial', () => {
  const mc = bodyBetween('monteCarlo = async function', '\nconst driftEl=');
  assert.match(mc, /random:reactive\('random'/);
  assert.match(mc, /memory:reactive\('memory'/);
  assert.match(mc, /motor:reactive\('motor'/);
  assert.match(mc, /smart:planned95\(start\)/);
});

test('Monte Carlo pairs memory and motor with same start, heading, profile and controller seed', () => {
  const mc = bodyBetween('monteCarlo = async function', '\nconst driftEl=');
  assert.match(mc, /memory:reactive\('memory',start,heading,\(baseSeed\^0x22222222\)>>>0,profile\)/);
  assert.match(mc, /motor:reactive\('motor',start,heading,\(baseSeed\^0x22222222\)>>>0,profile\)/);
});

test('Monte Carlo reports censored failures instead of pretending they reached 95 percent', () => {
  const mc = bodyBetween('monteCarlo = async function', '\nconst driftEl=');
  assert.match(mc, /return\{distance:dist,reached:count>=need\}/);
  assert.match(mc, /Nådde 95 %/);
  assert.match(mc, /räknas den som misslyckad/);
});

test('Monte Carlo RTK reference starts from the same physical trial start', () => {
  const mc = bodyBetween('monteCarlo = async function', '\nconst driftEl=');
  assert.match(mc, /function planned95\(start\)/);
  assert.match(mc, /smartRoute\(poly,cutWidth,start\)/);
  assert.match(mc, /bfsPath\(start,mowing\[0\]\.p/);
});
