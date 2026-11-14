import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createInkFoodGeometry } from './fauna-geometry.js';
import { surfaceHeightSampler } from './warnings.js';
import { flightBand } from '../rules.js';

const { clamp, lerp, smoothstep, smootherstep } = THREE.MathUtils;
const sceneTints = {
  water: '#356f70', waterActive: '#397f78', gold: '#b4731c', lightGold: '#c9974f',
  red: '#a22820', darkRed: '#642622', ink: '#263538', porcelain: '#a2b6b3', steel: '#3e717a',
};
const up = new THREE.Vector3(0,1,0);
const oathTints = {
  mirror:'#265984', mirrorRim:'#536c79', tether:'#277567', tetherRim:'#427c68',
};
const artifactLifetimes = { catch:.55, counter:.65, tether:.84, undertow:.82, intercept:.42 };
const aimedStart = new THREE.Vector3();
const aimedEnd = new THREE.Vector3();
const artifactFlightSpeed=23.5;
const siteNames = {
  whirlpool: '回潮水眼', sword: '分水古剑', pigment: '山海墨髓', crane: '仙鹤衔羽',
  palm: '金身落掌', gates: '朱阙三封', carp: '白鲤寻珠', spring: '潮门夺珠', oath: '水誓古龛',
  wild: '镇潮四阵',
};
const gritGLSL = /* glsl */ `
  float tooth(vec2 p){
    vec3 q=fract(vec3(p.xyx)*.1031);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
  }
  float grainAt(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(tooth(i),tooth(i+vec2(1,0)),f.x),mix(tooth(i+vec2(0,1)),tooth(i+1.),f.x),f.y);
  }
  float fibers(vec2 p){return tooth(floor(gl_FragCoord.xy)+floor(p*7.));}
`;
const vertexShader = /* glsl */ `
  uniform float uTime;
  #ifdef WONDER_FISH
    attribute vec4 faunaPaint;
    attribute vec2 inkGuides;
    varying vec4 vFauna;
    varying vec2 vGuides;
  #endif
  varying vec2 vUv;
  varying vec3 vLocal,vNormal,vWorld;
  void main(){
    vUv=uv;vLocal=position;vNormal=normalize(normalMatrix*normal);
    vec3 p=position;
    #ifdef WONDER_FISH
      float tail=smoothstep(.10,1.04,-p.z);
      p.x+=sin(uTime*6.6+p.z*4.)*tail*.31;
      vFauna=faunaPaint;
      vGuides=inkGuides;
    #endif
    vec4 world=modelMatrix*vec4(p,1.);
    vWorld=world.xyz;
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;
const washFragment = /* glsl */ `
  uniform float uOpacity,uTime,uProgress,uMode,uLoad,uClearHead;
  uniform vec3 uHead;
  varying vec2 vUv;
  varying vec3 vLocal,vNormal,vWorld;
  ${gritGLSL}
  vec4 surfacePaint(){
    vec2 p=vLocal.xy+vLocal.z*vec2(.73,.37);
    float paper=fibers(p);
    float wash=grainAt(p*vec2(8.,3.));
    vec3 normal=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
    float light=.5+.5*dot(normal,normalize(vec3(-.48,.71,.51)));
    float lamina=grainAt(p*vec2(21.,9.)+wash);
    float lightWash=.60*light+.30*wash+.10*paper;
    float reflectance=1.-uLoad*(.75+.42*(1.-lightWash));
    float reserve=smoothstep(.63,.96,lightWash+.11*lamina)*(.17+.12*uMode);
    float headReserve=uClearHead*.57*(1.-smoothstep(1.45,4.2,length((vWorld-uHead)*vec3(1.,1.25,1.))));
    float alpha=uOpacity*(1.-headReserve);
    return vec4(clamp(reflectance,.045,.96),reserve,paper,alpha);
  }
`;
const strokeFragment = /* glsl */ `
  uniform float uOpacity,uTime,uProgress,uMode,uLoad;
  varying vec2 vUv;
  ${gritGLSL}
  vec4 surfacePaint(){
    float along=vUv.x,side=vUv.y*2.-1.;
    float paper=fibers(vUv);
    float wash=grainAt(vec2(along*13.,side*8.));
    float fine=grainAt(vec2(along*22.,side*49.));
    float end=pow(max(.0,sin(along*3.141593)),.25);
    float margin=abs(side)+.10*(wash-.50)+.09*(fine-.5);
    float edge=1.-smoothstep(.63,.98,margin);
    float tip=mix(end,1.,step(.5,uMode));
    float split=.14+.28*sin(along*7.2)+.1*(wash-.5);
    float dry=(1.-smoothstep(.03,.26,abs(side-split)))*smoothstep(.37,.81,along)*fine;
    float reserve=clamp(uProgress*(.32+.52*dry),.0,.83);
    float pressure=(.72+.28*wash)*(.79+.21*paper);
    float ink=clamp(uLoad*(.80+.26*wash),.0,.96);
    return vec4(1.-ink,reserve,paper,edge*tip*uOpacity*pressure);
  }
`;
const spiralFragment = /* glsl */ `
  uniform float uOpacity,uTime,uProgress,uMode,uLoad,uInner;
  varying vec2 vUv;
  ${gritGLSL}
  vec4 surfacePaint(){
    vec2 point=vUv*2.-1.;
    float radius=length(point);
    float a=atan(point.y,point.x);
    float grain=fibers(point);
    float rough=grainAt(point*13.);
    float fine=grainAt(point*vec2(57.,43.));
    float deep=step(1.5,uMode),speed=mod(uMode,2.);
    float turn=(3.+deep)*a+15.2*pow(max(radius,.01),.74)+uTime*(1.48+1.24*speed)+.46*(rough-.5);
    float spiral=.5+.5*cos(turn);
    float body=smoothstep(.24,.91,spiral);
    float threads=smoothstep(.71,.98,.5+.5*cos(turn-.68));
    float lip=(1.-smoothstep(.035,.19,abs(sin((turn-.47)*.5))));
    float cut=smoothstep(.26,.65,fine*.63+grain*.19+rough*.20);
    float rim=1.-smoothstep(.85,1.,radius+(rough-.5)*.029);
    float darkEye=1.-smoothstep(uInner*.30,uInner*1.01,radius+.041*(rough-.5));
    float halo=(1.-smoothstep(.018,.044,abs(radius-.94)))
      *smoothstep(.28,.83,.54+.34*cos(a*5.+.57)+.15*rough);
    float rimAngle=fract((a+1.570796+6.283185)/6.283185);
    float progress=(1.-smoothstep(.013,.034,abs(radius-.955)))
      *smoothstep(0.,.018,rimAngle)*(1.-smoothstep(uProgress-.012,uProgress+.006,rimAngle))
      *step(.007,uProgress);
    float brow=(1.-smoothstep(.006,.022,abs(radius-uInner)))*(.44+.56*cut);
    float dark=clamp(darkEye*.88+body*(.59+.18*deep)+halo*.44+progress*.30,0.,.94);
    float white=max(max(lip*cut*.89,threads*cut*.45)*(1.-darkEye),max(progress*.60,brow*.75));
    float base=(.16+.22*speed+.14*deep)*uLoad;
    float coverage=rim*max((base+.45*darkEye+.41*body)*(.72+.28*rough),white*.88);
    coverage=max(coverage,halo*.56+progress*.33);
    return vec4(1.-dark,white,grain,coverage*uOpacity);
  }
`;
const carpFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vLocal,vNormal;
  varying vec4 vFauna;
  varying vec2 vGuides;
  ${gritGLSL}
  void carpTones(out float ink,out float reserve,out float grain){
    vec2 p=vLocal.xz+vLocal.y*vec2(.86,-.32);
    grain=fibers(p);
    float wash=grainAt(p*vec2(13.,8.));
    float fine=grainAt(p*vec2(45.,37.));
    float membrane=step(1.5,vFauna.z)*(1.-step(2.5,vFauna.z));
    float cut=smoothstep(.17,.80,vFauna.y);
    float dorsal=smoothstep(-.06,.23,vLocal.y);
    float eyeSide=smoothstep(.41,.61,vLocal.z)*(1.-smoothstep(.68,.77,vLocal.z));
    float body=.14+.16*wash+.29*vGuides.x+.19*dorsal+.14*eyeSide;
    float fin=.66+.26*wash+.14*vGuides.x-.21*cut;
    ink=mix(body,fin,membrane);
    reserve=clamp(.26*vGuides.y+.12*fine+(.19+.25*cut)*membrane,0.,.62);
  }
  vec4 surfacePaint(){
    float ink,reserve,grain;
    carpTones(ink,reserve,grain);
    return vec4(1.-ink,reserve,grain,uOpacity);
  }
`;
const mirrorFragment = /* glsl */ `
  uniform float uOpacity,uTime,uMode;
  varying vec3 vLocal;
  ${gritGLSL}
  void mirrorTones(out float ink,out float reserve,out float paper){
    vec2 p=vLocal.xy;
    paper=fibers(p);
    float r=length(p);
    float pool=grainAt(p*11.);
    float crescent=1.-smoothstep(.022,.078,abs(length(p-vec2(.18,.17))-.39));
    float streak=1.-smoothstep(.03,.11,abs(p.x-p.y*.49-.12+.06*sin(p.y*8.)));
    float gloss=.47*crescent+.49*streak;
    ink=clamp(.39+.36*smoothstep(.19,.77,r)+.15*pool-.21*gloss,.11,.89);
    reserve=clamp((gloss*.69+.20*pool)*(.85+.15*sin(uTime*2.+uMode)),0.,.79);
  }
  vec4 surfacePaint(){
    float ink,reserve,paper;
    mirrorTones(ink,reserve,paper);
    return vec4(1.-ink,reserve,paper,uOpacity);
  }
`;
const springFragment = /* glsl */ `
  uniform float uOpacity,uTime,uProgress,uMode,uLoad;
  varying vec2 vUv;
  ${gritGLSL}
  vec4 surfacePaint(){
    vec2 point=vUv*2.-1.;
    float r=length(point),a=atan(point.y,point.x);
    float paper=fibers(point);
    float rough=grainAt(point*16.);
    float fine=grainAt(point*63.);
    float lift=fract(r*3.25-uTime*(1.10+1.10*uMode)+.053*(rough-.5));
    float band=1.-smoothstep(.05,.19,abs(lift-.48));
    float cut=smoothstep(.21,.70,rough*.64+.24*fine+.18*paper);
    float veil=(1.-smoothstep(.34,1.02,r))*.21;
    float hollow=1.-smoothstep(.12,.28,r);
    float bank=(1.-smoothstep(.013,.047,abs(r-.95)))
      *(.32+.68*smoothstep(.13,.70,rough+sin(a*9.)*.17));
    float ring=band*cut*(1.-smoothstep(.75,1.0,r));
    float fill=(1.-smoothstep(.008,.024,abs(r-.85)))
      *(1.-smoothstep(uProgress-.02,uProgress+.02,fract((a+1.5708)/6.283185)))*step(.001,uProgress);
    float ink=clamp(ring*.39+bank*.63+fill*.47+hollow*.57+veil*.45,0.,.92);
    float reserve=max(ring*.60,fill*.63);
    float alpha=max(max(bank*.85,ring*.72),max(hollow*.76,veil+fill*.65));
    return vec4(1.-ink,reserve,paper,alpha*uOpacity*uLoad);
  }
`;

