import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (start, end, value) => THREE.MathUtils.smoothstep(value, start, end);
const after = (start, end, value) => 1 - smooth(start, end, value);
const noise = (n) => {
  const value = Math.sin(n * 127.1 + 174.9) * 43758.5453;
  return value - Math.floor(value);
};

const surfaceMask = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float hasDepth;
  uniform vec2 resolution;
  void testDepth() {
    if (hasDepth > .5) {
      float depth = texture2D(tDepth, gl_FragCoord.xy / resolution).r;
      if (gl_FragCoord.z > depth + .000065) discard;
    }
  }
  float hash(vec2 p) {
    return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.54);
  }
  float wash(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),
      mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
  }
`;

const shapeVertex = /* glsl */ `
  varying vec2 inkUV;
  varying vec2 inkPosition;
  void main() {
    inkUV = uv;
    inkPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
  }
`;

const circleFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity, frost, phase;
  varying vec2 inkUV, inkPosition;
  void main() {
    testDepth();
    float radius = length(inkPosition);
    float a = atan(inkPosition.y, inkPosition.x);
    float dry = wash(inkPosition * 77.);
    float grain = hash(floor(gl_FragCoord.xy * .67));
    float brush = .6 * wash(inkPosition * 18. + 4.) + .3 * dry + .1 * grain;
    float rim = .921 + .027 * sin(a * 9.) + .013 * sin(a * 27.);
    float core = 1. - smoothstep(.019,.076,abs(radius-rim + .035*brush));
    float chalk = 1. - smoothstep(.007,.029,abs(radius-rim - .018*dry));
    float thin = 1. - smoothstep(.009,.023,abs(radius-rim + .103));
    float ribs = 1. - smoothstep(.031,.30,abs(sin(a * 36. + 2.5*brush)));
    float radial = 1. - smoothstep(.01,.052,abs(radius-.79));
    float flecks = smoothstep(.40,.83,brush + .17 * sin(a * 53.));
    float opacityMask = max(core * (.62 + .38 * flecks), max(thin * .49, ribs * radial * .77));
    float edge = max(chalk*.91, thin*.55) * (.57+.43*dry);
    vec3 ink = mix(vec3(.155,.115,.078),vec3(.14,.35,.45),frost);
    vec3 color = mix(ink,mix(vec3(.93,.76,.51),vec3(.94,.99,1.),frost),edge);
    color = mix(color,vec3(.99,.97,.87),phase * .21);
    float alpha = max(opacityMask,edge) * opacity * (.54 + .46 * brush) *
      (1. - smoothstep(.975,1.,radius));
    if (alpha < .006) discard;
    gl_FragColor = vec4(color,alpha);
  }
`;

// The advancing stone front is a vertical curtain. Dry breaks expose the
// landscape through it and the lower stroke connects it to the surface.
const curtainFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity, frost;
  varying vec2 inkUV, inkPosition;
  void main() {
    testDepth();
    float a = inkUV.x;
    float height = inkUV.y;
    float grain = wash(vec2(a*106.,height*13.));
    float fiber = wash(vec2(a*136.,height*4.));
    float tooth = hash(vec2(floor(a*153.),9.));
    float crest = .24+.39*fiber+.24*tooth;
    float leaning = sin(a*314.+height*4.);
    float stroke = (1.-smoothstep(crest*.54,crest,height)) *
      smoothstep(.02,.20,height) * (.30+.70*smoothstep(.13,.78,grain+.13*leaning));
    float edge = (1.-smoothstep(.03,.14,abs(height-crest*.68))) * grain * grain;
    vec3 dark = mix(vec3(.14,.095,.063),vec3(.28,.52,.62),frost);
    vec3 light = mix(vec3(.82,.62,.35),vec3(.92,.99,1.),frost);
    float alpha = max(stroke,edge*.45) * opacity;
    if (alpha < .006) discard;
    gl_FragColor = vec4(mix(dark,light,edge),alpha);
  }
