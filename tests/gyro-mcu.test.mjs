import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEstimator, integrateMeasuredWheels, integrateMeasuredWheelGyro,
  observePass, correctPoseFromMotor, makeProfile, mulberry32
} from '../model-core.mjs';

const exact={driftPct:0,seed:1,wheelBase:.5,leftScale:1,rightScale:1,slipSigma:0,gyroBias:0,gyroNoise:0};

test('gyro fusion strongly reduces heading error from asymmetric encoder slip',()=>{
  const wheel=createEstimator({profile:exact}), fused=createEstimator({profile:exact});
  integrateMeasuredWheels(wheel,1,1.3);
  const result=integrateMeasuredWheelGyro(fused,1,1.3,0,{slipThreshold:.05});
  assert.equal(result.slipping,true);
  assert.ok(Math.abs(fused.heading)<Math.abs(wheel.heading)*.1);
});

test('matching wheel and gyro rotation is not flagged as slip',()=>{
  const e=createEstimator({profile:exact});
  const result=integrateMeasuredWheelGyro(e,.8,.8,0,{slipThreshold:.05});
  assert.equal(result.slipping,false);
});

test('motor-localization correction is bounded and motor-only',()=>{
  const m=createEstimator({x:.1,y:.1,profile:exact,useMotor:true,cellSize:.72});
  observePass(m,.05);const x=m.x,y=m.y;
  const r=correctPoseFromMotor(m,1,{minImprovement:.05});
  assert.equal(r.corrected,true);
  assert.ok(Math.hypot(m.x-x,m.y-y)<.3);
  const no=createEstimator({profile:exact,useMotor:false});
  assert.equal(correctPoseFromMotor(no,1).corrected,false);
});

test('PBT fused gyro estimator stays finite for arbitrary sensor disagreement',()=>{
  const r=mulberry32(991);
  for(let i=0;i<1500;i++){
    const e=createEstimator({heading:(r()*2-1)*Math.PI,profile:exact});
    integrateMeasuredWheelGyro(e,(r()*2-1)*2,(r()*2-1)*2,(r()*2-1)*2);
    assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.heading));
    assert.ok(e.heading>-Math.PI-1e-12&&e.heading<=Math.PI+1e-12);
  }
});

test('gyro profile remains tiny and finite across seeds',()=>{
  for(let seed=0;seed<200;seed++){
    const p=makeProfile({driftPct:8,seed});
    assert.ok(Number.isFinite(p.gyroBias)&&Number.isFinite(p.gyroNoise));
    assert.ok(Math.abs(p.gyroBias)<.01&&p.gyroNoise<.01);
  }
});

const overlay=readFileSync(new URL('../engine-6.txt',import.meta.url),'utf8');

test('MCU cruise planner reads learned map only, never true lawn geometry',()=>{
  const start=overlay.indexOf('function chooseCruiseTurn');
  const end=overlay.indexOf('\n}',start)+2;
  const body=overlay.slice(start,end);
  assert.match(body,/Core\.chooseTurn\(w\.learn/);
  assert.doesNotMatch(body,/safeAt|pointInPoly|straightInside|w\.poly/);
});

test('physical motion layer contains gyro fusion and boundary truth separately',()=>{
  assert.match(overlay,/Core\.integrateMeasuredWheelGyro/);
  assert.match(overlay,/if\(!safeAt\(nx,ny,w\.poly,w\.bodyR\)\)/);
  assert.match(overlay,/DR_CRUISE_CANDIDATES/);
  assert.match(overlay,/Core\.correctPoseFromMotor/);
});