// Keep the pigment mask in register with torn and fading brush coverage.
function makePaint(geometry, tint, fragment=washFragment, {
  load=.64, order=8, depthWrite=false, side=THREE.DoubleSide, defines={},
}={}) {
  const uniforms = {
    uOpacity: { value: 1 }, uProgress: { value: 0 }, uMode: { value: 0 },
    uLoad: { value: load }, uTime: { value: 0 }, uInner: { value: .22 },
    uClearHead: { value: 0 }, uHead: { value: new THREE.Vector3() },
    uSurface: { value: new THREE.Vector3() },
  };
  const paint = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader, fragmentShader: `${fragment}
      void main(){vec4 paint=surfacePaint();if(paint.a<.012)discard;gl_FragColor=paint;}`,
    transparent: !depthWrite, depthWrite, side, forceSinglePass: true,
  });
  paint.allowOverride=depthWrite;
  const id = new THREE.ShaderMaterial({
    defines, vertexShader, fragmentShader: `uniform vec3 uSurface;uniform float uHold;${fragment}
      void main(){if(surfacePaint().a<.34)discard;gl_FragColor=vec4(uSurface.xy,uHold,1.);}`,
    side,
    uniforms: {...uniforms,uHold:{value:0}},
  });
  id.allowOverride=depthWrite;
  id.onBeforeRender=(_renderer,_scene,_camera,_geometry,object)=>{
    id.uniforms.uHold.value=.65*(object.userData.inkMineralHold??0);
    id.uniformsNeedUpdate=true;
  };
  const mesh = new THREE.Mesh(geometry, paint);
  Object.assign(mesh.userData, { inkTint: tint, inkTintAmount: .90, inkSurfaceMaterial: id });
  mesh.renderOrder = order;
  return mesh;
}

function stroke(mesh, opacity, time, progress=0, mode=0) {
  const { uniforms } = mesh.material;
  uniforms.uOpacity.value = opacity;
  uniforms.uTime.value = time;
  uniforms.uProgress.value = progress;
  uniforms.uMode.value = mode;
  mesh.visible = opacity > .008;
}

const reserveStroke = /* glsl */ `
  uniform float uOpacity,uMode;
  varying vec2 vUv;
  ${gritGLSL}
  vec4 surfacePaint(){
    float paper=fibers(vUv),cross=abs(vUv.y*2.-1.);
    float ragged=(grainAt(vUv*vec2(35.,19.))-.5)*.13;
    float coverage=(1.-smoothstep(.78,1.,cross+ragged))*uOpacity;
    float edge=smoothstep(.58,.82,cross+ragged);
    float dark=mix(.29,.085,uMode);
    return vec4(mix(.91,dark,edge),.59*(1.-edge),paper,coverage);
  }
`;

const gateAirWash = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  ${gritGLSL}
  vec4 surfacePaint(){
    vec2 p=vUv*2.-1.;
    float paper=fibers(vUv);
    float dry=grainAt(vec2(p.x*18.,p.y*47.));
    float edges=(1.-smoothstep(.56,1.,abs(p.x)+.11*(dry-.5)))
      *(1.-smoothstep(.44,1.,abs(p.y)+.18*(dry-.5)));
    float strands=.72+.28*dry;
    return vec4(.86+.11*dry,.77,paper,uOpacity*edges*strands);
  }
`;

const wildSeaWash = /* glsl */ `
  uniform float uOpacity,uTime,uMode,uProgress;
  varying vec2 vUv;
  ${gritGLSL}
  void wildTones(out float ink,out float reserve,out float paper,out float alpha){
    vec2 p=vUv*2.-1.;
    float r=length(p);
    float angle=atan(p.y,p.x);
    paper=fibers(p);
    float dry=grainAt(p*25.);
    float grit=grainAt(p*83.);
    float seam=.008+.024*dry;
    float outside=1.-smoothstep(.014,.039,abs(r-.96)+(dry-.5)*.016);
    float inside=1.-smoothstep(.008,.021,abs(r-.89)+(grit-.5)*.022);
    float four=1.-smoothstep(.11,.28,abs(sin(angle*2.)));
    float knot=four*(1.-smoothstep(.05,.071,abs(r-.87)+seam));
    float stains=1.-smoothstep(.09,.25,r+(dry-.5)*.056);
    float orbit=fract((angle+1.5708)/6.283185);
    float progress=(1.-smoothstep(.009,.024,abs(r-.928)))
      *(1.-smoothstep(uProgress-.015,uProgress+.008,orbit))*step(.007,uProgress);
    float tide=.63+.29*sin(angle*7.+uTime*1.8)+.08*dry;
    ink=clamp(outside*.79+inside*.42+knot*.69+stains*.91+progress*.67,0.,.94);
    reserve=progress*.45;
    alpha=uOpacity*max(max(outside*(.63+.37*tide),inside*.52),max(knot*.81,max(stains*.60,progress*.74)));
  }
  vec4 surfacePaint(){
    float ink,reserve,paper,alpha;
    wildTones(ink,reserve,paper,alpha);
    return vec4(1.-ink,reserve,paper,alpha);
  }
`;

const reticleInk = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  ${gritGLSL}
  float diamond(vec2 p){return abs(p.x)+abs(p.y)*1.01;}
  float line(vec2 p,vec2 a,vec2 b){
    vec2 span=b-a;
    return length(p-a-span*clamp(dot(p-a,span)/dot(span,span),0.,1.));
  }
  vec4 surfacePaint(){
    vec2 p=vUv*2.-1.;
    float fiber=fibers(vUv);
    float rough=(grainAt(vUv*22.)-.5)*.031;
    float d=diamond(p)+rough;
    float outside=1.-smoothstep(.87,.98,d);
    float edge=smoothstep(.70,.86,d);
    float glyph;
    #ifdef ALIGNED
      glyph=1.-smoothstep(.035,.076,abs(d-.38));
    #else
      float v=min(line(p,vec2(-.30,-.026),vec2(.0,.278)),line(p,vec2(.0,.278),vec2(.30,-.026)));
      v=min(v,line(p,vec2(.0,-.32),vec2(.0,.244)));
      glyph=1.-smoothstep(.045,.081,v);
    #endif
    float ink=max(glyph,edge*.91);
    return vec4(mix(.96,.055,ink),.52*(1.-ink),fiber,outside*uOpacity*(.94+.06*fiber));
  }
`;

function reserveMark(geometry, order, danger=false, hidden=false) {
  const mesh=makePaint(geometry,sceneTints.ink,reserveStroke,{order});
  mesh.userData.inkIdSuppressed=true;
  mesh.material.uniforms.uMode.value=Number(danger);
  mesh.material.depthFunc=hidden?THREE.GreaterDepth:THREE.LessEqualDepth;
  mesh.frustumCulled=false;
  return mesh;
}

function mergeParts(parts) {
  const geometries = parts.map(part => {
    if (!part.index) return part;
    const unindexed = part.toNonIndexed();
    part.dispose();
    return unindexed;
  });
  const result = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  return result;
}

function brushPath(paths, segments=30) {
  const points = [], uv = [], index = [];
  for (const path of paths) {
    const first = points.length / 3;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      for (const edge of [-1, 1]) {
        points.push(...path(u, edge));
        uv.push(u, .5 + edge * .5);
      }
      if (i < segments) {
        const a = first + i * 2;
        index.push(a, a+1, a+2, a+2, a+1, a+3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function ellipseArc(start, length, width, radius=1, y=0) {
  return (u, side) => {
    const angle = start + u * length;
    const pressure = .62 + .38 * Math.sin(u * Math.PI) ** .54;
    const r = radius + side * width * pressure * (.84 + .16*Math.sin(angle*11.8+1.3));
    return [Math.cos(angle)*r, y, Math.sin(angle)*r];
  };
}

function rimGeometry() {
  return brushPath([
    ellipseArc(.07,1.68,.043,.962),ellipseArc(1.84,1.59,.044,.962),
    ellipseArc(3.55,1.22,.045,.962),ellipseArc(4.89,1.31,.043,.962),
  ], 23);
}

function rectangularRim() {
  const sides = [];
  for (const sign of [-1,1]) {
    sides.push((u,edge)=>[lerp(-.5,.5,u),0,sign*(.462+edge*.04*(.88+.12*Math.sin(u*13.)))]);
    sides.push((u,edge)=>[sign*(.484+edge*.018*(.81+.19*Math.sin(u*17.))),0,lerp(.5,-.5,u)]);
  }
  return brushPath(sides, 18);
}

function vaporGeometry() {
  return brushPath([
    ellipseArc(.19,2.6,.14,.84),ellipseArc(3.21,2.50,.10,1.02),
    ellipseArc(.47,2.14,.095,1.17),ellipseArc(2.82,1.81,.12,.96),
    ellipseArc(4.79,1.31,.13,1.26),
  ], 24);
}

function surfaceGrid() {
  const geometry = new THREE.PlaneGeometry(2,2,15,15).rotateX(-Math.PI*.5);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

function mutableStroke(geometry) {
  const copy=geometry.clone();
  copy.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return copy;
}

function fitWaterStroke(mesh, source, x, z, radius, sample, lift) {
  const original=source.attributes.position;
  const position=mesh.geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    const px=x+original.getX(i)*radius,pz=z+original.getZ(i)*radius;
    position.setY(i,sample(px,pz)+lift);
  }
  position.needsUpdate=true;
  mesh.position.set(x,0,z);
  mesh.scale.set(radius,1,radius);
}

function fitWildFront(mesh,geometry,front,width,sample) {
  const source=geometry.attributes.position;
  const target=mesh.geometry.attributes.position;
  const sin=Math.sin(front.angle??0),cos=Math.cos(front.angle??0);
  for(let i=0;i<target.count;i++){
    const across=source.getX(i)*width,along=source.getZ(i)*2.4;
    const x=front.x+cos*across+sin*along;
    const z=front.z-sin*across+cos*along;
    target.setXYZ(i,x,sample(x,z)+source.getY(i),z);
  }
  target.needsUpdate=true;
}

function fitWater(mesh, x, z, radius, sample) {
  const positions = mesh.geometry.attributes.position;
  for (let i=0; i<positions.count; i++) {
    const worldX = x + positions.getX(i)*radius;
    const worldZ = z + positions.getZ(i)*radius;
    positions.setY(i, sample(worldX,worldZ)+.045);
  }
  positions.needsUpdate = true;
  mesh.position.set(x,0,z);
  mesh.scale.set(radius,1,radius);
}

function makeWhirlpool() {
  const root = new THREE.Group();
  root.name = siteNames.whirlpool;
  const wash = makePaint(surfaceGrid(), sceneTints.water, spiralFragment, {order:7});
  wash.frustumCulled = false;
  root.add(wash);
  return { root, wash };
}

function outline(points) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) shape.lineTo(...points[i]);
  shape.closePath();
  return shape;
}

function extrusion(shape, depth, bevel=0) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel>0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    curveSegments: 7, steps: 1,
  }).translate(0,0,-depth*.5);
}

function swordGeometry() {
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position',new THREE.Float32BufferAttribute([
    .045,-.115,0, .42,-.146,0, 1.89,-.116,0, 2.32,0,0, 1.89,.116,0, .42,.146,0, .045,.115,0,
    .14,0,.048, 1.87,0,.039, .14,0,-.048, 1.87,0,-.039,
  ],3));
  blade.setAttribute('uv',new THREE.Float32BufferAttribute([.04,0,.18,0,.82,0,1,.5,.82,1,.18,1,.04,1,.06,.5,.82,.5,.06,.5,.82,.5],2));
  blade.setIndex([
    0,1,7,1,8,7,1,2,8,2,3,8,3,4,8,4,5,8,5,7,8,5,6,7,6,0,7,
    1,0,9,9,10,1,2,1,10,3,2,10,4,3,10,5,4,10,10,9,5,6,5,9,0,6,9,
  ]);
  blade.computeVertexNormals();
  const guard = new THREE.Shape();
  guard.moveTo(-.04,-.18);
  guard.quadraticCurveTo(.015,-.26,-.16,-.32);
  guard.quadraticCurveTo(-.31,-.38,-.19,-.43);
  guard.quadraticCurveTo(.13,-.40,.18,-.17);
  guard.lineTo(.18,.17);
  guard.quadraticCurveTo(.13,.40,-.19,.43);
  guard.quadraticCurveTo(-.31,.38,-.16,.32);
  guard.quadraticCurveTo(.015,.26,-.04,.18);
  guard.closePath();
  const tang = new THREE.CylinderGeometry(.078,.081,.48,7).rotateZ(Math.PI*.5).translate(-.29,0,0);
  const pommel = new THREE.TorusGeometry(.107,.030,5,12).translate(-.565,0,0);
  return { blade, guard:mergeParts([extrusion(guard,.13,.016),pommel]), grip:tang };
}

