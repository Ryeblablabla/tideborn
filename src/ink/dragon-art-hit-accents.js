import * as THREE from 'three';
import { ENEMY_TYPES } from '../encounters.js';
import { surfaceHeightSampler } from './warnings.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const fade = (time, start, end) => 1 - smoothstep(time, start, end);
const TAU = Math.PI * 2;
const MAX_STAMPS = 392;
const MAX_SCENIC_STAMPS = 70;
const PALETTES = Object.fromEntries(Object.entries({
  frost: ['#21434e', '#79c5cc', '#f4ffff'],
  stone: ['#2b211c', '#8d6947', '#efddb1'],
  abyss: ['#152a26', '#527469', '#e2eade'],
  rift: ['#201925', '#956b8a', '#f6ece3'],
  beam: ['#73391c', '#df963b', '#fff5d5'],
  return: ['#611e2c', '#d44231', '#ffe4b9'],
  steam: ['#44434a', '#bb9d83', '#fff5e5'],
  thermal: ['#335259', '#9bc2c0', '#fff3df'],
  flame: ['#6a2520', '#be432c', '#ffdda6'],
  poison: ['#293b25', '#6c7851', '#e6dda2'],
  conduit: ['#29254f', '#6556a6', '#f3f2ff'],
}).map(([kind, colors]) => [kind, colors.map(color => new THREE.Color(color))]));
const SHAPE = {
  fish: 0, ray: 1, crab: 2, tear: 3, chip: 4, crest: 5, slash: 6,
  vapor: 7, ember: 8, pool: 9, arc: 10, clod: 11, shell: 12, subject: 16,
};
const LINKED = new Set(['resonance','stone-chain','frost-chain','stone-surge',
  'rift-crosscut','abyss-transfer','beam-crosscut','beam-conduit','stone-quarry','stone-march','abyss-undertow','abyss-steamwake','frost-thunder-fork']);
const TRACED = new Set(['stone-chain','frost-chain','stone-surge','beam-conduit']);
const REACTION_CARRIERS = new Set(['rain','steam','cloud','storm','thunder','ring','water-crest']);
const FOLLOW_THROUGH = {'stone-quarry':'stone','stone-march':'stone','abyss-undertow':'poison','abyss-steamwake':'steam','frost-thunder-fork':'frost'};

export function dragonArtHitPriority(mark) {
  if (mark.boss) return 4;
  if (mark.killed && FOLLOW_THROUGH[mark.impact]) return 4;
  if (LINKED.has(mark.impact) || mark.shell) return 3;
  return mark.killed || mark.absorbed ? 2 : 1;
}