`;

const faultVertex = /* glsl */ `
  uniform float rise, time;
  varying vec2 faultPoint;
  void main() {
    faultPoint=position.xy;
    float r=length(position.xy);
    float angle=atan(position.y,position.x);
    float broken=sin(angle*7.+sin(angle*13.))*.18+sin(angle*18.+time*3.)*.16;
    float crest=.80+.046*sin(angle*9.2)+.018*sin(angle*26.);
    float ridge=1.-smoothstep(.018,.20,abs(r-crest));
    float shoulder=1.-smoothstep(.03,.19,abs(r-crest+.13));
    float y=(ridge*(.50+broken)+shoulder*.12)*rise;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position.xy,y,1.);
  }
`;

const faultFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity, time, phase;
  varying vec2 faultPoint;
  void main() {
    testDepth();
    float angle=atan(faultPoint.y,faultPoint.x), r=length(faultPoint);
    float fibers=wash(faultPoint*104.);
    float rough=wash(faultPoint*37. + vec2(time*.08,3.5));
    float facets=wash(faultPoint*14.);
    float seam=.80+.046*sin(angle*9.2)+.018*sin(angle*26.);
    float signedR=r-seam;
    float footing=(1.-smoothstep(.025,.20,abs(signedR)))*(.74+.26*facets);
    float thrownEdge=1.-smoothstep(.010,.042,abs(signedR + .018*(fibers-.5)));
    float split=1.-smoothstep(.009,.038,abs(signedR+.109+.019*sin(angle*27.)));
    float shear=1.-smoothstep(.029,.18,abs(sin(angle*9. + r*8. + facets*.7)));
    float contour=max(thrownEdge,split*.66)*(.37+.63*rough);
    vec3 deep=vec3(.16,.145,.12), ochre=vec3(.44,.34,.24);
    vec3 stone=mix(deep,ochre,rough*.34 + smoothstep(-.14,.17,signedR)*.48);
    stone=mix(stone,vec3(.84,.75,.56),contour*(.47+.19*phase));
    stone=mix(stone,vec3(.20,.185,.157),shear*.43);
    float alpha=footing*opacity*(.61+.39*fibers)*(1.-smoothstep(.94,1.,r));
    if(alpha<.007) discard;
    gl_FragColor=vec4(stone,alpha);
  }
`;

const heldVertex = /* glsl */ `
  varying vec2 platePoint;
  varying vec2 location;
  void main() {
    platePoint=position.xy;
    location=instanceMatrix[3].xz;
    gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
  }
`;

const heldFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity;
  varying vec2 platePoint,location;
  void main() {
    testDepth();
    float r=length(platePoint), angle=atan(platePoint.y,platePoint.x);
    float seed=dot(location,vec2(.9,.37));
    float rough=wash(platePoint*13.+seed);
    float facets=wash(platePoint*4.+0.29*seed);
    float edge=.73+.13*sin(angle*3.+seed)+.07*sin(angle*7.3)+.14*facets;
    float body=1.-smoothstep(.048,.17,r-edge + .08*rough);
    float ledge=1.-smoothstep(.014,.079,abs(r-edge-.02));
    float seam=1.-smoothstep(.024,.083,abs(sin(dot(platePoint*vec2(14.,6.),vec2(.41,.91))+rough*.63+seed)));
    vec3 pigment=mix(vec3(.21,.185,.15),vec3(.55,.486,.40),facets*.73);
    pigment=mix(pigment,vec3(.89,.79,.60),ledge*.88+.11*seam);
    float alpha=opacity*max(body*(.28+.53*facets),ledge*.87)*(.64+.36*rough);
    if(alpha<.008) discard;
    gl_FragColor=vec4(pigment,alpha);
  }