function swordModel(geometry) {
  const sword = new THREE.Group();
  const blade = makePaint(geometry.blade, sceneTints.steel, washFragment, {load:.45,depthWrite:true});
  const guard = makePaint(geometry.guard, sceneTints.gold, washFragment, {load:.67,depthWrite:true});
  const grip = makePaint(geometry.grip, sceneTints.darkRed, washFragment, {load:.76,depthWrite:true});
  blade.material.uniforms.uMode.value = 1;
  blade.userData.inkMineralHold=.58;
  sword.add(blade,guard,grip);
  return sword;
}

function pigmentModel() {
  const root = new THREE.Group();
  const stone = new THREE.DodecahedronGeometry(.61,0).scale(.81,1.04,.54);
  const facet = makePaint(stone, sceneTints.gold, washFragment, {load:.69,depthWrite:true});
  const stand = makePaint(new THREE.CylinderGeometry(.53,.65,.19,7).translate(0,-.67,0),
    sceneTints.ink, washFragment, {load:.70,depthWrite:true});
  root.add(stand,facet);
  return { root, facet };
}

function softTube(points, radius, detail=12) {
  const curve = new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
  return new THREE.TubeGeometry(curve,detail,radius,6,false);
}

function ellipsoid(x,y,z,rx,ry,rz) {
  return new THREE.SphereGeometry(1,12,8).scale(rx,ry,rz).translate(x,y,z);
}

function craneWing(side) {
  const root = new THREE.Group();
  root.position.x = side*.23;
  root.scale.x = side;
  const wing = brushPath([
    (u, edge) => {
      const x = 1.64*u;
      const y = .26*Math.sin(u*2.3)+.12*u;
      const leading = .32+.36*Math.sin(u*2.3)-.51*u*u;
      const trailing = -.58-.17*Math.sin(u*2.7)+.27*u;
      return [x,y+edge*.06*Math.sin(u*Math.PI),edge<0?leading:trailing];
    },
  ], 16);
  root.add(makePaint(wing,sceneTints.porcelain,washFragment,{load:.36,depthWrite:true}));
  const feathers = [], quills = [];
  for (let i = 0; i < 10; i++) {
    const t = i/9;
    const rootX = .22+1.33*t;
    const rootY = .06+.27*Math.sin(t*2.15);
    const rootZ = -.28+.44*t;
    const length = .56+.59*Math.sin(t*2.35);
    const path = (u,edge)=>{
      const span = .105*(.37+.63*Math.sin(u*Math.PI)**.61)*(1-.54*u);
      const x = rootX + u*length*(.27+.78*t) + edge*span;
      const y = rootY + .16*u*t - .13*u*u;
      const z = rootZ - u*length*(1-.30*t) + .25*t*edge*span;
      return [x,y,z];
    };
    (i<4 ? feathers : quills).push(path);
  }
  root.add(makePaint(brushPath(feathers,8),sceneTints.porcelain,washFragment,{load:.40,depthWrite:true}),
    makePaint(brushPath(quills,8),sceneTints.ink,washFragment,{load:.87,depthWrite:true}));
  return root;
}

function makeCrane() {
  const root = new THREE.Group();
  const ivory = mergeParts([
    ellipsoid(0,0,-.18,.29,.26,.64),
    softTube([[0,.06,.24],[0,.23,.54],[0,.60,.59],[0,.83,.72],[0,.88,.96]],.119),
    ellipsoid(0,.87,1.00,.157,.153,.243),
  ]);
  const legs = [[-.095,0,0],[.095,.023,.048]].map(([x,y,z])=>
    softTube([[x,y-.14,z-.55],[x*1.33,y-.28,z-1.04],[x*1.66,y-.36,z-1.61]],.030,8));
  const beak = new THREE.ConeGeometry(.085,.59,5).rotateX(Math.PI*.5).translate(0,.855,1.39);
  const black = mergeParts([
    ...legs,beak,ellipsoid(0,.62,.66,.122,.23,.137),ellipsoid(0,.79,.91,.141,.082,.186),
    ellipsoid(0,.026,-.72,.17,.083,.38),
  ]);
  const crown = ellipsoid(0,.985,1.035,.095,.029,.128);
  const left = craneWing(-1),right = craneWing(1);
  root.add(left,right,
    makePaint(ivory,sceneTints.porcelain,washFragment,{load:.34,depthWrite:true}),
    makePaint(black,sceneTints.ink,washFragment,{load:.86,depthWrite:true}),
    makePaint(crown,sceneTints.red,washFragment,{load:.76,depthWrite:true}));
  return {root,left,right};
}

function makeCarp(assets) {
  const root = new THREE.Group();
  const body = makePaint(assets.carp, '#49696e', carpFragment,
    {depthWrite:true, defines:{WONDER_FISH:1}});
  body.userData.inkTintAmount=.74;
  const feelers=makePaint(assets.carpFeelers,sceneTints.ink,washFragment,{load:.86,depthWrite:true});
  const crown=makePaint(assets.carpCrown,sceneTints.red,washFragment,{load:.76,depthWrite:true});
  root.add(body,feelers,crown);
  return {root,body};
}

function carpParts() {
  const carp=createInkFoodGeometry('carp').scale(2.8,2.8,2.8);
  const details=[];
  for(const side of [-1,1]){
    details.push(ellipsoid(side*.219,.14,.574,.050,.041,.053));
    details.push(softTube([[side*.055,-.033,.772],[side*.14,-.071,.818],
      [side*.272,-.096,.793],[side*.367,-.100,.723]],.016,10));
  }
  const crown=new THREE.SphereGeometry(1,12,8).scale(.177,.058,.163)
    .rotateX(-.17).translate(0,.291,.48);
  return {carp,carpFeelers:mergeParts(details),carpCrown:crown};
}

function pearlGeometry() {
  return new THREE.SphereGeometry(.24,16,10).scale(1,1.08,1);
}

function oathGeometry() {
  const foot = new THREE.CylinderGeometry(1.04,1.15,.23,8).scale(1,1,.79).translate(0,.08,0);
  const step = new THREE.CylinderGeometry(.89,1.02,.22,8).scale(1,1,.76).translate(0,.28,0);
  const plinth = new THREE.CylinderGeometry(.66,.82,.26,8).scale(1,1,.81).translate(0,.50,0);
  const petals=[];
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    petals.push(new THREE.SphereGeometry(1,8,5).scale(.21,.081,.38).rotateX(-.29)
      .translate(0,.62,.54).rotateY(angle));
  }
  const mirror = new THREE.CylinderGeometry(.75,.75,.076,32).rotateX(Math.PI*.5);
  const mirrorFrame = new THREE.TorusGeometry(.76,.067,6,28);
  const stamps=[];
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    stamps.push(new THREE.SphereGeometry(1,7,5).scale(.074,.074,.035)
      .translate(Math.sin(angle)*.76,Math.cos(angle)*.76,.058));
  }
  const jadeShape=outline([[-.63,-.15],[-.42,.54],[.19,.68],[.63,.22],[.47,-.48],[-.15,-.68]]);
  const hole = new THREE.Path();
  hole.absellipse(0,.025,.25,.29,0,Math.PI*2,true);
  jadeShape.holes.push(hole);
  const jade=extrusion(jadeShape,.15,.058);
  const lanyard=mergeParts([
    softTube([[-.33,.58,.06],[-.12,.92,.12],[.12,1.00,.14],[.27,.70,.07],[.08,.57,.05]],.035,16),
    softTube([[.20,.71,.12],[.32,.87,.11],[.42,.60,.10],[.55,.37,.09]],.033,12),
  ]);
  return {
    steps:mergeParts([foot,step,plinth]), petals:mergeParts(petals), mirror,
    mirrorFrame:mergeParts([mirrorFrame,...stamps]), jade, lanyard,
  };
}

function makeOathShrine(assets) {
  const root=new THREE.Group();
  const shrine=assets.oath;
  const base=makePaint(shrine.steps,'#576c65',washFragment,{load:.61,depthWrite:true});
  const petals=makePaint(shrine.petals,sceneTints.gold,washFragment,{load:.62,depthWrite:true});
  const pendant=new THREE.Group();
  const mirror=new THREE.Group();
  const face=makePaint(shrine.mirror,oathTints.mirror,mirrorFragment,{depthWrite:true});
  face.userData.inkMineralHold=.57;
  const frame=makePaint(shrine.mirrorFrame,'#967449',washFragment,{load:.82,depthWrite:true});
  mirror.add(face,frame);
  const jade=new THREE.Group();
  const stone=makePaint(shrine.jade,oathTints.tether,washFragment,{load:.81,depthWrite:true});
  stone.userData.inkMineralHold=.47;
  const cord=makePaint(shrine.lanyard,sceneTints.darkRed,washFragment,{load:.76,depthWrite:true});
  jade.add(stone,cord);
  pendant.add(mirror,jade);
  root.add(base,petals,pendant);
  return {root,pendant,mirror,jade,face};
}

function springJets() {
  const paths=[];
  for(let i=0;i<9;i++){
    const angle=i*2.399963;
    const height=.88+1.45*(.5+.5*Math.sin(i*4.35));
    const distance=.55+.44*Math.cos(i*5.12);
    paths.push((u,edge)=>{
      const span=(.052+.036*Math.sin(i))*Math.sin(Math.PI*u)**.70;
      const travel=u**1.31*distance;
      const y=height*Math.sin(Math.PI*u)*(.86+.17*u);
      return [
        Math.cos(angle)*travel+Math.sin(angle)*span*edge,
        y+edge*.028*Math.sin(u*Math.PI),
        Math.sin(angle)*travel-Math.cos(angle)*span*edge,
      ];
    });
  }
  return brushPath(paths,15);
}

function flowStrokes() {
  return brushPath([-1,1].map(sign=>(u,edge)=>{
    const x=sign*(.23+u*.12);
    const z=.6-u*4.2;
    const width=(.06+.025*Math.sin(u*21))*Math.sin(u*Math.PI)**.54;
    return [x+edge*width,-.06-.05*u,z];
  }),20);
}

function makeSpring(assets) {
  const root = new THREE.Group();
  root.name=siteNames.spring;
  const basin=makePaint(surfaceGrid(), '#38786e', springFragment, {load:.96,order:7});
  basin.frustumCulled=false;
  const jets=makePaint(assets.jets, '#406b66', strokeFragment, {load:.63,order:10});
  const rim=makePaint(mutableStroke(assets.rim),sceneTints.steel,strokeFragment,{load:.77,order:10});
  rim.frustumCulled=false;
  const core=makePaint(assets.rim,sceneTints.lightGold,strokeFragment,{load:.61,order:9});
  const pearl=makePaint(assets.pearl,sceneTints.lightGold,washFragment,{load:.68,depthWrite:true});
  root.add(basin,jets,rim,core,pearl);
  return {root,basin,jets,rim,core,pearl,rimGeometry:assets.rim};
}

function makeWild(assets) {
  const root=new THREE.Group();
  root.name=siteNames.wild;
  const field=makePaint(surfaceGrid(),'#985a37',wildSeaWash,{order:10});
  field.frustumCulled=false;
  const seal=new THREE.Group();
  const base=makePaint(assets.oath.steps,'#59655b',washFragment,{load:.69,depthWrite:true});
  const bowl=makePaint(assets.wildCauldron,'#4a544c',washFragment,{load:.82,depthWrite:true});
  const lip=makePaint(assets.wildLip,'#9f673a',washFragment,{load:.84,depthWrite:true});
  const ink=makePaint(assets.pearl,'#a64a2d',washFragment,{load:.89,depthWrite:true});
  ink.position.y=2.24;
  seal.add(base,bowl,lip,ink);
  const fronts=[];
  root.add(field,seal);
  return {root,field,seal,ink,fronts};
}