const vertexShader = /* glsl */ `
  attribute vec4 motif;
  attribute vec3 ink;
  attribute vec3 edge;
  attribute vec3 paper;
  varying vec4 vMotif;
  varying vec3 vInk, vEdge, vPaper;
  void main() {
    vMotif = motif;
    vInk = ink;
    vEdge = edge;
    vPaper = paper;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDepth;
  uniform bool hasDepth;
  uniform vec2 resolution;
  varying vec4 vMotif;
  varying vec3 vInk, vEdge, vPaper;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(23.183, 68.713))) * 13572.37);
  }
  float ell(vec2 p, vec2 size) {
    return length(p / size) - 1.;
  }
  float wash(vec2 p) {
    vec2 c = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(c), hash(c + vec2(1., 0.)), f.x),
      mix(hash(c + vec2(0., 1.)), hash(c + vec2(1., 1.)), f.x), f.y);
  }
  void main() {
    vec2 p = vMotif.xy;
    float style = vMotif.w;
    bool severed = style >= 24.;
    bool subject = style >= 16. && !severed;
    bool shell = (style >= 12. && !subject) || severed;
    if (hasDepth) {
      float sceneDepth = texture2D(tDepth, gl_FragCoord.xy / resolution).r;
      if (gl_FragCoord.z > sceneDepth + (shell || subject ? .000017 : .000048)) discard;
    }
    if (severed) {
      style -= 24.;
      float keepRight = step(3.,style);
      style = mod(style,3.);
      float fault = p.x + p.y*.31 + .075*sin(p.y*16.);
      if ((keepRight>.5 && fault<.013) || (keepRight<.5 && fault>-.013)) discard;
    } else if (shell || subject) style -= subject ? 16. : 12.;
    float tooth = hash(floor(gl_FragCoord.xy));
    float grain = .045 * (tooth - .5);
    float ink = 0., pale = 0., mask = 0.;
    if (style < 3.) {
      float tail = max(abs(p.y + .09 * sin(p.x * 6.)) + .60 * p.x + .24,
        max(p.x + .40, -.96 - p.x));
      float d = min(ell(p - vec2(.12, .025), vec2(.68, .59)), tail * 2.5);
      if (style > .5 && style < 1.5) {
        float wing = abs(p.y + .13 * sin(p.x * 4.));
        d = min(ell(p - vec2(.18, 0.), vec2(.58, .45)), max(wing + .58 * abs(p.x + .26) - .77,
          wing - .40 + p.x * .93) * 1.9);
        d = min(d, max(abs(p.y + p.x * .12) - .07, abs(p.x + .54) - .39) * 3.8);
      } else if (style > 1.5) {
        float claw = ell(vec2(p.x, abs(p.y)) - vec2(.53, .53), vec2(.35, .29));
        float legs = max(abs(p.x + .21) - .48, abs(p.y) - .79 + .47 * abs(p.x + .33));
        legs = max(legs, abs(sin(p.x * 12. - abs(p.y) * 2.3)) - .57);
        d = min(min(ell(p + vec2(.04, 0.), vec2(.66, .47)), claw), legs);
      }
      mask = 1. - smoothstep(.025, .23, d + grain);
      ink = .11 + .46 * smoothstep(-.23, .1, d);
      pale = .76 * smoothstep(-.19, .025, d) * mask;
      pale += .23 * (1. - smoothstep(.019, .094, abs(p.y - .27 - .15 * sin(p.x * 3.)))) * mask;
      if (shell || subject) {
        float seam = abs(sin(dot(p, vec2(8.7, 6.2)) + .8 * wash(p * 6.) + p.y * p.y));
        float ledge = (1. - smoothstep(.025, .16, seam)) * smoothstep(.18, .49, p.y + tooth * .2);
        float feather = clamp(fwidth(d), .045, .21);
        float rim = 1. - smoothstep(feather * .45, feather * 1.33, abs(d + .025 + grain));
        float ridge = 1. - smoothstep(.022,.145,abs(p.y - .24 + .14 * sin(p.x * 4.)));
        mask = 1. - smoothstep(.06, feather + .14, d + grain);
        float dryRim = .64 + .28 * smoothstep(-.55,.48,p.y);
        dryRim *= .55 + .45 * smoothstep(.24,.70,wash(p*8. + vec2(1.,.3)) + .28*p.y);
        pale = max(rim * dryRim, max(ledge * .61, ridge * .45)) * mask;
        ink = shell ? .16 + .31 * wash(p * 9.) + .13 * tooth : .08 + .20 * tooth;
        if (severed) {
          float cut = 1. - smoothstep(.012,.145,abs(p.x + p.y*.31 + .075*sin(p.y*16.)));
          pale = max(pale,cut*.91);
          ink = mix(ink,.79,cut*.88);
        }
      }
    } else if (style < 4.) {
      float radius = max(.1, .68 * (1. - p.x * p.x));
      float dry = abs(p.y + .14 * sin(p.x * 7.)) / radius;
      mask = (1. - smoothstep(.18, 1., dry + grain * 6.)) * smoothstep(-1., -.74, p.x);
      ink = .17 + .27 * tooth;
      pale = .45 * (1. - smoothstep(.04, .37, dry));
    } else if (style < 5.) {
      float a = abs(p.y + .23 * p.x) - (.69 - .47 * p.x);
      float d = max(a, max(.69 * p.x + p.y * .46 - .48, -.88 - p.x));
      mask = 1. - smoothstep(-.04, .10, d + grain);
      ink = .18 + .49 * step(-.17 - p.x * .56, p.y);
      pale = .89 * smoothstep(-.23, .01, d) * (.58 + .42 * tooth);
    } else if (style < 6.) {
      float a = abs(length(p + vec2(0., .37)) - .81);
      float broken = sin(p.x * 14. + 2.1) + .49 * sin(p.x * 26.);
      mask = (1. - smoothstep(.035, .15, a + grain)) * smoothstep(-.32, .08, p.y);
      ink = .32 + .43 * tooth;
      pale = .83 * smoothstep(-.7, .6, broken) * (1. - smoothstep(.012, .073, a));
    } else if (style < 7.) {
      float tuck = smoothstep(-1., -.70, p.x) * (1. - smoothstep(.73, 1., p.x));
      float dist = p.y - .17 * sin(p.x * 5.) - grain;
      float width = max(.1, pow(tuck, .83));
      float blade = 1. - smoothstep(.05, .20, abs(dist - .21) / width);
      float dark = 1. - smoothstep(.34, .84, abs(dist) / width);
      mask = tuck * max(blade, dark * .83) * (.83 + .17 * tooth);
      ink = .24 + .57 * blade;
      pale = blade * .83;
    } else if (style < 8.) {
      float seed = dot(vEdge, vec3(2.7, 7.1, 11.3));
      float rough = wash(p * vec2(9., 6.) + seed);
      float fiber = wash(p * vec2(29., 19.) - seed);
      vec2 bulge = p + vec2(.12 * sin(p.y * 5.), .04 * sin(p.x * 9.));
      float body = 1. - smoothstep(.39, 1., length(bulge) + .24 * (rough - .5));
      float stream = abs(sin(2.7 * p.y + 1.54 * p.x + .7 * rough));
      float dry = smoothstep(.16, .72, .42 * rough + .38 * fiber + .18 * tooth);
      mask = body * (.31 + .69 * dry) * (.30 + .70 * smoothstep(.12, .89, stream));
      ink = .51 + .40 * rough;
      pale = .40 + .54 * smoothstep(-.48, .60, p.y + .79 * rough);
    } else if (style < 9.) {
      float curl = p.x + .37 * sin(4.3 * p.y + .91) + .14 * wash(p * 12.);
      float spread = max(.09, (.65 - .36 * p.y) * smoothstep(-1., -.58, p.y));
      float fusible = abs(curl) / spread;
      mask = (1. - smoothstep(.43, 1., fusible)) * (1. - smoothstep(.60, .99, p.y));
      ink = .54 + .37 * tooth;
      pale = (1. - smoothstep(.10, .46, fusible)) * (1. - smoothstep(-.31, .69, p.y));
    } else if (style < 10.) {
      float a = atan(p.y, p.x), r = length(p);
      float rough = wash(p * 30.);
      float rim = .86 + .035 * sin(7. * a) + .013 * sin(19. * a);
      float broken = smoothstep(-.65, .83, sin(a * 6.) + .40 * sin(a * 19.) + rough);
      float lip = (1. - smoothstep(.012, .078, abs(r - rim + grain))) * broken;
      float body = (1. - smoothstep(.35, .81, r)) * rough;
      mask = max(lip, body * .30) * (1. - smoothstep(.91, 1., r));
      ink = .32 + .45 * rough;
      pale = lip * .79;
    } else if (style < 11.) {
      float tip = smoothstep(-1., -.88, p.x) * (1. - smoothstep(.91, 1., p.x));
      float zig = asin(sin(21. * p.x)) * .13 + sin(p.x * 11.) * .24;
      float d = abs(p.y + zig + grain);
      float fork = abs(p.y + zig * .72 - .23 - p.x * .27);
      mask = tip * max(1. - smoothstep(.06, .32, d), .43 * (1. - smoothstep(.04, .20, fork)));
      ink = .49 + .33 * tooth;
      pale = .94 * (1. - smoothstep(.035, .14, d));
    } else {
      float grain = wash(p * 11.) - .5;
      float plane = abs(p.y + .31 * p.x) - (.64 - .27 * abs(p.x));
      float notch = abs(p.x + .25 * p.y) - .74 + .17 * abs(p.y);
      float rim = max(plane, notch) + grain * .14;
      mask = 1. - smoothstep(-.04,.105,rim);
      ink = .16 + .53 * smoothstep(-.14,.05,p.y + .41 * p.x + .14 * grain);
      pale = (1. - smoothstep(.01,.098,abs(plane + .087))) * smoothstep(-.25,.16,p.y) * .79;
    }
    float alpha = clamp(mask * vMotif.z, 0., 1.);
    if (alpha < .02) discard;
    gl_FragColor = vec4(mix(mix(vInk, vEdge, ink), vPaper, min(pale, 1.)), alpha);
    #include <colorspace_fragment>
  }
`;

