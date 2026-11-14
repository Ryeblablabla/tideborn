import * as THREE from 'three';

const TAU = Math.PI * 2;
const MAX_VERTICES = 16000;
const MAX_INDICES = MAX_VERTICES * 3;
const MAX_MARKS = 64;
const MAX_PULSES = 16;
const MAX_DOCTRINE_PULSES = 24;
const PIGMENTS = {
  wind: ['#243e39', '#91aaa0', '#f0f2e4'],
  fire: ['#662019', '#b94d29', '#fff0ca'],
  thunder: ['#232943', '#5a889d', '#eefbff'],
  water: ['#1b4c52', '#4c9b9e', '#eaf6ec'],
  poison: ['#373c22', '#7c8b39', '#e0e3a6'],
};
const WIDTH = { wind: 0, water: 1, thunder: 2, fire: 3, poison: 4, mote: 5, wash: 6, cloud: 7, imprint: 8, soot: 9, ash: 10 };
const routeWidth = { wind:WIDTH.wind, water:WIDTH.water, thunder:WIDTH.thunder, fire:WIDTH.fire, poison:WIDTH.poison };
const crestDetails = new Set(['fan-crest','lane-crest']);
const boltDetails = new Set(['rise-bolt','fork-bolt']);
const windDetails = new Set(['gyre-core','gyre-burst','gale-run']);
const delayedDetails = new Set(['cinder-path','crown-ring','host-knot','basin-flow']);
const delayedDoctrines = new Set(['cinder','crown','host','basin']);

const vertexShader = /* glsl */ `
  attribute vec4 aStroke;
  attribute vec4 aPaint;
  varying vec4 vStroke;
  varying vec4 vPaint;
  varying vec3 vWorld;
  void main() {
    vStroke = aStroke;
    vPaint = aPaint;
    vWorld = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tSurface, tBrush;
  uniform vec2 uResolution;
  uniform vec3 uDeep, uTint, uPale, uHead;
  uniform float uBrush;
  uniform vec4 uWarning[6], uLane[3], uLaneStyle[3], uHandoff, uClearLayer[2];
  uniform int uWarningCount, uLaneCount;
  varying vec4 vStroke;
  varying vec4 vPaint;
  varying vec3 vWorld;

  float hash(vec2 point) {
    return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5453123);
  }

  float noiseAt(vec2 point) {
    vec2 cell = floor(point);
    vec2 t = fract(point);
    t = t*t*(3.-2.*t);
    return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),t.x),
      mix(hash(cell+vec2(0.,1.)),hash(cell+vec2(1.,1.)),t.x),t.y);
  }

  float threatReserve() {
    float keep = 0.;
    for(int i=0;i<6;i++){
      if(i>=uWarningCount) break;
      vec4 mark = uWarning[i];
      float rim = abs(length(vWorld.xz-mark.xz)-mark.w);
      float level = abs(vWorld.y-mark.y);
      keep = max(keep,(1.-smoothstep(.56,1.92,rim))*(1.-smoothstep(3.2,6.8,level)));
    }
    for(int i=0;i<3;i++){
      if(i>=uLaneCount) break;
      vec4 path = uLane[i], style = uLaneStyle[i];
      vec2 span=path.zw-path.xy;
      float along=clamp(dot(vWorld.xz-path.xy,span)/max(.001,dot(span,span)),0.,1.);
      float edge=abs(length(vWorld.xz-path.xy-span*along)-style.x*.88);
      float level=abs(vWorld.y-mix(style.y,style.z,along));
      keep=max(keep,(1.-smoothstep(.48,1.60,edge))*(1.-smoothstep(3.0,6.,level)));
    }
    return keep;
  }

  void main() {
    float sceneDepth = texture2D(tSurface, gl_FragCoord.xy/uResolution).r;
    if (gl_FragCoord.z > sceneDepth + .000045) discard;

    float along = vStroke.x;
    float side = vStroke.y;
    float across = abs(side);
    float seed = vStroke.w;
    float form = vPaint.x;
    float age = vPaint.y;
    float grain = hash(floor(gl_FragCoord.xy));
    float wash = noiseAt(vec2(along*11.,side*6.)+seed);
    float fine = noiseAt(vec2(along*27.,side*28.)-seed);
    vec2 brushCell = vec2(floor(fract(seed*.73)*4.),form>6.5||form<.5||form>1.5&&form<2.5 ? 1. : 0.);
    vec2 brushUv = (brushCell + vec2(.05+.9*along,.5+.45*side))/vec2(4.,2.);
    float brush = mix(.76,texture2D(tBrush,brushUv).r,uBrush);
    float outer = 1.-smoothstep(.68,1.,across + (wash-.5)*.25);
    float tip = smoothstep(0.,.14,along)*(1.-smoothstep(.82,1.,along));
    float fibers = noiseAt(vec2(along*26.,side*54.)+seed);
    float body = outer*tip;
    float shade = .35 + .45*wash;
    float paper = 0.;

    if (form<.5) {
      float stick = .70*brush+.30*fibers;
      float split = .22+.21*sin(along*4.+seed);
      float fray = .055 + .052*wash + .024*fibers;
      float dryTip = smoothstep(.075-fray,.27,along)*(1.-smoothstep(.68,.92+fray,along));
      body *= dryTip * (1.-smoothstep(.42,.98,across + .11*wash));
      paper = (1.-smoothstep(.025,.12,abs(side-split)))*.82*tip;
      body *= .45+.55*smoothstep(.23,.73,stick);
      shade = .36+.39*wash+.18*brush;
    } else if (form<1.5) {
      float crest = .48+.17*sin(along*10.8+seed)+wash*.21;
      float lip = 1.-smoothstep(.04,.22,abs(side-crest)+(fine-.5)*.15);
      float foam = smoothstep(.31,.81,brush*.64+fine*.34+grain*.10);
      paper = lip*(.45+.55*foam);
      body *= .54+.38*wash+.15*foam;
      shade = .06+.39*wash+.45*smoothstep(-.28,.76,side);
    } else if (form<2.5) {
      float gutter = .10*sin(along*28.+seed)+.044*sin(along*163.2+seed);
      float fault = abs(side-gutter);
      float spine = 1.-smoothstep(.075,.18,fault);
      float corona = 1.-smoothstep(.13,.59,fault+(fine-.5)*.28);
      paper = spine;
      body = max(spine*.9, max(corona*.70,outer*(.18+.24*brush)));
      shade = .13+.79*corona;
    } else if (form<3.5) {
      float wisp = .29*sin(7.4*along+seed-age*3.7)+.18*(wash-.5);
      float taper = .88-.64*pow(along,.84);
      float edge = abs(side-wisp)+(fine-.5)*.38;
      float tongue = 1.-smoothstep(taper*.48,taper+.18,edge);
      float heel = smoothstep(.0,.11,along)*(1.-smoothstep(.66,1.,along));
      body = tongue*heel*(.54+.46*smoothstep(.16,.71,brush+fine*.18));
      float pale = 1.-smoothstep(.051,.30,abs(side-wisp+.14+(fibers-.5)*.14));
      float crest = smoothstep(.44,.84,brush+fine*.23)*(1.-smoothstep(.06,.25,abs(edge-taper*.64)));
      paper = max(pale*(1.-along)*.94,crest*.53);
      shade = .31+.41*wash+.26*pow(along,.5);
    } else if (form<4.5) {
      float curl = .20*sin(7.5*along+seed+age);
      float cloud = length(vec2((along-.52)*1.86,(side-curl)*.83));
      float pool = cloud-.85+(wash-.5)*.43+(fine-.5)*.15;
      body = (1.-smoothstep(-.18,.03,pool))*(.40+.6*brush);
      shade = .13+.53*smoothstep(.22,.78,brush+wash*.32);
      paper = smoothstep(.78,.97,brush+fine*.16)*.27;
    } else if (form<5.5) {
      body = pow(max(0.,1.-length(vec2((along-.5)*1.5,side*.82))),1.3);
      body *= .68+.32*brush;
      shade = .52+.38*wash;
      paper = .31*grain;
    } else if(form<6.5) {
      float stain = length(vec2((along-.5)*1.68,side*.82));
      body = (1.-smoothstep(.40,.88,stain+(wash-.5)*.3))*(.27+.73*brush);
      shade = .21+.38*wash;
      paper = .12*grain;
    } else if(form<7.5){
      float edge = length(vec2((along-.5)*1.72,(side+.11*wash)*.91));
      float profile = edge-.84+(wash-.5)*.33+(fine-.5)*.19;
      body = (1.-smoothstep(-.17,.12,profile))*(.36+.64*brush);
      body *= smoothstep(.0,.12,along)*(1.-smoothstep(.88,1.,along));
      shade = .07+.35*wash+.23*smoothstep(.05,.6,side);
      paper = .2*smoothstep(.65,.88,brush+fine*.15);
    } else if (form<9.5) {
      float split = smoothstep(.16,.47,age)*smoothstep(.25,.66,along);
      float fiber = smoothstep(.30,.71,brush + fine*.38 - split*.32);
      body *= (.2+.80*fiber)*(1.-split*.7);
      shade = .16+.31*wash;
      paper = .12+.38*smoothstep(.04,.16,abs(side-.25*sin(along*4.2)));
    } else {
      float drift = (wash-.5)*.37+.13*sin(along*28.+seed);
      float branch = abs(side-drift);
      float root = (1.-smoothstep(.13,.40,branch))*smoothstep(.36,.82,brush+fine*.31);
      float pool = (1.-smoothstep(.33,.95,branch))*.42*brush;
      body = max(root,pool)*tip;
      shade = .16+.34*wash;
      paper = root*.73*smoothstep(.50,.89,fibers);
    }

    float headSpace = smoothstep(.83,3.45,length((vWorld-uHead)*vec3(1.,.77,1.)));
    float leaveHead = form>1.5&&form<2.5 ? .80+.20*headSpace : .23+.77*headSpace;
    float alpha = vStroke.z*body*leaveHead*(1.-.98*threatReserve());
    if (uHandoff.w > .001) {
      vec3 offset = vWorld-uHandoff.xyz;
      float corridor = 1.-smoothstep(3.5,14.5,length(vec3(offset.x,offset.y*1.42,offset.z)));
      // Keep the crest's fine white edge while the heavier wash yields to
      // the receiving group. This is visual only; all cascade hits still run.
      float edgeInk = smoothstep(.42,.84,paper);
      alpha *= 1.-corridor*uHandoff.w*(.83-.42*edgeInk);
    }
    for(int i=0;i<2;i++) {
      vec4 clear = uClearLayer[i];
      if(clear.w <= .001) continue;
      vec3 offset = (vWorld-clear.xyz)*vec3(1.,1.5,1.);
      float local = (1.-smoothstep(2.6,10.5,length(offset)))*clear.w;
      float scenery = smoothstep(4.5,6.6,form)*(1.-smoothstep(7.4,8.6,form));
      float edge = smoothstep(.23,.78,paper);
      alpha *= 1.-local*(.26+.57*scenery)*(1.-.80*edge);
    }
    if (alpha < .017) discard;
    vec3 color = mix(uDeep,uTint,clamp(shade,0.,1.));
    if(form>6.5&&form<7.5)color=mix(vec3(.038,.033,.026),color,.64);
    if(form>8.5)color=mix(vec3(.040,.030,.025),color,.38+.26*wash);
    else if(form>7.5)color=mix(vec3(.052,.043,.033),color,.20+.52*age);
    color = mix(color,uPale,clamp(paper*vPaint.z,0.,1.));
    color *= .95+.09*grain;
    gl_FragColor = vec4(color,alpha);
    #include <colorspace_fragment>
  }
`;

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth = (start, end, value) => THREE.MathUtils.smoothstep(value, start, end);
const random = value => {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return result - Math.floor(result);
};
const heightOf = point => point.y ?? .7;
const groundOf = point => Math.max(.16, heightOf(point) - .29);
const positionOf = (point, y = heightOf(point)) => ({ x: point.x, y, z: point.z });