function makeOathSite(assets) {
  const root=new THREE.Group();
  root.name=siteNames.oath;
  const shrine=makeOathShrine(assets);
  const rim=makePaint(mutableStroke(assets.rim),oathTints.mirrorRim,strokeFragment,{load:.76});
  rim.frustumCulled=false;
  const trial=new THREE.Group();
  const tokens=[];
  for(let i=0;i<3;i++){
    const circle=makePaint(assets.rim,oathTints.tetherRim,strokeFragment,{load:.76,order:10});
    const token=makePaint(assets.oath.jade,oathTints.tether,washFragment,{load:.79,depthWrite:true});
    trial.add(circle,token);
    tokens.push({circle,token});
  }
  const ray=makePaint(assets.oathRay,oathTints.mirror,strokeFragment,{load:.84,order:11});
  const rail=makePaint(assets.oathRay,oathTints.tether,strokeFragment,{load:.80,order:11});
  const pulse=new THREE.Group();
  const pulseInk=makePaint(assets.oathRay,oathTints.mirror,strokeFragment,{load:.97,order:12});
  const pulseRing=makePaint(assets.artifactRing,oathTints.mirrorRim,strokeFragment,{load:.84,order:12});
  pulse.add(pulseInk,pulseRing);
  trial.add(ray,rail,pulse);
  root.add(shrine.root,rim,trial);
  return {root,shrine,rim,trial,tokens,ray,rail,pulse,pulseInk,pulseRing,rimGeometry:assets.rim};
}

function palmGeometry() {
  // An open ritual palm with a splayed thumb and staggered finger lengths.
  const hand = new THREE.Shape();
  hand.moveTo(-.37,-.92);
  hand.bezierCurveTo(-.41,-.66,-.50,-.46,-.69,-.25);
  hand.bezierCurveTo(-.85,-.10,-.98,.09,-.87,.16);
  hand.bezierCurveTo(-.76,.23,-.59,.11,-.47,.00);
  hand.bezierCurveTo(-.43,.14,-.46,.44,-.44,.74);
  hand.bezierCurveTo(-.43,.94,-.27,.96,-.24,.79);
  hand.lineTo(-.21,.38);
  hand.bezierCurveTo(-.17,.40,-.18,.77,-.16,.94);
  hand.bezierCurveTo(-.13,1.13,.041,1.10,.063,.94);
  hand.lineTo(.083,.43);
  hand.bezierCurveTo(.13,.43,.137,.73,.16,.86);
  hand.bezierCurveTo(.194,1.007,.34,.98,.37,.843);
  hand.bezierCurveTo(.388,.74,.375,.49,.369,.36);
  hand.bezierCurveTo(.42,.38,.45,.56,.494,.67);
  hand.bezierCurveTo(.56,.80,.677,.74,.695,.60);
  hand.bezierCurveTo(.71,.41,.64,.14,.621,-.04);
  hand.bezierCurveTo(.63,-.43,.45,-.58,.40,-.77);
  hand.lineTo(.41,-.92);
  hand.quadraticCurveTo(.02,-1.035,-.37,-.92);
  return extrusion(hand,.185,.041);
}

function palmCreases() {
  const paths = [
    (u,edge)=>[-.44+u*.96,-.27+.17*Math.sin(u*1.61)+edge*.023,.143],
    (u,edge)=>[-.49+u*.68,-.35+.18*u*u+edge*.025,.145],
    (u,edge)=>[-.21+.42*u,-.56+.14*Math.sin(Math.PI*u)+edge*.019,.146],
    (u,edge)=>[-.54+.41*u,.115-.16*u+edge*.013,.140],
    (u,edge)=>[-.397+.15*u,.55+.014*Math.sin(u*3)+edge*.018,.14],
    (u,edge)=>[-.143+.19*u,.62+.013*Math.sin(u*3)+edge*.017,.14],
    (u,edge)=>[.186+.153*u,.57-.029*u+edge*.017,.14],
    (u,edge)=>[.485+.139*u,.367-.058*u+edge*.014,.14],
  ];
  // A dry, eight-spoked wheel is painted into the center of the palm.
  paths.push((u,edge)=>{
    const angle=u*Math.PI*2;
    const radius=.186+edge*.013;
    return [.083+Math.sin(angle)*radius,.145+Math.cos(angle)*radius,.146];
  });
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    paths.push((u,edge)=>{
      const length=lerp(.032,.17,u);
      return [.083+Math.sin(angle)*length+Math.cos(angle)*edge*.012,
        .145+Math.cos(angle)*length-Math.sin(angle)*edge*.012,.147];
    });
  }
  return brushPath(paths,16);
}

function gateGeometry() {
  const uprights=[], shadows=[], fasteners=[];
  for (const side of [-1,1]) {
    const post = new THREE.CylinderGeometry(.027,.038,5.05,8).translate(side*.391,-.095,0);
    post.rotateZ(side*.009);
    uprights.push(post);
    const foot = new THREE.CylinderGeometry(.045,.047,.42,8).translate(side*.411,-2.46,0);
    const collar = new THREE.CylinderGeometry(.036,.036,.25,8).translate(side*.378,2.04,0);
    shadows.push(foot,collar);
    fasteners.push(new THREE.SphereGeometry(.031,7,5).translate(side*.384,1.48,.032));
  }
  const roof = outline([[-.54,2.74],[-.44,2.55],[-.24,2.50],[0,2.47],[.24,2.50],
    [.44,2.55],[.54,2.74],[.548,3.10],[.41,2.94],[.24,2.84],[0,2.82],
    [-.24,2.84],[-.41,2.94],[-.548,3.10]]);
  const eave = outline([[-.52,3.02],[-.36,2.89],[-.19,2.85],[.19,2.85],[.36,2.89],[.52,3.02],
    [.549,3.16],[.37,3.04],[.18,2.97],[-.18,2.97],[-.37,3.04],[-.549,3.16]]);
  const lintel = new THREE.BoxGeometry(1.02,.235,.055).translate(0,1.49,0);
  const tablet = new THREE.BoxGeometry(.095,1.00,.066).translate(0,2.10,0);
  const plaque = new THREE.BoxGeometry(.056,.64,.012).translate(0,2.15,.036);
  uprights.push(lintel,tablet,extrusion(roof,.096));
  shadows.push(extrusion(eave,.112));
  fasteners.push(plaque);
  return { body:mergeParts(uprights), dark:mergeParts(shadows), gold:mergeParts(fasteners) };
}

function slashGeometry() {
  return brushPath([
    (u,edge)=>{
      const span = (u-.5)*2;
      const crescent = 1-span*span;
      const tip = Math.sin(u*Math.PI)**.58;
      return [span*.5,span*.12+edge*.079*tip,.34*crescent-.07+edge*.135*tip];
    },
    (u,edge)=>{
      const span = (u-.5)*2;
      const tip = Math.sin(u*Math.PI)**.82;
      return [span*.465-.08,span*.095+.075+edge*.046*tip,.27*(1-span*span)-.25+edge*.092*tip];
    },
  ],32);
}

function fallTraces() {
  return brushPath([
    (u,edge)=>[-.47+.12*u+edge*.012, u,.17-.19*u],
    (u,edge)=>[.32+.11*u+edge*.017,u,.04+.1*u],
    (u,edge)=>[.06-.06*u+edge*.011,u*.78,-.41+.10*u],
    (u,edge)=>[-.21-.02*u+edge*.012,u*.87,.34+.14*u],
    (u,edge)=>[.43+.05*u+edge*.011,u*.73,-.26-.1*u],
  ],15);
}

function oathRayGeometry() {
  return brushPath([
    (u,edge)=>{
      const profile=Math.sin(Math.PI*u)**.68;
      return [.17*Math.sin(u*4.3)*profile+edge*.16*profile,.28*profile,u];
    },
    (u,edge)=>{
      const profile=Math.sin(Math.PI*u)**.58;
      return [-.19*profile+edge*.075*profile,.16*profile,u*.94+.035];
    },
    (u,edge)=>{
      const profile=Math.sin(Math.PI*u)**.74;
      return [.38*profile+edge*.085*profile,.38*profile,u*.90+.066];
    },
  ],24);
}

function tetherBrush() {
  return brushPath([
    (u,edge)=>{
      const weight=Math.sin(Math.PI*u)**.67;
      return [.40*weight+edge*.13*weight,.13+.58*weight,u];
    },
    (u,edge)=>{
      const weight=Math.sin(Math.PI*u)**.70;
      return [.12*weight+edge*.07*weight,.16+.41*weight,u];
    },
  ],20);
}

function artifactRingGeometry() {
  const paths=[];
  for(let i=0;i<8;i++){
    const start=i*Math.PI*.25+.08;
    paths.push(ellipseArc(start,.57,.033,.94));
    paths.push(ellipseArc(start+.14,.25,.042,.76));
  }
  return brushPath(paths,8);
}

function breakwaterGeometry() {
  const paths=[];
  for(let i=0;i<6;i++){
    const start=i*Math.PI/3+.06;
    for(let j=0;j<2;j++){
      paths.push((u,edge)=>{
        const a=start+u*(.88-j*.16);
        const crest=Math.sin(u*Math.PI)**.65;
        const r=.98+(j===0?-.052:.035)*crest+edge*.035;
        return [Math.cos(a)*r,.12+.35*crest+j*.20+edge*.075*crest,Math.sin(a)*r];
      });
    }
  }
  return brushPath(paths,14);
}

function counterCrescent() {
  return brushPath([
    (u,edge)=>{
      const s=(u-.5)*2;
      const bristle=Math.sin(u*Math.PI)**.62;
      return [s*.52+edge*.037*bristle,s*.39+edge*.082*bristle,
        .18*(1-s*s)+edge*.10*bristle];
    },
    (u,edge)=>{
      const s=(u-.5)*2;
      const bristle=Math.sin(u*Math.PI)**.65;
      return [s*.47+edge*.034*bristle,s*.36+.075+edge*.045*bristle,
        .14*(1-s*s)-.20+edge*.045*bristle];
    },
  ],28);
}

function aimOathStroke(mesh,from,to,width) {
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
  const ground=Math.hypot(dx,dz);
  mesh.position.set(from.x,from.y,from.z);
  mesh.rotation.set(-Math.atan2(dy,ground),Math.atan2(dx,dz),0,'YXZ');
  mesh.scale.set(width,width,Math.max(.05,Math.hypot(ground,dy)));
}

function makeArtifactEffect(assets) {
  const root=new THREE.Group();
  root.name='水誓法宝';
  const main=makePaint(assets.oathRay,oathTints.mirror,strokeFragment,{load:.91,order:13});
  const ring=makePaint(assets.artifactRing,oathTints.mirror,strokeFragment,{load:.89,order:13});
  const echo=makePaint(assets.counter,oathTints.mirror,strokeFragment,{load:.91,order:13});
  const links=[];
  root.add(main,ring,echo);
  return {root,main,ring,echo,links};
}