class HitStamps {
  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.attributes = {};
    for (const [name, size] of Object.entries({position:3, motif:4, ink:3, edge:3, paper:3})) {
      const attribute = new THREE.BufferAttribute(new Float32Array(MAX_STAMPS * 4 * size), size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attribute);
      this.attributes[name] = attribute;
    }
    const indices = new Uint16Array(MAX_STAMPS * 6);
    for (let i = 0; i < MAX_STAMPS; i++) indices.set([0, 1, 2, 0, 2, 3].map(index => i * 4 + index), i * 6);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.uniforms = {
      tDepth: {value: null}, hasDepth: {value: false}, resolution: {value: new THREE.Vector2(1, 1)},
    };
    this.root = new THREE.Mesh(this.geometry, new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms:this.uniforms, transparent:true,
      depthWrite:false, depthTest:false, side:THREE.DoubleSide, forceSinglePass:true,
    }));
    this.root.name = 'Dragon arts · contact ink';
    this.root.renderOrder = 104;
    this.root.frustumCulled = this.root.visible = false;
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.toward = new THREE.Vector3();
    this.projection = new THREE.Vector3();
    this.count = 0;
  }

  begin(camera, depth, resolution) {
    this.count = 0;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    this.toward.setFromMatrixColumn(camera.matrixWorld, 2);
    this.camera = camera;
    this.uniforms.tDepth.value = depth ?? null;
    this.uniforms.hasDepth.value = Boolean(depth && resolution);
    if (resolution) this.uniforms.resolution.value.set(resolution.x ?? resolution.width, resolution.y ?? resolution.height);
  }

  angle(dx, dy, dz) {
    const {right, up} = this;
    return Math.atan2(dx * up.x + dy * up.y + dz * up.z, dx * right.x + dy * right.y + dz * right.z);
  }

  /** Use the visible side of a creature's physical envelope for subject ink. */
  subject(x, y, z, width, height, angle, alpha, style, palette, thickness, minPixels) {
    const matrix = this.camera.matrixWorldInverse.elements;
    const viewDepth = -(matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]);
    const worldPerPixel = 2 * (this.camera.isPerspectiveCamera ? Math.max(1,viewDepth) : 1)
      / (this.camera.projectionMatrix.elements[5] * this.uniforms.resolution.value.y);
    const min = Math.min(1.19, worldPerPixel * minPixels);
    const grow = Math.max(1, min / Math.max(.01,height));
    this.stamp(x, y, z, width * grow, height * grow, angle, alpha, style, palette, false, thickness);
  }

  stamp(x, y, z, width, height, angle, alpha, style, palette, horizontal = false, towardBias = .18) {
    if (this.count === MAX_STAMPS || alpha < .025) return;
    const {right, up, toward, attributes} = this;
    const offset = this.count++ * 4;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const [ink, edge, paper] = palette;
    for (let i = 0; i < 4; i++) {
      const u = i === 1 || i === 2 ? 1 : -1, v = i >= 2 ? 1 : -1;
      const side = u * width * cos - v * height * sin;
      const rise = u * width * sin + v * height * cos;
      const vertex = offset + i;
      if (horizontal) attributes.position.setXYZ(vertex, x + side, y, z + rise);
      else attributes.position.setXYZ(vertex, x + right.x * side + up.x * rise + toward.x * towardBias,
        y + right.y * side + up.y * rise + toward.y * towardBias, z + right.z * side + up.z * rise + toward.z * towardBias);
      attributes.motif.setXYZW(vertex, u, v, alpha, style);
      attributes.ink.setXYZ(vertex, ink.r, ink.g, ink.b);
      attributes.edge.setXYZ(vertex, edge.r, edge.g, edge.b);
      attributes.paper.setXYZ(vertex, paper.r, paper.g, paper.b);
    }
  }

  visibleCell(point) {
    const p = this.projection.set(point.x,point.y,point.z).project(this.camera);
    if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1.18 || Math.abs(p.y) > 1.19) return -1;
    return Math.floor((p.x + 1.2) * 3) + 8 * Math.floor((p.y + 1.2) * 3);
  }

  finish() {
    this.root.visible = this.count > 0;
    this.geometry.setDrawRange(0, this.count * 6);
    if (!this.count) return;
    for (const attribute of Object.values(this.attributes)) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * 4 * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}

function preyShape(type) {
  if (type === ENEMY_TYPES.kite || type === ENEMY_TYPES.seaRay || type === ENEMY_TYPES.cloudRay) return SHAPE.ray;
  if (type === ENEMY_TYPES.crab || type === ENEMY_TYPES.polyp || type === ENEMY_TYPES.turtle) return SHAPE.crab;
  return SHAPE.fish;
}

function creatureProfile(type) {
  switch (preyShape(type)) {
    case SHAPE.ray: return [1.38, .90];
    case SHAPE.crab: return [1.16, .82];
    default: return type === ENEMY_TYPES.eel ? [1.62, .55] : [1.37, .68];
  }
}

