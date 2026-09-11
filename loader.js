import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const sources=await Promise.all(['engine-1.txt','engine-2.txt','engine-3.txt'].map(async p=>{const r=await fetch(p);if(!r.ok)throw new Error(`Kunde inte ladda ${p}`);return r.text()}));
eval(sources.join('\n'));