function drawArtifactEffect(effect,record,assets,time,sampleWater) {
  const {event,at,life}=record;
  const t=clamp((time-at)/life,0,1);
  const spread=1-(1-t)**2.1;
  const load=(1-t)**.66;
  const {root,main,ring,echo,links}=effect;
  const from=event.from??event;
  const to=event.to??event;
  const mirror=event.kind==='mirror';
  const catching=event.action==='catch';
  const counter=event.action==='counter';
  const intercept=event.action==='intercept';
  const undertow=event.action==='undertow';
  const tint=intercept?'#487b88':mirror?oathTints.mirror:oathTints.tether;
  root.visible=true;
  main.userData.inkTint=tint;
  ring.userData.inkTint=tint;
  echo.userData.inkTint=tint;
  const projectile=counter?event.velocity:null;
  const elapsed=Math.max(0,time-at);
  const horizontal=Math.max(.001,Math.hypot(to.x-from.x,to.z-from.z));
  const flight=elapsed*artifactFlightSpeed/horizontal;
  const headX=projectile?from.x+projectile.x*elapsed:counter?lerp(from.x,to.x,flight):intercept?event.x:to.x;
  const headY=projectile?from.y+projectile.y*elapsed:counter?lerp(from.y,to.y,Math.min(1,flight)):intercept?event.y:to.y;
  const headZ=projectile?from.z+projectile.z*elapsed:counter?lerp(from.z,to.z,flight):intercept?event.z:to.z;
  const headHeight=Math.max(headY,sampleWater(headX,headZ));
  aimedStart.set(from.x,Math.max(from.y,sampleWater(from.x,from.z))+.30,from.z);
  aimedEnd.set(headX,headHeight+(counter?.64:.34),headZ);
  aimOathStroke(main,aimedStart,aimedEnd,catching?.63:mirror?1.80:1.26);
  stroke(main,load*(catching?.84:undertow?.63:.99),time,catching?.72:counter?.40:.56);
  ring.position.set(headX,headHeight+(counter?.64:mirror?.14:.42),headZ);
  ring.rotation.set(catching?1.04:0,time*.75,0,'YXZ');
  const radius=mirror?(catching?1.7:intercept?1.4:2.6):(event.radius??4.5);
  ring.scale.setScalar(radius*(.42+.58*spread));
  stroke(ring,load*(catching?.94:.81),time,mirror?.62:.29);
  if(!counter&&!intercept)echo.visible=false;
  else{
    const width=Math.min(6.2,Math.max(4.3,event.radius??3.3));
    echo.position.set(headX,headHeight+(intercept?.28:.73),headZ);
    echo.rotation.set(.11,Math.atan2(headX-from.x,headZ-from.z),-.34,'YXZ');
    echo.scale.set(width,intercept?1.14:2.85,intercept?1.75:3.05);
    stroke(echo,load*.99,time,.46);
  }

  const sources=event.links??[];
  const points=event.points??[];
  const segments=mirror?0:Math.min(4,Math.max(0,points.length-1));
  const connections=mirror?0:Math.min(10,sources.length);
  for(let i=0;i<segments+connections;i++){
    let mesh=links[i];
    if(!mesh){
      mesh=makePaint(assets.tetherBrush,oathTints.tether,strokeFragment,{load:.94,order:12});
      links.push(mesh);
      root.add(mesh);
    }
    const segment=i<segments;
    const link=segment?null:sources[i-segments];
    const a=segment?points[Math.floor(i*(points.length-1)/segments)]:link.from;
    const b=segment?points[Math.floor((i+1)*(points.length-1)/segments)]:link.to;
    aimedStart.set(a.x,Math.max(a.y,sampleWater(a.x,a.z))+.30,a.z);
    aimedEnd.set(b.x,Math.max(b.y,sampleWater(b.x,b.z))+.44,b.z);
    aimOathStroke(mesh,aimedStart,aimedEnd,segment?.74:.70+.26*spread);
    if(!segment&&i%2)mesh.scale.x*=-1;
    stroke(mesh,load*(segment?.83:.92),time,segment?.68:.50);
  }
  for(let i=segments+connections;i<links.length;i++)links[i].visible=false;
}

function levelTraces(rectangle) {
  const paths = [];
  for(const sign of [-1,1]){
    const corners=rectangle
      ? [[-.49,-.49],[.49,-.49],[-.49,.49],[.49,.49]]
      : [[-.70,-.70],[.70,-.70],[-.70,.70],[.70,.70]];
    for(const [x,z] of corners){
      paths.push((u,edge)=>[
        x + edge*(rectangle?.012:.018)*(1-.48*u),
        sign*(.5*u),
        z + edge*(rectangle?.012:.018)*(1-.48*u),
      ]);
    }
  }
  return brushPath(paths,12);
}

function splitPalmFootprint() {
  const paths=[];
  for(let i=0;i<12;i++)paths.push(ellipseArc(i*Math.PI/6+.05,.36,.011,.984));
  return brushPath(paths,8);
}

function gateSafeCenter() {
  const paths=[];
  for(let i=0;i<5;i++){
    paths.push((u,edge)=>{
      const z=-.48+(i+u*.77)*.192;
      const width=.022*(.82+.18*Math.sin(u*Math.PI));
      return [edge*width,0,z];
    });
  }
  paths.push((u,edge)=>[lerp(-.12,.12,u),.003,edge*.014]);
  return brushPath(paths,8);
}

function routeMark(geometry,danger=false) {
  const group=new THREE.Group();
  const front=reserveMark(geometry,31,danger);
  const behind=reserveMark(geometry,32,danger,true);
  group.add(front,behind);
  return {group,front,behind,danger};
}

function updateRouteMark(mark,alpha,time) {
  stroke(mark.front,alpha,time,0,Number(mark.danger));
  stroke(mark.behind,alpha*(mark.danger?.58:.83),time,0,Number(mark.danger));
}

function edgeCueGeometry() {
  return brushPath([-1,1].map(side=>(u,edge)=>[
    side*.45*(1-u)+edge*.063,lerp(-.24,.37,u)-edge*side*.057,0,
  ]),9);
}

function makeGateReticle() {
  const group=new THREE.Group();
  group.name='朱阙通行高度';
  const geometry=new THREE.PlaneGeometry(2,2);
  const arrow=makePaint(geometry,sceneTints.ink,reticleInk,{order:36});
  const aligned=makePaint(geometry,sceneTints.ink,reticleInk,{order:36,defines:{ALIGNED:1}});
  for(const mesh of [arrow,aligned]){
    mesh.userData.inkIdSuppressed=true;
    mesh.material.depthTest=false;
    mesh.frustumCulled=false;
  }
  group.add(arrow,aligned);
  group.visible=false;
  return {group,arrow,aligned};
}

const modes = {
  sword: sceneTints.lightGold,
  pigment: sceneTints.gold,
  crane: sceneTints.steel,
  carp: '#6a9993',
  palm: sceneTints.lightGold,
  gates: sceneTints.red,
};

function makeSite(kind, assets) {
  if (kind==='whirlpool') return makeWhirlpool();
  if (kind==='spring') return makeSpring(assets);
  if (kind==='oath') return makeOathSite(assets);
  if (kind==='wild') return makeWild(assets);
  const root = new THREE.Group();
  root.name=siteNames[kind];
  const rim=makePaint(assets.rim,modes[kind],strokeFragment,{load:.68});
  const vapor=makePaint(assets.vapor,modes[kind],strokeFragment,{load:.43,order:7});
  root.add(rim,vapor);
  const instance={root,rim,vapor};
  if (kind==='sword') {
    instance.object=swordModel(assets.sword);
  } else if (kind==='pigment') {
    const {root:object,facet}=pigmentModel();
    instance.object=object;
    instance.facet=facet;
  } else if (kind==='crane') {
    const crane=makeCrane();
    instance.object=crane.root;
    instance.wings=[crane.left,crane.right];
    const gift=makePaint(assets.gift,sceneTints.gold,washFragment,{load:.69,depthWrite:true});
    gift.position.set(0,.73,1.48);
    instance.object.add(gift);
    instance.gift=gift;
  } else if(kind==='carp'){
    const fish=makeCarp(assets);
    instance.object=fish.root;
    instance.fish=fish.body;
    const current=makePaint(assets.flow,sceneTints.steel,strokeFragment,{load:.62,order:7});
    const beacon=new THREE.Group();
    const pearl=makePaint(assets.pearl,sceneTints.lightGold,washFragment,{load:.69,depthWrite:true});
    const station=makePaint(assets.rim,sceneTints.lightGold,strokeFragment,{load:.72,order:9});
    beacon.add(pearl,station);
    root.add(current,beacon);
    Object.assign(instance,{current,beacon,pearl,station});
  } else {
    const omen=makePaint(kind==='palm'?assets.palm:assets.gate.body,modes[kind],washFragment,
      {load:.66,depthWrite:true,side:THREE.FrontSide});
    instance.object=new THREE.Group();
    instance.object.add(omen);
    if(kind==='gates')omen.scale.set(2.3,.38,2.3);
  }
  if(kind==='crane'||kind==='carp'||kind==='palm'||kind==='gates'){
    const prize=makePaint(kind==='carp'?assets.pearl:assets.gift,sceneTints.lightGold,washFragment,{load:.77,depthWrite:true});
    prize.visible=false;
    instance.prize=prize;
    root.add(prize);
  }
  root.add(instance.object);
  return instance;
}

function makeHazard(kind,assets) {
  const root=new THREE.Group();
  root.name=kind==='palm'?'金掌落击':'明神门落击';
  const tint=kind==='palm'?sceneTints.gold:sceneTints.red;
  const rim=makePaint(kind==='palm'?assets.rim:assets.rect,tint,strokeFragment,{load:.89,order:12});
  const vapor=makePaint(assets.vapor,tint,strokeFragment,{load:.57,order:11});
  const descent=makePaint(assets.fall,tint,strokeFragment,{load:.68,order:10});
  const level=makePaint(kind==='palm'?assets.palmLevel:assets.gateLevel,tint,strokeFragment,{load:.60,order:11});
  const clear=kind==='gate'?makePaint(assets.rect,'#568177',strokeFragment,{load:.65,order:11}):null;
  const mark=routeMark(kind==='gate'?assets.gateCenter:assets.palmFootprint,kind==='palm');
  const window=kind==='gate'?makePaint(assets.gateWindow,'#a5b8b2',gateAirWash,{order:11}):null;
  if(window)window.userData.inkIdSuppressed=true;
  root.add(mark.group);
  if(clear)root.add(clear,window);
  const shape=new THREE.Group();
  let body, marks;
  if (kind==='palm') {
    body=makePaint(assets.palm,tint,washFragment,{load:.87,order:10,side:THREE.FrontSide});
    body.userData.inkMineralHold=.58;
    marks=makePaint(assets.lines,sceneTints.darkRed,strokeFragment,{load:.97,order:11});
    shape.add(body,marks);
  } else {
    body=makePaint(assets.gate.body,tint,washFragment,{load:.91,order:10,side:THREE.FrontSide});
    body.userData.inkMineralHold=.44;
    marks=makePaint(assets.gate.dark,sceneTints.darkRed,washFragment,{load:.89,order:11});
    const seal=makePaint(assets.gate.gold,sceneTints.lightGold,washFragment,{load:.63,order:12});
    shape.add(body,marks,seal);
  }
  root.add(rim,vapor,descent,level,shape);
  return {root,rim,vapor,descent,level,clear,window,mark,shape,body,marks,fallAxis:new THREE.Vector3()};
}

function wildFrontGeometry() {
  const paths=[];
  for(let i=0;i<4;i++){
    paths.push((u,edge)=>{
      const x=-.48+(i+u*.84)*.247;
      const z=.09*Math.cos(Math.PI*x*2)+.024*Math.sin(u*7.);
      const width=(.051+.018*Math.sin(u*Math.PI))*(.79+.21*Math.sin(u*11+i));
      return [x,.18,z+edge*width];
    });
    paths.push((u,edge)=>{
      const x=-.37+i*.248;
      return [x+.18*(u-.5)+edge*.025,.22+.28*Math.sin(u*Math.PI),-.23+.39*u];
    });
    const center=-.37+i*.248;
    for(const side of [-1,1]){
      paths.push((u,edge)=>[
        center+side*.055*(1-u)+edge*.013,
        .49+.29*u+edge*.047,
        -.16-.055*u,
      ]);
    }
  }
  return brushPath(paths,8);
}