function paintSubject(batch, subject, kind, progress, alpha, mouth) {
  const {x,y,z} = subject;
  const type = subject.enemyType ?? subject.type;
  const radius = clamp(subject.targetRadius ?? subject.radius ?? .71,.53,2.1);
  const [width,height] = creatureProfile(type);
  const heading = subject.targetAngle ?? subject.angle ?? 0;
  const twist = mouth ? batch.angle(mouth.x-x,mouth.y-y,mouth.z-z)
    : batch.angle(Math.sin(heading), .12, Math.cos(heading));
  const vanish = mouth ? 1 - .84 * smoothstep(progress,.16,1) : 1;
  const style = kind === 'stone' || kind === 'frost' ? SHAPE.shell : SHAPE.subject;
  const size = vanish * radius;
  batch.subject(x,y+radius*.24,z,size*width,size*height,twist,alpha,style+preyShape(type),PALETTES[kind],
    radius * (style === SHAPE.shell ? .53 : .42),mouth ? 2.4 * vanish : 3.4);
}

function paintSeveredQuarry(batch, target, age) {
  if (age > .45) return;
  const type = target.type ?? target.enemyType;
  const radius = clamp(target.radius ?? target.targetRadius ?? .75,.55,1.9);
  const [wide,tall] = creatureProfile(type);
  const heading = target.angle ?? target.targetAngle ?? 0;
  const twist = batch.angle(Math.sin(heading), .06, Math.cos(heading));
  if(age<.12) {
    paintSubject(batch,target,'stone',0,.99);
    return;
  }
  const split = smoothstep(age,.102,.32);
  const settle = smoothstep(age,.29,.45);
  const body = .98*fade(age,.27,.45);
  const travel = .07+radius*.69*split;
  for (const side of [-1,1]) {
    const x = target.x + Math.sin(heading) * travel * side;
    const z = target.z + Math.cos(heading) * travel * side;
    const y = target.y + radius*.34 + split*(side===1?.41:.19) - settle*.46;
    const style = 24+preyShape(type)+(side===1?3:0);
    batch.subject(x,y,z,radius*wide,radius*tall,twist+side*split*.37,body,style,PALETTES.stone,radius*.31,3.45);
  }
}

function paintReceiver(batch, mark, age, element, plated) {
  const {x,y,z,from}=mark;
  const dx=x-(from?.x??x), dz=z-(from?.z??z);
  const heading=dx||dz?Math.atan2(dx,dz):(mark.targetAngle??0);
  const fx=Math.sin(heading), fz=Math.cos(heading);
  const radius=clamp(mark.targetRadius??.73,.59,1.78);
  const presence=(mark.killed?1:.67)*fade(age,.16,.57);
  const sweep=1-Math.pow(1-clamp(age/.37,0,1),3);
  const hold=plated?(element==='stone'||element==='frost'?.235:.115):.043;
  const burst=smoothstep(age,hold,hold+.085);
  const open=smoothstep(age,hold,hold+.24);
  const palette=PALETTES[element];
  const ground=y+.13;
  if(element==='stone') {
    const cut=smoothstep(age,.024,.077)*fade(age,.111,.28);
    if(mark.killed&&!plated)paintSeveredQuarry(batch,mark,age);
    batch.subject(x,ground+.06,z,radius*(1.49+open*1.63),radius*.26,
      batch.angle(fx,.02,fz),presence*cut*.87,SHAPE.slash,palette,.20,2.6);
    for(let i=0;i<(plated?2:3);i++) {
      const side=i-1;
      const distal=radius*(.64+open*(1.03+.37*i));
      const rise=.48+3.10*age-9.80*age*age;
      batch.subject(x+fx*distal+fz*side*.56,ground+Math.max(.10,rise),z+fz*distal-fx*side*.56,
        radius*(.55-.09*i),radius*(.42-.06*i),side*.43+age*.56,presence*burst*(plated?.66:1),SHAPE.clod,palette,.25,2.6);
    }
    return;
  }
  if(element==='frost') {
    const palette=PALETTES.frost;
    if(mark.killed&&!plated) paintSubject(batch,mark,'frost',0,fade(age,.09,.28));
    const cracks=burst*fade(age,.19,.39);
    for(const turn of [-1,1]) {
      const tilt=batch.angle(fx,.58,fz)+turn*(.27+sweep*.40);
      const edge=turn*radius*(.29+open*.72);
      batch.subject(x+fz*edge,ground+.31+open*.52,z-fx*edge,radius*(1.02+open*.71),radius*.25,tilt,
        presence*cracks,SHAPE.arc,palette,.24,2.7);
    }
    if (burst>.03) paintIceShatter(batch,x,y,z,radius*(mark.killed?.82:.64),(mark.targetId??1)*.21,
      Math.max(0,age-hold),presence*burst,palette,plated);
    return;
  }
  const steam=element==='steam';
  const slip=radius*open*(steam?.26:.76);
  if(mark.killed && !plated && age<.38) {
    const dissolve=fade(age,.115,.38);
    const body={...mark,x:x+fx*slip,y:y+(steam?.51:.18)*sweep,z:z+fz*slip};
    paintSubject(batch,body,element,sweep*.46,dissolve*.98);
  }
  for(const side of [-1,1]) {
    const shift=side*radius*(.81+open*.57);
    const h=radius*(steam?.39+open*1.04:.30+open*.39);
    const tilt=steam?side*.37:batch.angle(fx,.065,fz)+side*.29;
    batch.subject(x+fx*slip+fz*shift,ground+h*(steam?.77:.42),z+fz*slip-fx*shift,
      radius*(steam?.45:.91),h,tilt,presence*burst*(plated?.62:.82),steam?SHAPE.vapor:SHAPE.tear,palette,.24,2.7);
  }
  if(!steam) batch.stamp(x+fx*slip,ground,z+fz*slip,radius*(.78+sweep*1.53),radius*(.48+sweep*.64),heading,
    presence*(.29+.43*burst),SHAPE.pool,palette,true);
}