`;

const fracturesFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity, frost, phase;
  varying vec2 inkUV, inkPosition;
  void main() {
    testDepth();
    float r=length(inkPosition), a=atan(inkPosition.y,inkPosition.x);
    float field = wash(inkPosition*18.);
    float branches = a * mix(7.,11.,frost) + sin(r*14.) * .28 + .19 * field;
    float breaks = abs(sin(branches));
    float radial = 1. - smoothstep(.040,.138,breaks);
    float fork = 1. - smoothstep(.021,.086,abs(sin(branches + .65 * smoothstep(.32,.78,r))));
    float bands = 1. - smoothstep(.034,.24,abs(sin(r*34. + 1.3*sin(a*6.) + .8*field)));
    float veins = max(radial * (.36 + .64*field), max(fork * field * .58,bands * frost * .17));
    veins *= smoothstep(.12,.22,r) * (1. - smoothstep(.87,1.,r));
    float pressure = (1. - smoothstep(.18,1.,r)) * (.24 + field*.48);
    float grain = hash(floor(gl_FragCoord.xy*.82));
    float pigment = mix(pressure*.32,pressure*.08,frost);
    vec3 base = mix(vec3(.25,.18,.12),vec3(.19,.40,.49),frost);
    vec3 sheen = mix(vec3(.78,.58,.37),vec3(.87,.98,1.),frost);
    vec3 color = mix(base,sheen,max(phase*.26,veins*(.15+.76*frost)));
    float alpha = (pigment + veins * (.69 + .25 * phase)) * opacity * (.73+.27*grain);
    if (alpha < .006) discard;
    gl_FragColor=vec4(color,alpha);
  }
`;

const shardVertex = /* glsl */ `
  uniform float progress, frost, phase, radius, lift, shatterAge;
  attribute vec4 fragment;
  attribute vec2 faceData;
  varying vec2 fragmentUv;
  varying vec2 tone;
  varying float presence;
  vec2 turn(vec2 x,float a) {
    float s = sin(a), c = cos(a);
    return vec2(c*x.x-s*x.y,s*x.x+c*x.y);
  }
  void main() {
    float seed=fragment.w;
    vec2 outward = vec2(cos(fragment.x),sin(fragment.x));
    float distance = radius * fragment.y;
    float delay=fragment.y*.19;
    float kicked=smoothstep(delay,delay+.06,shatterAge);
    float life=clamp((shatterAge-delay)/.42,0.,1.);
    float expand = phase > .5 ? mix(life,progress,frost) : 0.;
    float launch = life * (1.-life*.75);
    float offset = mix(.18,.63,frost) * expand * radius * (.42+seed*.72);
    float rise = mix(lift*(.045+fragment.z*.16 + launch * (.63+1.10*seed)),
      lift*(fragment.z + progress * (1.-progress*.55)*(1.3+2.4*seed)) ,frost);
    vec3 body = position;
    body.xz=turn(body.xz,fragment.x+expand*(1.1+seed*5.5));
    body.yz=turn(body.yz,seed*2.+expand*(.9+seed*2.)*sign(seed-.5));
    float size = radius * mix(.050,.063,frost) * (.26+.74*seed);
    size *= mix(.52,1.,smoothstep(0.,.57,progress+phase*.52));
    body *= size * mix(vec3(1.4,.76,1.19),vec3(1.13,1.54,.85),frost);
    vec3 p = vec3(outward.x*(distance+offset),rise,outward.y*(distance+offset)) + body;
    fragmentUv=uv;
    tone=vec2(seed,faceData.x);
    presence=mix(kicked*(1.-smoothstep(.73,1.,life)),1.,frost);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.);
  }
`;

const shardFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity, frost;
  varying vec2 fragmentUv, tone;
  varying float presence;
  void main() {
    testDepth();
    vec2 uv = fragmentUv;
    float edge = 1. - smoothstep(.009,.052,min(min(uv.x,uv.y),1.-uv.x-uv.y));
    float fibers = wash(uv * vec2(13.,43.) + tone.x * 7.2);
    float fine = wash(uv*89.);
    vec3 rock = mix(vec3(.16,.149,.125),vec3(.50,.425,.33),tone.y*.86+fibers*.14);
    vec3 ice = mix(vec3(.28,.52,.60),vec3(.86,.98,1.),tone.y*.58+fibers*.42);
    vec3 ink = mix(rock,ice,frost);
    ink = mix(ink,mix(vec3(.63,.54,.43),vec3(.96,.99,1.),frost),edge*(.50+fine*.35));
    float alpha = opacity * presence * (.83 + .17*fibers) * mix(1.,.49 + .49*edge,frost);
    if (alpha < .005) discard;
    gl_FragColor = vec4(ink,alpha);
  }
`;

// One sheet over the measured freeze footprint. Fracture opens to the original
// paper and terrain through the same paths it traced in the intact ice.
const frostSheetVertex = /* glsl */ `
  uniform float spread;
  varying vec2 sheetPoint;
  void main() {
    sheetPoint=position.xy;
    float lift=(.035+.035*cos(position.x*5.+position.y*4.))*spread;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position.xy,lift,1.);
  }
`;

const frostFracture = /* glsl */ `
  float frostFault(vec2 p,float heading,float turn) {
    float a=atan(p.y,p.x)-heading;
    float distance=length(p);
    float bend=.49+.19*sin(a*2.+.7)+.09*cos(a*5.-.2);
    return abs(sin(a*3.5+bend*sin(distance*12.)+.19*sin(distance*26.)+turn))*distance;
  }
`;

const frostSheetFragment = /* glsl */ `
  ${surfaceMask}
  ${frostFracture}
  uniform float opacity, fracture, split, heading;
  uniform vec2 crackOrigin;
  varying vec2 sheetPoint;
  void main() {
    testDepth();
    vec2 q=sheetPoint, p=q-crackOrigin;
    float span=length(q), distance=length(p);
    float a=atan(p.y,p.x)-heading;
    float rag=wash(q*14.);
    float paper=hash(floor(gl_FragCoord.xy*.80));
    float edge=span+.055*sin(atan(q.y,q.x)*7.+.8)+.029*sin(atan(q.y,q.x)*13.);
    float body=1.-smoothstep(.86,.99,edge);
    float branch=frostFault(p,heading,0.);
    float minor=frostFault(p,heading,.44);
    float gap=(1.-smoothstep(.009+split*.075,.020+split*.094,branch));
    float crest=1.-smoothstep(.014,.036,abs(branch-.028-split*.093));
    float fringe=1.-smoothstep(.006,.021,minor);
    float crackFront=1.-smoothstep(fracture-.12,fracture+.042,distance);
    float open=crackFront*gap*min(1.,split*2.9);
    float flight=length((gl_FragCoord.xy/resolution-vec2(.50,.03))*vec2(1.10,1.));
    float space=smoothstep(.19,.44,flight);
    float skyline=1.-smoothstep(.014,.068,abs(edge-.89));
    float shards=smoothstep(.25,.69,rag+.18*sin(a*3.5))*pow(body,.7);
    vec3 dark=vec3(.11,.28,.36), light=vec3(.83,.95,.98);
    vec3 ink=mix(dark,light,.18+.35*rag+.26*skyline);
    float veins=crackFront*(.89*gap*(1.-split)+.93*crest+.38*fringe)*
      (.56+.44*rag)*smoothstep(0.,.067,distance);
    ink=mix(ink,light,max(veins,skyline*.48));
    float filled=max(body*(.24+.24*shards),skyline*.77);
    float alpha=max(filled,veins)*space*opacity*(1.-open)*(.89+.11*paper);
    #ifdef DRAGON_REVEAL
      float stainedPaper = .86 * (1. - smoothstep(.13,.64,max(veins,skyline)));
      alpha *= dragonScenicCoverage(stainedPaper);
    #endif
    if(alpha<.006)discard;
    gl_FragColor=vec4(ink,alpha);
  }