function setWild(instance,site,game,time,sampleWater,assets) {
  const {root,field,seal,ink,fronts}=instance;
  const active=site.phase==='active';
  const radius=active?(site.leash??site.radius):Math.min(site.triggerRadius??site.radius,4.2);
  const y=sampleWater(site.x,site.z);
  const pulse=.5+.5*Math.sin(time*(active?3.9:1.8));
  fitWater(field,site.x,site.z,radius,sampleWater);
  stroke(field,active?.97:.83,time,site.progress,Number(active));
  seal.position.set(site.x,y+.085,site.z);
  seal.rotation.y=time*.19;
  seal.scale.setScalar(active?.89:1);
  ink.position.y=1.95+.28*pulse;
  ink.scale.setScalar((active?1.7:1.26)+.20*pulse);
  const targets=active?site.fronts??[]:[];
  let index=0;
  for(const front of targets){
    if(front.phase==='spent'||game.time<front.startsAt)continue;
    let mesh=fronts[index];
    if(!mesh){
      mesh=makePaint(mutableStroke(assets.wildFront),sceneTints.red,strokeFragment,{load:.92,order:12});
      mesh.frustumCulled=false;
      fronts.push(mesh);
      root.add(mesh);
    }
    const width=front.width??11;
    fitWildFront(mesh,assets.wildFront,front,width,sampleWater);
    const waiting=front.phase==='warning';
    const warmup=clamp((game.time-front.startsAt)/Math.max(.1,front.spawnAt-front.startsAt),0,1);
    const fade=1-clamp((game.time-front.spawnAt)/Math.max(.1,front.endsAt-front.spawnAt),0,1);
    stroke(mesh,waiting?.52+.44*warmup:.69*fade,time,waiting?.13:.48);
    index++;
  }
  for(let i=index;i<fronts.length;i++)fronts[i].visible=false;
}

function setSpring(instance,site,time,sampleWater) {
  const {basin,jets,rim,core,pearl}=instance;
  const active=site.phase==='active';
  const open=active&&site.windowOpen;
  const y=sampleWater(site.x,site.z);
  fitWater(basin,site.x,site.z,site.radius,sampleWater);
  basin.userData.inkTint=open?'#497d75':'#36575f';
  stroke(basin,active?.97:.82,time,site.progress,Number(active));
  const flow=.68+.28*Math.sin(time*3.1);
  jets.position.set(site.x,y+.05,site.z);
  jets.rotation.y=time*.34;
  jets.scale.set(1.50+flow*.46,open?.37:flow*(active?1.48:1.14),1.50+flow*.46);
  stroke(jets,open?.51:.93,time,.57);
  const wave=site.waveRadius??0;
  if(wave>0)fitWaterStroke(rim,instance.rimGeometry,site.x,site.z,wave,sampleWater,.062);
  rim.userData.inkTint=open?'#487f70':sceneTints.red;
  stroke(rim,active&&wave>0?(open?.65:.95):0,time,open?.68:.14);
  const target=site.beacon;
  const tx=target?.x??site.x,tz=target?.z??site.z;
  const waterY=sampleWater(tx,tz);
  core.position.set(tx,waterY+.088,tz);
  core.scale.setScalar(target?.radius??1.55);
  core.rotation.y=-time*.48;
  stroke(core,open?.98:.20,time,open?.38:.87);
  pearl.visible=!active||Boolean(target);
  pearl.position.set(tx,waterY+(open?.62:.35)+.10*Math.sin(time*4.1),tz);
  pearl.rotation.set(.40,time*1.15,.38);
  pearl.scale.setScalar(open?3.1:1.6);
}

function setOath(instance,site,game,time,sampleWater,camera) {
  const {shrine,rim,trial,tokens,ray,rail,pulse:bolt,pulseInk,pulseRing}=instance;
  const mirror=site.relic==='mirror';
  const active=site.phase==='active',reward=site.phase==='reward';
  const y=site.stage<3?sampleWater(site.x,site.z)+.065:site.y;
  const face=camera?Math.atan2(camera.position.x-site.x,camera.position.z-site.z):site.angle;
  const pulse=.5+.5*Math.sin(time*2.6);
  shrine.root.position.set(site.x,y,site.z);
  shrine.root.rotation.y=face+.20*Math.sin(time*.49);
  shrine.mirror.visible=mirror;
  shrine.jade.visible=!mirror;
  shrine.face.material.uniforms.uTime.value=time;
  shrine.pendant.position.y=1.76+.13*pulse;
  shrine.pendant.rotation.set(.09*Math.sin(time*.8),.31*Math.sin(time*.64),.10*Math.sin(time*.82));
  shrine.pendant.scale.setScalar(reward?1.31:active?1.03:1.17);
  rim.userData.inkTint=mirror?oathTints.mirrorRim:oathTints.tetherRim;
  if(site.stage<3){
    fitWaterStroke(rim,instance.rimGeometry,site.x,site.z,site.radius,sampleWater,.068);
  }else{
    const positions=rim.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setY(i,0);
    positions.needsUpdate=true;
    rim.position.set(site.x,y+.04,site.z);
    rim.scale.set(site.radius,1,site.radius);
  }
  stroke(rim,active?.86:reward?.91:.58,time,reward?.66:.25);
  trial.visible=active;
  if(!active)return;
  const beacons=site.beacons??[];
  const first=beacons.find(beacon=>!beacon.cleared);
  if(!mirror&&first){
    const last=beacons.at(-1);
    const from=beacons.indexOf(first)===0?game.p:first;
    aimedStart.set(from.x,Math.max(from.y,site.stage<3?sampleWater(from.x,from.z):from.y)+.13,from.z);
    aimedEnd.set(last.x,Math.max(last.y,site.stage<3?sampleWater(last.x,last.z):last.y)+.23,last.z);
    aimOathStroke(rail,aimedStart,aimedEnd,1.25);
    stroke(rail,.83,time,.59);
  }else rail.visible=false;
  for(let i=0;i<tokens.length;i++){
    const {circle,token}=tokens[i];
    const beacon=beacons[i];
    if(!beacon||mirror){circle.visible=token.visible=false;continue;}
    const level=site.stage<3?sampleWater(beacon.x,beacon.z)+.08:beacon.y-.20;
    circle.position.set(beacon.x,level,beacon.z);
    circle.scale.setScalar(beacon.radius??1.22);
    circle.rotation.y=-time*.46+i*.59;
    stroke(circle,beacon.cleared?.28:.95,time,beacon.cleared?.78:.23);
    token.visible=!beacon.cleared;
    token.position.set(beacon.x,Math.max(beacon.y,level)+.49+.11*Math.sin(time*3+i),beacon.z);
    token.scale.setScalar(.49);
    token.rotation.set(.18,face+time*.37,.20*Math.sin(time*3+i));
  }
  const emitter=site.emitter;
  const hazard=mirror&&game.hazards.find(hazard=>hazard.oathSite===site.id&&hazard.life>0);
  bolt.visible=Boolean(hazard);
  const target=site.beacons?.[0];
  if(!hazard||!emitter||!target){ray.visible=false;return;}
  aimOathStroke(ray,emitter,target,.83);
  stroke(ray,.58+.21*pulse,time,.68);
  const heading=Math.atan2(hazard.vx,hazard.vz);
  bolt.position.set(hazard.x,hazard.y+.13,hazard.z);
  bolt.rotation.y=heading;
  pulseInk.position.z=-1.28;
  pulseInk.scale.set(1.25,1.35,1.48);
  stroke(pulseInk,.89,time,.54);
  pulseRing.rotation.set(Math.PI*.5,0,time*.68,'YXZ');
  pulseRing.scale.setScalar(.79+.14*pulse);
  stroke(pulseRing,.94,time,.68);
}

function setSite(instance, site, game, time, sampleWater, camera, assets) {
  const {root,object,rim,vapor}=instance;
  const age = Math.max(0,game.time-(site.startedAt??game.time));
  const active=site.phase==='active',reward=site.phase==='reward';
  if(site.kind==='spring'){
    setSpring(instance,site,time,sampleWater);
    return;
  }
  if(site.kind==='oath'){
    setOath(instance,site,game,time,sampleWater,camera);
    return;
  }
  if(site.kind==='wild'){
    setWild(instance,site,game,time,sampleWater,assets);
    return;
  }
  if(site.kind==='whirlpool'){
    const {wash}=instance;
    const radius=site.radius;
    const uniforms=wash.material.uniforms;
    wash.userData.inkTint=site.deep?'#294d64':active?sceneTints.waterActive:sceneTints.water;
    uniforms.uLoad.value=reward?.39:1;
    uniforms.uInner.value=(site.innerRadius??1.7)/radius;
    fitWater(wash,site.x,site.z,radius,sampleWater);
    stroke(wash,reward?.65:.98,time,site.progress,Number(active)+Number(Boolean(site.deep))*2);
    return;
  }
  const flight = site.stage >= 3;
  const y = flight?site.y:sampleWater(site.x,site.z)+.056;
  root.position.set(site.x,y,site.z);
  const pulse = .5+.5*Math.sin(time*1.3+(site.angle??0));
  const reach=site.claimRadius??site.radius;
  const ritual=['palm','gates'].includes(site.kind);
  const ringSize=site.kind==='crane'&&active?site.radius:Math.min(reach,3.4);
  rim.scale.set(ringSize,1,ringSize);
  rim.rotation.y = time*.12;
  rim.position.y = flight?-.18:.025;
  rim.userData.inkTint=reward?sceneTints.lightGold:modes[site.kind];
  stroke(rim,site.kind==='carp'&&active?.31:active&&ritual?.32:.81+.19*pulse,time,reward?.67:.23);
  vapor.position.y=flight?-.45:.043;
  vapor.scale.set(ringSize*(.93+.10*pulse),1,ringSize*(.93+.10*pulse));
  vapor.rotation.y = time*.22+1.8;
  stroke(vapor,ritual?.28:.35,time,.8);
  if(instance.prize){
    const prize=instance.prize;
    prize.visible=reward;
    if(reward){
      prize.position.y=.52+.21*pulse;
      prize.scale.setScalar(2.7+.26*pulse);
      prize.rotation.set(time*.39,time*.79,.22);
      prize.userData.inkTint=site.relic==='indigo'?'#33578c':site.relic==='ochre'?'#a13e2b':
        site.relic==='pearl'?'#8b9a87':sceneTints.gold;
    }
  }
  if(site.kind==='carp'){
    const {beacon,pearl,station,current,fish}=instance;
    const target=site.beacon;
    beacon.visible=active&&Boolean(target);
    if(beacon.visible){
      const lift=1.02+.19*pulse;
      beacon.position.set(target.x-site.x,sampleWater(target.x,target.z)-y+lift,target.z-site.z);
      beacon.scale.setScalar(2.05);
      station.position.y=-lift/2.05+.026;
      const radius=(target.radius??2.08)/2.05;
      station.scale.set(radius,.49,radius);
      station.rotation.y=time*.31;
      pearl.rotation.y=time*.31;
      stroke(station,.88,time,.44);
    }
    current.position.y=.09;
    current.rotation.y=site.angle??0;
    stroke(current,active?.69:0,time,.70);
    fish.material.uniforms.uTime.value=time;
  }
  const rewardAge=reward?Math.max(0,game.time-(site.claimAt??game.time)+.45):0;
  object.visible=(!reward||site.kind==='crane'&&rewardAge<1.75)&&!(active&&ritual);
  if(!object.visible)return;
  if(site.kind==='sword'){
    object.position.y = 1.80+.19*Math.sin(time*2.2);
    object.rotation.set(.03, time*.48, -Math.PI*.28 + .12*Math.sin(time*1.35));
    object.scale.setScalar(1.06);
  } else if(site.kind==='pigment'){
    object.position.y = (flight?.40:1.08)+.14*Math.sin(time*1.8);
    object.rotation.y=time*.48;
    instance.facet.userData.inkTint=site.relic==='indigo'?'#33578c':'#a13e2b';
  } else if(site.kind==='crane'){
    const a=time*.55+(site.angle??0);
    const span=active||reward?.22:2.9;
    const wingbeat=Math.sin(time*(active?5.2:3.4));
    const fly=reward?smoothstep(rewardAge,.04,1.75):0;
    object.position.set(Math.cos(a)*span+Math.sin(site.angle)*8*fly,
      (active||reward?.05:1.23)+.23*wingbeat+5.6*fly,Math.sin(a)*span+Math.cos(site.angle)*8*fly);
    object.rotation.set(.05+.06*Math.cos(time*3.2),active||reward?site.angle+.14*Math.cos(age*1.1):-a,.16);
    object.scale.setScalar(1.44);
    instance.wings[0].rotation.z=-.52*wingbeat+.22;
    instance.wings[1].rotation.z=.52*wingbeat-.22;
    instance.gift.visible=!reward;
  } else if(site.kind==='carp'){
    const drift=Math.sin(time*2.75);
    object.position.y=.66+.18*drift;
    object.rotation.set(.03+.13*Math.sin(time*4.1),(site.angle??0)+.42*Math.sin(time*1.3),.21*drift,'YXZ');
    object.scale.setScalar(active?1.48:1.24);
  } else {
    const face=camera?Math.atan2(camera.position.x-site.x,camera.position.z-site.z):site.angle;
    object.position.y=.89+.13*pulse;
    object.rotation.set(.10,face+.19*Math.sin(time*.29),.16);
    object.scale.setScalar(.85);
  }
}

