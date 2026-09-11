from pathlib import Path
import re
import subprocess

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Demo first, directly below hero.
a = s.index('<section id="experiment">')
b = s.index('</section>', a) + len('</section>')
experiment = s[a:b]
s = s[:a] + s[b:]
m = s.index('<main>') + len('<main>')
s = s[:m] + '\n' + experiment + '\n' + s[m:]
s = s.replace('ljusare gräs = klippt', 'kortare + ljusare gräs = klippt')
s = s.replace(
    'faktisk täckning på ett raster',
    'faktisk täckning på ett raster och ett separat 3D-lager av stående grässtrån som kortas när klippdisken passerar'
)

# Do not shortcut across grey/outside ground.
old = """  if(end<0)return[goal];const rev=[];for(let k=end;k>=0;k=prev[k]){const[x,y]=coord(k);rev.push([b.minX+x*step,b.minY+y*step]);if(prev[k]===-1)break}rev.reverse();rev.push(goal);return rev.filter((_,i)=>i===rev.length-1||i%2===0)\n}"""
new = """  if(end<0)return[goal];
  const rev=[];
  for(let k=end;k>=0;k=prev[k]){
    const[x,y]=coord(k);
    rev.push([b.minX+x*step,b.minY+y*step]);
    if(prev[k]===-1)break;
  }
  rev.reverse();
  rev.push(goal);
  const safe=[];
  let i=0;
  while(i<rev.length){
    safe.push(rev[i]);
    if(i===rev.length-1)break;
    let j=rev.length-1;
    while(j>i+1 && !straightInside(rev[i],rev[j],poly,.40))j--;
    i=j;
  }
  return safe;
}"""
assert old in s, 'bfs target missing'
s = s.replace(old, new, 1)

# Instanced standing grass. Spatial buckets mean only blades under the mower update.
grass = r'''
function makeGrassField(poly,offset){
  const A=areaPoly(poly),count=Math.min(4200,Math.max(1400,Math.floor(A*31)));
  const geom=new THREE.PlaneGeometry(.040,.36);geom.translate(0,.18,0);
  const material=new THREE.MeshStandardMaterial({color:0x3f9148,side:THREE.DoubleSide,roughness:1,metalness:0,vertexColors:true});
  const mesh=new THREE.InstancedMesh(geom,material,count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=false;mesh.receiveShadow=true;
  const data=[],buckets=new Map(),cell=.48,dummy=new THREE.Object3D();
  const freshA=new THREE.Color(0x367f3e),freshB=new THREE.Color(0x58a34f);
  const key=(gx,gy)=>gx+','+gy;
  for(let i=0;i<count;i++){
    const p=randomPoint(poly,.03),x=p[0],y=p[1],angle=Math.random()*Math.PI,h=.23+Math.random()*.20,sx=.72+Math.random()*.65,lean=(Math.random()-.5)*.17;
    data.push({x,y,angle,h,sx,lean,cut:false});
    dummy.position.set(offset+x,.012,y);dummy.rotation.set(lean,angle,(Math.random()-.5)*.08);dummy.scale.set(sx,h/.36,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    mesh.setColorAt(i,freshA.clone().lerp(freshB,Math.random()));
    const gx=Math.floor(x/cell),gy=Math.floor(y/cell),k=key(gx,gy);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);
  }
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;addSim(mesh);
  return{mesh,data,buckets,cell,offset,dummy,key};
}
function cutGrassField(field,x,y,r){
  if(!field)return;
  const {mesh,data,buckets,cell,offset,dummy,key}=field,r2=r*r;
  const gx0=Math.floor((x-r)/cell),gx1=Math.floor((x+r)/cell),gy0=Math.floor((y-r)/cell),gy1=Math.floor((y+r)/cell);
  let changed=false;const cutA=new THREE.Color(0x63a954),cutB=new THREE.Color(0x82ba68);
  for(let gy=gy0;gy<=gy1;gy++)for(let gx=gx0;gx<=gx1;gx++){
    const ids=buckets.get(key(gx,gy));if(!ids)continue;
    for(const i of ids){const d=data[i];if(d.cut)continue;const dx=d.x-x,dy=d.y-y;if(dx*dx+dy*dy>r2)continue;
      d.cut=true;const h=.075+Math.random()*.035;dummy.position.set(offset+d.x,.012,d.y);dummy.rotation.set(d.lean*.25,d.angle,0);dummy.scale.set(d.sx*.95,h/.36,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,cutA.clone().lerp(cutB,Math.random()));changed=true;
    }
  }
  if(changed){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true}
}
'''
marker = 'function createWorld(poly,offset,kind){'
assert marker in s, 'createWorld marker missing'
s = s.replace(marker, grass + '\n' + marker, 1)

