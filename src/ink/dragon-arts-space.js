import * as THREE from 'three';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const TAU = Math.PI * 2;
const MAX_ROWS = 6000;
const STYLE = { stroke: 0, seam: 1, wind: 2, aperture: 3, ray: 4, speck: 5, wake: 6, spark: 7,
  blade: 8, band: 9, intake: 10, cut: 11, throat: 13, tornLip: 14, riftPull: 15 };
const RETURN_STYLE = 16;
const PALETTES = {
  rift: ['#100e17', '#60465e', '#f6ece2'],
  abyss: ['#101c1f', '#536f65', '#e6eee5'],
  beam: ['#6a271b', '#db9f4c', '#fff4da'],
};
const RETURN_INK = '#621e2e';
const RETURN_EDGE = '#d74432';
const RETURN_CORE = '#ffe3b9';
const SCORCH = { bed:32, ember:33, cooled:34, wetEdge:35 };
const BEAM_ECHO = { curtain:36, lip:37, core:38 };

const vertexShader = /* glsl */ `
  attribute vec4 brush;
  attribute float seed;
  varying vec4 vBrush;
  varying float vSeed;
  void main() {
    vBrush = brush;
    vSeed = seed;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform bool uDepth;
  uniform float uAge;
  uniform vec3 uInk, uMineral, uPaper;
  uniform vec3 uReturnInk, uReturnEdge, uReturnCore;
  varying vec4 vBrush;
  varying float vSeed;

  float hash(vec2 point) {
    vec3 p = fract(vec3(point.xyx)*.1031);
    p += dot(p, p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float grain(vec2 point) {
    vec2 cell=floor(point), f=fract(point);
    f=f*f*(3.-2.*f);
    return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),
      mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
  }
  void main() {
    if (uDepth && gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy/uResolution).r + .000052) discard;
    float u=vBrush.x, v=vBrush.y, style=mod(vBrush.w, 16.);
    bool returning=vBrush.w>=16.;
    float tooth=hash(floor(gl_FragCoord.xy));
    float wash=grain(vec2(u*24., v*5.)+vSeed);
    float fiber=grain(vec2(u*48.,v*37.)-vSeed);
    float edge=abs(v + .09*(wash-.5));
    float tips=smoothstep(0.,.065,u)*(1.-smoothstep(.91,1.,u));
    float body=(1.-smoothstep(.70,1.,edge))*tips;
    float paper=0.;
    float tint=.15+.54*wash;

    if (style < .5) {
      float hairs=grain(vec2(u*12., v*55.)+vSeed);
      body *= .51+.49*smoothstep(.28,.65,hairs);
      paper = .91*(1.-smoothstep(.02,.13,abs(v+.24+.14*sin(u*8.))))*tips;
    } else if (style < 1.5) {
      float rim=1.-smoothstep(.01,.15,abs(edge-.78));
      float mica=smoothstep(.21,.45,wash+.18*fiber);
      float recede=smoothstep(.41,1.,edge);
      float embers=smoothstep(.57,.75,grain(vec2(11.*u,24.*v)+vSeed));
      body=max(body*.995, rim)*(.95+.05*fiber);
      tint=.022 + .11*wash + .43*rim + .11*recede+embers*.064;
      paper=rim*mica*.92;
    } else if (style < 2.5) {
      float washEdge=.74+.22*wash;
      float filaments=grain(vec2(u*12.,v*49.)+vSeed);
      body=(1.-smoothstep(.5,washEdge,edge))*tips*smoothstep(.10,.68,filaments+.14*wash);
      float ridge=abs(v-.34-.15*sin(u*20.+vSeed));
      paper=(1.-smoothstep(.018,.16,ridge))*(.35+.48*fiber);
    } else if (style < 3.5) {
      vec2 point=vec2(2.*u-1.,v);
      float rad=length(point);
      float theta=atan(point.y,point.x);
      float pulse=.028*sin(theta*4.+uAge*12.)+.014*sin(theta*13.-.65*uAge);
      float rag=rad + pulse + .04*(wash-.5);
      float crest=1.-smoothstep(.022,.105,abs(rag-.86));
      float swirl=sin(theta*3. + rad*11. - uAge*17.);
      float window=1.-smoothstep(.18,.67,point.y+point.x*.36);
      float dark=1.-smoothstep(.29,.83,rag);
      float pooled=(1.-smoothstep(.78,1.,rag)) * (.22 + window*.32 + .14*wash + dark*.24);
      float dry=crest * smoothstep(-.53,.71,swirl+.78*wash);
      body=max(pooled,dry*.92);
      tint=.03+.24*wash+.40*dry;
      paper=dry*(.48+.40*fiber);
    } else if (style < 4.5) {
      float vein=.075*sin(u*34.+uAge*14.)+.04*sin(u*97.-uAge*37.);
      float distance=abs(v-vein);
      float core=1.-smoothstep(.075,.25,distance);
      float corona=1.-smoothstep(.23,1.,distance+(fiber-.5)*.17);
      float baseInk=(1.-smoothstep(.04,.15,abs(distance-.77)))*(.51+.49*wash);
      float edgeStream=(1.-smoothstep(.018,.083,abs(distance-.61-.11*wash)))*fiber;
      body=max(core,max(corona*(.61+.34*wash),max(edgeStream*.70,baseInk*.96)));
      body *= smoothstep(0.,.017,u)*(1.-smoothstep(.89,1.,u));
      tint=.37+.56*corona-baseInk*.32;
      paper=core*.99+edgeStream*.32;
      if (returning) {
        float redLip=(1.-smoothstep(.115,.33,abs(distance-.55)))*(.53+.47*fiber);
        body=max(core, max(corona*.53, redLip*.92))*smoothstep(0.,.017,u)*(1.-smoothstep(.89,1.,u));
        tint=.36+.57*redLip;
        paper=core*.86+edgeStream*.10;
      }
    } else if (style < 5.5) {
      float taper=min(u*7.,1.-u*.94);
      body=(1.-smoothstep(max(0.,taper*.37),max(.035,taper),edge))
        *(1.-smoothstep(.54,1.,u))*smoothstep(0.,.14,u);
      paper=.19+.52*fiber;
    } else if (style < 6.5) {
      float seam=abs(v+.08*sin(u*45.+vSeed)+.17*(wash-.5));
      body *= .42+.58*fiber;
      tint=.16+.40*wash;
      paper=(1.-smoothstep(.03,.18,seam))*.68;
    } else if (style < 7.5) {
      vec2 star=vec2(u*2.-1.,v);
      float radius=length(star);
      float flare=.20+.12*sin(uAge*37.);
      float rays=max(1.-smoothstep(.02,.16,abs(star.x)),1.-smoothstep(.02,.12,abs(star.y)));
      float heat=1.-smoothstep(.19,.50,radius);
      tint=.89+.11*wash;
      paper=.65+.35*heat;
      body=max(heat,rays*.48+flare)*(1.-smoothstep(.40,1.,radius));
    } else if (style < 8.5) {
      float blade=abs(v-.40+.13*sin(u*23.+vSeed));
      float gap=.10+.21*fiber;
      float silver=1.-smoothstep(.03,gap,blade);
      body=max(silver,body*(.67+.31*wash))*tips;
      paper=.86*silver+.10*wash;
      tint=.13+.51*silver+.21*fiber;
    } else if (style < 9.5) {
      float contour=abs(v+.10*sin(u*12.)-.14*(fiber-.5));
      float crown=1.-smoothstep(.028,.19,abs(contour-.62));
      body=max(body*(.56+.34*wash), crown*tips);
      tint=.67+.33*wash;
      paper=crown*.82+.11*(1.-contour);
    } else if (style < 10.5) {
      float line=abs(v-(.07+.13*sin(u*12.+vSeed)));
      float taper=.35+.63*pow(u,.65);
      body=(1.-smoothstep(.16,taper,line)) * tips * (.62+.37*fiber);
      tint=.31+.46*u;
      paper=(1.-smoothstep(.04,.37,line))*(.60+.36*u);
    } else if (style < 11.5) {
      float tear=abs(v+.087*sin(u*21.+vSeed)+(wash-.5)*.14);
      float cut=1.-smoothstep(.035,.12,abs(tear-.64));
      float core=1.-smoothstep(.04,.32,tear);
      body=max(cut*.74,core*.17)*tips*(.46+.54*fiber);
      tint=.13+.57*cut;
      paper=cut*.23;
    } else if (style < 12.5) {
      float groove=abs(v+.13*sin(u*27.+vSeed)+.18*(wash-.5));
      float core=1.-smoothstep(.06,.22,groove);
      float edge=1.-smoothstep(.19,.46,abs(groove-.53));
      body=max(core,body*.79)*(.51+.49*fiber)*tips;
      tint=.05+.35*edge*wash;
      paper=edge*.16*wash;
    } else if (style < 13.5) {
      float bite=grain(vec2(u*37.+vSeed,v*7.));
      float gouge=abs(v+.12*sin(37.*u)+.065*sin(89.*u)+.22*(bite-.5));
      float breakEdge=.88+.10*fiber;
      float well=1.-smoothstep(.69,breakEdge,gouge);
      float lip=(1.-smoothstep(.019,.101,abs(gouge-.71)))*(.44+.56*smoothstep(.34,.67,fiber));
      body=(max(well,.76*lip))*tips;
      tint=.05+.17*wash+.27*lip;
      paper=lip*.67;
    } else if (style < 14.5) {
      float fold=v+.12*sin(u*35.+vSeed)+.12*(wash-.5);
      float scar=1.-smoothstep(.07,.58,abs(fold));
      float fray=(1.-smoothstep(.55,1.,abs(fold)))*smoothstep(.21,.60,fiber);
      body=max(fray,scar*.96)*tips;
      tint=.12+.42*wash+.14*scar;
      paper=(1.-smoothstep(.025,.18,abs(fold+.23)))*(.79+.20*tooth);
    } else {
      float fold=v+.16*sin(u*18.+vSeed);
      float filament=1.-smoothstep(.07,.38,abs(fold));
      body=max(filament,(1.-smoothstep(.44,1.,abs(fold)))*.82)*tips;
      tint=.24+.24*wash;
      paper=filament*(.40+.36*tooth)*smoothstep(.17,.93,u);
    }
    vec3 color=mix(returning?uReturnInk:uInk,returning?uReturnEdge:uMineral,clamp(tint,0.,1.));
    color=mix(color,returning?uReturnCore:uPaper,clamp(paper,0.,1.));
    if (vBrush.w >= 35.5) {
      float rag=.12*sin(u*31.-uAge*7.)+.10*sin(u*63.)+.18*(wash-.5);
      float work=v+rag;
      float span=1.-smoothstep(.49,.99,abs(work));
      float thread=(1.-smoothstep(.022,.13,abs(work-.53+.10*sin(u*42.))));
      float tear=(1.-smoothstep(.013,.075,abs(work+.29+.14*sin(u*37.))))*fiber;
      float tuft=smoothstep(.16,.71,fiber+.22*wash);
      vec3 ink=vec3(.19,.025,.038), cinnabar=vec3(.75,.12,.084), paperGold=vec3(1.,.85,.66);
      if(vBrush.w<36.5) {
        body=span*tips*(.66+.34*tuft);
        color=mix(ink,cinnabar,.25+.41*wash+.17*thread);
        color=mix(color,paperGold,(thread*.37+tear*.17)*tuft);
      } else if(vBrush.w<37.5) {
        body=max(span*.73,thread)*(.72+.28*tuft)*tips;
        color=mix(ink,cinnabar,.42+.36*wash);
        color=mix(color,paperGold,max(thread*.95,tear*.62)*(.70+.30*tuft));
      } else {
        float core=1.-smoothstep(.07,.39,abs(work+.08*sin(u*46.)));
        body=max(span*.84,core)*smoothstep(0.,.012,u)*(1.-smoothstep(.96,1.,u));
        color=mix(ink,cinnabar,.23+.46*wash+.31*thread);
        color=mix(color,paperGold,max(core*.86,thread*.76));
      }
    } else if(vBrush.w>=32.) {
      float rag=.095*sin(u*48.+vSeed)+.16*(wash-.5);
      float edge=abs(v+rag);
      float footprint=1.-smoothstep(.62,1.0,edge);
      float ash=grain(vec2(u*21.+vSeed,v*12.));
      float chips=smoothstep(.23,.66,fiber+.19*ash);
      float core=1.-smoothstep(.14,.42,edge);
      float lip=1.-smoothstep(.020,.16,abs(v+rag+.075*sin(u*125.)));
      float fissure=(1.-smoothstep(.026,.16,abs(v-.16*sin(u*98.+vSeed)+.24*(fiber-.5))))*chips;
      bool ember=vBrush.w>=32.5&&vBrush.w<33.5;
      bool wetEdge=vBrush.w>=34.5;
      if(ember) {
        float blister=.59+.41*grain(vec2(u*103.+vSeed,u*11.+vSeed))+.09*sin(u*341.-uAge*8.);
        color=mix(vec3(.28,.041,.013),vec3(.99,.32,.075),clamp(max(lip,.53*fissure)*blister,0.,1.));
        color=mix(color,vec3(1.,.64,.26),lip*lip*.52*chips);
        body=footprint*(.57+lip*.38)*blister;
      } else if(wetEdge) {
        color=mix(vec3(.17,.40,.43),vec3(.68,.87,.87),lip*(.33+.61*chips));
        body=footprint*(.48+.49*lip)*(.44+.56*chips);
      } else if(vBrush.w>=33.5) {
        color=mix(vec3(.037,.093,.10),vec3(.30,.60,.61),.22+.46*ash+.13*fissure);
        color=mix(color,vec3(.57,.75,.73),fissure*.66);
        body=footprint*(.72+.24*ash);
      } else {
        color=mix(vec3(.040,.014,.012),vec3(.22,.066,.033),.14+.23*ash+.26*fissure);
        color=mix(color,vec3(.043,.028,.025),core*.78);
        body=footprint*(.81+.16*ash);
      }
    }
    float opacity=clamp(vBrush.z*body,0.,1.);
    if(opacity<.014)discard;
    gl_FragColor=vec4(color*(.965+.07*tooth),opacity);
    #include <colorspace_fragment>
  }
`;

