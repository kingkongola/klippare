import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const sources = await Promise.all(
  ['engine-1.txt','engine-2.txt','engine-3.txt','engine-4.txt'].map(async p => {
    const r = await fetch(`${p}?v=24`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Kunde inte ladda ${p}`);
    return r.text();
  })
);

// Legacy typo in the original split engine.
sources[0] = sources[0].replace('i<p.length', 'i<poly.length');

// engine-4 intentionally replaces rebuild() and updateStats() with the
// three-mower versions. Remove the old declarations before evaluating the
// combined source; duplicate declarations are a SyntaxError in module strict mode.
const start = sources[2].indexOf('function rebuild(){');
const end = sources[2].indexOf('function resize()', start);
if (start < 0 || end < 0) throw new Error('Kunde inte patcha presentationslagret');
sources[2] = sources[2].slice(0, start) + sources[2].slice(end);

eval(sources.join('\n'));