function paintPrey(batch, art, enemy, capture) {
  const mouth = capture?.mouth ?? enemy.dragonArtPullCenter;
  const p = enemy.dragonArtCaptureProgress;
  if (!mouth) return;
  const {x, y, z} = enemy;
  const dx = mouth.x - x, dy = mouth.y - y, dz = mouth.z - z;
  const range = Math.hypot(dx, dy, dz);
  const angle = batch.angle(dx, dy, dz);
  const palette = PALETTES[art.kind];
  const rise = art.stage < 3 ? .12 : .05;
  if (Number.isFinite(p)) {
    const size = clamp(enemy.radius ?? .70, .58, 1.24) * lerp(1.07, .16, p);
    const opacity = .66 + .31 * smoothstep(p, 0, .32);
    const stretch = Math.min(1.27, range * .48);
    paintSubject(batch,enemy,art.kind,p,opacity,mouth);
    if (range > .1) {
      paintLink(batch,enemy,mouth,1,opacity*.78,palette,'ink',.22);
      const shift = stretch * .68 / range;
      batch.stamp(x - dx * shift, y + rise - dy * shift, z - dz * shift,
        size + stretch, .19 + size * .29, angle, opacity * .76, SHAPE.tear, palette);
    }
  } else if (range > 2.3) {
    const size = clamp(enemy.radius ?? .70, .58, 1.24);
    const strength = .48 + .25 * smoothstep(art.age, .25, 1.25);
    const shift = Math.min(.16, 1.45 / range);
    batch.subject(x - dx * shift, y + rise - dy * shift, z - dz * shift,
      size*1.95,size*.30,angle,strength,SHAPE.tear,palette,.24,1.55);
    paintSubject(batch,enemy,art.kind,0,strength*.75,mouth);
  }
}

function paintShatter(batch, mark, age, plated=false, quiet=0) {
  const frost = mark.kind === 'frost';
  const palette = PALETTES[mark.kind];
  const {x, y, z} = mark;
  const strength = (mark.killed || mark.shell ? 1 : .58) * (mark.boss ? 1.25 : 1);
  const size = clamp(mark.targetRadius ?? .75, .58, 1.5) * strength;
  const alpha = fade(age, .15, frost ? .53 : .61) * (1-quiet*.84);
  const seed = (mark.targetId ?? 2) * 2.39996;
  const fractured = fade(age,.045,.155) * (mark.killed || mark.shell ? .93 : .69);
  if (!plated && fractured > .045) paintSubject(batch,mark,mark.kind,0,fractured);
  const debrisAge=plated?age-.235:age;
  const debrisAlpha=plated?alpha*smoothstep(debrisAge,0,.082)*.68:alpha;
  if(debrisAge<0)return;
  if (frost) paintIceShatter(batch,x,y,z,size,seed,debrisAge,debrisAlpha,palette,plated);
  else paintStoneShatter(batch,x,y,z,size,seed,debrisAge,debrisAlpha,palette,plated);
}

function paintIceShatter(batch,x,y,z,size,seed,age,alpha,palette,plated=false) {
  const open = 1 - Math.pow(1 - clamp(age/.29,0,1),3);
  if(!plated) batch.subject(x,y+.30+age*.82,z,size*(1.07+open*1.72),size*(.69+open*.55),Math.sin(seed)*.52,
    alpha*fade(age,.12,.36)*.93,SHAPE.crest,palette,.26,3.6);
  for (let i = 0; i < (plated?2:4); i++) {
    const direction = seed + i*TAU/4;
    const reach = size * (.40 + open * (1.65 + i % 3 * .32));
    const rise = .25 + i % 3 * .14 + size * open * (1.47 + i % 3 * .28);
    const tilt = batch.angle(Math.sin(direction),1.34,Math.cos(direction)) - Math.PI*.5;
    batch.subject(x+Math.sin(direction)*reach,y+rise,z+Math.cos(direction)*reach,
      size*(.21+.05*(i%3)),size*(.65+i%2*.21),tilt+age*(i%2?1.2:-1.2),
      alpha*(.87+i*.022),SHAPE.chip,palette,.23,2.25);
  }
}

function paintStoneShatter(batch,x,y,z,size,seed,age,alpha,palette,plated=false) {
  const crack = fade(age,.095,.34);
  const settle = smoothstep(age,.055,.44);
  batch.stamp(x,y+.11,z,size*(.86+settle*2.1),size*(.69+settle*.9),seed*.27,alpha*.58*settle,SHAPE.pool,palette,true);
  batch.subject(x,y+.22,z,size*(1.07+age*1.8),size*.39,Math.sin(seed)*.51,crack*(plated?alpha*.51:.97),
    SHAPE.slash,palette,.22,2.8);
  for (let i = 0; i < (plated?2:4); i++) {
    const direction = seed + i*TAU/4;
    const reach = size * (.48 + settle*(1.41 + i % 3 * .38));
    const rise = Math.max(.12,(.50+i%3*.18) + age*(2.65+i%2*.68) - age*age*15);
    const tilt = direction + i * .29 + (1-settle)*.93;
    batch.subject(x+Math.sin(direction)*reach,y+rise,z+Math.cos(direction)*reach,
      size*(.55+i%3*.13),size*(.42+i%2*.18),tilt,alpha*(.93-i*.065),SHAPE.clod,palette,.23,2.65);
  }
}