function hash(number) {
  const source = Math.sin(number * 91.781 + 5.72) * 44135.18433;
  return source - Math.floor(source);
}

const ease = (a, b, time) => smoothstep(time, a, b);
const windowAt = (time, start, full, release, end) =>
  ease(start, full, time) * (1 - ease(release, end, time));
const originOf = (origin, art) => origin?.muzzle ?? (Number.isFinite(origin?.x) ? origin : art.origin ?? art);
const angleDelta = (from, to) => Math.atan2(Math.sin(to-from), Math.cos(to-from));

class ArtBrush {
  constructor() {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(MAX_ROWS * 6), 3);
    const brush = new THREE.BufferAttribute(new Float32Array(MAX_ROWS * 8), 4);
    const seed = new THREE.BufferAttribute(new Float32Array(MAX_ROWS * 2), 1);
    this.index = new THREE.BufferAttribute(new Uint16Array(MAX_ROWS * 6), 1);
    for (const attribute of [position, brush, seed, this.index]) attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('brush', brush);
    geometry.setAttribute('seed', seed);
    geometry.setIndex(this.index);
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, side: THREE.DoubleSide, forceSinglePass: true,
      transparent: true, depthWrite: false, depthTest: false,
      uniforms: {
        tDepth: {value: null}, uDepth: {value: false}, uResolution: {value: new THREE.Vector2(1, 1)},
        uAge: {value: 0}, uInk: {value: new THREE.Color()}, uMineral: {value: new THREE.Color()},
        uPaper: {value: new THREE.Color()},
        uReturnInk: {value: new THREE.Color(RETURN_INK)}, uReturnEdge: {value: new THREE.Color(RETURN_EDGE)},
        uReturnCore: {value: new THREE.Color(RETURN_CORE)},
      },
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Dragon arts · ink brush';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.position = position;
    this.brush = brush;
    this.seed = seed;
    this.p = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.cameraUp = new THREE.Vector3();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.toward = new THREE.Vector3();
    this.castId = null;
    this.rayTrail = [];
    this.preyTrails = new Map();
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  begin(art, camera, depth, resolution) {
    this.vertexCount = this.indexCount = 0;
    if (this.castId !== art.id) {
      this.castId = art.id;
      this.rayTrail.length = 0;
      this.preyTrails.clear();
    }
    this.cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    this.cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
    this.toward.setFromMatrixColumn(camera.matrixWorld, 2);
    const {uInk, uMineral, uPaper, uAge, tDepth, uDepth, uResolution} = this.mesh.material.uniforms;
    const [ink, mineral, paper] = PALETTES[art.kind];
    uInk.value.set(ink);
    uMineral.value.set(mineral);
    uPaper.value.set(paper);
    uAge.value = art.age;
    tDepth.value = depth ?? null;
    uDepth.value = Boolean(depth && resolution);
    if (resolution) uResolution.value.set(resolution.x ?? resolution.width, resolution.y ?? resolution.height);
  }

