import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STAGES, FOOD, random, TAU, clamp } from './model.js';

const palette = { ink: '#204c50', mint: '#b8ebad', light: '#edfacd', teal: '#489e93', gold: '#f2cd79', pink: '#eba7b6', sand: '#e0d5a2' };
const geo = {
  sphere: new THREE.SphereGeometry(1, 8, 6), box: new THREE.BoxGeometry(1, 1, 1),
  gem: new THREE.OctahedronGeometry(1), cone: new THREE.ConeGeometry(1, 1, 6),
  disc: new THREE.CylinderGeometry(1, 1, .1, 12), ring: new THREE.TorusGeometry(1, .045, 4, 32),bubble:new THREE.TorusGeometry(.23,.07,4,8),
};
const matCache = new Map();
const gradient = new THREE.DataTexture(new Uint8Array([100, 180, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
const creatureMat=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:gradient});
function material(color, unlit = false) {
  const key = color + unlit;
  if (!matCache.has(key)) matCache.set(key, unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshToonMaterial({ color, gradientMap: gradient }));
  return matCache.get(key);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: palette.ink, side: THREE.BackSide });
function mesh(g, color, scale = [1,1,1], pos = [0,0,0], outlined = false, unlit = false) {
  const m = new THREE.Mesh(typeof g === 'string' ? geo[g] : g, material(color, unlit));
  m.scale.set(...scale); m.position.set(...pos);
  if (outlined) { const edge = new THREE.Mesh(m.geometry, outlineMat); edge.scale.setScalar(1.065); m.add(edge); }
  return m;
}
const add = (group, ...meshes) => { meshes.forEach(m => group.add(m)); return meshes[0]; };
const shadowMat = new THREE.MeshBasicMaterial({ color: '#225f67', transparent: true, opacity: .22, depthWrite: false });
function shadow(radius) { const m = new THREE.Mesh(geo.disc, shadowMat); m.scale.set(radius,.05,radius * .7); m.position.y = .025; return m; }