function paintCut(batch, mark, age) {
  const {kind, from, x, y, z} = mark;
  if (mark.impact === 'beam-conduit') {
    const radius = clamp(mark.targetRadius ?? .72, .55, 1.38);
    const growth = smoothstep(age, 0, .24);
    const alpha = fade(age, .09, .45) * (mark.killed ? 1 : .80);
    const heading = from ? batch.angle(x - from.x, y - from.y, z - from.z) : .15;
    batch.stamp(x, y + .30, z, radius * (.90 + growth * 1.60), radius * (.72 + growth * 1.13),
      heading, alpha * .86, SHAPE.crest, PALETTES.conduit);
    for (const side of [-1, 1]) {
      const tilt = heading + side * .79;
      batch.stamp(x, y + .52 + growth * .63, z, radius * (1.10 + growth * 1.34), radius * .24,
        tilt, alpha * (.81 - growth * .22), SHAPE.arc, PALETTES.conduit);
    }
    return;
  }
  const heated = kind === 'beam' && (mark.impact === 'beam-crosscut' || mark.impact === 'beam-scorch'
    || mark.rank === 3 && mark.age >= 1.39);
  const palette = PALETTES[heated ? 'return' : kind];
  const radial = from ? Math.atan2(x - from.x, z - from.z) : mark.sweepAngle ?? mark.angle ?? 0;
  const azimuth = radial + (heated ? -.77 : .67);
  const angle = batch.angle(Math.sin(azimuth), heated ? .25 : .12, Math.cos(azimuth));
  const alpha = fade(age, .12, heated ? .41 : .36) * (mark.killed ? 1 : .72);
  const cut = 1 - Math.pow(1 - clamp(age/.17,0,1),2);
  const size = clamp(mark.targetRadius ?? .72, .59, 1.6) * (mark.killed ? 1 : .81);
  batch.subject(x,y+.33+age*.52,z,size*(1.41+cut*1.38),size*.39,angle,alpha,SHAPE.slash,palette,.26,2.68);
  if (mark.killed) {
    const spread = .38 + age * 1.06;
    batch.stamp(x + Math.cos(azimuth) * spread, y + .27 + age * .54, z - Math.sin(azimuth) * spread,
      size * (1.24 + age * 2.3), size * .23, angle + .22, alpha * .86, SHAPE.slash, palette);
  }
}

function paintStoneSurge(batch, mark, age) {
  const {x, y, z, from} = mark;
  if (!from) return;
  const dx = x - from.x, dz = z - from.z;
  const span = Math.hypot(dx, dz);
  if (span < .2) return;
  const angle = batch.angle(dx, y - from.y + .2, dz);
  const alpha = fade(age, .11, .47);
  const reach = Math.min(2.9, span * .46);
  for (let i = 0; i < 3; i++) {
    const t = 1 - i * reach / (span * 2);
    batch.stamp(lerp(from.x, x, t), lerp(from.y, y, t) + .37 + i * .25 + age * .91,
      lerp(from.z, z, t), .48 + i * .24 + age * .63, .23 + i * .07, angle + .18 * i,
      alpha * (1 - i * .14), SHAPE.chip, PALETTES.stone);
  }
}

function paintMouth(batch, mark, age, palette) {
  if (!mark.from) return;
  const {x, y, z} = mark.from;
  const crest = mark.impact === 'abyss-transfer';
  const alpha = fade(age, .09, crest ? .53 : .34);
  const size = (crest ? .98 : .51) + age * (crest ? 3.1 : 1.9);
  const turn = Math.sin((mark.targetId ?? 0) * 2.39) * .31;
  batch.stamp(x, y + .32, z, size, size * .67, turn, alpha * .92, SHAPE.crest, palette);
  if (crest) batch.stamp(x, y + .30, z, size * .92, size * .57, Math.PI + turn, alpha * .79, SHAPE.crest, palette);
}

function paintSwallowed(batch, mark, age, palette) {
  const travel = Math.hypot(mark.from.x-mark.x,mark.from.y-mark.y,mark.from.z-mark.z);
  const flow = fade(age,.070,.32);
  if (travel > .54) {
    paintLink(batch,mark,mark.from,1,flow*.87,palette,'ink',.26);
    if (flow > .10) {
      const glide = smoothstep(age,0,.24);
      const pose = {...mark,x:lerp(mark.x,mark.from.x,glide),y:lerp(mark.y,mark.from.y,glide),
        z:lerp(mark.z,mark.from.z,glide)};
      paintSubject(batch,pose,mark.kind,glide,flow*.95,mark.from);
    }
  }
}

function paintLink(batch, from, to, progress, alpha, palette, brush = 'ink', thickness = .43) {
  if (!from || !to) return;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const span = Math.hypot(dx, dy, dz);
  if (span < .28) return;
  const length = span * progress;
  if (length < .15) return;
  const rough = brush === 'arc';
  const parts = Math.max(1, Math.ceil(length / (rough ? 7 : 3.65)));
  const rise = brush==='ink' ? .15 : brush==='stone' ? .24 : .45;
  const peak = span * (brush==='ink' ? .049 : brush==='stone' ? .080 : .022);
  for (let i = 0; i < parts; i++) {
    const t = progress * (i + .5) / parts;
    const angle = batch.angle(dx, dy + Math.cos(t * Math.PI) * peak * Math.PI, dz);
    batch.subject(lerp(from.x,to.x,t),lerp(from.y,to.y,t) + rise + Math.sin(t*Math.PI)*peak,lerp(from.z,to.z,t),
      length/(parts*1.63),thickness,angle,alpha*(.76+t*.23),rough?SHAPE.arc:SHAPE.tear,palette,.15,rough?2.45:1.45);
  }
}

function paintCrowdBreak(batch, burst, age) {
  const palette = PALETTES[burst.kind];
  const open = 1 - Math.pow(1 - clamp(age/.22,0,1),2);
  const alpha = fade(age, .065, .33);
  for (const [index, center] of burst.centers.entries()) {
    if (batch.visibleCell(center) < 0) continue;
    const span = (.63 + 1.51 * open) * (burst.absorbed ? .78 : 1);
    const angle = index * 2.39996 + burst.id * .37;
    const {x, y, z} = center;
    if (burst.absorbed) {
      batch.stamp(x,y+.52,z,span,span*.67,angle,alpha*.89,SHAPE.crest,palette);
      batch.stamp(x,y+.5,z,span,span*.6,angle+Math.PI,alpha*.77,SHAPE.crest,palette);
      continue;
    }
    for (const side of [-1,1]) {
      batch.stamp(x,y+.52+open*.49,z,span,span*.45,angle+side*.53,alpha*.91,SHAPE.slash,palette);
    }
  }
}