  finish() {
    this.mesh.geometry.setDrawRange(0, this.indexCount);
    this.mesh.visible = this.indexCount > 0;
    if (!this.mesh.visible) return;
    for (const attribute of [this.position, this.brush, this.seed, this.index]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, (attribute === this.index ? this.indexCount : this.vertexCount) * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  ribbon(rows, style, seed, opacity, sample, brushStart=0, brushEnd=1) {
    if (opacity < .013 || this.vertexCount / 2 + rows + 1 > MAX_ROWS) return;
    const {p, side, position, brush} = this;
    const indices = this.index.array;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const strength = sample(t, p, side) ?? 1;
      for (const sign of [-1, 1]) {
        const vertex = this.vertexCount++;
        position.setXYZ(vertex, p.x + sign*side.x, p.y + sign*side.y, p.z + sign*side.z);
        brush.setXYZW(vertex, lerp(brushStart,brushEnd,t), sign, opacity*strength, style);
        this.seed.setX(vertex, seed);
      }
      if (row === 0) continue;
      const start = this.vertexCount - 4;
      indices[this.indexCount++] = start;
      indices[this.indexCount++] = start + 1;
      indices[this.indexCount++] = start + 2;
      indices[this.indexCount++] = start + 1;
      indices[this.indexCount++] = start + 3;
      indices[this.indexCount++] = start + 2;
    }
  }

  disk(center, radiusX, radiusY, seed, opacity, style = STYLE.aperture) {
    this.ribbon(44, style, seed, opacity, (t, point, side) => {
      point.copy(center).addScaledVector(this.cameraRight, (t*2-1)*radiusX);
      side.copy(this.cameraUp).multiplyScalar(radiusY);
    });
  }

  ellipse(center, radius, height, width, phase, seed, opacity, style = STYLE.wind, turns = 1) {
    this.ribbon(72, style, seed, opacity, (t, point, side) => {
      const angle=phase+t*TAU*turns;
      const sin=Math.sin(angle), cos=Math.cos(angle);
      const drift=.08*Math.sin(angle*5.+seed);
      point.set(center.x+sin*radius, center.y+height*(cos+drift), center.z+cos*radius);
      side.set(sin*width, .23*width, cos*width);
    });
  }
}

function pullTrails(brush, art, context) {
  if (!context || !Number.isFinite(context.time)) return;
  const {time, feed} = context;
  const trails = brush.preyTrails;
  let sampled = 0;
  for (const enemy of feed ?? []) {
    if (sampled++ >= 14) break;
    const {id, x, y, z} = enemy;
    if (!Number.isFinite(x+y+z)) continue;
    let trace = trails.get(id);
    if (!trace) {
      if (trails.size >= 22) continue;
      trace = [];
      trails.set(id,trace);
    }
    const last=trace.at(-1);
    if (!last || time-last.time >= .030) {
      trace.push({x,y,z,time});
      if(trace.length>7)trace.shift();
    }
  }

  for (const [id, trace] of trails) {
    const tip=trace.at(-1);
    const fade=1-ease(.05,.28,time-tip.time);
    if (fade<=.01) {
      trails.delete(id);
      continue;
    }
    if (trace.length<2) continue;
    const salt=Number.isFinite(id)?id*3.17:11;
    const first=trace[0];
    if(Math.hypot(tip.x-first.x,tip.y-first.y,tip.z-first.z)<.38)continue;
    brush.ribbon((trace.length-1)*2,STYLE.intake,salt,fade*.83,(t,p,side)=>{
      const index=Math.min(trace.length-2,Math.floor(t*(trace.length-1)));
      const blend=t*(trace.length-1)-index;
      const a=trace[index], b=trace[index+1];
      p.set(lerp(a.x,b.x,blend),lerp(a.y,b.y,blend)+.16,lerp(a.z,b.z,blend));
      p.addScaledVector(brush.toward,.12);
      side.copy(brush.cameraUp).multiplyScalar(.046+.15*t*t);
    });
  }

}

function drawRift(brush, art, origin, context) {
  const {age, duration, radius, angle} = art;
  const portals = art.portals?.length ? art.portals : [art];
  const closeAt = art.collapseAt ?? 1.65;
  const visibility = windowAt(age, .20, .49, closeAt-.01, closeAt+.25);
  const opening = ease(.34, .68, age)*(1-ease(closeAt-.11, closeAt+.075, age));
  const inward = windowAt(age, .46, .79, closeAt, closeAt+.24);
  const snap = windowAt(age, closeAt-.042, closeAt+.06, closeAt+.13, Math.min(duration,closeAt+.40));
  const source = originOf(origin, art);
  const {cameraRight, cameraUp, toward, a, b, point, end} = brush;
  const divided=portals.length>1;
  const halfSpan=divided?clamp(radius*.18,2.65,4.25):clamp(radius*.30,4.6,8.7);
  const forwardX=Math.sin(angle), forwardZ=Math.cos(angle);
  const scaleY=art.stage<3 ? .66 : 1;
  const basis = (well,tilt) => {
    point.set(well.x,well.y+(divided?.68:1.1),well.z);
    a.set(forwardZ,tilt*scaleY,-forwardX).normalize();
    b.copy(cameraUp).addScaledVector(a,-cameraUp.dot(a)).normalize();
  };
  const seam = (t,p,salt=0) => {
    const nick=.20*Math.sin(t*TAU*3+salt)+.17*Math.sin(t*TAU*6+.71+salt);
    p.copy(point).addScaledVector(a,(2*t-1)*halfSpan)
      .addScaledVector(b,(.32*Math.sin(t*Math.PI)+nick)*scaleY)
      .addScaledVector(toward,.30*Math.sin(t*TAU-.45));
    if (art.stage < 3) p.y=Math.max(.82,p.y);
  };
  for (const [index,well] of portals.entries()) {
    basis(well,divided?(index?-.55:.55):.45);
    const salt=index*3.27+art.id*.013;
    const cutWidth=(.09+opening*(divided?1.58:1.89))*scaleY;
    const profile=t=>Math.pow(Math.sin(t*Math.PI),.65)*(.89+.18*Math.sin(t*19.2+salt));
    if(visibility>.013) {
      brush.ribbon(84, STYLE.throat, salt, visibility, (t,p,side) => {
        seam(t,p,salt);
        side.copy(b).multiplyScalar(cutWidth*profile(t)*1.08+.018);
      });
      for (const bank of [-1,1]) {
        brush.ribbon(66, STYLE.tornLip, salt+bank, visibility*.96, (t,p,side) => {
          seam(t,p,salt);
          const tooth=.34*Math.sin(t*28.+salt+bank*.26)+.15*Math.sin(t*58.-salt);
          p.addScaledVector(toward,.095).addScaledVector(b,bank*cutWidth*profile(t)*(.79+.30*tooth));
          side.copy(b).multiplyScalar((.05+.22*opening)*profile(t));
        });
      }
      for (const [fork,start] of [[-1,.29],[1,.67]]) {
        brush.ribbon(24, STYLE.tornLip, salt+fork*4, visibility*opening*.67, (t,p,side) => {
          seam(clamp(start+t*fork*.19,0,1),p,salt);
          const kink=.21*Math.sin(t*13)+.15*Math.sin(t*30.);
          p.addScaledVector(b,fork*(cutWidth*.45+(2.45+cutWidth*.17)*t+kink)*scaleY);
          side.copy(b).multiplyScalar((.035+.18*Math.sin(t*Math.PI))*(1-.79*t));
        });
      }
    }
    if(snap>.013) {
      const close=ease(closeAt,closeAt+.27,age);
      brush.ribbon(63,STYLE.tornLip,salt+14,snap,(t,p,side)=>{
        seam(.5+(t-.5)*(1-.56*close),p,salt);
        p.addScaledVector(toward,.11);
        side.copy(b).multiplyScalar((.08+.32*snap)*Math.sin(Math.PI*t));
      });
      brush.disk(point,.42+1.43*snap,.30+1.14*snap,19.4,snap*.61,STYLE.spark);
    }
  }

  // Swing twice from the live paw sockets, meet at the split, then leave
  // thin raised edges over the heavy brush mark for a few extra frames.
  for (const hand of [-1,1]) {
    const lag=hand<0?.012:.148;
    const slash=windowAt(age,lag,lag+.092,lag+.34,lag+.58);
    const reach=ease(lag,lag+.255,age);
    const start=hand<0 ? origin?.left ?? source : origin?.right ?? source;
    const destination=brush.end;
    basis(divided?portals[hand<0?0:1]:portals[0],divided?-hand*.55:.45);
    seam(hand<0?.48:.55,destination);
    for (const cut of [0,1]) {
      brush.ribbon(49,STYLE.tornLip,6.28+hand*1.7+cut*1.49,slash*(cut===0?1:.76),(u,p,side)=>{
        const t=u*reach;
        const wing=Math.sin(t*Math.PI);
        const offset=wing*hand*(2.1+.82*cut);
        const spread=cut*(.17+.22*wing)*(1-t*.78);
        p.set(lerp(start.x+spread*forwardZ,destination.x,t)+forwardZ*offset,
          lerp(start.y,destination.y,t)+wing*(hand>0?2.90:.94)*scaleY+.61*spread,
          lerp(start.z-spread*forwardX,destination.z,t)-forwardX*offset);
        side.copy(cameraUp).multiplyScalar((.13+.65*wing)*(cut===0?1:.47))
          .addScaledVector(cameraRight,.18*hand);
      });
    }
  }
  // The visible currents follow live enemy positions and the actual mouth.
  let drawn=0;
  for (const enemy of context?.feed??[]) {
    if (drawn>=9||inward<.014)break;
    let well=art.captures?.get(enemy.id)?.mouth;
    if (!well) well=portals.reduce((nearest,mouth)=>distanceTo(enemy,mouth)<distanceTo(enemy,nearest)?mouth:nearest);
    const range=distanceTo(enemy,well);
    if (range<.71||range>radius*.92)continue;
    const reach=.27+.52*ease(.33,1.43,age);
    const salt=enemy.id*.973;
    end.set(enemy.x,enemy.y+.09,enemy.z);
    brush.ribbon(20,STYLE.riftPull,salt,inward*(.34+.24*hash(salt))*(1-ease(radius*.65,radius*.92,range)),(t,p,side)=>{
      p.copy(end).lerp(well,t*reach);
      p.y+=.20+Math.sin(t*Math.PI)*(.14+range*.056);
      side.copy(cameraUp).multiplyScalar((.06+.24*t*t)*(1-Math.abs(.5-t)));
    });
    drawn++;
  }
  if (art.phase==='echo' && art.echoCenter && !art.riftSeam) {
    const echo=windowAt(age,art.phaseAt,art.phaseAt+.08,duration-.14,duration);
    const passes=ease(art.phaseAt,art.phaseAt+.26,age);
    const center=art.echoCenter;
    const start=art.echoFrom??center;
    const target=art.echoTo??center;
    a.set(target.x-start.x,target.y-start.y,target.z-start.z);
    if(a.lengthSq()<.09)a.set(forwardX,0,forwardZ);
    a.normalize();
    b.set(a.z,0,-a.x);
    const visibleEnd=Math.min(1,passes+.16);
    for(const hand of [-1,1]){
      brush.ribbon(53,STYLE.tornLip,38.3+hand*5.8,echo*(hand<0?.92:.76),(t,p,side)=>{
        const n=t*visibleEnd;
        const offset=(.82+art.echoRadius*.074)*hand*Math.cos(n*Math.PI);
        const rise=.40+.25*Math.sin(n*Math.PI)+.20*hand*Math.sin(t*6.5);
        p.set(lerp(start.x,target.x,n),lerp(start.y,target.y,n)+rise,lerp(start.z,target.z,n));
        p.addScaledVector(b,offset).addScaledVector(toward,.46);
        side.copy(cameraUp).multiplyScalar((.085+.54*Math.sin(t*Math.PI))*(1-.45*passes));
      });
    }
  }
}

function distanceTo(a,b) {
  return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}

function drawAbyss(brush, art, context) {
  const {age, duration, radius, rank} = art;
  const collapseAt = art.collapseAt ?? 1.65;
  const lift = ease(0,.44,age);
  const gather = ease(.35,collapseAt+.10,age);
  const collapse = ease(collapseAt-.08,collapseAt+.46,age);
  const hero = context?.heroWeight ?? 0;
  const wind = lift*(1-ease(collapseAt-.07,collapseAt+.39,age))*(1-hero*.95);
  const rim = windowAt(age,.35,.77,duration-.46,duration)*(1-hero*.97);
  const rebound = windowAt(age,collapseAt+.01,collapseAt+.12,collapseAt+.24,duration)
    * (art.absorbed>=4?.34:1)*(1-hero);
  const spin=age*1.72+age*age*3.9;
  const center=brush.point.set(art.x,art.y+.30,art.z);

  // Build into a hollow funnel and keep clear gaps between its main arms.
  const arms=3+rank;
  for (let layer=0;layer<arms;layer++) {
    const seed=23.73+layer*7.77;
    const turn=spin+layer*TAU/arms;
    brush.ribbon(78, STYLE.wind, seed, wind*(.42+.22*hash(seed)), (t,p,side)=>{
      const theta=turn+t*(TAU*(.87+.049*rank))+Math.sin(t*12.+layer)*.045;
      const curve=Math.pow(t,.72);
      const reach=radius*lerp(.078,1.06,curve)*(1-.70*gather);
      const liftFunnel=radius*(.09+.43*gather)*curve;
      const sin=Math.sin(theta), cos=Math.cos(theta);
      const wave=.45*Math.sin(theta*2.-age*12.3+layer);
      const w=(.11+.66*Math.sin(Math.PI*t))*(.92+.18*hash(seed+1));
      p.set(center.x+sin*reach, center.y+liftFunnel+wave, center.z+cos*reach);
      side.set(sin*w, .61*w, cos*w);
    });
  }

  const core = clamp((.19+.62*gather+.1*Math.min(1,(art.absorbed ?? 0)/14))*(1-.83*collapse), .06, .91)*radius*.21;
  brush.end.copy(center);
  brush.end.y+=radius*(.016+.027*gather);
  let pulse=0;
  for(const mark of context?.marks??[]){
    if(mark.id!==art.id||!mark.absorbed||mark.phase==='echo')continue;
    pulse=Math.max(pulse,1-ease(.03,.25,context.time-mark.at));
  }
  if(!art.stackedMouths)brush.disk(brush.end,core*.88,core*.54,23.25,rim*(.39+.08*pulse));
  if(pulse>.019)brush.ellipse(brush.end,core*(.66+(1-pulse)*.51),.44,.14+core*.10,spin,41.8,pulse*.53*(1-hero),STYLE.intake);
  if(!art.stackedMouths)for(const upper of [false,true]){
    brush.ribbon(58,STYLE.intake,upper?37.3:32.7,rim*(upper?.73:.64),(t,p,side)=>{
      const theta=(upper?Math.PI:0)+t*Math.PI;
      const sway=.14*Math.sin(theta*5.-spin)*Math.sin(t*Math.PI);
      p.copy(brush.end).addScaledVector(brush.cameraRight,Math.cos(theta)*core*1.26)
        .addScaledVector(brush.cameraUp,(Math.sin(theta)*.67+sway+.11*Math.cos(theta))*core)
        .addScaledVector(brush.toward,Math.sin(theta)*core*(upper?-.20:.29));
      side.copy(brush.cameraUp).multiplyScalar((.09+core*.06)*(.76+.24*Math.sin(theta-spin)));
    });
  }
  if(art.stackedMouths&&art.portals?.length===2){
    const reach=core*.64;
    for(let i=0;i<art.portals.length;i++){
      const mouth=art.portals[i];
      brush.ribbon(35,STYLE.intake,41.4+i*7.1,rim*.74,(t,p,side)=>{
        const theta=spin*.78+i*1.3+t*TAU*.85;
        p.set(mouth.x,mouth.y+.18,mouth.z)
          .addScaledVector(brush.cameraRight,Math.sin(theta)*reach)
          .addScaledVector(brush.cameraUp,Math.cos(theta)*reach*.35);
        side.copy(brush.cameraUp).multiplyScalar(.062+reach*.13*Math.sin(t*Math.PI));
      });
    }
  }

  for (let debris=0;debris<22;debris++) {
    const salt=31.9+debris*17.17;
    const travel=(hash(salt)+age*(.28+.49*hash(salt+1)))%1;
    const reach=radius*(.12+.64*hash(salt+2))*Math.pow(1-travel,.82)*(1-.56*collapse);
    const angle=spin*.53+hash(salt+3)*TAU+Math.pow(travel,2)*TAU;
    const y=radius*(.06+.45*hash(salt+4))*travel;
    const trail=.19+.39*hash(salt+5);
    brush.ribbon(9, STYLE.speck, salt, rim*.71*Math.sin(Math.PI*travel), (t,p,side)=>{
      const theta=angle-t*(.44+trail);
      const cellReach=reach*(1+trail*t);
      p.set(center.x+Math.sin(theta)*cellReach,center.y+y-.73*t,center.z+Math.cos(theta)*cellReach);
      side.copy(brush.cameraUp).multiplyScalar(.05+.12*hash(salt+1));
    });
  }
  const top=rebound*(1-.55*collapse);
  const bandTime=ease(collapseAt+.02,collapseAt+.46,age);
  brush.ellipse(center,lerp(radius*.05,radius,bandTime),.20+top*1.8,.23+radius*.018,spin*.16,41.,rebound*.85,
    STYLE.wake);
  brush.ellipse(center,lerp(radius*.04,radius*.66,bandTime),.78+top*2.3,.12+radius*.010,spin*.14,52.,rebound*.63,
    STYLE.stroke);
}

function rememberBeam(brush, art, mouth, angle, reach, slope) {
  const trail = brush.rayTrail;
  if (!['sweep','echo'].includes(art.phase)) return;
  const previous = trail.at(-1);
  if (previous && art.age - previous.age < .024) return;
  const echo=art.phase==='echo';
  const followup=echo||art.rank===3&&art.age>=1.39;
  trail.push({age:art.age, x:mouth.x,y:mouth.y,z:mouth.z,angle,reach,slope,followup,echo});
  if (trail.length > 27) trail.shift();
}

function drawBeamBand(brush, art, glow) {
  const trail = brush.rayTrail;
  if (trail.length < 2 || glow < .014) return;
  if(art.phase==='echo') {
    drawBeamEchoCurtain(brush,art,glow,trail);
    return;
  }
  for (const followup of [false, true]) drawBeamBandPass(brush, art, glow, trail, followup);
}

function drawBeamEchoCurtain(brush,art,glow,trail) {
  const life=.51;
  const first=trail.findIndex(ray=>ray.echo&&ray.age>=art.age-life);
  const count=trail.length-first;
  if(first<0||count<2)return;
  const edge=art.echoWidth??art.beamWidth*.77;
  for(const [style,span,strength] of [[BEAM_ECHO.curtain,.73,.86],[BEAM_ECHO.lip,.88,.89]]) {
    brush.ribbon(60,style,style*.39,glow*strength,(t,p,w)=>{
      const stage=t*(count-1);
      const i=Math.min(count-2,Math.floor(stage));
      const left=trail[first+i],right=trail[first+i+1],blend=stage-i;
      const theta=left.angle+angleDelta(left.angle,right.angle)*blend;
      const sin=Math.sin(theta),cos=Math.cos(theta);
      const time=art.age-lerp(left.age,right.age,blend);
      const retain=1-ease(.12,life,time);
      const crown=Math.sin(t*Math.PI);
      const distance=lerp(left.reach,right.reach,blend)*span;
      p.set(lerp(left.x,right.x,blend)+sin*distance,
        lerp(left.y,right.y,blend)+lerp(left.slope,right.slope,blend)*distance+
          (style===BEAM_ECHO.lip?.11:.54)+.27*crown,
        lerp(left.z,right.z,blend)+cos*distance);
      const thickness=edge*(style===BEAM_ECHO.lip?.46:1.43)*(.32+.68*retain);
      w.set(sin*thickness*.75,thickness*(style===BEAM_ECHO.lip?.42:.81),cos*thickness*.75);
      return retain*(.58+.42*crown);
    });
  }
}

function drawBeamBandPass(brush, art, glow, trail, followup) {
  const lifetime = followup ? .35 : .50;
  const first = trail.findIndex(ray => ray.followup === followup && ray.age >= art.age-lifetime);
  const last = trail.findLastIndex(ray => ray.followup === followup);
  const count = last-first+1;
  if (first < 0 || count < 2) return;
  const drawBand = (span, thickness, opacity, salt, style, bank = 0) => {
    brush.ribbon(64,style+(followup?RETURN_STYLE:0),salt,opacity,(t,p,side)=>{
      const section=t*(count-1);
      const floor=Math.min(count-2,Math.floor(section));
      const a=trail[first+floor], b=trail[first+floor+1];
      const blend=section-floor;
      const theta=a.angle+angleDelta(a.angle,b.angle)*blend;
      const sin=Math.sin(theta), cos=Math.cos(theta);
      const age=art.age-lerp(a.age,b.age,blend);
      const retain=1-ease(.085,lifetime,age);
      const reach=lerp(a.reach,b.reach,blend);
      const distance=reach*span*(.52+.48*retain);
      p.set(lerp(a.x,b.x,blend)+sin*distance+cos*bank,
        lerp(a.y,b.y,blend)+lerp(a.slope,b.slope,blend)*distance+
          (bank===0?.28+.48*retain:-.36)+Math.sin(t*4.1+salt)*.11,
        lerp(a.z,b.z,blend)+cos*distance-sin*bank);
      const width=thickness*(.12+.88*retain*retain)*(.76+.24*Math.sin(t*Math.PI));
      side.set(sin*width,.43*width,cos*width);
      return (.24+.76*retain)*ease(0,.18,t);
    });
  };
  drawBand(.87,1.06,glow*.67,11.7,STYLE.band);
  drawBand(.65,.46,glow*.58,15.2,STYLE.band);
  drawBand(.38,.37,glow*.41,21.4,STYLE.band);
  drawBand(.82,.73,glow*.83,28.9,STYLE.cut,.48);
  drawBand(.52,.43,glow*.67,35.6,STYLE.cut,-.56);
}

function drawScorchLanes(brush, lanes, gameTime, startedAt, floorAt) {
  for(const lane of lanes){
    const {points,direction,startsAt,expiresAt}=lane;
    const elapsed=gameTime-(lane.plantedAt??(startedAt+startsAt));
    const expires=lane.expires??(startedAt+expiresAt);
    const fade=1-ease(expires-.73,expires,gameTime);
    if (elapsed<0 || fade<.013) continue;
    const heatScale=1-ease(.10,1.15,elapsed);
    const width=lane.width*.89;
    for(let i=1;i<points.length;i++){
      const from=points[i-1], to=points[i];
      // A missed sample is a break in the actual contact, including on a
      // steep face or where the beam clears the floor altogether.
      if(to.along-from.along>(lane.plantedAt===undefined?lane.length*.28:3.45))continue;
      const seed=(lane.id??((startsAt??0)*43))*2.7;
      const at=u=>lerp(from.along,to.along,u);
      const damp=u=>(lane.doused??[]).some(({from,to})=>at(u)>=from&&at(u)<=to);
      const strip=(style,opacity,size,offset,visible,rows)=>{
        brush.ribbon(rows,style,seed,opacity,(u,p,side)=>{
          const drag=(.14*Math.sin(at(u)*1.37+seed)+.065*Math.sin(at(u)*4.17+seed))*width;
          const transverse=drag+offset;
          const x=lerp(from.x,to.x,u)+direction.z*transverse;
          const z=lerp(from.z,to.z,u)-direction.x*transverse;
          const height=lerp(from.y,to.y,u);
          const floor=floorAt?.(x,z);
          const contact=Number.isFinite(floor)&&Math.abs(floor-height)<1.55;
          const y=contact?Math.max(height,floor+.13):height;
          const rim=style===SCORCH.ember||style===SCORCH.wetEdge;
          p.set(x,y+(rim?.10:.035),z);
          const rise=rim?size*.12*Math.sign(offset):0;
          side.set(direction.z*size,rise,-direction.x*size);
          const joint=i===1?ease(0,.15,u):1;
          const end=i===points.length-1?1-ease(.87,1,u):1;
          return joint*end*Number(visible(u));
        },from.along/lane.length,to.along/lane.length);
      };
      const wet=lane.doused?.some(mark=>mark.to>=from.along&&mark.from<=to.along);
      const soaked=lane.doused?.some(mark=>mark.from<=from.along&&mark.to>=to.along);
      const rows=wet?7:3;
      // One bed anchors the beam to the surface. Heat stays on its banks and
      // the wet interval shows a continuous blue-grey crust instead.
      if(!soaked) {
        strip(SCORCH.bed,fade*(.67+.25*heatScale),width,0,u=>!damp(u),rows);
        for(const edge of [-1,1]) {
          strip(SCORCH.ember,fade*(.33+.65*heatScale),width*.205,width*.62*edge,u=>!damp(u),rows);
        }
      }
      if(wet) {
        strip(SCORCH.cooled,fade*.87,width,0,damp,rows);
        strip(SCORCH.wetEdge,fade*.51,width*.20,width*.57,damp,rows);
      }
    }
  }
}

function drawBeam(brush, art, origin) {
  const {age, duration, radius, rank} = art;
  const echo = art.phase === 'echo';
  const intercept=echo&&Boolean(art.beamInterception);
  const reverse = !echo && rank === 3 && age >= 1.39;
  const aim=art.sweepAngle ?? art.angle;
  const charge = windowAt(age, .01, .20, .46, .60);
  const sweepEnd = rank === 3 ? 2.08 : 1.91;
  const echoAt=art.phaseAt??2.09;
  const release=art.phase==='release';
  const onset=echoAt+(intercept?.13:0);
  const fire = release ? 0 : echo
    ? windowAt(age, onset, onset+.042, duration-.16, duration)*.93
    : windowAt(age,.48,.57,sweepEnd,Math.min(sweepEnd+.14,duration));
  const source = originOf(origin, art);
  const mouth=brush.point.set(source.x,source.y,source.z);
  const dirX=Math.sin(aim), dirZ=Math.cos(aim);
  const slope=art.beamPitch??0;
  const strength=echo ? .96 : reverse ? .72 : 1;
  const thermalStyle=echo||reverse?RETURN_STYLE:0;
  const width=echo?(art.echoWidth??art.beamWidth*.68):art.beamWidth;
  const thickness = clamp((width ?? 1.65)*1.08,.77,2.75)*strength;
  const advance=ease(.49,.61,age);
  const reach=Math.max(.09,(echo?(art.echoRadius??radius*.78):(art.beamLength??radius))*advance);
  const rebound = ease(reverse ? 1.39 : .52,reverse ? 1.45 : .60,age)*
    (1-ease(reverse ? 1.49 : .66,reverse ? 1.61 : .87,age));
  const tail = 1-ease(sweepEnd-.14,sweepEnd+.08,age);
  if(!intercept||age>=onset)rememberBeam(brush,art,mouth,aim,reach,slope);
  const band=release?.70*(1-ease(0,.26,art.phaseAge)):fire*(.58+.42*tail);
  drawBeamBand(brush,art,band);

  brush.ellipse(mouth,.38+charge*.71,.13+.36*charge,.14,age*9.4,14.5,charge*.74,STYLE.wake,1.13);
  brush.disk(mouth,.28+charge*.47,.27+charge*.50,8.6,charge*.96,STYLE.spark);
  if(intercept) {
    const coil=windowAt(age,echoAt,echoAt+.05,onset,onset+.085);
    brush.disk(mouth,.36+coil*.54,.25+coil*.48,14.8,coil*.78,STYLE.spark+RETURN_STYLE);
  }
  if (fire < .014) return;
  // The hot core keeps a straight axis at the active damage heading.
  // Secondary strips fold into it as the first blast becomes a sustained cut.
  for (const vertical of [false,true]) {
    const style=echo?BEAM_ECHO.core:STYLE.ray+thermalStyle;
    brush.ribbon(96,style,4.5+Number(vertical),fire*(vertical?.97:.98),(t,p,side)=>{
      const swell=.42+.58*Math.sin(Math.PI*t*.85);
      const tremble=.95+.040*Math.sin(age*44+t*52);
      const waist=echo?.92:lerp(.59,1,tail);
      const distance=.13+reach*t;
      p.set(mouth.x+dirX*distance,mouth.y+slope*distance+.08+.09*t,mouth.z+dirZ*distance);
      const width=swell*thickness*tremble*(waist+rebound*.25);
      side.set(vertical?-slope*dirX*width:dirZ*width,vertical?width*1.12:0,vertical?-slope*dirZ*width:-dirX*width);
    });
  }
  for (let slash=0;slash<5+rank;slash++) {
    const salt=6.72+7.68*slash;
    const spread=(hash(salt)-.5)*(0.8+2.2*tail+rebound);
    const speed=(age*4.8+hash(salt+1))%1;
    const segment=reach*(.16+.29*hash(salt+2));
    const base=reach*.54*speed;
    brush.ribbon(24,STYLE.blade+thermalStyle,salt,fire*(.47+.34*hash(salt+3))*Math.sin(Math.PI*speed),(t,p,side)=>{
      const push=base+t*segment;
      const loosen=spread*(.77+.67*t);
      p.set(mouth.x+dirX*push+dirZ*loosen,mouth.y+slope*push+.16+.14*spread+.38*Math.sin(t*TAU+.5*slash),
        mouth.z+dirZ*push-dirX*loosen);
      side.copy(brush.cameraUp).multiplyScalar(.075+.26*Math.sin(Math.PI*t));
    });
  }
  brush.disk(mouth,thickness*(.81+rebound*.41),thickness*(.70+rebound*.36),7.8,fire*.91,STYLE.spark+thermalStyle);
  const tip=brush.end.set(mouth.x+dirX*reach*.99,mouth.y+slope*reach*.99+.17,mouth.z+dirZ*reach*.99);
  brush.disk(tip,thickness*(.48+rebound*.31),thickness*(.43+rebound*.51),24.,fire*(.44+.39*rebound),STYLE.spark+thermalStyle);
}

export function createSpaceArtVisuals() {
  const root = new THREE.Group();
  const brush = new ArtBrush();
  root.name = 'Dragon arts · space';
  root.add(brush.mesh);
  root.visible = false;

  return {
    root,
    reset() {
      root.visible = false;
      brush.castId = null;
      brush.rayTrail.length = 0;
      brush.preyTrails.clear();
    },
    update(art, camera, origin, depthTexture, resolution, context) {
      root.visible = Boolean(art && Object.hasOwn(PALETTES, art.kind));
      if (!root.visible) return;
      brush.begin(art, camera, depthTexture, resolution);
      switch (art.kind) {
        case 'rift':
          drawRift(brush, art, origin, context);
          pullTrails(brush, art, context);
          break;
        case 'abyss':
          drawAbyss(brush, art, context);
          pullTrails(brush, art, context);
          break;
        case 'beam':
          drawBeam(brush, art, origin);
          break;
      }
      brush.finish();
    },
  };
}

export function createBeamGroundVisuals() {
  const brush=new ArtBrush();
  const {mesh}=brush;
  mesh.renderOrder=16;
  mesh.name='Dragon arts · live scorch';
  mesh.visible=false;
  const beam={id:null,kind:'beam',age:0};
  return {
    root:mesh,
    reset() { mesh.visible=false; },
    update(scorch,camera,depth,resolution,gameTime,floorAt) {
      if (!scorch?.lanes.length) { mesh.visible=false; return; }
      beam.age=gameTime;
      brush.begin(beam,camera,depth,resolution);
      drawScorchLanes(brush,scorch.lanes,gameTime,scorch.art.startedAt,floorAt);
      brush.finish();
    },
  };
}
