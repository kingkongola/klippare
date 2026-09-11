import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import * as Core from './model-core.mjs?v=29';

const files=['engine-1.txt','engine-2.txt','engine-3.txt','engine-4.txt','engine-5.txt'];
const sources=await Promise.all(files.map(async p=>{
  const r=await fetch(`${p}?v=29`,{cache:'no-store'});
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

// Make the Monte Carlo experiment self-explanatory in the UI.
{
  const button=document.getElementById('mcBtn');
  const output=document.getElementById('mc');
  if(button&&output){
    button.textContent='Kör 100 jämförbara försök';
    const box=button.parentElement;
    if(!box.querySelector('.mc-help')){
      const title=document.createElement('strong');
      title.textContent='Testa 100 nya körningar';
      const help=document.createElement('p');
      help.className='mc-help';
      help.innerHTML='Vad händer? Vi nollställer gräsmattan 100 gånger. I varje omgång kör alla fyra strategier på samma form. Slump, DR + minne och DR + minne + klippmotor får samma startpunkt. Modell 2 och 3 får dessutom exakt samma dead-reckoning-fel. Vi stoppar när <strong>95 %</strong> är klippt och jämför körsträckan. <strong>Kortare är bättre.</strong>';
      box.insertBefore(help,button);
      box.insertBefore(title,help);
    }
    const style=document.createElement('style');
    style.textContent='.mc-help{margin:5px 0 12px;color:var(--muted);font-size:.86rem;max-width:950px}.mc-results{margin-top:12px}.mc-summary{font-size:.92rem;line-height:1.45;margin:10px 0 12px}.mc-table{width:100%;border-collapse:collapse;font-size:.82rem}.mc-table th,.mc-table td{padding:8px 7px;border-top:1px solid var(--line);text-align:right;vertical-align:top}.mc-table th:first-child,.mc-table td:first-child{text-align:left}.mc-table th{color:var(--muted);font-weight:650}.mc-win{color:var(--accent);font-weight:750}.mc-note{color:var(--muted);font-size:.78rem;margin-top:9px}@media(max-width:760px){.mc-table{font-size:.72rem}.mc-table th,.mc-table td{padding:7px 4px}}';
    document.head.appendChild(style);
    output.classList.add('mc-results');
  }
}