function paintBloom(batch, reaction, age, life, floorAt, zone, breath = 1) {
  const { x, y, z, radius } = zone ?? reaction;
  const flame = reaction.reaction === 'fire-bloom';
  const thermal = reaction.kind === 'frost' || reaction.reaction === 'steam-break';
  const mist = thermal ? PALETTES.thermal : flame ? PALETTES.poison : PALETTES.steam;
  const edge = flame ? PALETTES.flame : mist;
  const front = smoothstep(age, .0, flame ? .48 : .60);
  const birth = fade(age, .16, .93);
  const opacity = smoothstep(age, 0, .085) * smoothstep(life, 0, .66) * breath;
  const surface = floorAt?.(x, z);
  const grounded = Number.isFinite(surface) && Math.abs(y-surface) < 1.35;
  const base = grounded ? Math.max(y - .12, surface + .16) : y + .06;
  if (flame) {
    const flare=smoothstep(age,.018,.12)*fade(age,.22,.56)*opacity;
    batch.subject(x,base+radius*.44,z,radius*(.49+front*.29),radius*(.90+front*.22),.10,
      flare,SHAPE.ember,PALETTES.flame,.31,4.7);
    batch.stamp(x,base + .17,z,radius*(.31+front*.93),radius*(.31+front*.93),age*.64,
      flare*.84,SHAPE.pool,PALETTES.flame,grounded);
  }
  batch.stamp(x, base + .06, z, radius * (.36 + .74 * front), radius * (.36 + .74 * front), age * .14,
    opacity * (flame ? .71 : .57) * (.48 + .52 * birth), SHAPE.pool, edge, grounded);
  for (let i = 0; i < 6; i++) {
    const turn = i * TAU / 6 + age * .63 + ((reaction.zoneId ?? reaction.id ?? 0) % 7) * .35;
    const spread = radius * (.18 + .51 * front) * (.85 + .15 * Math.sin(turn * 2.));
    const rise = radius * (.31 + .27 * birth + i % 3 * .047);
    const twist = Math.sin(turn) * (flame ? .29 : .67);
    const shift = i % 2 ? 1 : -1;
    const plume = (.45 + .23 * birth + .13 * Math.sin(age * 5.1 + i * 1.57)) * opacity;
    const px = x + Math.sin(turn) * spread, pz = z + Math.cos(turn) * spread;
    const tint = flame && i % 3 !== 0 ? edge : mist;
    batch.stamp(px, base + rise * (flame ? .58 : .81), pz, radius * (flame ? .28 : .52), rise,
      twist + shift * .26, plume * (flame ? 1.33 : 1), flame && i % 3 !== 0 ? SHAPE.ember : SHAPE.vapor, tint);
  }
  if (thermal && birth > .05) {
    const lift = .83 + 2.44 * front;
    batch.stamp(x, base + lift, z, radius * (.55 + .21 * front), radius * (.31 + .14 * front),
      .09, birth * opacity * .93, SHAPE.crest, mist);
  }
}

function paintConductor(batch, reaction, age) {
  const duration = reaction.duration ?? .24;
  const to = reaction.to ?? reaction;
  const reach = smoothstep(age, 0, Math.max(.04, duration * .84));
  const alpha = fade(age, duration, duration + .24);
  const palette = PALETTES.conduit;
  paintLink(batch,reaction.from,to,reach,alpha,palette,'arc',.47);
  if (!REACTION_CARRIERS.has(reaction.carrier)) return;
  const wake = smoothstep(age, duration*.68, duration+.05);
  const radius = clamp(reaction.radius ?? 1.2,.75,3.2);
  batch.stamp(to.x,to.y+.31,to.z,radius*(.48+.45*wake),radius*(.31+.33*wake),.08,
    wake*alpha*.83,SHAPE.pool,palette,true);
  batch.subject(to.x,to.y+.62,to.z,radius*.44,radius*.28,.17,
    wake*alpha*.92,SHAPE.crest,palette,.25,3.05);
}