function directionOf(event, fallback = { x: 0, z: 1 }) {
  const direction = event.direction ?? fallback;
  const length = Math.hypot(direction.x, direction.z);
  return length > .001 ? { x: direction.x / length, z: direction.z / length } : fallback;
}

function envelope(age, life, attack = .075, release = .28) {
  return smooth(0, attack, age) * (1 - smooth(Math.max(attack, life - release), life, age));
}

/** Builds tapered ribbons into one reused dynamic mesh. The depth test uses
 * the actual ink pass so the wash does not paint through shores or actors. */
class BrushBatch {
  constructor() {
    this.position = new THREE.BufferAttribute(new Float32Array(MAX_VERTICES * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.stroke = new THREE.BufferAttribute(new Float32Array(MAX_VERTICES * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.paint = new THREE.BufferAttribute(new Float32Array(MAX_VERTICES * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.index = new THREE.BufferAttribute(new Uint16Array(MAX_INDICES), 1).setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('aStroke', this.stroke);
    geometry.setAttribute('aPaint', this.paint);
    geometry.setIndex(this.index);
    geometry.setDrawRange(0, 0);
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallback.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
      uniforms: {
        tSurface: { value: null }, tBrush: { value: fallback }, uBrush: { value: 0 },
        uResolution: { value: new THREE.Vector2() },
        uDeep: { value: new THREE.Color() }, uTint: { value: new THREE.Color() },
        uPale: { value: new THREE.Color() }, uHead: { value: new THREE.Vector3() },
        uWarning: {value:Array.from({length:6},()=>new THREE.Vector4())},
        uLane: {value:Array.from({length:3},()=>new THREE.Vector4())},
        uLaneStyle: {value:Array.from({length:3},()=>new THREE.Vector4())},
        uWarningCount: {value:0}, uLaneCount: {value:0},
        uHandoff: {value:new THREE.Vector4()},
        uClearLayer:{value:[new THREE.Vector4(),new THREE.Vector4()]},
      },
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = '元素连锁墨迹';
    this.mesh.frustumCulled = false;
    this.reset();
  }

  reset() {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  horizontal = new THREE.Vector3();
  viewSide = new THREE.Vector3();
  eye = new THREE.Vector3();
  view = new THREE.Vector3();
  tangent = new THREE.Vector3();
  stretch = new THREE.Vector3();

  ribbon(rows, form, seed, age, opacity, paper, paintRow) {
    const needed = (rows + 1) * 2;
    if (opacity < .018 || this.vertexCount + needed > MAX_VERTICES ||
      this.indexCount + rows * 6 > MAX_INDICES) return;
    const position = this.position.array, stroke = this.stroke.array, paint = this.paint.array, index = this.index.array;
    const base = this.vertexCount;
    for (let row = 0; row <= rows; row++) {
      const u = row / rows;
      const [x, y, z, ox, oy, oz] = paintRow(u, row);
      for (let side = -1; side <= 1; side += 2) {
        const vertex = this.vertexCount++;
        let at = vertex * 3;
        position[at] = x + side * ox;
        position[at + 1] = y + side * oy;
        position[at + 2] = z + side * oz;
        at = vertex * 4;
        stroke[at] = u; stroke[at + 1] = side;
        stroke[at + 2] = opacity; stroke[at + 3] = seed;
        paint[at] = form; paint[at + 1] = age; paint[at + 2] = paper; paint[at + 3] = 0;
      }
      if (row === 0) continue;
      const tail = base + row * 2;
      const i = this.indexCount;
      index[i] = tail - 2; index[i + 1] = tail - 1; index[i + 2] = tail;
      index[i + 3] = tail; index[i + 4] = tail - 1; index[i + 5] = tail + 1;
      this.indexCount += 6;
    }
  }

  prepare(renderer, camera, ink, palette, game, relayField) {
    this.reset();
    this.viewSide.setFromMatrixColumn(camera.matrixWorld, 0);
    this.viewSide.y = 0;
    this.viewSide.normalize();
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    const uniforms = this.material.uniforms;
    uniforms.tSurface.value = ink.target.depthTexture;
    const brush = ink.sharedResources?.brushAtlas;
    if (brush) uniforms.tBrush.value = brush;
    uniforms.uBrush.value = brush ? 1 : 0;
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    uniforms.uDeep.value.set(palette[0]);
    uniforms.uTint.value.set(palette[1]);
    uniforms.uPale.value.set(palette[2]);
    const {p:head} = game;
    uniforms.uHead.value.set(head.x, head.y + .4, head.z);
    let warningCount = 0;
    if(relayField)uniforms.uWarning.value[warningCount++].set(relayField.x,relayField.y,relayField.z,relayField.radius);
    for(const warning of game.hazards){
      if(!warning.warning || warning.previewOnly || warning.life <= 0)continue;
      uniforms.uWarning.value[warningCount++].set(warning.x,warning.y,warning.z,warning.radius);
      if(warningCount===6)break;
    }
    uniforms.uWarningCount.value = warningCount;
    let laneCount = 0;
    const writeLane=plan=>{
      if(!plan?.from||!plan.to||plan.phase==='recovery'||laneCount>=3)return;
      uniforms.uLane.value[laneCount].set(plan.from.x,plan.from.z,plan.to.x,plan.to.z);
      uniforms.uLaneStyle.value[laneCount++].set(plan.width??.8,plan.from.y??head.y,plan.to.y??head.y,0);
    };
    writeLane(game.boss?.bossPlan);
    for(const enemy of game.enemies){
      if(laneCount===3)break;
      if(enemy.hp<=0)continue;
      writeLane(enemy.pincer);
      writeLane(enemy.dartRush);
      writeLane(enemy.cloudPass);
      writeLane(enemy.dive);
    }
    uniforms.uLaneCount.value = laneCount;
  }

  upload() {
    this.mesh.geometry.setDrawRange(0, this.indexCount);
    const attributes = [this.position, this.stroke, this.paint];
    for (const attribute of attributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.vertexCount * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.index.clearUpdateRanges();
    this.index.addUpdateRange(0, this.indexCount);
    this.index.needsUpdate = true;
  }

  blot(p, radius, seed, age, opacity, kind = WIDTH.wash, high = 0) {
    const x = this.viewSide.x, z = this.viewSide.z;
    this.ribbon(12, kind, seed, age, opacity, .49, u => {
      const across = radius * Math.sin(Math.PI * u) ** .49;
      const run = (u - .5) * radius * 1.79;
      const y = p.y + Math.sin(u * Math.PI) * high + (kind === WIDTH.poison ? high * (u - .15) : 0);
      return [p.x + z * run, y, p.z - x * run, x * across, across * high * .12 / radius, z * across];
    });
  }

  plume(p, height, span, seed, age, opacity, mode, drift = 0) {
    const side = this.viewSide;
    this.ribbon(16, mode, seed, age, opacity, .96, u => {
      const x = drift * u + (Math.sin(u * 5.8 + age * 3 + seed) * .42 + Math.sin(u * 10 + seed) * .22) * span * u;
      const width = span * (.78 + .18 * Math.sin(u * 7 + seed)) * (1 - .41 * u);
      return [p.x + side.x * x, p.y + height * u, p.z + side.z * x, side.x * width, 0, side.z * width];
    });
  }

  canopy(p, length, depth, seed, age, opacity) {
    const side = this.viewSide;
    this.ribbon(27, WIDTH.cloud, seed, age, opacity, .67, u => {
      const t = (u - .5)*2;
      const vary = .71 + .26*Math.sin(10.5*u+seed) + .13*Math.cos(23.*u-seed);
      const x = t*length;
      const w = depth*vary*Math.sin(Math.PI*u)**.62;
      const y = p.y + depth*(.38*Math.sin(u*4.+seed)+.21*Math.cos(u*14.-seed));
      return [p.x+side.x*x,y,p.z+side.z*x,-side.z*w*.13,w,side.x*w*.13];
    });
  }

  facingStroke(rows, form, seed, age, opacity, paper, trajectory, pressure) {
    this.ribbon(rows,form,seed,age,opacity,paper,u=>{
      const [x,y,z] = trajectory(u);
      const a = trajectory(Math.max(0,u-.012)), b = trajectory(Math.min(1,u+.012));
      this.tangent.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
      this.view.set(this.eye.x-x,this.eye.y-y,this.eye.z-z).normalize();
      this.stretch.crossVectors(this.tangent,this.view);
      const width = pressure(u)*smooth(.07,.41,this.stretch.length());
      this.stretch.normalize().multiplyScalar(width);
      return [x,y,z,this.stretch.x,this.stretch.y,this.stretch.z];
    });
  }

  inkImprint(mark, age, opacity) {
    const {to,from,seed,direction} = mark;
    const outward = directionOf({direction:{x:to.x-from.x,z:to.z-from.z}},direction);
    const flight = smooth(0,.37,age);
    const span = (.91+.39*random(seed))*(1-flight*.37);
    const p = {
      x: to.x+outward.x*flight*1.82,
      y: heightOf(to)+.10+Math.sin(age/.50*Math.PI)*(.39+random(seed+2)*.62),
      z: to.z+outward.z*flight*1.82,
    };
    const bearing = directionOf({direction:{
      x:outward.x*.62+this.viewSide.x*.6,z:outward.z*.62+this.viewSide.z*.6,
    }},outward);
    this.facingStroke(11,WIDTH.imprint,seed+12.1,age,opacity,.18,u=>{
      const slide = (u-.43)*span*2;
      const bow = (1-2*u)*flight*.19 + Math.sin(u*Math.PI)*.12;
      return [p.x+bearing.x*slide,p.y+bow,p.z+bearing.z*slide];
    }, u=>span*(.31*Math.sin(Math.PI*u)**.61 + .15*Math.exp(-(((u-.72)*8)**2))));
    this.embers(p,span*1.13+flight*1.31,seed+62,age,opacity*.73,5,.88,WIDTH.imprint);
  }

  bolt(from, to, width, seed, age, opacity) {
    this.horizontal.set(to.x - from.x, 0, to.z - from.z);
    const span = this.horizontal.length();
    const sideways = this.horizontal.normalize();
    const sx = span > .08 && Math.abs(heightOf(from) - heightOf(to)) < span ? sideways.z : this.viewSide.x;
    const sz = span > .08 && Math.abs(heightOf(from) - heightOf(to)) < span ? -sideways.x : this.viewSide.z;
    const fracture = u => {
      const block = Math.floor(u * 8), t = u * 8 - block;
      return lerp(random(seed + block * 2.15) - .5, random(seed + (block + 1) * 2.15) - .5, t);
    };
    this.ribbon(24, WIDTH.thunder, seed, age, opacity, 1.17, u => {
      const x = fracture(u) * Math.sin(u * Math.PI) * Math.min(1.9, .45 + span * .26);
      const w = width * (.48 + .50 * Math.sin(Math.PI * u)) * (.85 + .23 * Math.sin(u * 27 + seed));
      const y = lerp(heightOf(from), heightOf(to), u) + Math.sin(u * Math.PI) * Math.min(1.15, span * .23);
      return [lerp(from.x,to.x,u) + sx*x, y, lerp(from.z,to.z,u) + sz*x, sx*w, w*.18, sz*w];
    });
  }

  embers(p, radius, seed, age, opacity, count, lift = 1, mode = WIDTH.mote) {
    for (let i = 0; i < count; i++) {
      const key = seed + i * 7.3;
      const angle = random(key) * TAU + age * .7;
      const distance = radius * (.17 + random(key + 1) * .83) * (.55 + .52 * age);
      const height = (.28 + random(key + 2) * .88) * lift;
      const x = Math.sin(angle), z = Math.cos(angle);
      const px = p.x + x * distance, pz = p.z + z * distance;
      const py = p.y + height * (.18 + age * 1.2);
      const size = .10 + random(key + 3) * .27;
      this.ribbon(2, mode, key, age, opacity * (.52 + .48 * random(key + 5)), .66, u => {
        const stretch = (u - .5) * size * 2.8;
        const w = size * .49 * Math.sin(Math.PI * u);
        return [px + x*stretch,py + stretch*.71,pz + z*stretch,z*w,0,-x*w];
      });
    }
  }
}

function windCore(batch, p, direction, radius, age, opacity, seed) {
  const hook = seed + age*2.05;
  const outer = radius*(.49+.19*smooth(0,.7,age));
  batch.facingStroke(45,WIDTH.wind,seed+13.63,age,opacity*.99,.96,u=>{
    const angle = hook + u*4.76;
    const x = Math.sin(angle), z = Math.cos(angle);
    const pull = outer*(.88-.51*u)*(1+.14*Math.cos(u*13.+seed));
    const lift = radius*(.047+.37*Math.sin(u*Math.PI*.67))*(.70+.3*smooth(0,.32,age));
    return [p.x+x*pull+direction.x*u*2.7,p.y+lift,p.z+z*pull+direction.z*u*2.7];
  }, u=>(.56+radius*.093)*Math.sin(Math.PI*u)**1.12);
  for (let i = 0; i < 7; i++) {
    const spin = i * .88 + age * (2.8 + i * .12) + seed;
    const height = (.65 + i * .61) * (1 + age * .16);
    const reach = radius * (.31 + (i%4)*.16) * (.46 + .54 * smooth(0,.65,age));
    const width = (.24 + (i % 3) * .22) * radius * .18;
    batch.ribbon(34, WIDTH.wind, seed + i*2.2, age, opacity * (i<4 ? .93 : .72), 1.02, u => {
      const t = spin + u * (3.4 + (i%3)*.45);
      const x = Math.sin(t), z = Math.cos(t);
      const rake = reach * (.68 + .36*u + .11*Math.sin(u*TAU));
      const bend = reach * .21 * u * u;
      const w = width * (Math.sin(Math.PI*u)**.57) * (.71 + .35 * u);
      const y = p.y + height * (.27 + u*.8) + .28*Math.sin(t*1.8);
      return [p.x + x*rake + direction.x*bend,y,p.z + z*rake + direction.z*bend,x*w*.90,w*.53,z*w*.90];
    });
  }
  batch.embers(p, radius*.84, seed, age, opacity*.89, 25, 2.9);
}

function windSweep(batch, p, direction, width, age, opacity, seed) {
  for (let i = 0; i < 4; i++) {
    const span = width * (.93 + i*.06);
    batch.ribbon(22, WIDTH.wind, seed+i*.81, age, opacity*(1 - .136*i), 1.11, u => {
      const edge = (u-.5)*2;
      const lead = 2.3*age+.66*i+(1-edge*edge)*2.8;
      const drift = edge*span;
      const w = (.66 + .94*(1-Math.abs(edge))) * (1+.13*i);
      const y = p.y+(.62+.49*i)*(1-edge*edge) + .21*edge;
      return [p.x + direction.x*lead + direction.z*drift,y,p.z + direction.z*lead - direction.x*drift,
        direction.x*w, w*.44,direction.z*w];
    });
  }
}

function gyreFunnel(batch, pulse, age) {
  const {point, radius, seed} = pulse;
  const gathering = pulse.preparing !== false;
  const travel = Math.max(.15,pulse.travelTime ?? .52);
  const p = positionOf(point,heightOf(point));
  const extent = clamp(radius,2.5,20);
  if (!gathering) {
    // Hold the compressed ink briefly above the eye so the pause remains
    // readable behind a near wing, then let it fall through the rupture.
    const press = smooth(0,travel,age);
    const carry = smooth(travel,travel+.065,age);
    const ink = smooth(0,.025,age)*(1-carry);
    for (const spoke of [0,1,2]) {
      batch.ribbon(31,WIDTH.ash,seed+spoke*6.17,age,ink*(1.05-.19*spoke),.76,u=>{
        const turn = seed+spoke*TAU/3+u*3.21+press*1.55;
        const x = Math.cos(turn), z = Math.sin(turn);
        const r = extent*(.19-.108*press)*(.92-.37*u);
        const height = 1.10 + extent*(1-.61*press)*(.085+.19*u)-carry*.75;
        const pressure = .92*Math.sin(Math.PI*u)*(.94-.23*press);
        return [p.x+x*r,p.y+height,p.z+z*r,x*pressure,pressure*.50,z*pressure];
      });
    }
    batch.blot(positionOf(p,p.y+1.10),extent*(.16-.055*press),seed+39,age,ink*.77,WIDTH.ash,.67);
    return;
  }

  const gather = smooth(0,travel,age);
  const ink = envelope(age,travel+.095,.055,.105);
  if (ink<.018 || pulse.receivers?.length===0) return;
  const spin = seed+TAU*(.13*gather+.93*gather*gather);
  for (let arm=0; arm<4; arm++) {
    // Open a paper gap between each arm. The stationary narrow eye stays visible.
    const phase = spin+arm*TAU/4;
    batch.facingStroke(40,arm%2 ? WIDTH.wind : WIDTH.ash,seed+arm*5.83,age,ink*(arm%2?.94:1.05),1.13,u=>{
      const a = phase + u*(4.05+.73*gather);
      const reach = extent*(.68-.58*u)*(.78+.22*gather);
      const contour = 1+.095*Math.sin(u*17+seed);
      return [p.x+Math.cos(a)*reach*contour,p.y+.34+extent*(.019+.34*u*u)*(.65+.35*gather),
        p.z+Math.sin(a)*reach*contour];
    }, u=>extent*(.052+.027*gather)*Math.sin(Math.PI*u)**.63);
  }
  const root = positionOf(p,p.y+.38);
  batch.blot(root,extent*(.18-.09*gather),seed+41,age,ink*.65,WIDTH.ash,.35);
  batch.embers(root,extent*.61,seed+6,age,ink*.74,17,1.2);
}

function gyreRupture(batch, pulse, age) {
  if (pulse.receivers?.length===0) return;
  const ink = envelope(age,.63,.020,.45);
  if (ink<.018) return;
  const extent = clamp(pulse.radius,1.7,24);
  const split = smooth(0,.25,age);
  const p = pulse.point;
  const radius = extent*lerp(.53,1,split);
  for (let piece=0; piece<6; piece++) {
    const phase = pulse.seed+piece*TAU/6;
    for (const [edge,form] of [WIDTH.ash,WIDTH.wind].entries()) {
      const weight = edge ? .67*(1-smooth(.20,.45,age)) : 1;
      batch.ribbon(21,form,pulse.seed+piece*6.79+edge*2.7,age,ink*weight,edge?1.38:.44,u=>{
        const angle = phase + u*.91 + .035*Math.sin(u*19+pulse.seed);
        const x = Math.cos(angle), z = Math.sin(angle);
        const rake = Math.sin(Math.PI*u);
        const r = radius - edge*.56 + (.32+.46*split)*rake;
        const pressure = (.50+.31*split)*rake;
        const rise = rake*(1.15+(piece%3)*.29+edge*.35-.40*split);
        return [p.x+x*r,heightOf(p)+.38+rise,p.z+z*r,
          x*pressure,pressure*(edge?.74:.45),z*pressure];
      });
    }
  }
}

function runningGale(batch, pulse, age) {
  const {point, preparing, seed} = pulse;
  if (preparing===false && pulse.receivers?.length===0) return;
  const from = pulse.from ?? point;
  const to = pulse.to ?? point;
  const travel = Math.max(.08,pulse.travelTime ?? .38);
  const glide = preparing ? smooth(0,travel,age) : 1;
  const ink = preparing ? envelope(age,travel+.09,.030,.105)*.88 : envelope(age,.57,.025,.41);
  if (ink<.018) return;
  const center = preparing ? {
    x:lerp(from.x,to.x,glide), y:lerp(heightOf(from),heightOf(to),glide), z:lerp(from.z,to.z,glide),
  } : point;
  const {x:dx,z:dz} = directionOf({direction:{x:to.x-from.x,z:to.z-from.z}},pulse.direction);
  const reach = clamp(pulse.width,1.1,17);
  const open = preparing ? lerp(.42,.90,glide) : lerp(.92,1.05,smooth(0,.22,age));
  for (const [layer,form] of [WIDTH.ash,WIDTH.wind,WIDTH.wind].entries()) {
    batch.ribbon(37,form,seed+layer*4.7,age,ink*(1-layer*.16),layer===1?1.48:.87,u=>{
      const side = 2*u-1;
      const fan = Math.sin(Math.PI*u)**.65;
      const ripple = Math.sin(u*19+seed-layer*.84)*.20;
      const rim = reach*side*open;
      const fold = (1.9+ripple)*fan-layer*.66;
      const height = heightOf(center)+.44+(1.43+layer*.55)*fan+ripple;
      const thickness = (.62+layer*.20)*fan;
      return [center.x+dz*rim+dx*fold,height,center.z-dx*rim+dz*fold,
        dx*thickness,thickness*(layer===1?1.35:.71),dz*thickness];
    });
  }
  if (!preparing) batch.embers(positionOf(center,heightOf(center)+.57),reach*.78,seed+29,age,ink*.76,16,1.56);
}

function windContact(batch, mark, age, opacity) {
  const {seed,to,from,direction,detail} = mark;
  const {x:dx,z:dz} = directionOf({direction:{x:to.x-from.x,z:to.z-from.z}},direction);
  const sever = smooth(.025,.30,age);
  for (const side of [-1,1]) {
    batch.facingStroke(13,side<0?WIDTH.ash:WIDTH.wind,seed+side*7,age,opacity*.89,1.55,u=>{
      const cut = (u-.44)*(1.6+sever*1.1);
      const away = sever*(detail==='gyre-burst'?2.05:1.2) + .42*Math.sin(Math.PI*u);
      return [to.x+dz*(cut+side*sever*.73)+dx*away,heightOf(to)+.36+u*1.35+sever*.72,
        to.z-dx*(cut+side*sever*.73)+dz*away];
    },u=>.35*Math.sin(Math.PI*u)**.84*(1-.36*sever));
  }
}

function waterFront(batch, p, direction, width, age, opacity, seed) {
  batch.ribbon(39,WIDTH.water,seed+7.21,age,opacity*.91,.94,u=>{
    const cross = (u-.5)*2;
    const bend = 1-cross*cross;
    const curvature = bend*(2.5+1.07*Math.sin(u*14.+seed)+.40*Math.sin(u*31.-seed));
    const lip = (.82 + .22*Math.sin(u*18.+seed))*(1.15+width*.085)*bend**.42;
    const travel = 4.8*age+curvature-.38;
    const rim = width*1.01*cross;
    const stroke = (1.28+width*.112)*Math.sin(u*Math.PI)**.69;
    return [p.x+direction.x*travel+direction.z*rim,p.y+lip+.37,p.z+direction.z*travel-direction.x*rim,
      direction.x*stroke*.64,stroke*.67,direction.z*stroke*.64];
  });
  for (let i = 0; i < 5; i++) {
    const travel = 4.8 * age - i * (1.25 + .27*age);
    const spread = width * (1 + i*.06);
    const rise = (i === 0 ? 2.9 : 1.34 - i*.11) * Math.min(1.36,.75+width*.041);
    const show = opacity * (i===0 ? .91 : .72-i*.075);
    batch.ribbon(38, WIDTH.water, seed+i*.92, age, show, 1.25, u => {
      const cross = (u-.5)*2;
      const scallop = .49*Math.sin(u*15.+seed+i*.65)+.24*Math.sin(u*37.+seed);
      const lean = travel + 2.55*(1-cross*cross) + scallop*(1-cross*cross);
      const rim = cross*spread;
      const crest = rise * Math.sin(u * Math.PI)**.52 * (.73 + .27*Math.sin(u*19 + seed + i));
      const w = (.78+i*.19)*Math.sin(u*Math.PI)**.46;
      return [p.x+direction.x*lean+direction.z*rim,p.y+crest,p.z+direction.z*lean-direction.x*rim,
        direction.x*w*.79,w*.72,direction.z*w*.79];
    });
  }
  batch.embers(p, width *.86, seed, age, opacity*.86, 21, 1.32);
}

function doctrineCrest(batch, pulse, age) {
  const {point, direction, width, seed, carrierFrom, preparing, receivers} = pulse;
  const fan = pulse.detail === 'fan-crest';
  const primer = fan && !carrierFrom;
  const travel = Math.max(.05, pulse.travelTime ?? .24);
  const ink = preparing ? envelope(age,travel+.11,.029,.11) :
    envelope(age,primer?.27:.60,.029,primer?.20:.41)*(receivers?.length===0?.62:1);
  if(ink<.018)return;
  const arrival = preparing ? smooth(0, travel, age) : 1;
  const center = preparing && carrierFrom ? {
    x:lerp(carrierFrom.x,point.x,arrival), y:lerp(heightOf(carrierFrom),point.y,arrival),
    z:lerp(carrierFrom.z,point.z,arrival),
  } : point;
  const {x:dx,z:dz} = direction;
  const sx = dz, sz = -dx;
  const retreat = preparing ? 0 : smooth(.055,.60,age);
  const span = width * lerp(.20,preparing?.56:1,arrival);
  const rise = (primer ? .71 : fan ? 1.30 : 2.60) * (preparing?.61:1) * (.53+.47*arrival) * (1-.60*retreat);
  const bow = (fan ? 1.55 : .82) * (.55+.45*arrival);
  for(const [index, opacity] of (preparing ? [.63,.37] : [1,.78,.47]).entries()){
    batch.ribbon(34,WIDTH.water,seed+index*4.31,age,ink*opacity,index===1?1.25:.91,u=>{
      const across = u*2-1;
      const arc = 1-across*across;
      const shoulder = arc**.66 * (.85+.15*Math.sin(u*24+seed));
      const rim = span * across * (1+.042*index);
      const advance = arc*bow + retreat*(fan?.48:1.40) - index*(fan?.67:.96);
      const stroke = (.28+rise*.44)*(1-.17*index)*Math.sin(Math.PI*u)**.66;
      return [center.x+sx*rim+dx*advance,center.y-.12+shoulder*rise*(1-.22*index),
        center.z+sz*rim+dz*advance,dx*stroke*.68,stroke*.75,dz*stroke*.68];
    });
  }
  if(preparing && carrierFrom && Math.hypot(point.x-carrierFrom.x,point.z-carrierFrom.z)>1.5){
    batch.facingStroke(18,WIDTH.water,seed+24.2,age,ink*(.70-.41*retreat),1.06,u=>{
      const t = arrival * u, lean = Math.sin(Math.PI*u);
      return [lerp(carrierFrom.x,point.x,t) + sx*lean*.39,
        lerp(heightOf(carrierFrom),point.y,t) + .16 + lean*.41,
        lerp(carrierFrom.z,point.z,t) + sz*lean*.39];
    },u=>Math.sin(Math.PI*u)**.65 * (.28+u*.43));
  }
  if(preparing||receivers?.length===0)return;
  const hit = envelope(age,.41,.033,.30);
  batch.embers(positionOf(center,center.y+.21),span*.72,seed+18.5,age,hit*.69,fan?11:13,fan?1.02:2);
}

function fireBloom(batch, p, radius, age, opacity, seed, count) {
  batch.blot(p, radius * (.76 + .51*age), seed, age, opacity*.83, WIDTH.soot, .35);
  const bloom = .07+.93*smooth(0,.18,age);
  for (let i = 0; i < count; i++) {
    const key = seed + i*4.5;
    const angle = random(key)*TAU;
    const distance = radius * (.16 + random(key + 1) * .71) * (.55 + .45*smooth(0,.5,age));
    const high=i%3===0;
    const sky = (1.48 + radius*.53) * (high?1.15+random(key+2)*.64:.47+random(key+2)*.68) * bloom * (1 - .43*age);
    const p2 = {x:p.x+Math.sin(angle)*distance,y:p.y-.08,z:p.z+Math.cos(angle)*distance};
    batch.plume(p2, sky, (high?.62:.45)+radius*(.082+.075*random(key+3)), key, age, opacity*(.65+.35*random(key+4)),
      WIDTH.fire, Math.sin(key)*(high?1.38:.84));
  }
  batch.embers(p, radius, seed, age, opacity*.84, count+4, 1.38);
}

function poisonBloom(batch, p, radius, age, opacity, seed, count) {
  batch.blot(p, radius * (.81+.52*age), seed, age, opacity*.94, WIDTH.poison, .34);
  batch.blot(positionOf(p,p.y+.09), radius*(.65+.46*age), seed+3.16, age, opacity*.57, WIDTH.cloud, .38);
  const settling = smooth(0,.53,age);
  for (let i = 0; i < count; i++) {
    const key = seed + i*5.4;
    const angle = random(key)*TAU;
    const distance = radius * (.18 + random(key+1)*.58) * (.56 + .44*settling);
    const width = radius * (.24 + random(key+2)*.26);
    const high = (.48 + random(key+3)*.64) * (radius*.44+1.1) * (.38+.62*settling);
    const q = {x:p.x+Math.sin(angle)*distance,y:p.y+.21+i*.035,z:p.z+Math.cos(angle)*distance};
    batch.plume(q, high*.67, width*1.21, key, age, opacity*.72, WIDTH.poison, Math.sin(key)*width*.47);
  }
  batch.embers(p, radius*.82, seed, age, opacity *.72, count+7, .7);
}

function emberPath(batch, pulse, age) {
  const {from,to= pulse.point,seed,preparing} = pulse;
  const size = clamp(pulse.radius,2.1,9.2);
  if(preparing){
    if(!from)return;
    const travel = Math.max(.10,pulse.travelTime ?? .31);
    const ink = envelope(age,travel+.09,.032,.11);
    if(ink<.018)return;
    const bearing = directionOf({direction:{x:to.x-from.x,z:to.z-from.z}},pulse.direction);
    const lead = smooth(0,travel,age);
    const path = (t,offset=0) => {
      const arc = Math.sin(Math.PI*t);
      const side = arc*(.66*Math.sin(t*6.9+seed)+.21*Math.sin(t*19.1)+offset);
      return {x:lerp(from.x,to.x,t)+bearing.z*side,
        y:lerp(heightOf(from),heightOf(to),t)+.39+1.34*arc,
        z:lerp(from.z,to.z,t)-bearing.x*side};
    };
    for(const [index,form] of [WIDTH.ash,WIDTH.fire].entries()){
      batch.facingStroke(24,form,seed+index*4.5,age,ink*(index?.97:.72),index?1.10:.35,u=>{
        const t = u*lead;
        const p = path(t,index*.24);
        return [p.x,p.y+(index?.08:-.20),p.z];
      },u=>(index?.86:1.34)*Math.sin(Math.PI*u*.94)**.67*(.30+.70*u));
    }
    const front = path(lead);
    batch.plume(front,.88+lead*1.42,.50,seed+3.7,age,ink*.91,WIDTH.fire,.78);
    batch.embers(front,1.6,seed+8.2,age,ink*.80,8,1.75);
    return;
  }
  if(pulse.receivers?.length===0)return;
  const ink = envelope(age,.78,.028,.42);
  if(ink<.018)return;
  const p = positionOf(to,heightOf(to)-.22);
  const rise = smooth(0,.22,age);
  const radius = size*(.48+.34*rise);
  fireBloom(batch,p,radius,age,ink*.86,seed,6);
  batch.plume(p,(3.65+size*.44)*rise,1.03+size*.12,seed+22.1,age,ink,WIDTH.fire,.79);
  batch.plume(p,(2.68+size*.28)*rise,.81+size*.18,seed+19.2,age,ink*.45,WIDTH.ash,-.60);
}

function fireCrown(batch, pulse, age) {
  const {point:p,seed,preparing} = pulse;
  if(!preparing && pulse.receivers?.length===0)return;
  const outward = Math.max(.65,pulse.radius);
  const inward = clamp(pulse.innerRadius??outward*.61,0,outward-.30);
  const travel = Math.max(.10,pulse.travelTime??.28);
  const opacity = preparing ? envelope(age,travel+.10,.025,.12)*.70 : envelope(age,.59,.018,.39);
  if(opacity<.018)return;
  const opening = preparing ? smooth(0,travel,age) : smooth(0,.28,age);
  const rim = lerp(inward,outward,preparing ? .22+.72*opening : .69+.31*opening);
  const y = heightOf(p)-.13;
  for(let quadrant=0;quadrant<4;quadrant++){
    const phase=(quadrant*.25+.10*random(seed+3))*TAU;
    const key=seed+quadrant*2.91;
    for(const [index,form] of [WIDTH.ash,WIDTH.fire].entries()){
      batch.ribbon(19,form,key+index*11.3,age,opacity*(index?.94:.71),index?1.16:.25,u=>{
        const angle = phase + u*1.47;
        const x = Math.cos(angle), z = Math.sin(angle);
        const pressure = Math.sin(Math.PI*u)**.62;
        const r = rim + Math.sin(angle*7.8+key)*.23 - index*.32;
        const height = index ? .33+pressure*(.51+.54*opening) : .04;
        const spread = pressure*(index?.51:.87);
        return [p.x+x*r,y+height,p.z+z*r,x*spread,spread*(index?.97:.27),z*spread];
      });
    }
    if(!preparing){
      const angle=phase+.4+random(key+2)*.66;
      const flame={x:p.x+Math.cos(angle)*rim,y,z:p.z+Math.sin(angle)*rim};
      batch.plume(flame,(1.15+outward*.21)*smooth(0,.14,age),.57+outward*.033,key,age,opacity*.83,WIDTH.fire,.44);
      batch.embers(flame,1.75,key+20,age,opacity*.68,6,1.75);
    }
  }
}

function carriedPoison(batch, pulse, age, enemy) {
  const {from= pulse.point,to=pulse.point,seed,preparing} = pulse;
  if(preparing){
    const travel = Math.max(.04,pulse.travelTime??.12);
    const plantedAge = pulse.plantedAt===undefined ? age : age+pulse.time-pulse.plantedAt;
    const shown = smooth(0,.055,plantedAge)*(1-smooth(travel+.04,travel+.17,age));
    if(shown<.018)return;
    const t = smooth(0,travel,age);
    const current = enemy ?? {x:lerp(from.x,to.x,t),y:lerp(heightOf(from),heightOf(to),t),z:lerp(from.z,to.z,t)};
    const knot = positionOf(current,heightOf(current)+.90);
    batch.blot(knot,.90,seed,age,shown*.99,WIDTH.ash,.43);
    batch.plume(knot,1.66,.73,seed+6.9,age,shown*.95,WIDTH.poison,.44);
    batch.facingStroke(10,WIDTH.poison,seed+19,age,shown*.86,1.26,u=>{
      return [lerp(from.x,knot.x,u),lerp(heightOf(from)+.10,knot.y,u)-.25*Math.sin(Math.PI*u),lerp(from.z,knot.z,u)];
    },u=>.67*Math.sin(Math.PI*u)**.66);
    return;
  }
  const ink = envelope(age,.86,.052,.53);
  if(ink<.018)return;
  const p = positionOf(to,heightOf(to)-.10);
  const packed = clamp(pulse.radius,1.1,8.3);
  const open = smooth(.01,.28,age);
  const spread = pulse.receivers?.length===0 ? Math.min(1.4,packed) : lerp(packed*.32,packed*.86,open);
  batch.blot(p,spread*.70,seed,age,ink,WIDTH.ash,.75);
  poisonBloom(batch,p,spread,age,ink*.88,seed+11.4,4);
  batch.canopy(positionOf(p,p.y+.7+open*1.15),spread*.90,.63,seed+23.4,age,ink*.62);
}

function poisonConfluence(batch, pulse, age) {
  const {to=pulse.point,seed,preparing} = pulse;
  if(preparing){
    const travel = Math.max(.10,pulse.travelTime??.34);
    const ink = envelope(age,travel+.09,.033,.12);
    if(ink<.018)return;
    const lead = smooth(0,travel,age);
    const sources = pulse.sources?.length ? pulse.sources : [pulse.from];
    for(const [index,source] of sources.slice(0,2).entries()){
      const from = source?.from ?? source;
      if(!from || !Number.isFinite(from.x) || !Number.isFinite(from.z))continue;
      const key = seed + index*8.53;
      const side = directionOf({direction:{x:to.x-from.x,z:to.z-from.z}},pulse.direction);
      const route = t => {
        const bend = Math.sin(Math.PI*t)*(.83+index*.38);
        return [lerp(from.x,to.x,t)+side.z*bend,lerp(heightOf(from),heightOf(to),t)+.38+bend*1.08,
          lerp(from.z,to.z,t)-side.x*bend];
      };
      batch.blot(positionOf(from,heightOf(from)+.03),1.32,key,age,ink*.65,WIDTH.ash,.43);
      batch.facingStroke(24,WIDTH.ash,key,age,ink*.95,.25,u=>route(u*lead),u=>1.63*Math.sin(Math.PI*u)**.74);
      batch.facingStroke(24,WIDTH.poison,key+9,age,ink,.97,u=>{
        const point=route(u*lead);
        point[1]+=.26;
        return point;
      },u=>1.05*Math.sin(Math.PI*u)**.72);
    }
    return;
  }
  if(pulse.receivers?.length===0)return;
  const ink = envelope(age,1.01,.053,.60);
  if(ink<.018)return;
  const p = positionOf(to,heightOf(to)+.02);
  const size = clamp(pulse.radius,2.6,9.4);
  const rise = smooth(.025,.29,age);
  batch.blot(p,size*(.39+.55*rise),seed,age,ink*.92,WIDTH.ash,.46);
  for(const side of [-1,1]){
    const q = positionOf(p,p.y+.18);
    batch.plume(q,(1.07+size*.83)*rise,size*.22,seed+side*5.92,age,ink*.80,WIDTH.poison,side*size*.39);
  }
  poisonBloom(batch,p,size*(.57+.27*rise),age,ink*.79,seed+15.4,6);
}

function travellingFront(batch, pulse, kind, age, opacity) {
  const {from, to, direction, seed} = pulse;
  if (!from || !to) return;
  const fire = kind === 'fire';
  const span = Math.hypot(to.x-from.x,to.z-from.z);
  if (span < 1.5) return;
  const width = clamp(pulse.width,2.6,10.2);
  const travelTime = pulse.travelTime ?? (fire ? .22 : .37);
  const reach = .08+.92*smooth(.0,travelTime,age);
  const swell = smooth(travelTime*.25,travelTime+.16,age);
  const side = {x:direction.z,z:-direction.x};
  const pointOnPath = u => ({
    x:lerp(from.x,to.x,u), y:lerp(heightOf(from),heightOf(to),u),
    z:lerp(from.z,to.z,u),
  });
  const trailHead = pointOnPath(reach);
  for(let i=0;i<4;i++){
    const key=seed+3.3*i;
    const contour=(i-1.35)*.47;
    const periphery=width*(.32+.13*i);
    const intensity=opacity*(i===0?.99:i===1?.83:.57);
    batch.facingStroke(28,fire?WIDTH.fire:i===0?WIDTH.ash:WIDTH.poison,key,age,intensity,fire?1.01:.69,u=>{
      const t = u*reach;
      const p = pointOnPath(t);
      const head = Math.sin(u*Math.PI*.86)*(.30+.70*t);
      const cross = (contour+.19*Math.sin(u*7.+key))*periphery*head;
      const roll = head*((fire?1.5:.76)+swell*.91+i*.35);
      return [p.x+side.x*cross,p.y+roll,p.z+side.z*cross];
    },u=>(.67+width*(.14+i*.044))*Math.sin(u*Math.PI)**.72*(.45+.55*u));
  }
  // The far pocket only takes over the frame after the front reaches it.
  const ignite = smooth(travelTime-.04,travelTime+.13,age);
  const tip = positionOf(trailHead,heightOf(trailHead)+.12);
  batch.blot(positionOf(from,groundOf(from)+.10),width*.57,seed+42.3,age,opacity*.87,fire?WIDTH.soot:WIDTH.ash,.28);
  batch.embers(tip,width*.68,seed+14.8,age,opacity*.89,18,fire?2.8:1.42);
  if(ignite>.03){
    const end=positionOf(to,groundOf(to)+.20);
    if(fire)fireBloom(batch,end,width*(.91+.25*swell),age,opacity*ignite,seed+7.18,8);
    else{
      poisonBloom(batch,end,width*(1.10+.41*swell),age,opacity*ignite*.96,seed+9.42,6);
      batch.canopy(positionOf(end,end.y+1.65+swell*.85),width*1.16,.83,seed+19.2,age,
        opacity*ignite*.74);
    }
  }
}

function waveDrop(batch, mark, age, opacity) {
  const {to, from, seed} = mark;
  const direction = directionOf(mark, {x:0,z:1});
  const normal = Math.hypot(to.x-from.x,to.z-from.z) > .1
    ? directionOf({direction:{x:to.x-from.x,z:to.z-from.z}})
    : direction;
  const p = positionOf(to, groundOf(to)+.22);
  const size = mark.killed ? 1.12 : .69;
  batch.ribbon(13, WIDTH.water, seed, age, opacity*.85, 1.29, u => {
    const cross = (u-.5)*2;
    const spread = (size*1.75+2.8*age)*cross;
    const tilt = normal.x*spread*.96;
    const w = .72*Math.sin(u*Math.PI);
    const crest = (.14 + size*1.38*(1-age*.5))*(1-cross*cross);
    const pull = age*2.5+cross*cross*.7;
    return [p.x+normal.z*spread+normal.x*pull,p.y+crest+tilt*.08,
      p.z-normal.x*spread+normal.z*pull,normal.x*w,w*.71,normal.z*w];
  });
  batch.embers(p,size*1.48,seed,age,opacity*.78,5,1.16);
}

function thunderWeather(batch, p, radius, age, opacity, seed) {
  const breadth = radius*(.67+.28*smooth(0,.54,age));
  const ground = positionOf(p,groundOf(p)+.24);
  batch.blot(ground,breadth,seed,age,opacity*.53,WIDTH.wash,.53);
  const side = batch.viewSide;
  const cloudSwell = .69+.31*smooth(.01,.44,age);
  for(let i=0;i<4;i++){
    const offset = (i-1.45)*breadth*.31;
    const q={x:p.x+side.x*offset,y:p.y+6.3+i*.63,z:p.z+side.z*offset};
    batch.canopy(q,breadth*(.38+.07*(i%3))*cloudSwell,(1.71-.18*i)*cloudSwell,
      seed+i*4.18,age,opacity*(.62-.05*i));
  }
  for(let streak=0;streak<10;streak++){
    const key=seed+streak*9.5;
    const theta=random(key+1)*TAU;
    const range=breadth*(.35+.66*random(key));
    const x=p.x+Math.sin(theta)*range,z=p.z+Math.cos(theta)*range;
    const da=age-.038*streak;
    if(da<=0)continue;
    batch.ribbon(4,WIDTH.thunder,key,age,opacity*.19,1.12,u=>{
      const y=p.y+3.2+4.4*u-3.1*da;
      return [x+.38*u,y,z+.19*u,.069,0,.025];
    });
  }
}

function thunderImpact(batch, mark, age, opacity) {
  const {to, from, seed} = mark;
  const p = positionOf(to,heightOf(to)+.29);
  const root = positionOf(from,heightOf(from)+.53);
  const span = Math.hypot(root.x-p.x,root.z-p.z);
  const side = batch.viewSide;
  if(span>.21)batch.bolt(root,p,(mark.depth>1?.47:.66),seed+1.4,age,opacity*.97);
  if (mark.strike || span<=.21){
    const offset=(random(seed+1)-.5)*4.0;
    const high=4.7+3.15*random(seed+2)+(mark.killed?.94:0);
    const sky={x:p.x+side.x*offset,y:p.y+high,z:p.z+side.z*offset};
    batch.bolt(sky,p,.85+random(seed+3)*.23,seed,age,opacity);
    const fork={x:p.x+side.x*(2.1+random(seed+6)*2),y:p.y+high*.35,z:p.z+side.z*(2.1+random(seed+6)*2)};
    batch.bolt(positionOf(sky,(sky.y+p.y)*.5),fork,.30,seed+11.2,age,opacity*.52);
  }
  batch.embers(p,1.3,seed,age,opacity*.79,mark.killed?6:3,1.3);
}

function doctrineBolt(batch, pulse, age) {
  const {from,to,seed,preparing} = pulse;
  if(!from||!to)return;
  const travel = Math.max(.05,pulse.travelTime??.15);
  const opacity = preparing ? envelope(age,travel+.09,.018,.10)*.57 : envelope(age,.34,.019,.28);
  if(opacity<.018)return;
  const rising = pulse.detail==='rise-bolt';
  const direction = directionOf({direction:{x:to.x-from.x,z:to.z-from.z}},pulse.direction);
  const span = Math.hypot(to.x-from.x,to.z-from.z);
  const lift = heightOf(to)-heightOf(from);
  const lead = preparing ? smooth(0,travel,age) : 1;
  const stroke = u => {
    const t = u*lead, bow = Math.sin(t*Math.PI);
    const step = Math.floor(t*7), phase = t*7-step;
    const fracture = lerp(random(seed+step*5.1)-.5,random(seed+(step+1)*5.1)-.5,phase);
    const lateral = fracture * bow * (rising ? .75 : 2.1);
    const y = rising ? t**1.44 * lift + 1.32*bow : t * lift + .29*bow;
    return [from.x+direction.x*span*t+direction.z*lateral,heightOf(from)+.31+y,
      from.z+direction.z*span*t-direction.x*lateral];
  };
  batch.facingStroke(28,WIDTH.wash,seed+9.3,age,opacity*(rising?.62:.43),.63,stroke,
    u=>(rising?1.22:.91)*Math.sin(u*Math.PI)**.42);
  batch.facingStroke(28,WIDTH.thunder,seed,age,opacity,1.34,stroke,
    u=>(rising?.63:.52)*(.44+.56*Math.sin(u*Math.PI)**.51));
  if(preparing)return;
  // Receiver wash sits behind the bright contact edge and goes away before the next branch.
  const end = positionOf(to,heightOf(to)+.38);
  batch.blot(end,1.3+.97*age,seed+1.9,age,opacity*.40,WIDTH.wash,rising?.63:.24);
  batch.embers(end,rising?2.2:1.53,seed+17.2,age,opacity*.86,rising?9:6,rising?2.2:1.32);
  if(rising){
    batch.canopy(positionOf(end,end.y+1.62),1.84+age*1.27,.51,seed+6.6,age,opacity*.50);
  }
}

function effectPoint(event, center=false) {
  const point = center ? event : event.to ?? event;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return null;
  return positionOf(point);
}

function recentClear(kind, recent, time, direction, seed, radius, doctrine) {
  const points = recent.map(mark=>mark.point), count = points.length;
  const center = points.reduce((sum,point)=>({
    x:sum.x+point.x/count,y:sum.y+point.y/count,z:sum.z+point.z/count,
  }),{x:0,y:0,z:0});
  const stretch = Math.max(...points.map(point=>Math.hypot(point.x-center.x,point.z-center.z)));
  const pockets = [];
  for (const point of points) {
    const near = pockets.find(pocket=>Math.hypot(point.x-pocket.x,point.z-pocket.z)<3.8);
    if (!near) pockets.push(point);
  }
  return {kind,time,points,center,count,pockets,direction,seed,doctrine,radius:Math.min(radius,Math.max(8.2,stretch*1.23+3.6))};
}

// The rebound is a pressure stroke, not another damaging wave. Its two ends
// work from real deaths in different pockets, while its low arc opens toward
// the nearest contact. Across the framing, paper remains open around the head.
function rebound(batch, peak, age, head, attack) {
  if(peak.count<10 || peak.pockets.length<2 || age>.52)return;
  const points = peak.pockets.slice().sort((a,b)=>
    Math.hypot(a.x-head.x,a.z-head.z)-Math.hypot(b.x-head.x,b.z-head.z));
  const near = points[0];
  const farther = points.slice(1).sort((a,b)=>
    Math.hypot(b.x-near.x,b.z-near.z)-Math.hypot(a.x-near.x,a.z-near.z))[0];
  const along = directionOf({direction:{x:farther.x-near.x,z:farther.z-near.z}},peak.direction);
  const reverse = directionOf({direction:{x:head.x-near.x,z:head.z-near.z}},peak.direction);
  const reach = clamp(Math.hypot(farther.x-near.x,farther.z-near.z),4,18);
  const turn = Math.sign(batch.viewSide.x * along.x + batch.viewSide.z * along.z) || 1;
  const side = batch.viewSide;
  const advance = smooth(.0,.43,age);
  const stroke = envelope(age,.51,.021,.36)*attack;
  const size = 3.6+reach*.36;
  const p = positionOf(near,groundOf(near)+.34);
  const form = peak.kind==='water'?WIDTH.water:peak.kind==='wind'?WIDTH.wind:WIDTH.ash;
  const strength = { wind:1,water:.96,thunder:.75,fire:.89,poison:.97 }[peak.kind];
  for(let i=0;i<2;i++){
    const gain = 1 - i * .28;
    batch.facingStroke(29,form,peak.seed+27.4+i*8.26,age,stroke*strength*gain,1.18,u=>{
      const sweep = (u-.45)*size*(2.65+.42*advance)*turn;
      const arc = Math.sin(Math.PI*u);
      const relief = peak.kind==='wind'?2.1:peak.kind==='water'?1.44:peak.kind==='fire'?.88:.40;
      const push = (.85+3.35*arc)*advance + .54*i;
      return [
        p.x+side.x*sweep+reverse.x*push+along.x*u*reach*.29,
        p.y+arc*relief*(.75+.35*advance)-i*.21,
        p.z+side.z*sweep+reverse.z*push+along.z*u*reach*.29,
      ];
    },u=>Math.sin(u*Math.PI)**.8*(.72+.14*size)*(i?.53:1));
  }
  const spray = positionOf(p,p.y+.27);
  batch.embers(spray,size,peak.seed+63,age,stroke*.92,23,peak.kind==='wind'?1.8:1.35);
}

function riseFromClear(batch, kind, peak, time, head) {
  const age = time-peak.time;
  if(age < 0 || age > .83)return;
  const level = clamp((peak.count-3)/10,.27,1);
  const attack = envelope(age,.82,.042,.56)*(.49+level*.49);
  const mid = positionOf(peak.center,groundOf(peak.center)+.17);
  const rearDistance = Math.hypot(mid.x-head.x,mid.z-head.z);
  const across = batch.viewSide;
  const size = peak.radius;
  const progress = smooth(.01,.51,age);
  if(peak.doctrine&&(kind==='water'||kind==='thunder'||delayedDoctrines.has(peak.doctrine))){
    // Let the delivered crests or bolts own the picture; their aftermath only grows where enemies fell.
    for(const [index,point] of peak.pockets.slice(0,5).entries()){
      const residue = positionOf(point,groundOf(point)+.20);
      const radius = (2.05+level*1.65)*(.81+.49*progress);
      const residueInk = kind==='fire' ? WIDTH.soot : kind==='poison' ? WIDTH.ash : WIDTH.wash;
      batch.blot(residue,radius,peak.seed+index*4.2,age,attack*.54,residueInk,kind==='water'?.19:.43);
      batch.embers(residue,radius*.82,peak.seed+index*7.3,age,attack*.60,7,kind==='water'?1.23:1.83);
    }
    return;
  }
  rebound(batch,peak,age,head,attack);
  if(kind==='wind'){
    const back = {x:mid.x - peak.direction.x*size*.42,y:mid.y,z:mid.z-peak.direction.z*size*.42};
    const sign = Math.sign(across.x*peak.direction.z-across.z*peak.direction.x) || 1;
    for(let i=0;i<3;i++){
      const key=peak.seed+i*1.58;
      batch.facingStroke(35,WIDTH.wind,key,age,attack*(.88-.13*i),1.07,u=>{
        const lean = Math.sin(u*Math.PI*.86);
        const cross = size*(u-.48)*(2.19+.16*i)*sign;
        const through = size*(-.22+u*.98+progress*.29);
        const y = back.y + (.39+size*.35*lean)*(1-i*.14);
        return [back.x+across.x*cross+peak.direction.x*through,y,back.z+across.z*cross+peak.direction.z*through];
      },u=>(1.29+size*.10)*Math.sin(u*Math.PI)**.90);
    }
    batch.embers(back,size*.94,peak.seed,age,attack*.84,31,2.5);
  }else if(kind==='water'){
    const reach = clamp(rearDistance*.63,2,8.5);
    const near = {x:lerp(mid.x,head.x,.58),y:mid.y,z:lerp(mid.z,head.z,.58)};
    near.x -= peak.direction.x*(reach*.34-progress*3.3);
    near.z -= peak.direction.z*(reach*.34-progress*3.3);
    const far = {x:mid.x+peak.direction.x*(size*.37+progress*3.0),y:mid.y,z:mid.z+peak.direction.z*(size*.37+progress*3.0)};
    waterFront(batch,near,peak.direction,Math.min(13.8,size*.95),age,attack*.68,peak.seed);
    waterFront(batch,far,peak.direction,Math.min(14.5,size*1.19),age,attack*.53,peak.seed+8.87);
  }else if(kind==='thunder'){
    const sky = positionOf(mid,mid.y+8.6);
    batch.canopy(sky,size*1.44,1.65,peak.seed+9.2,age,attack*.69);
    batch.canopy(positionOf(sky,sky.y+1.05),size*.96,1.36,peak.seed+3.7,age,attack*.46);
    batch.blot(mid,size*(.82+.17*progress),peak.seed+15.2,age,attack*.70,WIDTH.wash,.29);
    for(const [index,point] of peak.points.entries()){
      if(index % 3 !== 0 || index>13)continue;
      const localAge=age-index*.015;
      const hit = envelope(localAge,.33,.035,.24)*(.69+level*.3);
      if(hit<.02)continue;
      const strike = positionOf(point,heightOf(point)+.39);
      batch.bolt(positionOf(strike,Math.min(sky.y,strike.y+9.3)),strike,1.01,peak.seed+index*2.3,localAge,hit);
    }
  }else if(kind==='fire'){
    batch.blot(mid,size*.79,peak.seed,age,attack*.77,WIDTH.soot,.23);
    for(const [index,point] of peak.points.entries()){
      if(index%3!==0||index>16)continue;
      const localAge=age-index*.008;
      if(localAge<0)continue;
      const p=positionOf(point,groundOf(point));
      const heat=envelope(localAge,.57,.038,.40)*(.69+level*.31);
      const q = positionOf(p,p.y+1.2+age*2.5);
      fireBloom(batch,p,3.38+level*1.72,age,heat,peak.seed+index*.81,4);
      batch.plume(q,3.8+level*2.1,1.40,peak.seed+index*2.36,age,attack*.56,WIDTH.soot,
        (.5+random(index+peak.seed))*size*.19);
    }
    batch.embers(mid,size*1.02,peak.seed+15.4,age,attack*.91,35,2.31);
  }else if(kind==='poison'){
    for(const [index,point] of peak.pockets.entries()){
      if(index>7)continue;
      const p=positionOf(point,groundOf(point)-.12);
      const spread=(2.72+level*1.45)*(.76+.63*progress);
      const bloom=smooth(index*.021,index*.021+.13,age);
      batch.blot(p,spread,peak.seed+index*3.2,age,attack*.84*bloom,WIDTH.poison,.21);
      batch.canopy(positionOf(p,p.y+.60),spread*.93,.42,peak.seed+index*4.2+2,age,attack*.41*bloom);
      batch.embers(p,spread*.63,peak.seed+index*2.79,age,attack*.44*bloom,7,.59);
    }
    batch.blot(mid,size*.78,peak.seed+.7,age,attack*.31,WIDTH.cloud,.16);
    batch.embers(mid,size*.99,peak.seed+10.9,age,attack*.79,28,.83);
  }
}

export class CascadeEffects {
  constructor(renderer, ink) {
    this.renderer = renderer;
    this.ink = ink;
    this.scene = new THREE.Scene();
    this.batch = new BrushBatch();
    this.scene.add(this.batch.mesh);
    this.reset();
  }

  reset() {
    this.core = null;
    this.marks = [];
    this.pulses = [];
    this.carriers = new Map();
    this.ending = null;
    this.hitIndex = 0;
    this.lastKill = -Infinity;
    this.footprint = [];
    this.recentKills = [];
    this.clear = null;
    this.aim = null;
    this.reserve = null;
    this.batch.mesh.geometry.setDrawRange(0,0);
  }

  event(event, time) {
    const {type, kind} = event;
    if (!PIGMENTS[kind]) return;
    if(type==='cascadeHandoffCancel'){
      if(this.aim?.id===event.id)this.aim=null;
      if(event.reason==='expired'&&this.reserve?.id===event.id)this.reserve=null;
      return;
    }
    const detail = event.detail ?? (event.phase==='drift' ? 'feeder' : event.doctrine==='fan' ? 'fan-crest' : null);
    if(detail==='gale-spore-carry'||detail==='gale-spore-front'||detail==='gale-spore-hit'||detail==='gale-spore-hold')return;
    // Water pulse endpoints describe its lateral edges. Use its actual center.
    const point = effectPoint(event,type==='cascadePulse'&&(crestDetails.has(detail)||windDetails.has(detail)||
      event.doctrine==='fan'||detail==='crown-ring'));
    if (!point) return;
    const seed = type==='cascadePulse' && event.leg != null &&
      (crestDetails.has(detail)||boltDetails.has(detail)||windDetails.has(detail)||delayedDetails.has(detail))
      ? (event.id??1)*.243+event.leg*7.71 : point.x*.113+point.z*.38+(event.id??1)*.243+time*.071;
    if(type==='cascadeReserve'){
      this.reserve={id:event.id??event.artId,kind,point,time,seed};
      return;
    }
    if(type==='cascadeHandoffAim'){
      this.aim={...event,point,time,seed};
      return;
    }
    const direction = directionOf(event, this.core?.direction);
    const radius = clamp(event.radius ?? 11, 1, 29);
    if(type==='cascadeStart'){
      this.reset();
      const handoff=event.handoff?{...event.handoff}:null;
      this.core = {kind, id:event.id, time, point, direction, radius, seed, handoff, doctrine:event.doctrine,
        life: clamp((event.duration??1.5)+.49,1.38,3.6)};
    }else if(type==='cascadePulse'){
      if(!event.preparing&&this.core?.handoff&&this.core.handoff.landedAt===undefined)this.core.handoff.landedAt=time;
      const width = clamp(event.width ?? radius,crestDetails.has(detail)?.15:1.4,18);
      const pulse = {point,time,direction,radius,width,seed,detail,from:event.from,to:event.to,
        carrierFrom:event.carrierFrom,preparing:event.preparing,travelTime:event.travelTime,receivers:event.receiverIds,
        carrierId:event.carrierId,innerRadius:event.innerRadius,sources:event.sources};
      if(detail==='host-knot'){
        const key = event.carrierId ?? event.leg;
        if(event.preparing&&key!==undefined){
          pulse.plantedAt=this.carriers.get(key)?.plantedAt??time;
          this.carriers.set(key,pulse);
          return;
        }
        this.carriers.delete(key);
      }
      if(detail==='gyre-core'&&event.preparing===false){
        this.pulses=this.pulses.filter(mark=>mark.detail!=='gyre-core');
      }
      const limit = this.core?.doctrine==='rise'||this.core?.doctrine==='fork' ? MAX_DOCTRINE_PULSES : MAX_PULSES;
      while(this.pulses.length>=limit)this.pulses.shift();
      this.pulses.push(pulse);
    }else if(type==='cascadeHit'){
      // The mist relay draws the verified strike and enemy release in DragonArtsVisual.
      if(detail==='thaw-thunder-hit')return;
      if(this.marks.length>=MAX_MARKS)this.marks.shift();
      const from = event.from ?? this.core?.point ?? point;
      const killed = Boolean(event.killed);
      const strike = this.hitIndex++ % 2 === 0;
      this.marks.push({point,from,to:point,time,direction,seed,depth:event.depth??0,killed,strike,detail,
        doctrine:event.doctrine??this.core?.doctrine});
      if(killed){
        this.lastKill = time;
        this.recentKills = this.recentKills.filter(mark=>time-mark.time<=.24);
        this.recentKills.push({ point, time });
        const count = this.recentKills.length;
        if(count>=5){
          const fresh = !this.clear || time-this.clear.time>.42;
          const stronger = count>=10 && time-this.clear?.time<=.14 &&
            (this.clear.count<10 || count>=this.clear.count+3);
          if (fresh || stronger) {
            this.clear=recentClear(kind,this.recentKills,fresh?time:this.clear.time,direction,seed,radius,
              event.doctrine??this.core?.doctrine);
          }
        }
        const near = this.footprint.find(mark=>Math.hypot(mark.point.x-point.x,mark.point.z-point.z)<3.4);
        if(near){
          near.count++;
          near.point.x = lerp(near.point.x,point.x,1/near.count);
          near.point.z = lerp(near.point.z,point.z,1/near.count);
          near.time = time;
        }else if(this.footprint.length<12){
          this.footprint.push({point:{...point},time,seed,count:1});
        }
      }
    }else if(type==='cascadeEnd'){
      if(event.killCount>0){
        this.ending={point,time,direction,radius,seed,killCount:event.killCount};
      }
    }
  }

  paintCore(kind, time) {
    const mark = this.core;
    if(!mark)return;
    const age = time-mark.time;
    if(age <0 || age > mark.life)return;
    const travel=mark.handoff?.travel??0;
    if (mark.handoff?.afterClear && kind!=='wind') this.paintAfterClear(mark,age);
    else if (mark.handoff) this.paintHandoff(mark,age);
    if (mark.doctrine==='gyre'||mark.doctrine==='gale') return;
    if(age<travel)return;
    if(mark.handoff?.landedAt===undefined&&mark.handoff)return;
    const landedAge=mark.handoff?time-mark.handoff.landedAt:age;
    const opacity = envelope(landedAge,mark.life-travel,.15,.59);
    const p = mark.point, r = mark.radius;
    const base = positionOf(p,groundOf(p));
    if(kind==='wind'){
      windCore(this.batch,base,mark.direction,r*.91,landedAge,opacity*.89,mark.seed);
      this.batch.blot(base,r*.76,mark.seed,landedAge,opacity*.32,WIDTH.wash,.42);
    }else if(kind==='water'){
      const lead={x:p.x+mark.direction.x*landedAge*4.8,y:base.y,z:p.z+mark.direction.z*landedAge*4.8};
      const shaped = mark.doctrine === 'lane' || mark.doctrine === 'fan';
      this.batch.blot(lead,r*(shaped?.42:.76),mark.seed,landedAge,opacity*(shaped?.26:.47),WIDTH.wash,.23);
      if(!shaped&&landedAge<.58)waterFront(this.batch,base,mark.direction,r*.61,landedAge,opacity*.47,mark.seed);
    }else if(kind==='fire'){
      // The black stain arrives first; the actual corpse bursts add the red brush columns.
      const shaped=delayedDoctrines.has(mark.doctrine);
      this.batch.blot(base,r*(shaped?.48:.80),mark.seed,landedAge,opacity*(shaped?.37:.55),WIDTH.cloud,.35);
      if(!shaped||landedAge<.44)fireBloom(this.batch,base,Math.min(shaped?3.6:5.7,r*.54),Math.min(1,landedAge),opacity*(shaped?.48:.79),mark.seed,shaped?5:9);
    }else if(kind==='thunder'){
      const shaped = mark.doctrine === 'rise' || mark.doctrine === 'fork';
      thunderWeather(this.batch,mark.point,r*(shaped?.57:1),landedAge,opacity*(shaped?.51:1),mark.seed);
      if(landedAge<.34){
        const a=positionOf(p,p.y+(shaped?5.5:8.8));
        const b=positionOf(p,p.y+.15);
        this.batch.bolt(a,b,shaped?.91:1.5,mark.seed,landedAge,envelope(landedAge,.35,.045,.23)*(shaped?.76:1));
      }
    }else if(kind==='poison'){
      const reach = Math.min(r*.67,3.4+4.7*smooth(0,.92,landedAge));
      const shaped=delayedDoctrines.has(mark.doctrine);
      poisonBloom(this.batch,base,reach*(shaped?.69:1),landedAge,opacity*(shaped?.36:.63),mark.seed,shaped?3:6);
    }
  }

  paintAfterClear(mark, age) {
    const {from,to,travel}=mark.handoff;
    if(age<0||age>travel+.32)return;
    const t=smooth(0,travel,age);
    const fade=smooth(0,.065,age)*(1-smooth(travel,travel+.32,age));
    const p={x:lerp(from.x,to.x,t),y:lerp(from.y,to.y,t),z:lerp(from.z,to.z,t)};
    const spanXZ=Math.hypot(to.x-from.x,to.z-from.z);
    const dx=(to.x-from.x)/spanXZ, dz=(to.z-from.z)/spanXZ;
    if(mark.kind==='water'){
      // The span unfurls transverse to the channel, then the real wave starts at the receiving shoal.
      const span=lerp(.8,5.8,t);
      for(const row of [0,1,2]){
        this.batch.ribbon(25,WIDTH.water,mark.seed+row*1.27,age,fade*(.95-.19*row),1.18,u=>{
          const side=u*2-1, bow=1-side*side;
          const forward=bow*.86-row*.77*t;
          const rim=span*side*(1+.10*row);
          const width=(.23+.66*bow)*(.8+.32*t);
          return [p.x+dx*forward+dz*rim,p.y+.36+bow*(1.02+.45*t-.24*row),p.z+dz*forward-dx*rim,
            dx*width,width*.64,dz*width];
        });
      }
      this.batch.embers(positionOf(p,p.y+.53),span*.91,mark.seed,age,fade*.78,15,1.11);
      return;
    }
    if(mark.kind==='thunder'){
      const first=positionOf(from,from.y+.36);
      const bend={x:lerp(from.x,to.x,t*.59)-dz*.63,y:lerp(from.y,to.y,t*.59)+1.1,z:lerp(from.z,to.z,t*.59)+dx*.63};
      const tip=positionOf(p,p.y+.54);
      this.batch.bolt(first,bend,.34,mark.seed,age,fade*.66);
      this.batch.bolt(bend,tip,.72,mark.seed+1.11,age,fade);
      return;
    }
    if(mark.kind==='fire'){
      for(const [index,lag] of [0,.21,.42].entries()){
        const along=Math.max(0,t-lag);
        const fire={x:lerp(from.x,to.x,along),y:lerp(from.y,to.y,along)+.51,z:lerp(from.z,to.z,along)};
        const size=1.25+(.80+1.32*along)*(1-.20*index);
        const glow=fade*smooth(lag,lag+.18,t);
        fireBloom(this.batch,fire,size,age,glow*.82,mark.seed+index*1.7,3);
      }
      return;
    }
    // Poison slips in rising pockets that thicken on approach, above a broken ribbon of residue.
    for(const [index,lag,side] of [[0,0,.1],[1,.20,1],[2,.38,-1],[3,.53,.56]]){
      const along=Math.max(0,t-lag);
      const width=lerp(.90,3.7,along);
      const drift=side*(.60+1.7*along);
      const cloud={x:lerp(from.x,to.x,along)+dz*drift,
        y:lerp(from.y,to.y,along)+.55+Math.sin(along*Math.PI)*1.45,
        z:lerp(from.z,to.z,along)-dx*drift};
      const gain=fade*smooth(lag,lag+.16,t)*(1-.18*index);
      this.batch.canopy(cloud,width,.91,mark.seed+index*1.73,age,gain*.84);
      this.batch.blot(positionOf(cloud,cloud.y-.42),width*.86,mark.seed+index*2.15,age,gain*.63,WIDTH.poison,.37);
    }
  }

  paintHandoff(mark,age) {
    const {from,to,travel=.34}=mark.handoff;
    const dx=to.x-from.x,dz=to.z-from.z;
    const span=Math.hypot(dx,dz);
    if(span<1||age>travel+.34)return;
    const fx=dz/span,fz=-dx/span;
    const front=smooth(.015,travel,age);
    const strength=smooth(0,.08,age)*(1-smooth(travel+.04,travel+.34,age));
    const width=routeWidth[mark.kind];
    for(const bank of [-1,0,1]) {
      this.batch.ribbon(27,bank===0?WIDTH.wash:width,mark.seed+bank*.31,age,strength*(bank===0?.79:.92),1,u=>{
        const t=front*u;
        const raised=Math.sin(t*Math.PI);
        const side=bank*(.25+raised*.84);
        const weight=(bank===0?.39:.71)*Math.sin(u*Math.PI*.89);
        return [lerp(from.x,to.x,t)+fx*side,lerp(from.y,to.y,t)+.56+raised*2.08+bank*.15,
          lerp(from.z,to.z,t)+fz*side,fx*weight,.79*weight,fz*weight];
      });
    }
    const head=positionOf({x:lerp(from.x,to.x,front),z:lerp(from.z,to.z,front)},
      lerp(from.y,to.y,front)+.68+Math.sin(front*Math.PI)*2.08);
    this.batch.embers(head,1.24,mark.seed,age,strength*.66,8,1.18);
  }

  paintAim(aim,time) {
    const age=time-aim.time;
    const rise=smooth(.025,.19,age);
    const visible=rise*(1-smooth(aim.duration-.16,aim.duration,age));
    const width=routeWidth[aim.kind];
    const {from,point,seed}=aim;
    const fx=point.x-from.x,fz=point.z-from.z;
    const bearing=Math.atan2(fx,fz);
    for(const [center,scale] of [[from,.52],[point,1]])for(const side of [-1,1]){
      this.batch.ribbon(19,width,seed+side*.41,age,visible*scale*.84,.64,u=>{
        const angle=bearing+side*(.40+u*1.84);
        const r=(1.15+.87*rise)*scale;
        const w=(.16+.13*Math.sin(u*Math.PI))*scale;
        return [center.x+Math.sin(angle)*r,center.y+.36+.50*Math.sin(u*Math.PI),
          center.z+Math.cos(angle)*r,Math.sin(angle)*w,w*.58,Math.cos(angle)*w];
      });
    }
  }

  paintReserve(mark,time) {
    const age=time-mark.time;
    const {point,seed}=mark;
    const width=routeWidth[mark.kind];
    const rise=smooth(.03,.21,age);
    const visible=rise*(1-smooth(.16,.73,age));
    for(const side of [-1,1]){
      this.batch.ribbon(24,width,seed+side*.37,age,visible*.88,.8,u=>{
        const a=side*(u*2.88+age*2.2)+seed*.33;
        const r=lerp(1.81,.39,rise)*(.58+.42*u);
        const w=.32*Math.sin(u*Math.PI);
        return [point.x+Math.sin(a)*r,point.y+.32+rise*.31+u*.29,
          point.z+Math.cos(a)*r,Math.sin(a)*w,.48*w,Math.cos(a)*w];
      });
    }
  }

  paintPulse(kind, pulse, time, enemies) {
    const age = time - pulse.time;
    if(crestDetails.has(pulse.detail))return doctrineCrest(this.batch,pulse,age);
    if(boltDetails.has(pulse.detail))return doctrineBolt(this.batch,pulse,age);
    if(pulse.detail==='gyre-core')return gyreFunnel(this.batch,pulse,age);
    if(pulse.detail==='gyre-burst')return gyreRupture(this.batch,pulse,age);
    if(pulse.detail==='gale-run')return runningGale(this.batch,pulse,age);
    if(pulse.detail==='cinder-path')return emberPath(this.batch,pulse,age);
    if(pulse.detail==='crown-ring')return fireCrown(this.batch,pulse,age);
    if(pulse.detail==='host-knot')return carriedPoison(this.batch,pulse,age,
      pulse.preparing&&pulse.carrierId!==undefined?enemies.find(enemy=>enemy.id===pulse.carrierId&&enemy.hp>0):null);
    if(pulse.detail==='basin-flow')return poisonConfluence(this.batch,pulse,age);
    if(pulse.detail==='feeder'||pulse.detail==='firefront'){
      if(age>=0&&age<1.34)travellingFront(this.batch,pulse,kind,age,envelope(age,1.34,.069,.53));
      return;
    }
    const life = { wind:.57,water:.65,fire:.64,thunder:.42,poison:1.19 }[kind];
    if(age<0 || age>life)return;
    const opacity = envelope(age,life,.05,kind==='poison'?.57:.36);
    const {point:p, seed, direction, width} = pulse;
    const base = positionOf(p,groundOf(p));
    const radius = clamp(pulse.radius,1.9,6.4);
    if(kind==='wind'){
      windSweep(this.batch,base,direction,width,age,opacity*.86,seed);
    }else if(kind==='water'){
      waterFront(this.batch,base,direction,width,age,opacity*.95,seed);
    }else if(kind==='fire'){
      const shaped=delayedDoctrines.has(this.core?.doctrine);
      const keep = shaped?1-smooth(.22,.52,age):1;
      fireBloom(this.batch,base,radius*(shaped?.79:1),age,opacity*.91*keep,seed,shaped?4:6);
    }else if(kind==='thunder'){
      this.batch.blot(base,radius*.79,seed,age,opacity*.43,WIDTH.wash,.41);
      this.batch.embers(base,radius,seed,age,opacity*.83,7,1.5);
    }else if(kind==='poison'){
      const shaped=delayedDoctrines.has(this.core?.doctrine);
      const keep = shaped?1-smooth(.14,.42,age):1;
      poisonBloom(this.batch,base,radius*(shaped?.64:1),age,opacity*.78*keep,seed,shaped?3:4);
    }
  }

  paintMark(kind, mark, time) {
    const age = time - mark.time;
    const life = { wind:.45,water:.55,fire:.72,thunder:.36,poison:1.3 }[kind];
    if(age<0 || age>life)return;
    const opacity = envelope(age,life,.029,kind==='poison'?.54:life*.73);
    const {seed, direction, killed, to, from} = mark;
    const p = positionOf(to,groundOf(to));
    if(kind==='thunder'){
      const shaped = mark.doctrine === 'rise' || mark.doctrine === 'fork';
      if(boltDetails.has(mark.detail)||shaped){
        const end=positionOf(to,to.y+.31);
        if(shaped&&!boltDetails.has(mark.detail)&&mark.strike&&Math.hypot(to.x-from.x,to.z-from.z)>.32){
          this.batch.bolt(positionOf(from,heightOf(from)+.47),end,.41,seed,age,opacity*.59);
        }
        this.batch.embers(end,1.18,seed,age,opacity*.74,killed?6:3,1.36);
      }else thunderImpact(this.batch,mark,age,opacity);
    }else if(kind==='water'){
      waveDrop(this.batch,mark,age,opacity*(crestDetails.has(mark.detail)?.48:1));
    }else if(kind==='wind'&&windDetails.has(mark.detail)){
      windContact(this.batch,mark,age,opacity*.88);
    }else if(kind==='wind'){
      const mixed = positionOf(from,heightOf(from));
      const sx=to.x-mixed.x,sz=to.z-mixed.z;
      const travel = Math.hypot(sx,sz);
      if(travel>.5 && mark.strike){
        const fx=sz/travel,fz=-sx/travel;
        this.batch.ribbon(12,WIDTH.wind,seed,age,opacity*.77,1.10,u=>{
          const tip = Math.sin(u*Math.PI);
          const w = (.46+(killed?.47:.1))*tip;
          const move = Math.min(.8,age)*1.4;
          return [lerp(mixed.x,to.x,u)+fx*tip*.65+direction.x*move,
            lerp(mixed.y,to.y,u)+.48+.67*tip,
            lerp(mixed.z,to.z,u)+fz*tip*.65+direction.z*move,fx*w,w*.47,fz*w];
        });
      }
      this.batch.embers(p,killed?2.15:1.25,seed,age,opacity*.86,killed?5:3,1.37);
    }else if(kind==='fire'){
      if(killed && mark.strike&&!delayedDetails.has(mark.detail))fireBloom(this.batch,p,1.85,age,opacity*.81,seed,3);
      else this.batch.embers(p,1.35,seed,age,opacity*.79,5,1.73);
    }else if(kind==='poison'){
      if(killed && mark.strike&&!delayedDetails.has(mark.detail))poisonBloom(this.batch,p,1.97,age,opacity*.67,seed,2);
      else this.batch.blot(p,1.02+.64*age,seed,age,opacity*.62,WIDTH.poison,.35);
    }
    if(killed){
      const recoil = 1-smooth(.10,.29,age);
      this.batch.embers(positionOf(to,heightOf(to)+.2),.69+age*3.9,seed+40.9,age,
        opacity*recoil*.94,windDetails.has(mark.detail)?4:mark.strike?10:6,1.8);
      this.batch.inkImprint(mark,age,envelope(age,.43,.032,.31)*.91);
    }
  }

  paintAftermath(kind, time) {
    const end = this.ending;
    if(!end)return;
    const age = time - end.time;
    const life = kind==='poison'?1.52:.79;
    if(age<0 || age>life)return;
    const opacity = envelope(age,life,.036,life*.88);
    const size = clamp(2.6+Math.sqrt(end.killCount)*1.24,2.8,end.radius)*(.79+.36*age);
    const base = positionOf(end.point,groundOf(end.point));
    this.batch.blot(base,size,end.seed,age,opacity*.46,kind==='poison'?WIDTH.poison:WIDTH.wash,.38);
    this.batch.embers(base,size*.83,end.seed,age,opacity*.56,15,kind==='fire'?1.9:.82);
  }

  paintFootprint(kind,time) {
    const since = time-this.lastKill;
    if(since<0||since>1.8)return;
    for(const mark of this.footprint){
      const age=time-mark.time, life=kind==='poison'?1.42:kind==='fire'?.98:.74;
      if(age<0||age>life)continue;
      const opacity=envelope(age,life,.044,life*.69);
      const point=positionOf(mark.point,groundOf(mark.point)+.09);
      const radius=(1.62+Math.sqrt(mark.count)*1.45)*(.79+.43*smooth(0,.37,age));
      if(kind==='poison'){
        this.batch.blot(point,radius*.94,mark.seed,age,opacity*.69,WIDTH.poison,.18);
        if(mark.count>=3)this.batch.blot(point,radius*.47,mark.seed+4.3,age,opacity*.74,WIDTH.ash,.15);
      }else if(kind==='fire'){
        this.batch.blot(point,radius,mark.seed,age,opacity*.83,WIDTH.cloud,.22);
      }else{
        this.batch.blot(point,radius,mark.seed,age,opacity*.45,WIDTH.wash,.14);
      }
      if(mark.count>=3&&age<.37)this.batch.embers(point,radius,mark.seed,age,
        opacity*(1-smooth(.14,.37,age))*.75,7,kind==='fire'?2.1:.83);
    }
  }

  render(camera, game, time, active, handoff, relayField=null, contacts=[]) {
    const core = this.core;
    const aim=this.aim;
    const showCore=core&&time-core.time<=5.2;
    const showAim=aim&&time-aim.time<aim.duration;
    const reserve=this.reserve;
    const showReserve=reserve&&time-reserve.time<.74;
    if(!active||!showCore&&!showAim&&!showReserve)return;
    this.marks = this.marks.filter(mark => time-mark.time<1.4);
    this.pulses = this.pulses.filter(mark => time-mark.time<1.4);
    for(const [key,mark] of this.carriers){
      if(time-mark.time>(mark.travelTime??.12)+.21)this.carriers.delete(key);
    }
    const {renderer,ink,batch} = this;
    if(!ink.target?.depthTexture)return;
    const {kind} = showCore?core:showAim?aim:reserve;
    batch.prepare(renderer,camera,ink,PIGMENTS[kind],game,relayField);
    const weight = batch.material.uniforms.uHandoff.value;
    if(handoff)weight.set(handoff.x,handoff.y,handoff.z,handoff.gain);
    else weight.w=0;
    for(const [index,layer] of batch.material.uniforms.uClearLayer.value.entries()) {
      const contact=contacts[index];
      if(contact && (contact.sourceType!=='cascadeHit'||contact.id!==core?.id||contact.detail==='thaw-thunder-hit')) {
        layer.set(contact.x,contact.y,contact.z,contact.gain);
      } else layer.w=0;
    }
    if(showCore){
      this.paintFootprint(kind,time);
      this.paintCore(kind,time);
      if(this.clear&&core.doctrine!=='gyre'&&core.doctrine!=='gale')riseFromClear(batch,kind,this.clear,time,game.p);
      for(const pulse of this.pulses)this.paintPulse(kind,pulse,time,game.enemies);
      for(const pulse of this.carriers.values())this.paintPulse(kind,pulse,time,game.enemies);
      for(const mark of this.marks)this.paintMark(kind,mark,time);
      this.paintAftermath(kind,time);
    }
    if(showAim)this.paintAim(aim,time);
    if(showReserve)this.paintReserve(reserve,time);
    if(!batch.indexCount)return;
    batch.upload();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.scene,camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }
}