`;

// Raise a broken face from the same field at the first contact. This view-facing
// face can be read edge-on while closer world geometry still writes over it.
const frostFaceVertex = /* glsl */ `
  varying vec2 facePoint;
  void main() {
    facePoint=position.xy;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const frostFaceFragment = /* glsl */ `
  ${surfaceMask}
  ${frostFracture}
  uniform float opacity, fracture, split, heading;
  varying vec2 facePoint;
  void main() {
    testDepth();
    vec2 p=facePoint;
    float span=length(p);
    float r=span+.062*sin(atan(p.y,p.x)*8.);
    float grain=wash(p*29.);
    float branch=frostFault(p,heading,0.);
    float opened=.009+split*.051;
    float cut=1.-smoothstep(opened,opened+.025,branch);
    float upper=1.-smoothstep(.005,.028,abs(branch-opened-.026));
    float lower=1.-smoothstep(.023,.075,abs(branch-opened-.072));
    float edgeInk=1.-smoothstep(fracture-.09,fracture+.043,span);
    float broken=edgeInk*(1.-cut);
    float fade=1.-smoothstep(.61,.96,r);
    float center=smoothstep(.047,.18,span);
    vec2 uv=gl_FragCoord.xy/resolution;
    float playable=smoothstep(.18,.43,length((uv-vec2(.50,.04))*vec2(1.35,1.)));
    float washTone=.20+.47*grain;
    vec3 ink=mix(vec3(.11,.34,.44),vec3(.85,.96,.99),washTone);
    ink=mix(ink,vec3(.94,.98,1.),upper*.94);
    float lines=max(upper*.94,lower*.69);
    float alpha=broken*fade*center*playable*opacity*
      max((.14+.16*grain)*smoothstep(.035,.15,branch),lines);
    #ifdef DRAGON_REVEAL
      float stainedPaper = .84 * (1. - smoothstep(.16,.67,lines));
      alpha *= dragonScenicCoverage(stainedPaper);
    #endif
    if(alpha<.006)discard;
    gl_FragColor=vec4(ink,alpha);
  }
`;

const frostEdgeFragment = /* glsl */ `
  ${surfaceMask}
  uniform float opacity, fracture, split;
  varying vec2 inkUV;
  void main() {
    testDepth();
    float angle=inkUV.x*6.2831853, height=inkUV.y;
    float tooth=wash(vec2(inkUV.x*83.,height*15.));
    float flank=sin(angle*4.8+.17*sin(angle*9.));
    float cliff=.25+.32*pow(.51+.49*flank,.67)+.16*sin(angle*7.)+.072*sin(angle*21.);
    float furrow=sin(angle*8.+.48*height+.36*sin(angle*15.));
    float face=(1.-smoothstep(cliff-.08,cliff+.02,height))*smoothstep(.015,.13,height);
    float cut=1.-smoothstep(.012+split*.22,.035+split*.34,abs(furrow));
    float edge=1.-smoothstep(.004,.052,abs(height-cliff+.058));
    float line=1.-smoothstep(.025,.23,abs(furrow));
    vec3 shade=mix(vec3(.12,.32,.40),vec3(.48,.70,.77),.33+.39*tooth);
    shade=mix(shade,vec3(.89,.98,1.),max(edge*.89,line*.40*fracture));
    float alpha=face*opacity*(1.-cut*split)*(.65+.35*tooth);
    if(alpha<.006)discard;
    gl_FragColor=vec4(shade,alpha);
  }
`;

function material(vertexShader, fragmentShader, uniforms, depthTest = true) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest,
    toneMapped: false,
  });
}

function mesh(geometry, shader, order) {
  const object = new THREE.Mesh(geometry, shader);
  object.frustumCulled = false;
  object.renderOrder = order;
  return object;
}