export function createDragonArtHitAccents() {
  const batch = new HitStamps();
  const litMouths = new Set();
  const linkSources = new Set();
  const targets = new Set();
  const cells = new Map();
  const subjectCenters = new Set();
  const picked = Array.from({length:4}, () => []);
  return {
    root: batch.root,
    reset() { batch.root.visible = false; },
    update(art, camera, { time, marks, feed, depth, resolution, reactions = [], breaks = [], heroBeats = [], world, stage, zones = [], gameTime, deathPlates, steam }) {
      batch.begin(camera, depth, resolution);
      litMouths.clear();
      linkSources.clear();
      targets.clear();
      cells.clear();
      subjectCenters.clear();
      for (const group of picked) group.length = 0;
      for (const burst of breaks) {
        if (burst.kind !== 'stone' && burst.kind !== 'frost' && (burst.kind !== 'abyss' || !burst.absorbed)) paintCrowdBreak(batch, burst, time - burst.at);
      }
      for (const beat of heroBeats) {
        if (beat.kind !== 'stone') continue;
        for (const target of beat.targets) {
          if (deathPlates?.has(target.id)) continue;
          if (marks.some(mark=>mark.id===beat.id&&mark.targetId===target.id&&FOLLOW_THROUGH[mark.impact]==='stone')) continue;
          paintSeveredQuarry(batch,target,time-beat.at);
        }
      }
      if (reactions.length) {
        const water = stage < 3 && world ? surfaceHeightSampler(world.water, world.water.position.y) : null;
        const terrain = world?.environment?.heightAt;
        const floorAt = terrain || water ? (x,z) => Math.max(terrain?.(x,z) ?? -Infinity, water?.(x,z) ?? -Infinity) : null;
        for (let i = reactions.length - 1; i >= 0 && batch.count < MAX_SCENIC_STAMPS; i--) {
          const reaction = reactions[i];
          const age = time - reaction.at;
          if (age < 0) continue;
          if (reaction.reaction === 'conductive-front') {
            paintConductor(batch,reaction,age);
            continue;
          }
          if (!['steam-bloom','steam-break','fire-bloom'].includes(reaction.reaction)) continue;
          const zone = Number.isFinite(reaction.zoneId) ? zones.find(zone => zone.id === reaction.zoneId) : null;
          if (Number.isFinite(reaction.zoneId) && !zone) continue;
          const life = zone?.life ?? (reaction.duration ?? 1) - age;
          if (life <= 0 || reaction.radius <= 0) continue;
          const relay = reaction.reaction === 'fire-bloom' && age < .48 &&
            marks.find(mark=>mark.id===reaction.id&&mark.impact==='abyss-transfer'&&
              Math.hypot(mark.x-reaction.x,mark.y-reaction.y,mark.z-reaction.z)<reaction.radius);
          const breath=relay ? .37+.63*smoothstep(age,.19,.48) : reaction.id===steam?.id ? 1-steam.gain*.6 : 1;
          paintBloom(batch, reaction, age, life, floorAt, zone, breath);
        }
      }
      if (art?.kind === 'abyss' || art?.kind === 'rift') {
        for (const enemy of feed ?? []) paintPrey(batch, art, enemy, art.captures?.get(enemy.id));
      }
      if (art?.kind === 'stone' || art?.kind === 'frost') {
        let painted = 0;
        for (const batchOfTargets of [art.shells,art.locked]) for (const enemy of batchOfTargets?.values() ?? []) {
          if (painted >= 31 || targets.has(enemy.id)) continue;
          const isShell = art.shells?.has(enemy.id);
          if (!isShell && (enemy.hp<=0 || enemy.dragonArtHeldUntil<gameTime)) continue;
          const cell = batch.visibleCell(enemy);
          const used = cells.get(cell) ?? 0;
          if (cell < 0 || used >= 4) continue;
          const p = batch.projection;
          const {x:width,y:height} = batch.uniforms.resolution.value;
          const projectedBin = Math.floor((p.x+1.2)*width/26) + 1024*Math.floor((p.y+1.2)*height/20);
          if (subjectCenters.has(projectedBin)) continue;
          subjectCenters.add(projectedBin);
          cells.set(cell, used + 1);
          targets.add(enemy.id);
          const grip = smoothstep((gameTime ?? 0) - (enemy.dragonArtHeldAt ?? 0),.01,.14);
          paintSubject(batch,enemy,art.kind,0,isShell ? .96 : .62 + grip*.28);
          painted++;
        }
      }
      targets.clear();
      cells.clear();
      for (let i = marks.length - 1; i >= 0; i--) {
        const mark = marks[i];
        const age = time - mark.at;
        if (age < 0 || age >= .57 || !PALETTES[mark.kind]) continue;
        if (mark.impact === 'lock' || mark.impact === 'frost-temper-rush' || !mark.absorbed && !mark.killed && !['stone','frost','beam'].includes(mark.kind)
          && mark.impact !== 'rift-crosscut' && !FOLLOW_THROUGH[mark.impact]) continue;
        const cell = batch.visibleCell(mark);
        const sourceCell = mark.from && (mark.absorbed || TRACED.has(mark.impact)) ? batch.visibleCell(mark.from) : -1;
        if (cell < 0 && sourceCell < 0) continue;
        picked[4 - dragonArtHitPriority(mark)].push({mark, age, cell: cell < 0 ? sourceCell : cell});
      }
      let painted = 0;
      for (const group of picked) for (const {mark, age, cell} of group) {
        if (painted >= 32) break;
        const key = `${mark.id}:${mark.targetId}`;
        const limit = mark.absorbed || LINKED.has(mark.impact) ? 5 : 3;
        const used = cells.get(cell) ?? 0;
        if (targets.has(key) || used >= limit) continue;
        const quarryCut = mark.kind === 'stone' && mark.killed && heroBeats.some(beat=>
          beat.kind==='stone' && beat.targets.some(target=>target.id===mark.targetId));
        const receiving=FOLLOW_THROUGH[mark.impact];
        const plated=deathPlates?.has(mark.targetId);
        if (receiving) paintReceiver(batch,mark,age,receiving,plated);
        else if (mark.absorbed && mark.from) {
          const { x, y, z } = mark.from;
          const mouth = `${x}:${y}:${z}`;
          if (!litMouths.has(mouth)) {
            litMouths.add(mouth);
            paintMouth(batch,mark,age,PALETTES[mark.kind]);
          }
          if (cell >= 0 && !plated) paintSwallowed(batch,mark,age,PALETTES[mark.kind]);
        } else {
          const from = mark.from;
          if (from && age < .39 && TRACED.has(mark.impact)) {
            const id = `${mark.id}:${mark.sourceId ?? `${from.x}:${from.y}:${from.z}`}:${mark.impact}:${cell}`;
            if (!linkSources.has(id)) {
              linkSources.add(id);
              const arc = mark.impact === 'beam-conduit' || mark.kind === 'frost';
              paintLink(batch,from,mark,1,fade(age,.14,.43),arc?PALETTES.conduit:PALETTES.stone,arc?'arc':'stone',arc?.34:.35);
            }
          }
          if (mark.impact === 'stone-surge') paintStoneSurge(batch, mark, age);
          if (mark.kind === 'frost' || mark.kind === 'stone' && !quarryCut) {
            paintShatter(batch,mark,age,plated,mark.kind==='frost'&&mark.id===steam?.id ? steam.gain : 0);
          }
          else if (quarryCut) continue;
          else {
            const peel = fade(age,.065,.19);
            if (mark.killed && !plated && peel > .05) paintSubject(batch,mark,mark.kind,0,peel*.85);
            paintCut(batch,mark,age);
          }
        }
        targets.add(key);
        cells.set(cell, used + 1);
        painted++;
      }
      batch.finish();
    },
  };
}
