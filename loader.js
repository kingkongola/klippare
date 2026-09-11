import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import * as Core from './model-core.mjs?v=28';

const files=['engine-1.txt','engine-2.txt','engine-3.txt','engine-4.txt','engine-5.txt'];
const sources=await Promise.all(files.map(async p=>{
  const r=await fetch(`${p}?v=28`,{cache:'no-store'});
  if(!r.ok)throw new Error(`Kunde inte ladda ${p}`);
  return r.text();
}));

// Legacy typo exists only in scanIntersections(). Patch that exact loop.
sources[0]=sources[0].replace(
  'j=poly.length-1;i<p.length;j=i++',
  'j=poly.length-1;i<poly.length;j=i++'
);

// engine-4 replaces the old 2-mower presentation layer. Remove the old
// rebuild/updateStats declarations from engine-3.
const start=sources[2].indexOf('function rebuild(){');
const end=sources[2].indexOf('function resize()',start);
if(start<0||end<0)throw new Error('Kunde inte patcha presentationslagret');
sources[2]=sources[2].slice(0,start)+sources[2].slice(end);

// Do not start the simulation until engine-5 has installed the honest
// four-model sensor-ablation layer.
sources[2]=sources[2].replace(/\nrebuild\(\);\s*$/,'\n');

eval(sources.join('\n')+'\nrebuild();\n');