old = """  const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x91a196,transparent:true,opacity:.55}));addSim(border);\n\n  const dp=dockPoint(poly),dock=makeDock();"""
new = """  const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x91a196,transparent:true,opacity:.55}));addSim(border);
  const grass=makeGrassField(poly,offset);

  const dp=dockPoint(poly),dock=makeDock();"""
assert old in s, 'grass insertion target missing'
s = s.replace(old, new, 1)

# Smart mower starts at dock, transports to its first mowing row and returns to dock.
old = """  const start=kind==='smart'?dp:randomPoint(poly,.5);\n  const route=kind==='smart'?smartRoute(poly,cutWidth):[];\n  const w={poly,offset,kind,lawn,mower,dockPos:dp,x:start[0],y:start[1],heading:0,speed:kind==='smart'?.48:.43,turnRate:kind==='smart'?1.55:1.35,\n    bodyR:.46,distance:0,elapsed:0,energy:0,batteryWh:kind==='smart'?82:70,battery:1,chargeCount:0,state:'work',reverseLeft:0,turnLeft:0,\n    route,routeIndex:0,routeMow:true,returnRoute:[],returnIndex:0,resume:null,covered:0,texTick:0,done:false};\n  if(kind==='smart'&&route.length){w.x=route[0].p[0];w.y=route[0].p[1];w.routeIndex=1}"""
new = """  const start=kind==='smart'?dp:randomPoint(poly,.5);
  let route=[];
  if(kind==='smart'){
    const mowing=smartRoute(poly,cutWidth);
    if(mowing.length){
      for(const q of bfsPath(dp,mowing[0].p,poly,.45))route.push({p:q,mow:false});
      route.push(...mowing);
      const last=mowing[mowing.length-1].p;
      for(const q of bfsPath(last,dp,poly,.45))route.push({p:q,mow:false});
    }
  }
  const w={poly,offset,kind,lawn,grass,mower,dockPos:dp,x:start[0],y:start[1],heading:0,speed:kind==='smart'?.48:.43,turnRate:kind==='smart'?1.55:1.35,
    bodyR:.46,distance:0,elapsed:0,energy:0,batteryWh:kind==='smart'?82:70,battery:1,chargeCount:0,state:'work',reverseLeft:0,turnLeft:0,
    route,routeIndex:0,routeMow:true,returnRoute:[],returnIndex:0,resume:null,covered:0,texTick:0,done:false};"""
assert old in s, 'smart route target missing'
s = s.replace(old, new, 1)

old = "function markCut(w,dt,active=true){if(active){w.covered+=w.lawn.mark(w.x,w.y,cutWidth/2);w.texTick+=dt;if(w.texTick>.15){w.lawn.draw();w.texTick=0}}}"
new = "function markCut(w,dt,active=true){if(active){w.covered+=w.lawn.mark(w.x,w.y,cutWidth/2);cutGrassField(w.grass,w.x,w.y,cutWidth/2);w.texTick+=dt;if(w.texTick>.15){w.lawn.draw();w.texTick=0}}}"
assert old in s, 'markCut target missing'
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')

module = re.search(r'<script type="module">(.*?)</script>', s, re.S)
assert module, 'module script missing'
check = Path('/tmp/klippare-check.mjs')
check.write_text(module.group(1), encoding='utf-8')
subprocess.run(['node', '--check', str(check)], check=True)
print('Patch applied; JavaScript syntax OK')