function setHazard(instance, hazard, now, time, camera, player, primary) {
  const {root,rim,vapor,descent,level,clear,window,mark,shape,body,marks}=instance;
  const palm = hazard.kind==='palm';
  const warning = hazard.phase==='warning';
  const t = hazard.progress;
  const fallout = warning?0:clamp((now-hazard.impactAt)/(hazard.endsAt-hazard.impactAt),0,1);
  const lead = warning?smootherstep(t,.02,.86):1;
  const descending = warning?smootherstep(t,.17,1):1;
  const flightHeight = hazard.height ?? 6;
  const altitude = (1-descending)*(palm?10.8:11.7);
  const offset = (1-descending)*(palm?15.2:4.7);
  const y = hazard.y;
  const scaleX = palm?hazard.radius:hazard.width;
  const scaleZ = palm?hazard.radius:hazard.length;
  const yaw = hazard.angle??0;
  root.position.set(hazard.x,y,hazard.z);
  root.rotation.y=yaw;

  // The ring or rectangle is evaluated on the same plane and footprint as
  // collision. The vapor and trailing bristles sit above it.
  const [floor,ceiling]=hazard.fullAltitude?flightBand(3):[y-flightHeight*.5,y+flightHeight*.5];
  const markLevel=palm?clamp(player.y,floor,ceiling):hazard.role==='lower'?ceiling:hazard.role==='upper'?floor:y;
  rim.position.y=markLevel-y;
  rim.scale.set(scaleX,1,scaleZ);
  stroke(rim,warning?.77+.23*lead:1-fallout,time,.10+.24*lead,Number(!palm));
  level.position.y=(floor+ceiling)*.5-y;
  level.scale.set(scaleX,ceiling-floor,scaleZ);
  stroke(level,warning?.44+.36*lead:0,time,.44);
  const legibility=warning?(primary?.82+.16*lead:.40+.25*lead):0;
  if(palm){
    mark.group.position.y=markLevel-y+.037;
    mark.group.scale.set(scaleX,1,scaleZ);
    updateRouteMark(mark,legibility,time);
  }
  if(clear){
    const safe=Number.isFinite(hazard.safeY);
    clear.position.y=(hazard.safeY??y)-y;
    clear.scale.set(scaleX*.92,.25,Math.max(scaleZ,12.4));
    stroke(clear,safe&&warning?.31+.19*lead:0,time,.70,1);
    const safeSide=hazard.role==='lower'?1:-1;
    const routeY=clamp((hazard.safeY??y)+1.27*safeSide,...flightBand(3));
    mark.group.position.y=routeY-y;
    mark.group.scale.set(scaleX,1,Math.max(scaleZ,12.4));
    updateRouteMark(mark,safe?legibility:0,time);
    const [flightFloor,flightCeiling]=flightBand(3);
    const space=safeSide>0?flightCeiling-hazard.safeY:hazard.safeY-flightFloor;
    const ribbonHeight=Math.min(2.1,space);
    window.position.set(0,clear.position.y+safeSide*ribbonHeight*.5,-scaleZ*.42);
    window.scale.set(scaleX*.89,ribbonHeight,1);
    stroke(window,safe&&warning&&primary?.30+.13*lead:0,time);
  }
  vapor.rotation.y=palm?time*.25:0;
  vapor.scale.set(palm?scaleX*(1+.55*fallout):scaleX*.53,
    1,palm?scaleZ*(1+.55*fallout):scaleZ*.51);
  vapor.position.y=-.15;
  stroke(vapor,warning?.20+.17*lead:.82*(1-fallout)**1.7,time,.63);
  descent.scale.set(palm?scaleX:scaleX*.86,Math.max(.01,Math.hypot(altitude,offset)),palm?scaleZ:scaleZ*.85);
  instance.fallAxis.set(0,altitude+.00001,offset).normalize();
  descent.quaternion.setFromUnitVectors(up,instance.fallAxis);
  descent.position.y=flightHeight*.12;
  stroke(descent,warning?(.26+.24*lead)*(1-smoothstep(t,.88,1)):0,time,.50);

  const opacity = warning ? .64+.36*smoothstep(t,.02,.51) : (1-fallout)**.47;
  if (palm) {
    const presenting = 1 - smoothstep(t,.70,1);
    const cameraAngle = camera ? Math.atan2(camera.position.x-hazard.x,camera.position.z-hazard.z) : yaw;
    const turn = Math.atan2(Math.sin(cameraAngle-yaw),Math.cos(cameraAngle-yaw));
    // The fingers lean into the fall while the face stays legible from
    // the flight camera. The warning footprint remains fixed beneath it.
    shape.rotation.set(-.33-.56*descending,turn,-.17-.12*presenting,'YXZ');
    shape.position.y = (markLevel-y)+altitude+.88-.62*fallout;
    shape.scale.setScalar(scaleX*(.78+.22*lead));
    stroke(marks,opacity,time,.17);
  } else {
    const modelHeight=clamp(flightHeight,3.3,8.0);
    const modelCenter=hazard.role==='lower'?ceiling-modelHeight*.48:hazard.role==='upper'?floor+modelHeight*.45:y;
    shape.position.y = modelCenter-y+altitude+modelHeight*.02;
    shape.scale.set(scaleX,modelHeight/6.05,scaleX);
    stroke(marks,opacity,time);
    stroke(shape.children[2],opacity,time);
  }
  shape.position.z = offset;
  const uniforms=body.material.uniforms;
  uniforms.uClearHead.value=1;
  uniforms.uHead.value.set(player.x,player.y,player.z);
  stroke(body,opacity,time);
}

function drawEdgeCue(mesh,hazard,camera,player,time,ndc,view) {
  mesh.visible=false;
  if(!hazard||!camera)return;
  const palm=hazard.kind==='palm';
  const y=palm?player.y:(hazard.safeY??hazard.y)+(hazard.role==='lower'?1.27:-1.27);
  ndc.set(hazard.x,y,hazard.z).project(camera);
  view.set(hazard.x,y,hazard.z).applyMatrix4(camera.matrixWorldInverse);
  const maxX=.83,maxY=.72;
  if(view.z<0&&Math.abs(ndc.x)<maxX&&Math.abs(ndc.y)<maxY)return;
  let x=ndc.x,yScreen=ndc.y;
  if(view.z>=0){
    x=Math.abs(view.x)>.45?Math.sign(view.x)*3:0;
    yScreen=-1.7;
  }
  const spread=Math.max(Math.abs(x)/maxX,Math.abs(yScreen)/maxY,1);
  ndc.set(x/spread,yScreen/spread,.48).unproject(camera);
  mesh.position.copy(ndc);
  mesh.quaternion.copy(camera.quaternion);
  mesh.rotateZ(Math.atan2(-x,yScreen));
  const cameraDepth=Math.abs(view.copy(ndc).applyMatrix4(camera.matrixWorldInverse).z);
  const screenHeight=camera.isPerspectiveCamera?cameraDepth*2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)):
    (camera.top-camera.bottom)/camera.zoom;
  mesh.scale.setScalar(screenHeight*.074);
  stroke(mesh,.88,time,0,Number(palm));
}

function drawGateReticle(reticle,hazard,camera,player,time,ndc,view) {
  const {group,arrow,aligned}=reticle;
  group.visible=hazard?.kind==='gate'&&Number.isFinite(hazard.safeY)&&Boolean(camera);
  if(!group.visible)return;
  const safeSide=hazard.role==='lower'?1:-1;
  const routeY=clamp(hazard.safeY+safeSide*1.27,...flightBand(3));
  const halfWidth=hazard.width*.46;
  const yaw=hazard.angle??0,cos=Math.cos(yaw),sin=Math.sin(yaw);
  const along=Math.min(4.3,hazard.length*.73);
  const lateral=(player.x-hazard.x)*cos-(player.z-hazard.z)*sin;
  const sideFit=clamp(lateral*.45,-halfWidth*.65,halfWidth*.65);
  const x=hazard.x+cos*sideFit-sin*along;
  const z=hazard.z-sin*sideFit-cos*along;
  ndc.set(x,routeY,z).project(camera);
  view.set(x,routeY,z).applyMatrix4(camera.matrixWorldInverse);
  const behind=view.z>=0;
  const boundX=camera.aspect<1?.73:.78;
  const targetX=behind?Math.sign(view.x||1)*boundX:clamp(ndc.x,-boundX,boundX);
  const targetY=behind?-.52:clamp(ndc.y,-.56,.67);
  const level=(player.y-hazard.safeY)*safeSide>.38;
  ndc.set(targetX,targetY,.43).unproject(camera);
  group.position.copy(ndc);
  group.quaternion.copy(camera.quaternion);
  const depth=Math.abs(view.copy(ndc).applyMatrix4(camera.matrixWorldInverse).z);
  const height=camera.isPerspectiveCamera?depth*2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)):
    (camera.top-camera.bottom)/camera.zoom;
  group.scale.setScalar(height*(level?.033:.041));
  arrow.scale.y=safeSide;
  stroke(arrow,level?0:.96,time);
  stroke(aligned,level?.94:0,time);
}

function setSlash(mesh, slash, time) {
  const age=slash.progress;
  const tint=slash.element==='ochre'?'#ad4630':slash.element==='indigo'?'#3f6b90':sceneTints.steel;
  mesh.userData.inkTint=tint;
  mesh.position.set(slash.x,slash.y,slash.z);
  mesh.rotation.set(-Math.atan2(slash.vy,Math.hypot(slash.vx,slash.vz))*.8,
    slash.angle,-slash.side*(.14-.08*age),'YXZ');
  mesh.scale.set(slash.width,slash.height,slash.dash?3.12:2.25);
  stroke(mesh,Math.min(1,.56+age*13)*(1-age)**.44,time,.85);
}

function restorePigment(mesh, {tint,amount,hold}) {
  const data=mesh.userData;
  if (tint===undefined) delete data.inkTint;
  else data.inkTint=tint;
  if (amount===undefined) delete data.inkTintAmount;
  else data.inkTintAmount=amount;
  if (hold===undefined) delete data.inkMineralHold;
  else data.inkMineralHold=hold;
}