function shardGeometry() {
  const geometry = new THREE.BufferGeometry();
  const position = [], uv = [], fragment = [], faceData = [];
  const shape = [[-.60,-.35,-.31],[.43,-.53,.12],[.61,.27,-.22],[-.25,1.04,.11]];
  const faces = [[0,1,2],[0,3,1],[1,3,2],[2,3,0]];
  const coords = [0,0,1,0,0,1];
  for (let i = 0; i < 126; i++) {
    const angle = i * 2.39996, size = noise(i + .38);
    const distance = .21 + .70 * Math.sqrt(noise(i + 105.7));
    const height = .04 + .86 * noise(i + 998.3);
    faces.forEach((face,index) => {
      face.forEach(vertex => {
        position.push(...shape[vertex]);
        fragment.push(angle,distance,height,size);
        faceData.push((index+.5)/faces.length,0);
      });
      uv.push(...coords);
    });
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('fragment',new THREE.Float32BufferAttribute(fragment,4));
  geometry.setAttribute('faceData',new THREE.Float32BufferAttribute(faceData,2));
  return geometry;
}

export function createStasisArtVisuals() {
  const root = new THREE.Group();
  root.name = 'Dragon Art Stasis';
  root.visible = false;
  const surface = {
    tDepth: {value:null},
    hasDepth: {value:0},
    resolution: {value:new THREE.Vector2(1,1)},
  };
  const common = () => ({...surface, opacity:{value:0}, frost:{value:0}, phase:{value:0}});
  const ringGeometry = new THREE.RingGeometry(.68,1,144,3);
  const base = mesh(new THREE.CircleGeometry(1,144),material(shapeVertex,fracturesFragment,common()),10);
  const rings = [11,12,13].map(order => mesh(ringGeometry,material(shapeVertex,circleFragment,common()),order));
  const column = mesh(new THREE.CylinderGeometry(1,1,1,144,3,true),material(shapeVertex,curtainFragment,common()),14);
  const faultUniforms={...common(), rise:{value:0}, time:{value:0}};
  const fault=mesh(new THREE.RingGeometry(.58,1,144,8),material(faultVertex,faultFragment,faultUniforms),15);
  const rubbleUniforms = {...common(), progress:{value:0}, radius:{value:1}, lift:{value:1}, shatterAge:{value:0}};
  const rubble = mesh(shardGeometry(),material(shardVertex,shardFragment,rubbleUniforms),16);
  for (const wash of [base,column,rubble]) wash.userData.scenicWash=true;
  const heldMaterial=material(heldVertex,heldFragment,common());
  const held=new THREE.InstancedMesh(new THREE.CircleGeometry(1,20),heldMaterial,64);
  held.frustumCulled=false;
  held.renderOrder=12;
  held.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const frostUniforms={...surface,opacity:{value:0},fracture:{value:0},split:{value:0},spread:{value:1},
    heading:{value:0},crackOrigin:{value:new THREE.Vector2()}};
  const sheet=mesh(new THREE.CircleGeometry(1,112),material(frostSheetVertex,frostSheetFragment,frostUniforms),10);
  const rimUniforms={...frostUniforms,opacity:{value:0}};
  const sheetEdge=mesh(new THREE.CylinderGeometry(1,1,1,120,1,true),
    material(shapeVertex,frostEdgeFragment,rimUniforms),14);
  const faceUniforms={...frostUniforms,opacity:{value:0},fracture:{value:0}};
  const sheetFace=mesh(new THREE.CircleGeometry(1,96),
    material(frostFaceVertex,frostFaceFragment,faceUniforms),15);
  sheet.rotation.x=-Math.PI/2;
  base.rotation.x = -Math.PI/2;
  fault.rotation.x = -Math.PI/2;
  for (const ring of rings) ring.rotation.x = -Math.PI/2;
  root.add(base,...rings,column,fault,rubble,held,sheet,sheetEdge,sheetFace);
  let fractureCast=null;
  let fractureHit=null;
  const platePose = new THREE.Object3D();
  platePose.rotation.x=-Math.PI/2;

  function reset() {
    root.visible=false;
    fractureCast=null;
    fractureHit=null;
  }

  function update(art,camera,_origin,{depth,resolution,heroWeight=0,relay=0,steam=0,firstImpact,reducedMotion=false}={}) {
    root.visible=art?.kind==='stone'||art?.kind==='frost';
    if(!root.visible) return;
    const frost=art.kind==='frost';
    const shrine=1-heroWeight*.88;
    const echo=art.phase==='echo';
    const shattered=art.phase==='shatter'||(echo&&art.echoPhase!=='lock');
    const age=art.age;
    const center=echo?(art.echoCenter??art):art;
    const radius=echo?(art.echoRadius??art.radius*.60):art.radius;
    const phaseAge=art.phaseAge??Math.max(0,age-(art.phaseAt??(frost?1.05:1.44)));
    const elapsed=echo?Math.max(0,phaseAge-(shattered?.20:0)):shattered?phaseAge:age;
    const progress=clamp(elapsed/(shattered?(echo?.34:.76):(frost?.40:1.08)),0,1);
    const front=Math.max(.12,echo?radius*smooth(0,.16,phaseAge):art.frontRadius??radius*smooth(0,frost?.32:.96,age));
    const falloff=shattered?after(echo?.10:.24,echo?.34:.79,elapsed):1;
    const release=shattered?(1+smooth(0,.40,elapsed)*.135):1;
    const y=center.y - (art.stage>=3?.42:.21);
    const quiet=after(frost?.32:.93,frost?.52:1.22,elapsed);
    const rupture=shattered?clamp(elapsed/.19,0,1):0;
    surface.tDepth.value=depth??null;
    surface.hasDepth.value=depth?1:0;
    if(resolution)surface.resolution.value.copy(resolution);

    sheet.visible=sheetEdge.visible=frost;
    sheetFace.visible=false;
    base.visible=!frost;
    if(frost) {
      for(const ring of rings)ring.visible=false;
      column.visible=fault.visible=rubble.visible=held.visible=false;
      if(fractureCast!==art.id) {
        fractureCast=art.id;
        fractureHit=null;
      }
      if(!fractureHit&&firstImpact&&Number.isFinite(firstImpact.x+firstImpact.z+firstImpact.age)) {
        fractureHit={x:firstImpact.x,y:firstImpact.y,z:firstImpact.z,age:art.age-firstImpact.age};
      }
      const crackAge=fractureHit ? age-fractureHit.age : shattered ? phaseAge : -1;
      const spread=front*(1+.055*smooth(0,.15,crackAge));
      const gather=smooth(.022,.23,age);
      const broken=crackAge>=0;
      const flash=broken?smooth(0,.047,crackAge)*after(.074,.23,crackAge):0;
      const clear=broken?after(.095,.31,crackAge):1;
      const relief=(1-clamp(relay,0,1)*.88)*(1-steam*.87);
      const motion=reducedMotion?.6:1;
      frostUniforms.opacity.value=(gather*.43*clear+flash*.46*motion)*relief;
      frostUniforms.fracture.value=broken?1.8*smooth(0,.18,crackAge):0;
      frostUniforms.split.value=broken?smooth(.043,.24,crackAge)*motion:0;
      frostUniforms.spread.value=Math.min(.85,art.height*.18);
      frostUniforms.heading.value=(art.angle??0)+.53;
      frostUniforms.crackOrigin.value.set(
        clamp(((fractureHit?.x??center.x)-center.x)/spread,-.60,.60),
        clamp((center.z-(fractureHit?.z??center.z))/spread,-.60,.60));
      sheet.position.set(center.x,y,center.z);
      sheet.scale.set(spread,spread,1);
      sheetEdge.position.set(center.x,y+.69,center.z);
      sheetEdge.scale.set(spread,1.45+flash*motion*.76,spread);
      rimUniforms.opacity.value=(gather*.63*clear+flash*.29*motion)*relief;
      const breakthrough=broken?smooth(.005,.043,crackAge)*after(.083,.235,crackAge):0;
      if(breakthrough>.015) {
        const contact=fractureHit??center;
        const faceRadius=spread*.84;
        sheetFace.visible=true;
        sheetFace.position.set(contact.x,contact.y+.57,contact.z);
        sheetFace.quaternion.copy(camera.quaternion);
        sheetFace.scale.set(faceRadius,faceRadius*.82,1);
        faceUniforms.opacity.value=breakthrough*motion*(.32*(1-steam*.95)+.68*relief);
        faceUniforms.fracture.value=1.12*smooth(.006,.17,crackAge);
      }
      return;
    }

    base.position.set(center.x,y,center.z);
    base.scale.setScalar(front*release);
    base.material.uniforms.opacity.value=smooth(.10,.44,age)*falloff*
      (shattered?.74:.31+.15*quiet)*shrine;
    base.material.uniforms.phase.value=shattered?1:0;
    rings.forEach((ring,index) => {
      const secondary=index>0;
      ring.visible=!secondary||shattered||quiet>.10;
      const spacing=secondary?.82-(index-1)*.18:1;
      const expanded=front*spacing*release;
      const rise=index*.19;
      ring.position.set(center.x,y+rise+.028,center.z);
      ring.scale.setScalar(expanded);
      const uniforms=ring.material.uniforms;
      const weight=secondary ? .17*(shattered?.63:quiet) : .92;
      uniforms.opacity.value = smooth(.035,.145,age) * falloff * weight *
        (shattered?.32:1)*shrine;
      uniforms.phase.value=shattered?1:0;
    });

    const height=Math.min(3.2,art.height*.66||2.25);
    column.visible=!shattered&&quiet>.035;
    column.position.set(center.x,y+height*.25,center.z);
    column.scale.set(front*release*.95, height, front*release*.95);
    column.material.uniforms.opacity.value = smooth(.045,.18,age)*quiet*.47*shrine;

    fault.visible=shattered||age>.11;
    const ridgeRadius=shattered?Math.max(.65,
      radius*(rupture+.14*smooth(.19,.43,elapsed))):front;
    fault.position.set(center.x,y-.02,center.z);
    fault.scale.set(ridgeRadius*1.18,ridgeRadius*1.18,height);
    faultUniforms.time.value=age;
    faultUniforms.rise.value=shattered?1.7: .29+quiet*.33;
    faultUniforms.phase.value=Number(shattered);
    faultUniforms.opacity.value=(shattered?smooth(.015,.052,elapsed)*after(.22,.49,elapsed)*.97:
      (.34+.47*quiet)*smooth(.10,.23,age))*shrine;

    held.visible=Boolean(art.locked?.size);
    if(held.visible) {
      let count=0;
      for(const enemy of art.locked.values()) {
        const footingScale=Math.max(1.35,(enemy.radius??.75)*1.60);
        platePose.position.set(enemy.x,enemy.y-.18,enemy.z);
        platePose.scale.set(footingScale,footingScale*.78,1);
        platePose.rotation.z=enemy.angle??0;
        platePose.updateMatrix();
        held.setMatrixAt(count++,platePose.matrix);
        if(count>=held.instanceMatrix.count)break;
      }
      held.count=count;
      held.instanceMatrix.needsUpdate=true;
      heldMaterial.uniforms.opacity.value=(echo?.63:.79)*falloff;
    }

    rubble.visible=shattered&&shrine>.22;
    rubble.position.set(center.x,y+.08,center.z);
    rubbleUniforms.radius.value=shattered?radius:front;
    rubbleUniforms.lift.value=height;
    rubbleUniforms.progress.value=progress;
    rubbleUniforms.shatterAge.value=elapsed;
    rubbleUniforms.phase.value=Number(shattered);
    rubbleUniforms.opacity.value=(echo?.71:.81)*falloff*smooth(0,.052,elapsed)*shrine;

  }

  return {root,update,reset};
}