export class OceanScene {
  constructor(canvas) {
    this.canvas = canvas; this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.setClearColor('#45988f');
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog('#63b8aa', 65, 120);
    this.camera = new THREE.OrthographicCamera(-24,24,14,-14,.1,180); this.center = new THREE.Vector3(0,0,0); this.zoom = 1;
    this.scene.add(new THREE.AmbientLight('#bde2c6', 1.25));
    const sun = new THREE.DirectionalLight('#fff6d2', 2.2); sun.position.set(-18,35,14); this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#80cbd5', .8); fill.position.set(10,10,-20); this.scene.add(fill);
    this.water = this.createWater(); this.scene.add(this.water);
    this.decor = new THREE.Group(); this.scene.add(this.decor); this.createWorld();
    this.body = []; this.path = []; this.stage = -1; this.player = new THREE.Group(); this.scene.add(this.player);this.spines=[];
    this.head = new THREE.Group(); this.player.add(this.head);
    this.feet = new THREE.Group(); this.scene.add(this.feet); this.wings = new THREE.Group(); this.head.add(this.wings);
    for (let i=0;i<48;i++) { const b = mesh('sphere', palette.mint, [1,1,1], [0,0,0], true); this.scene.add(b); this.body.push(b); }
    for(let i=0;i<24;i++){const spine=mesh('cone',palette.gold,[.13,.32,.16],[0,0,0],true);this.scene.add(spine);this.spines.push(spine);}
    this.playerShadow = shadow(1.2); this.scene.add(this.playerShadow);
    this.enemyMeshes = new Map(); this.shotMeshes = new Map(); this.hazardMeshes = new Map(); this.zoneMeshes = new Map();this.creatureCache=new Map();
    this.particles = []; this.ripples = []; this.shake = 0; this.flash = 0; this.t = 0; this.lastP = null;
    this.foodMesh = new THREE.InstancedMesh(geo.gem, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 700); this.foodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.foodMesh);
    const glowMat = new THREE.MeshBasicMaterial({ color: '#fff1be', transparent:true, opacity:.16, depthWrite:false });
    this.foodGlow = new THREE.InstancedMesh(geo.disc, glowMat, 700); this.scene.add(this.foodGlow);
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const aspect = innerWidth / innerHeight, h = 360;
    this.width = Math.round(h * aspect); this.height = h;
    this.renderer.setSize(this.width, h, false);
    this.camera.left = -15 * aspect; this.camera.right = 15 * aspect; this.camera.top = 15; this.camera.bottom = -15; this.camera.updateProjectionMatrix();
  }
  createWater() {
    return new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.ShaderMaterial({
      uniforms: { uTime:{value:0}, uStage:{value:0} },
      vertexShader: `varying vec2 vP; void main(){vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `precision highp float; varying vec2 vP; uniform float uTime; uniform float uStage;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec2 p=floor(vP*4.)/4.; float t=floor(uTime*10.)/10.;
          float wave=sin(p.x*.65+sin(p.y*.7+t*.25)*1.8+t*.4)+sin(p.y*.8-p.x*.2-t*.45);
          vec3 base=mix(vec3(.24,.58,.55),vec3(.14,.34,.44),uStage*.15);
          float noise=hash(floor(p*1.1)); base+=step(.6,wave)*.024-step(-.5,-wave)*.012;
          float caustic=sin(p.x*1.8+sin(p.y*1.5+t*.4)*1.6+t*.2)*sin(p.y*1.6+sin(p.x*.8-t*.2));
          base+=step(.84,caustic)*vec3(.055,.09,.06);
          vec2 cell=floor(p/2.8); float sparkle=hash(cell);
          vec2 pt=mod(p,2.8); float glint=step(.968,sparkle)*step(pt.x,.7)*step(pt.y,.22)*step(.4,sin(t*1.5+sparkle*40.));
          base+=glint*.28;
          float d=length(vP); base=mix(base,vec3(.24,.49,.47),smoothstep(64.,76.,d)*.5);
          gl_FragColor=vec4(base,1.);
        }`,
    }));
  }
  createWorld() {
    this.water.rotation.x = -Math.PI/2; this.water.position.y = -.12;
    const rng = random(8841); this.bobbing = [];this.obstacles=[];
    const island = (x,z,r, pink=false) => {
      this.obstacles.push({x,z,rx:r*.95,rz:r*.73});
      const g = new THREE.Group(); g.position.set(x,0,z);
      add(g,mesh('disc','#518c79',[r*1.05,7,r*.8],[0,-.3,0]),mesh('disc',palette.sand,[r,5,r*.76],[0,.1,0]),mesh('disc','#88b58c',[r*.87,3,r*.67],[0,.45,0]));
      for(let j=0;j<5;j++){ const a=rng()*TAU, rr=rng()*r*.65; add(g,mesh('sphere','#b5c993',[.5+rng()*.5,.23,.35],[Math.sin(a)*rr,.7,Math.cos(a)*rr])); }
      if(pink){
        add(g,mesh('box','#786a61',[.45,2.1,.5],[0,1.4,0],true));
        const colors=['#ce8d9b','#e9b4b2','#f3d1c0'];
        for(let j=0;j<7;j++){const a=j*2.4; add(g,mesh('sphere',colors[j%3],[1.25,.8,1.1],[Math.sin(a)*(j>0?1:0),2.5+rng()*.8,Math.cos(a)*(j>0?.8:0)],true));}
      } else {
        for(let j=0;j<3;j++) add(g,mesh('cone','#669d82',[.6,1.5+j*.3,.6],[-1+j*.8,1.2,j%2*.7]));
      }
      this.decor.add(g);
    };
    island(-13,-5,4.6,true); island(15,-12,4.5,true); island(21,15,5); island(-22,19,4,true);
    for(let i=0;i<16;i++){ const a=i/16*TAU, r=38+rng()*24; island(Math.sin(a)*r,Math.cos(a)*r,2+rng()*3,rng()<.4); }
    // A small, weathered moon gate is a landmark in the shallow bay.
    const gate = new THREE.Group(); gate.position.set(12,.2,-2);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.25,.43,4,14,Math.PI*1.65),material('#b8cab2')); arch.rotation.z=-Math.PI*.325; arch.position.y=2.4; gate.add(arch);
    add(gate,mesh('box','#8bad9a',[5,.45,2],[0,.2,0],true),mesh('box','#cad3af',[1,1.6,1.2],[-2.1,1,0],true),mesh('box','#cad3af',[1,1.6,1.2],[2.1,1,0],true));
    for(let i=0;i<4;i++) add(gate,mesh('box','#6e9b84',[.35,.15,.45],[-1+i*.65,4.75,0]));
    this.decor.add(gate);
    for(let i=0;i<200;i++){
      const x=(rng()-.5)*135,z=(rng()-.5)*135;
      if(Math.abs(x)<7&&Math.abs(z)<6)continue;
      if(i%4===0){
        const g = new THREE.Group(); g.position.set(x,.04,z); const r=.5+rng()*.6;
        const leaf=mesh(new THREE.CylinderGeometry(r,r,.06,7,1,false,.3,TAU-.35),'#7ead88',[1,1,.8]); g.add(leaf);
        add(g,mesh('box','#a2cb93',[r*.9,.025,.04],[0,.06,0]));
        if(i%12===0){for(let p=0;p<5;p++){const a=p/5*TAU;const petal=mesh('sphere',p%2?'#efc1be':'#e7a5b4',[.19,.22,.12],[Math.sin(a)*.13,.22,Math.cos(a)*.13]);petal.rotation.z=Math.sin(a)*.5;g.add(petal);}add(g,mesh('gem','#f0d58e',[.09,.12,.09],[0,.35,0]));}
        this.decor.add(g);this.bobbing.push(g);
      } else if(i%4===1){
        const g=new THREE.Group();g.position.set(x,-.08,z);for(let j=0;j<3;j++){const reed=mesh('box',j%2?'#4e9e85':'#8fb493',[.1,.8+rng()*.8,.12],[j*.25,.3,j*.1]);reed.rotation.z=(j-1)*.2;g.add(reed);}this.decor.add(g);
      } else if(i%4===2){const rock=mesh('sphere',rng()<.5?'#78a99c':'#598f88',[.4+rng()*.7,.25+rng()*.45,.4+rng()*.6],[x,.0,z],true);this.decor.add(rock);}
      else { // Sunken stepping stones are visible beneath the clear water.
        add(this.decor,mesh('box','#4e9b92',[.8+rng(),.1,.8+rng()],[x,-.04,z]));
      }
    }
    // Tiny pastel shore mushrooms and reeds.
    for(const [x,z] of [[-9,-4],[-14,-1],[17,-10],[18,-13]]){const g=new THREE.Group();g.position.set(x,.6,z);add(g,mesh('box','#e1d7b3',[.13,.5,.13],[0,.25,0]),mesh('sphere',palette.pink,[.4,.2,.4],[0,.55,0],true));this.decor.add(g);}
    const rim = new THREE.Mesh(new THREE.RingGeometry(69,70,96),new THREE.MeshBasicMaterial({color:'#b3d0a2',transparent:true,opacity:.25,side:THREE.DoubleSide}));rim.rotation.x=-Math.PI/2;rim.position.y=.01;this.decor.add(rim);
  }
  setStage(stage) {
    if(this.stage===stage)return;this.stage=stage;
    this.head.clear();this.wings=new THREE.Group();this.head.add(this.wings);
    const c=STAGES[stage].color;
    add(this.head,mesh('sphere',c,[.78,.65,.88],[0,0,0],true),mesh('sphere',palette.light,[.61,.34,.64],[0,-.27,.42],true));
    for(const side of [-1,1]){
      add(this.head,mesh('sphere','#fff7d4',[.25,.28,.19],[side*.59,.17,.47],true),mesh('sphere',palette.ink,[.12,.18,.09],[side*.65,.17,.6],false,true),mesh('box','#fffce2',[.07,.08,.04],[side*.65-.035,.26,.68],false,true));
      add(this.head,mesh('sphere','#e9acac',[.15,.085,.1],[side*.65,-.12,.62],false,true));
      add(this.head,mesh('box',palette.ink,[.075,.045,.03],[side*.22,-.03,.91],false,true));
      if(stage>=1){const ear=mesh('cone',stage>=3?'#f5ce87':'#5aa99e',[.22,.62,.12],[side*.7,.18,-.3],true);ear.rotation.z=side*-.85;this.head.add(ear);}
      if(stage>=2){const whisker=mesh('box','#fae8af',[.65,.045,.045],[side*.8,-.15,.7]);whisker.rotation.y=side*-.4;this.head.add(whisker);}
      if(stage>=3){const horn=mesh('cone','#f7dc9e',[.17,.9,.16],[side*.43,.85,-.2],true);horn.rotation.z=side*-.23;horn.rotation.x=-.3;this.head.add(horn);add(this.head,mesh('cone','#f7dc9e',[.1,.45,.1],[side*.58,1,-.35],true));}
      if(stage>=4){
        const g=new THREE.Group();g.position.set(side*.5,-.1,-.6);
        const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(side*2.8,1.8);shape.lineTo(side*2.4,.1);shape.lineTo(side*1.7,.4);shape.lineTo(side*1.6,-.6);shape.lineTo(side*.7,-.4);shape.lineTo(0,-.8);
        const wing=mesh(new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false}),'#f4e6b1',[1,1,1],[0,0,0],true);g.add(wing);this.wings.add(g);
        for(let j=0;j<3;j++){const vein=mesh('box','#dfa978',[.07,1.8-j*.3,.13],[side*(.6+j*.5),.15,-.03]);vein.rotation.z=side*-.7;g.add(vein);}
      }
    }
    add(this.head,mesh('box',palette.ink,[.22,.035,.025],[0,-.28,1.02],false,true));
    for(const b of this.body)b.material=material(c);
    this.feet.clear();
    if(stage>=2)for(let i=0;i<4;i++){const foot=new THREE.Group();const s=i%2?1:-1;add(foot,mesh('sphere',c,[.19,.23,.5],[s*.2,-.1,0],true),mesh('sphere',palette.light,[.26,.15,.28],[s*.4,-.28,.25],true));this.feet.add(foot);}
  }
  makeEnemy(e) {
    const g=new THREE.Group(), type=e.type, bodyColors=['#e5b78e','#ed9eaa','#beb1dc','#9ac5d9','#cf9fbf','#e7b48d','#c4a4e0','#99bda3','#9cabc9'];
    const c=bodyColors[type]||palette.pink, boss=!!e.boss;
    g.add(shadow(boss?2.4:.75));
    const creature=new THREE.Group();creature.position.y=boss?1.15:.55;g.add(creature);g.userData.creature=creature;
    if(type===0||type===4||type===8){
      add(creature,mesh('sphere',c,[.48,.38,.74],[0,0,0],true),mesh('cone',c,[.45,.5,.15],[0,0,-.8],true));creature.children.at(-1).rotation.x=Math.PI/2;
      const fin=mesh('cone','#f3cfa2',[.18,.3,.2],[0,.4,-.1]);creature.add(fin);
      if(type>=4)for(const s of [-1,1]){const f=mesh('cone',palette.gold,[.1,.5,.2],[s*.4,.3,.1]);f.rotation.z=s*-.6;creature.add(f);}
    } else if(type===1||type===5){
      add(creature,mesh('sphere',c,[.6,.33,.5],[0,0,0],true));
      for(const s of [-1,1]){for(let i=0;i<3;i++){const leg=mesh('box',c,[.55,.1,.1],[s*.55,-.15,-.35+i*.3],true);leg.rotation.y=s*.4;creature.add(leg);}add(creature,mesh('sphere',c,[.3,.3,.38],[s*.85,.05,.5],true));const claw=mesh('cone','#f7d4b4',[.14,.35,.14],[s*.87,.3,.67]);claw.rotation.x=.8;creature.add(claw);}
    } else if(type===2||type===3||type===6){
      const dome=mesh(new THREE.SphereGeometry(1,8,4,0,TAU,0,Math.PI*.63),c,[.64,.5,.64],[0,.2,0],true);creature.add(dome);
      add(creature,mesh('disc','#f1d4d4',[.62,.7,.62],[0,0,0]));
      for(let j=0;j<5;j++){const a=j/5*TAU;const tent=mesh('box',j%2?c:'#e1c6ce',[.11,.65,.12],[Math.sin(a)*.4,-.35,Math.cos(a)*.4],true);tent.rotation.z=Math.sin(a)*.25;creature.add(tent);}
      add(creature,mesh('gem','#fff0ba',[.17,.22,.17],[0,.5,0],false,true));
    } else if(type===7){
      add(creature,mesh('sphere',c,[.8,.5,1],[0,0,0],true),mesh('sphere','#b7d0a4',[.3,.25,.35],[0,-.15,1.1],true));for(const s of [-1,1])for(const z of [-.6,.6])add(creature,mesh('sphere','#8da996',[.35,.17,.35],[s*.7,-.25,z],true));
      add(creature,mesh('gem','#d3dfa9',[.55,.25,.65],[0,.5,0],true));
    }
    for(const s of [-1,1]){add(creature,mesh('sphere','#fff5d4',[.16,.18,.13],[s*.29,.12,.58],false,true),mesh('box',palette.ink,[.08,.12,.07],[s*.29,.13,.69],false,true));}
    if(boss){
      creature.scale.setScalar(2.6+this.stage*.16);
      const crown=new THREE.Group();for(let j=-1;j<=1;j++)add(crown,mesh('cone',palette.gold,[.12,.35+(j===0?.15:0),.12],[j*.22,.6,0],true));creature.add(crown);
      const halo=new THREE.Mesh(geo.ring,new THREE.MeshBasicMaterial({color:'#ffbfa1',transparent:true,opacity:.5}));halo.rotation.x=-Math.PI/2;halo.scale.setScalar(e.radius+1);halo.position.y=.1;g.add(halo);g.userData.halo=halo;
    }
    // Bake each species once into vertex-coloured geometry: two draw calls for
    // the entire creature, rather than a draw call per eye, leg and outline.
    if(!this.creatureCache.has(type)){
      creature.updateMatrixWorld(true);const inverse=creature.matrixWorld.clone().invert(),parts=[],edges=[];
      creature.traverse(m=>{if(!m.isMesh)return;let geometry=m.geometry.clone();if(geometry.index)geometry=geometry.toNonIndexed();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld));
        if(m.material===outlineMat){edges.push(geometry);return;}
        const colors=new Float32Array(geometry.attributes.position.count*3),c=m.material.color;for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);
      });
      const bodyGeo=mergeGeometries(parts),edgeGeo=edges.length?mergeGeometries(edges):null;
      this.creatureCache.set(type,{bodyGeo,edgeGeo});parts.forEach(g=>g.dispose());edges.forEach(g=>g.dispose());
    }
    const cached=this.creatureCache.get(type);creature.clear();
    creature.add(new THREE.Mesh(cached.bodyGeo,creatureMat));if(cached.edgeGeo)creature.add(new THREE.Mesh(cached.edgeGeo,outlineMat));
    this.scene.add(g);return g;
  }
  sync(map, items, create, update) {
    const live=new Set();
    for(const e of items){live.add(e.id);let m=map.get(e.id);if(!m){m=create(e);map.set(e.id,m);}update(m,e);}
    for(const [id,m]of map)if(!live.has(id)){this.remove(m);map.delete(id);}
  }
  remove(m){this.scene.remove(m);const shared=new Set([...matCache.values(),creatureMat,outlineMat,shadowMat]);m.traverse(q=>{if(q.isMesh&&!shared.has(q.material))q.material.dispose();});}
  burst(x,z,color,n=10,big=false){
    for(let i=0;i<n;i++){if(this.particles.length>250)break;const m=mesh('box',color,[.09,.09,.09],[x,.6,z],false,true);this.scene.add(m);const a=Math.random()*TAU;this.particles.push({m,vx:Math.sin(a)*(1+Math.random()*3),vz:Math.cos(a)*(1+Math.random()*3),vy:1+Math.random()*4,life:big?1.2:.5+Math.random()*.3,max:1});}
  }
  ripple(x,z,color='#cff3c7',size=1){const m=new THREE.Mesh(geo.ring,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.08,z);this.scene.add(m);this.ripples.push({m,t:0,size});}
  project(x,z,y=0){const v=new THREE.Vector3(x,y,z).project(this.camera);return {x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2};}
  pointer(x,y){this.ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),this.camera);const v=new THREE.Vector3();this.ray.ray.intersectPlane(this.plane,v);return {x:v.x,z:v.z};}
  render(game,dt,{menu=false,deferRender=false}={}) {
    this.t+=dt;const t=this.t,p=game.p;this.setStage(game.stage);
    const target=menu?new THREE.Vector3(3.5,0,0):new THREE.Vector3(p.x,0,p.z-1.5);
    this.center.lerp(target,1-Math.exp(-dt*4));
    if (!this.isInk) {
      const end=game.status==='ascending'||game.status==='won';
      const zoom=menu?.94:game.boss?.87:end?.84:1;this.camera.zoom=THREE.MathUtils.lerp(this.camera.zoom,zoom,dt*2);this.camera.updateProjectionMatrix();
      this.shake=Math.max(0,this.shake-dt*3);
      this.camera.position.set(this.center.x+(Math.random()-.5)*this.shake,this.center.y+30,this.center.z+25);this.camera.lookAt(this.center.x,0,this.center.z);
      this.water.material.uniforms.uTime.value=t;this.water.material.uniforms.uStage.value=game.stage;
      let px=p.x,pz=p.z,angle=p.angle;
      if(menu){px=6+Math.sin(t*.38)*1.6;pz=2+Math.cos(t*.38)*.8;angle=.45+Math.sin(t*.38)*.25;}
      const rise=end?Math.min(10,game.ascend*1.3):0,scale=menu?1.65:1.2+game.stage*.19;
      this.player.position.set(px,.72+Math.sin(t*3)*.045+rise,pz);this.player.rotation.y=angle;this.head.scale.setScalar(scale);this.head.rotation.z=Math.sin(t*3)*.025;
      this.player.visible=!(p.invul>.05&&p.invul<.75&&Math.floor(t*16)%2===0);
      this.playerShadow.position.set(px,.02,pz);this.playerShadow.scale.set(1.3*scale,.05,scale*.9);
      if(!this.lastP||Math.hypot(px-this.lastP.x,pz-this.lastP.z)>.07){this.path.unshift({x:px,z:pz});if(this.path.length>1000)this.path.length=1000;this.lastP={x:px,z:pz};}
      const count=Math.min(48,Math.floor(p.body)),spacing=.59*scale;let seg=0,cursor=0;
      const positions=[];
      for(let i=0;i<count;i++){
        const b=this.body[i],wanted=(i+1)*spacing;let at=null;
        while(cursor<this.path.length-1){const a=this.path[cursor],q=this.path[cursor+1],d=Math.hypot(a.x-q.x,a.z-q.z);if(seg+d>=wanted){const f=(wanted-seg)/Math.max(.001,d);at={x:THREE.MathUtils.lerp(a.x,q.x,f),z:THREE.MathUtils.lerp(a.z,q.z,f)};break;}seg+=d;cursor++;}
        if(!at){const last=this.path.at(-1)||{x:px,z:pz};const tail=Math.max(0,wanted-seg);at={x:last.x-Math.sin(angle)*tail,z:last.z-Math.cos(angle)*tail};}
        const taper=Math.max(.21,1-Math.pow(i/count,3)*.79),wiggle=Math.sin(t*4-i*.55)*.05;
        b.visible=this.player.visible;b.position.set(at.x+wiggle,.51*scale+Math.sin(t*3-i*.45)*.045+rise,at.z);b.scale.set(.53*scale*taper,.43*scale*taper,.56*scale*taper);b.rotation.y=angle;positions.push(at);
      }
      for(let i=count;i<this.body.length;i++)this.body[i].visible=false;
      this.spines.forEach((spine,i)=>{const b=this.body[i*2];spine.visible=game.stage>=1&&i*2<count&&b.visible;if(spine.visible){spine.position.copy(b.position);spine.position.y+=b.scale.y*.93;spine.scale.set(.12*scale,.32*scale,.18*scale);spine.material=material(game.stage>=3?'#efd293':'#5da99c');}});
      this.feet.visible=game.stage>=2;
      this.feet.children.forEach((f,i)=>{const at=positions[i<2?2:Math.min(7,count-1)];if(at){f.position.set(at.x+(i%2?1:-1)*.7*scale,.55+rise,at.z);f.rotation.y=angle;f.rotation.x=Math.sin(t*5+i*Math.PI)*.2;f.scale.setScalar(scale);}});
      this.wings.children.forEach((wing,i)=>wing.rotation.y=Math.sin(t*4)*(i?-.25:.25));
      const d=this.dummy;let glowing=0;
      this.foodMesh.count=Math.min(game.food.length,700);
      game.food.slice(0,700).forEach((f,i)=>{
        const size=.12+f.rank*.045;d.position.set(f.x,.25+Math.sin(t*2+f.phase)*.1,f.z);d.rotation.set(0,t*.8+f.phase,Math.PI/4);d.scale.set(size,size*(f.rank>1?1.4:1),size);d.updateMatrix();this.foodMesh.setMatrixAt(i,d.matrix);this.foodMesh.setColorAt(i,this.color.set(FOOD[f.rank].color));
        if(f.rank>=2){d.position.y=.015;d.rotation.set(0,0,0);d.scale.set(.36+f.rank*.12,.1,.36+f.rank*.12);d.updateMatrix();this.foodGlow.setMatrixAt(glowing++,d.matrix);}
      });
      this.foodMesh.instanceMatrix.needsUpdate=true;if(this.foodMesh.instanceColor)this.foodMesh.instanceColor.needsUpdate=true;this.foodGlow.count=glowing;this.foodGlow.instanceMatrix.needsUpdate=true;
    }
    this.sync(this.enemyMeshes,game.enemies,e=>this.makeEnemy(e),(m,e)=>{m.position.set(e.x,0,e.z);m.rotation.y=e.angle;const c=m.userData.creature;c.position.y=(e.boss?1.1:.55)+Math.sin(t*4+e.phase)*.08;c.rotation.z=Math.sin(t*5+e.phase)*.06;c.scale.setScalar((e.boss?2.6+game.stage*.16:1)*(e.hit>0?1.12:1));if(m.userData.halo)m.userData.halo.rotation.z=t*.5;});
    this.sync(this.shotMeshes,game.shots,e=>{const m=e.kind==='bubble'?new THREE.Mesh(geo.bubble,material('#d4f5e3',true)):mesh('gem','#b1e98b',[.22,.22,.4],[0,0,0],true,true);if(e.kind==='bubble')m.rotation.x=-.6;this.scene.add(m);return m;},(m,e)=>{m.position.set(e.x,.9,e.z);m.rotation.z=t*2;});
    this.sync(this.hazardMeshes,game.hazards.filter(hazard=>!hazard.wave&&(!this.isInk||!hazard.warning)),e=>{let m;if(e.warning){m=new THREE.Group();const ring=new THREE.Mesh(geo.ring,new THREE.MeshBasicMaterial({color:'#ff8c84',transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.scale.setScalar(e.radius);m.add(ring);const circle=new THREE.Mesh(geo.disc,new THREE.MeshBasicMaterial({color:'#d76f7f',transparent:true,opacity:.25}));circle.scale.set(e.radius,.02,e.radius);m.add(circle);}else m=mesh('gem','#fa9b9f',[.24,.24,.24],[0,0,0],true,true);this.scene.add(m);return m;},(m,e)=>{m.position.set(e.x,e.warning?.1:.6,e.z);if(e.warning)m.scale.setScalar(.95+Math.sin(t*16)*.05);else m.rotation.y=t*3;});
    if (!this.isInk) this.sync(this.zoneMeshes,game.zones,e=>{const m=new THREE.Group();const color=e.kind==='fire'?'#ffcd8e':'#caefdf';for(let i=0;i<4;i++){const r=new THREE.Mesh(geo.ring,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6-i*.08}));r.rotation.x=-Math.PI/2;r.scale.setScalar(e.radius*(.5+i*.15));r.position.y=.08+i*.035;m.add(r);}this.scene.add(m);return m;},(m,e)=>{m.position.set(e.x,0,e.z);m.rotation.y=t*2;});
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.scene.remove(p.m);this.particles.splice(i,1);continue;}p.vy-=dt*7;p.m.position.x+=p.vx*dt;p.m.position.z+=p.vz*dt;p.m.position.y+=p.vy*dt;p.m.rotation.x+=dt*5;p.m.scale.setScalar(Math.min(.14,p.life*.3));}
    for(let i=this.ripples.length-1;i>=0;i--){const r=this.ripples[i];r.t+=dt;if(r.t>1){this.scene.remove(r.m);r.m.material.dispose();this.ripples.splice(i,1);continue;}r.m.scale.setScalar((.2+r.t*2)*r.size);r.m.material.opacity=(1-r.t)*.5;}
    this.bobbing.forEach((g,i)=>g.position.y=.03+Math.sin(t*1.6+i)*.035);
    if(!deferRender)this.present(game,dt,{menu});
  }
  present(){this.renderer.render(this.scene,this.camera);}
  reset(){this.path=[];this.lastP=null;for(const map of [this.enemyMeshes,this.shotMeshes,this.hazardMeshes,this.zoneMeshes]){for(const m of map.values())this.remove(m);map.clear();}for(const p of this.particles)this.scene.remove(p.m);this.particles=[];for(const r of this.ripples)this.remove(r.m);this.ripples=[];}
}