function applyPigment(bridge, pigment, painted, frame) {
  for (const entry of bridge?.entries??[]) {
    if(entry.inkRole!=='body'&&entry.inkRole!=='wing'&&entry.kind!=='loft')continue;
    const mesh=entry.mesh;
    const data=mesh.userData;
    let saved=painted.get(mesh);
    if(!saved){
      saved={tint:data.inkTint,amount:data.inkTintAmount,hold:data.inkMineralHold,frame};
      painted.set(mesh,saved);
    }
    saved.frame=frame;
    data.inkTint=pigment.color;
    data.inkTintAmount=entry.inkRole==='wing'?.62:.88;
    data.inkMineralHold=entry.inkRole==='wing'?.32:.56;
  }
}

/** World-space ink marks and a bounded set of reusable wonder models. */
export class InkWondersVisual {
  constructor(scene) {
    this.root=new THREE.Group();
    this.root.name='山海奇遇';
    scene.add(this.root);
    this.assets={
      rim:rimGeometry(), rect:rectangularRim(), vapor:vaporGeometry(),
      palm:palmGeometry(), lines:palmCreases(), gate:gateGeometry(),
      fall:fallTraces(), sword:swordGeometry(), slash:slashGeometry(),
      palmLevel:levelTraces(false), gateLevel:levelTraces(true),
      palmFootprint:splitPalmFootprint(),gateCenter:gateSafeCenter(),gateWindow:new THREE.PlaneGeometry(1,1),
      gift:new THREE.OctahedronGeometry(.20,0).scale(.65,1,.65),
      pearl:pearlGeometry(),
      oath:oathGeometry(), oathRay:oathRayGeometry(), artifactRing:artifactRingGeometry(),
      counter:counterCrescent(), tetherBrush:tetherBrush(),
      wildCauldron:mergeParts([
        new THREE.CylinderGeometry(.69,.48,.52,10).translate(0,1.06,0),
        new THREE.TorusGeometry(.56,.10,6,18).rotateY(Math.PI*.5).translate(-.61,1.19,0),
        new THREE.TorusGeometry(.56,.10,6,18).rotateY(Math.PI*.5).translate(.61,1.19,0),
      ]),
      wildLip:new THREE.TorusGeometry(.70,.11,6,22).rotateX(-Math.PI*.5).translate(0,1.34,0),
      wildFront:wildFrontGeometry(),
      breakwater:breakwaterGeometry(),
      ...carpParts(), jets:springJets(), flow:flowStrokes(),
    };
    this.sites=new Map();
    this.hazards=new Map();
    this.slashes=[];
    this.artifactEffects=[];
    this.artifactEvents=[];
    this.mirrorCharge=makePaint(this.assets.artifactRing,oathTints.mirror,strokeFragment,{load:.82,order:12});
    this.mirrorCharge.name='镜鳞蓄势';
    this.mirrorCharge.visible=false;
    this.root.add(this.mirrorCharge);
    this.breakwater=makePaint(this.assets.breakwater,'#437b84',strokeFragment,{load:.92,order:12});
    this.breakwater.name='截浪符水幕';
    this.breakwater.visible=false;
    this.root.add(this.breakwater);
    this.painted=new Map();
    this.paintFrame=0;
    this.swing=null;
    this.run=null;
    this.weapon=swordModel(this.assets.sword);
    this.weapon.name='龙口衔剑';
    this.weapon.visible=false;
    this.root.add(this.weapon);
    this.edgeCue=reserveMark(edgeCueGeometry(),34,true);
    this.edgeCue.name='画缘奇遇指示';
    this.edgeCue.material.depthTest=false;
    this.edgeCue.visible=false;
    this.edgePoint=new THREE.Vector3();
    this.edgeView=new THREE.Vector3();
    this.root.add(this.edgeCue);
    this.gateReticle=makeGateReticle();
    this.root.add(this.gateReticle.group);
    this.mouth=new THREE.Vector3();
  }

  reset() {
    this.root.visible=false;
    for(const pool of [this.sites,this.hazards]){
      for(const instances of pool.values())for(const instance of instances)instance.root.visible=false;
    }
    for(const slash of this.slashes)slash.visible=false;
    for(const effect of this.artifactEffects)effect.root.visible=false;
    this.artifactEvents.length=0;
    this.mirrorCharge.visible=false;
    this.breakwater.visible=false;
    this.edgeCue.visible=false;
    this.gateReticle.group.visible=false;
    this.weapon.visible=false;
    this.swing=null;
    this.run=null;
    for(const [mesh,saved] of this.painted)restorePigment(mesh,saved);
    this.painted.clear();
  }

  event(event,time) {
    if (event.type==='wonderSword') this.swing={time,side:event.side,dash:event.dash};
    if (event.type==='wonderArtifact'&&artifactLifetimes[event.action]){
      if(this.artifactEvents.length>=5)this.artifactEvents.shift();
      this.artifactEvents.push({event,at:time,life:clamp(event.duration??artifactLifetimes[event.action],.32,1.20)});
    }
  }

  instance(pool,kind,index,create) {
    let instances=pool.get(kind);
    if(!instances)pool.set(kind,instances=[]);
    let instance=instances[index];
    if(!instance){
      instance=create(kind,this.assets);
      this.root.add(instance.root);
      instances.push(instance);
    }
    instance.root.visible=true;
    return instance;
  }

  paintDragon(dragon,pigment) {
    // The growth bridge may replace meshes as body length changes, so tint
    // the current painted surfaces after the dragon pose is updated.
    const frame=++this.paintFrame;
    if(pigment&&dragon){
      applyPigment(dragon.active?.bridge,pigment,this.painted,frame);
      if(dragon.shapeChange?.from!==dragon.active)applyPigment(dragon.shapeChange?.from?.bridge,pigment,this.painted,frame);
    }
    for(const [mesh,saved] of this.painted){
      if(saved.frame===frame)continue;
      restorePigment(mesh,saved);
      this.painted.delete(mesh);
    }
  }

  drawSword(tier,time,frame,dragon) {
    this.weapon.visible=tier>0&&Boolean(frame);
    if(!this.weapon.visible)return;
    const {position,heading}=frame;
    const mouth=dragon?.muzzle?.(this.mouth);
    if(mouth)this.weapon.position.copy(mouth);
    else this.weapon.position.set(position.x+Math.sin(heading)*.91,position.y+.1,position.z+Math.cos(heading)*.91);
    const duration=this.swing?.dash?.43:.32;
    const age=this.swing?(time-this.swing.time)/duration:1;
    const swing=age>=0&&age<1?Math.sin(age*Math.PI)*(this.swing.side??1):0;
    this.weapon.rotation.set(-.35+.77*swing,heading-.13+.98*swing,.10+.40*swing,'YXZ');
    this.weapon.translateX(.23);
    this.weapon.scale.setScalar(.82+tier*.07);
  }

  drawArtifacts(wonders,time,now,player,sampleWater) {
    for(let i=this.artifactEvents.length-1;i>=0;i--){
      const effect=this.artifactEvents[i];
      if(time>=effect.at+effect.life)this.artifactEvents.splice(i,1);
    }
    for(let i=0;i<this.artifactEvents.length;i++){
      let effect=this.artifactEffects[i];
      if(!effect){
        effect=makeArtifactEffect(this.assets);
        this.artifactEffects.push(effect);
        this.root.add(effect.root);
      }
      drawArtifactEffect(effect,this.artifactEvents[i],this.assets,time,sampleWater);
    }
    for(let i=this.artifactEvents.length;i<this.artifactEffects.length;i++)this.artifactEffects[i].root.visible=false;
    const wall=wonders.breakwater;
    const visible=wall&&wall.until>now;
    this.breakwater.visible=Boolean(visible);
    if(visible){
      const clarity=wall.charges>0?.88:.32;
      const fade=clamp((wall.until-now)*4,0,1);
      const y=Math.max(wall.y,sampleWater(wall.x,wall.z));
      this.breakwater.position.set(wall.x,y-.1,wall.z);
      this.breakwater.scale.set(wall.radius,1.3,wall.radius);
      this.breakwater.rotation.y=time*.24;
      stroke(this.breakwater,clarity*fade,time,.51);
    }
    const charge=wonders.relics.oath==='mirror'&&wonders.artifact?.charge;
    this.mirrorCharge.visible=Boolean(charge);
    if(!charge)return;
    this.mirrorCharge.position.set(player.x,player.y+.11,player.z);
    this.mirrorCharge.rotation.set(.18,time*.81,0,'YXZ');
    this.mirrorCharge.scale.set(1.24,.46,1.38);
    stroke(this.mirrorCharge,.64+.25*Math.sin(time*5),time,.55);
  }

  update(game,time,active,water,camera,frame,dragon,focusOnRelay=false) {
    if(this.run!==game){
      this.reset();
      this.run=game;
    }
    const wonders=game.wonders;
    const display=Boolean(active&&wonders);
    this.root.visible=display;
    this.paintDragon(dragon, active||game.stage===4 ? wonders?.pigment : null);
    if(!display)return;

    const count={}, hazardCount={};
    const sampleWater = surfaceHeightSampler(water,0);
    const contested=wonders.active?.kind==='palm'||wonders.active?.kind==='gates';
    let nextHazard=null;
    for(const site of wonders.sites) {
      if(site.stage!==game.stage||site.phase==='spent')continue;
      if(focusOnRelay&&site.phase==='ready'&&site!==wonders.active)continue;
      if(contested&&site.kind==='crane'&&site.phase==='ready')continue;
      if(wonders.active?.kind==='wild'&&site.kind==='whirlpool'&&site.phase==='ready'&&
        Math.hypot(site.x-wonders.active.x,site.z-wonders.active.z)<site.radius+wonders.active.radius)continue;
      const dx=site.x-game.p.x,dz=site.z-game.p.z;
      const visible=dx*dx+dz*dz < (site.phase==='active'?74**2:44**2);
      if(!visible)continue;
      const index=count[site.kind]??0;
      setSite(this.instance(this.sites,site.kind,index,makeSite),site,game,time,sampleWater,camera,this.assets);
      count[site.kind]=index+1;
      const primary=site.hazards?.find(hazard=>hazard.phase==='warning'&&game.time>=hazard.startsAt);
      if(primary&&(!nextHazard||primary.impactAt<nextHazard.impactAt))nextHazard=primary;
      for(const hazard of site.hazards??[]) {
        if(game.time<hazard.startsAt||hazard.phase==='spent')continue;
        const number=hazardCount[hazard.kind]??0;
        setHazard(this.instance(this.hazards,hazard.kind,number,makeHazard),hazard,game.time,time,camera,frame?.position??game.p,hazard===primary);
        hazardCount[hazard.kind]=number+1;
      }
    }
    for(const [pool,counts] of [[this.sites,count],[this.hazards,hazardCount]]){
      for(const [kind,instances] of pool){
        for(let i=counts[kind]??0;i<instances.length;i++)instances[i].root.visible=false;
      }
    }

    const slashes=wonders.slashes;
    for(let i=0;i<slashes.length;i++){
      let mesh=this.slashes[i];
      if(!mesh){
        mesh=makePaint(this.assets.slash,sceneTints.steel,strokeFragment,{load:.92,order:12});
        mesh.name='分水剑气';
        this.slashes.push(mesh);
        this.root.add(mesh);
      }
      setSlash(mesh,slashes[i],time);
    }
    for(let i=slashes.length;i<this.slashes.length;i++)this.slashes[i].visible=false;
    this.drawSword(wonders.relics.sword,time,frame,dragon);
    this.drawArtifacts(wonders,time,game.time,frame?.position??game.p,sampleWater);
    const player=frame?.position??game.p;
    drawEdgeCue(this.edgeCue,nextHazard?.kind==='gate'?null:nextHazard,camera,player,time,this.edgePoint,this.edgeView);
    drawGateReticle(this.gateReticle,nextHazard,camera,player,time,this.edgePoint,this.edgeView);
  }
}
