import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENDING_ROUTE_SITES, LAKE_WAVE_HIT, seaGateApproach } from '../ending-route.js';
import { LAKE_CHAIN_START } from '../heaven-finale.js';
import { createInkFoodGeometry } from './fauna-geometry.js';
import { supportInstancing } from './instanced-ink.js';
import { lotusLeaf } from './shore-plants.js';

export const MARSH_CHAIN = ENDING_ROUTE_SITES.marsh;
export const LAKE_SLUICE = ENDING_ROUTE_SITES.lake;

const TAU = Math.PI * 2;
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const inkProfile = { strokes: false, geometryInfluence: 0, reserveStrength: .15, coherentInk: .09 };
const tone = {
  slate: { tint: '#4a534c', amount: .43, profile: { ...inkProfile, toneRange: [.16, .43] } },
  edge: { tint: '#8c8572', amount: .62, profile: { ...inkProfile, toneRange: [.11, .31] } },
  timber: { tint: '#67554a', amount: .60, profile: { ...inkProfile, toneRange: [.18, .47] } },
  bronze: { tint: '#9f7454', amount: .70, profile: { ...inkProfile, toneRange: [.15, .38] } },
  patina: { tint: '#42665d', amount: .83, profile: { ...inkProfile, toneRange: [.27, .57], reserveStrength: .29 } },
  strikeSeat: { tint: '#81532e', amount: .82, profile: { ...inkProfile, toneRange: [.15, .38], reserveStrength: .24 } },
  iron: { tint: '#665041', amount: .55, profile: { ...inkProfile, toneRange: [.24, .52] } },
  seal: { tint: '#a63825', amount: .88, profile: { ...inkProfile, toneRange: [.29, .50] } },
};
const SEA_GATE_IMPACT = .34;
const SEA_LATCH_BREAK = .44;
const SEA_CHAIN_TAUT = .68;
const RELAY_JOINT = 41;
export const RELAY_SNAP = 1.03;
const RELAY_LINKS = 49;
const RELAY_JOINT_T = RELAY_JOINT / (RELAY_LINKS - 1);
export const RELAY_CLOUD_JOINT = [
  RELAY_JOINT_T * -4.36 + Math.sin(RELAY_JOINT_T * 2.9) * .82,
  -.29 + RELAY_JOINT_T * 17.42 - .74 * Math.sin(RELAY_JOINT_T * Math.PI),
  -.072 + RELAY_JOINT_T * 14.3 + Math.sin(RELAY_JOINT_T * 2.7) * 1.5,
];
const hash = n => {
  const value = Math.sin(n * 91.713 + 17.21) * 15481.421;
  return value - Math.floor(value);
};

function attach(parent, name, x = 0, y = 0, z = 0) {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(x, y, z);
  parent.add(root);
  return root;
}

function makeSite(parent, name, site) {
  return attach(parent, name, site.x, 0, site.z);
}

function ringBlock(x, y, z, width, height, depth, seed, lean = 0) {
  // Chipped courses hold a pale cut edge above the wet foot of the stone.
  const corners = [
    [-.50, -.31], [-.30, -.50], [.28, -.50], [.50, -.29],
    [.50, .31], [.29, .50], [-.30, .50], [-.50, .26],
  ];
  const levels = [[0, .86], [.12, 1], [.52, .96], [.82, .95], [1, .80]];
  const rings = levels.map(([heightRatio, scale], level) => corners.map(([u, v], corner) => {
    const ripple = hash(seed + level * 5.87 + corner * 1.86) - .5;
    return [
      x + (u * scale + ripple * .105) * width + heightRatio * lean,
      y + height * (heightRatio + (level > 0 ? ripple * .105 : 0)),
      z + (v * scale + ripple * .11) * depth,
    ];
  }));
  const positions = [], guides = [];
  const triangle = (a, b, c, load, reserve) => {
    positions.push(...a, ...b, ...c);
    for (const point of [a, b, c]) {
      const tooth = hash(point[0] * 7.51 + point[1] * 6.71 + point[2] * 5.31 + seed);
      const chisel = Math.sin(point[1] * 15.8 + point[0] * 5.9 + point[2] * 11 + seed);
      const worn = .40 + .60 * smoothstep(chisel, -.83, .38);
      guides.push(load * (.48 + .52 * tooth) * worn, reserve * (.45 + .42 * tooth + .13 * worn));
    }
  };
  for (let level = 0; level < rings.length - 1; level++) {
    const lower = rings[level], upper = rings[level + 1];
    for (let corner = 0; corner < lower.length; corner++) {
      const next = (corner + 1) % lower.length;
      const load = (level === 0 ? .44 : level === 3 ? .14 : .29) * (.56 + .44 * hash(corner * 8.9 + seed));
      const reserve = level === 3 ? .25 : .035;
      triangle(lower[corner], upper[corner], lower[next], load, reserve);
      triangle(upper[corner], upper[next], lower[next], load, reserve);
    }
  }
  const top = rings.at(-1);
  for (let i = 1; i < top.length - 1; i++) triangle(top[0], top[i + 1], top[i], .10, .21);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('inkGuides', new THREE.Float32BufferAttribute(guides, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function box(x, y, z, width, height, depth, angle = 0) {
  return new THREE.BoxGeometry(width, height, depth).rotateZ(angle).translate(x, y, z);
}

function assembled(environment, parent, parts, material, name) {
  const geometries = parts.map(part => {
    const geometry = part.index ? part.toNonIndexed() : part;
    if (geometry !== part) part.dispose();
    geometry.deleteAttribute('uv');
    if (!geometry.hasAttribute('inkGuides')) {
      geometry.setAttribute('inkGuides', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    return geometry;
  });
  const geometry = mergeGeometries(geometries);
  for (const part of geometries) part.dispose();
  const mesh = environment.add(parent, geometry, [0, 0, 0], material);
  mesh.name = name;
  return mesh;
}

export function vermilionTag(environment, parent, x, y, z, size, tilt) {
  const tag = attach(parent, '朱印锁牌', x, y, z);
  tag.rotation.z = tilt;
  assembled(environment, tag, [
    ringBlock(0, -size * .61, 0, size * .92, size * 1.22, size * .15, 219, size * .04),
  ], tone.bronze, '旧铜方牌');
  const strokeZ = -size * .075;
  assembled(environment, tag, [
    box(-size * .03, size * .21, strokeZ, size * .57, size * .070, size * .028, -.09),
    box(size * .07, -size * .16, strokeZ, size * .54, size * .072, size * .028, .11),
    box(0, 0, strokeZ, size * .082, size * .74, size * .032, -.08),
    box(size * .18, -size * .36, strokeZ, size * .24, size * .068, size * .028, -.38),
  ], tone.seal, '磨损朱印');
  return tag;
}

function instanced(parent, geometry, capacity, material, name) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), capacity);
  mesh.name = name;
  mesh.userData.inkTint = material.tint;
  mesh.userData.inkTintAmount = material.amount;
  mesh.userData.inkProfile = material.profile;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

class Chain {
  constructor(parent, radius, count, name, material = tone.bronze) {
    this.radius = radius;
    this.capacity = count;
    const geometry = new THREE.TorusGeometry(1, .22, 6, 16).scale(1.28, .82, 1);
    this.mesh = instanced(parent, geometry, count, material, name);
    this.cursor = new THREE.Object3D();
    this.before = new THREE.Vector3();
    this.after = new THREE.Vector3();
    this.axis = vector(1, 0, 0);
  }

  update(path, count = this.capacity, wave = 0, seaMist = 0, skip = -1) {
    const mesh = this.mesh, cursor = this.cursor;
    let shown = 0;
    for (let i = 0; i < count; i++) {
      if (i === skip) continue;
      const t = i / Math.max(1, count - 1);
      path(t, cursor.position);
      path(Math.max(0, t - .006), this.before);
      path(Math.min(1, t + .006), this.after);
      this.after.sub(this.before).normalize();
      cursor.quaternion.setFromUnitVectors(this.axis, this.after);
      cursor.rotateX((i % 2) * Math.PI * .50 + .18 * Math.sin(i * 1.28 + wave));
      const scale = this.radius * (.93 + hash(i * 1.711) * .12);
      cursor.scale.setScalar(scale * (1 - seaMist * smoothstep(t, .76, 1)));
      cursor.updateMatrix();
      mesh.setMatrixAt(shown++, cursor.matrix);
    }
    mesh.count = shown;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

const chargeLinkVertex = /* glsl */ `
  attribute vec2 aCharge;
  varying vec2 vUv,vCharge;
  varying vec3 vNormal;
  void main() {
    vUv=uv;vCharge=aCharge;
    vNormal=normalize(mat3(viewMatrix)*mat3(modelMatrix)*mat3(instanceMatrix)*normal);
    gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
  }
`;
const chargeLinkFragment = /* glsl */ `
  varying vec2 vUv,vCharge;
  varying vec3 vNormal;
  void main(){
    float grain=fract(sin(dot(floor(vUv*vec2(122.,47.)),vec2(127.1,311.7)))*43758.55);
    float shoulder=clamp(dot(normalize(vNormal),normalize(vec3(-.23,.58,.77))),0.,1.);
    float flash=vCharge.x*smoothstep(.31,.89,shoulder+.13*sin(vUv.x*36.+vCharge.y*3.));
    float rim=.08+.83*flash+.10*grain;
    float alpha=min(.98,vCharge.x*(.72+.28*shoulder));
    if(alpha<.025)discard;
    gl_FragColor=vec4(rim,.18+.79*flash,.49+.45*grain,alpha);
  }
`;

class ChargedLinks {
  constructor(parent, chain) {
    const geometry=chain.mesh.geometry.clone();
    this.charge=new THREE.InstancedBufferAttribute(new Float32Array(chain.capacity*2),2).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aCharge',this.charge);
    const material=new THREE.ShaderMaterial({
      vertexShader:chargeLinkVertex, fragmentShader:chargeLinkFragment,
      side:THREE.DoubleSide,transparent:true,depthWrite:false,forceSinglePass:true,
      polygonOffset:true,polygonOffsetFactor:-1.5,polygonOffsetUnits:-2,
    });
    this.mesh=new THREE.InstancedMesh(geometry,material,chain.capacity);
    this.mesh.name='逐节透出电白的铜链';
    this.mesh.userData.inkIdSuppressed=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled=false;
    this.mesh.renderOrder=9;
    this.mesh.visible=false;
    this.matrix=new THREE.Matrix4();
    this.chain=chain;
    parent.add(this.mesh);
  }
  draw(head,coupling,broken,age){
    const mesh=this.mesh, chain=this.chain;
    let shown=0,source=0;
    for(let i=0;i<chain.capacity;i++){
      if(broken&&i===RELAY_JOINT)continue;
      const at=i/(chain.capacity-1);
      const lag=head-at;
      const tip=(1-smoothstep(Math.abs(lag),.025,.123))*coupling;
      const body=smoothstep(lag,0,.028)*(1-smoothstep(lag,.15,.46))*.41*coupling;
      const value=Math.max(tip,body)*(.88+.12*Math.sin(age*43.5-i*1.31));
      if(value>.025){
        chain.mesh.getMatrixAt(source,this.matrix);
        mesh.setMatrixAt(shown,this.matrix);
        this.charge.setXY(shown++,value,.37*i);
      }
      source++;
    }
    mesh.count=shown;
    mesh.visible=shown>0;
    mesh.instanceMatrix.needsUpdate=this.charge.needsUpdate=true;
  }
}

function relayDebris(parent, geometry) {
  const fragments=[];
  for(const side of [-1,1]){
    const material=new THREE.ShaderMaterial({
      vertexShader:`
        varying vec3 vNormal;
        void main(){
          vNormal=normalize(normalMatrix*normal);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:`
        varying vec3 vNormal;
        void main(){
          float sheen=smoothstep(.02,.74,dot(normalize(vNormal),vec3(-.35,.51,.78)));
          gl_FragColor=vec4(.075+.34*sheen,.31*sheen,.61,1.);
        }`,
      side:THREE.DoubleSide,
    });
    const mesh=new THREE.Mesh(geometry.clone().scale(.73,.84,.81),material);
    mesh.name='高处断开的铜链';
    mesh.userData.inkTint='#46524b';
    mesh.userData.inkTintAmount=.75;
    mesh.visible=false;
    parent.add(mesh);
    fragments.push({mesh,side});
  }
  return fragments;
}

const shoalInk = {
  tint: '#546f65', amount: .79,
  profile: { ...inkProfile, toneRange: [.19, .47], reserveStrength: .38 },
};

// An open stretch of shallows curving around the east bank of the pavilion.
export function lakeFishCourse(age, out) {
  const leaving = age - LAKE_FISH_FIRST;
  const start = smoothstep(leaving, 0, .36);
  const travel = Math.max(0, leaving - .08) * start;
  const bank = smoothstep(travel, .35, 1.57);
  return out.set(LAKE_SLUICE.x - .08 + .20 * travel + 3.65 * bank,
    .062, LAKE_SLUICE.z - .74 + 3.24 * travel - 1.45 * bank);
}

export function lakeReedCourse(age,out){
  const carried=Math.max(0,age-LAKE_CURRENT_START);
  const draw=smoothstep(carried,.02,.54);
  const rush=Math.max(0,carried-.56);
  const turn=smoothstep(carried,.75,1.75);
  return out.set(LAKE_SLUICE.x+.34+.36*draw+2.38*turn,
    .087+.084*Math.sin(Math.PI*draw),LAKE_SLUICE.z-.94+1.90*draw+2.55*rush-.75*turn);
}

function lakePassageFish(age, route, point, tangent, out) {
  const { slot, wait, pace, arrive, check, offset, heading, seed } = route;
  const ageOnCourse = LAKE_FISH_FIRST + (age - LAKE_FISH_FIRST - wait) * pace;
  lakeFishCourse(ageOnCourse, point);
  lakeFishCourse(ageOnCourse + .036, tangent).sub(point);
  if (tangent.lengthSq() < .00001) tangent.set(0, 0, 1);
  else tangent.normalize();
  const launch = LAKE_FISH_FIRST + wait;
  const merge = smoothstep(age,launch-.42,launch+.53);
  const approach = smoothstep(age, .24 + arrive, .84 + arrive);
  const balk = smoothstep(age,.57+check,1.03+check) * (1-smoothstep(age,1.17+check,1.52+check));
  const bank = .27*balk*(slot === 1 ? .47 : Math.sign(offset));
  const roll = Math.sin(age * seed.frequency + seed.phase);
  const lateral = offset + .034 * roll;
  return out.set(
    point.x + lerp(lateral,lateral * tangent.z,merge) + bank + heading * .29 * (1-merge),
    .061 + (.013+.011*merge) * Math.sin(age*seed.frequency*.75 + seed.phase),
    point.z - 1.91*(1-approach) - wait*1.24*(1-merge) - .24*balk - lateral*tangent.x*merge,
  );
}

function lakeRainFish(age,route,out) {
  const leader=route.slot===1;
  const lag=leader?0:route.arrive*.72+.08;
  const local=age-lag;
  const row=route.offset;
  const turn=smoothstep(local,.36,.86);
  const spread=smoothstep(local,.73,1.64+route.wait*.18);
  const ease=smoothstep(local,1.48,2.19);
  const paddle=Math.sin(age*route.seed.frequency*.73+route.seed.phase);
  // First rain touches inside the bank. The lead fish runs along its
  // own side of the iron; the tight shoal opens into slower lanes.
  return out.set(
    -.11+row*.95+(leader?2.75:2.06+row*.40)*spread+
      (leader?.10:row*.31)*turn+.043*paddle,
    .061+.032*Math.sin(age*6.13+route.seed.phase)+.032*turn*(1-spread),
    -2.43+smoothstep(local,-.18,.36)*(1.03+row*.13)
      -.35*spread-(leader?.0:.35+route.wait*.44+Math.abs(row)*.27)-.12*ease,
  );
}

class Shoal {
  constructor(parent, count, site, extent, size) {
    this.site = site;
    this.extent = extent;
    this.size = size;
    this.count = count;
    this.mesh = instanced(parent, createInkFoodGeometry('fish'), count, shoalInk, '回游小银鱼');
    this.cursor = new THREE.Object3D();
    this.lead = new THREE.Vector3();
    this.coursePoint = new THREE.Vector3();
    this.courseTangent = new THREE.Vector3();
    this.fishBefore = new THREE.Vector3();
    this.fishAfter = new THREE.Vector3();
    this.fishVelocity = new THREE.Vector3();
    this.passage = Array.from({length:count},(_,slot)=>{
      const first = slot === 1;
      const place = slot === 0 ? 1 : slot;
      return {
        slot,
        wait: first ? 0 : .36+(place-1)*.105+hash(slot*11)*.10,
        pace: first ? 1 : .93+.18*hash(slot*21.3),
        arrive: first ? -.085 : .049*place + .09*hash(slot*2.3),
        check: first ? 0 : .021*place,
        offset: first ? 0 : (slot%3-1)*.69+(hash(slot*19.7)-.5)*.21,
        heading: first ? .12 : (hash(slot*11.9)-.5)*1.20,
        seed: {frequency: 8.2+hash(slot*47.1)*5.15,phase:slot*2.0+hash(slot*3.07)},
      };
    });
    this.wakePoint = new THREE.Vector3();
    this.wakeTangent = new THREE.Vector3();
  }

  update(time, release, epilogueAge, chainArrival = Infinity, rained = false) {
    for (let i = 0; i < this.count; i++) {
      const row = i % 3 - 1, cohort = Math.floor(i / 3);
      const origin = release === null ? time : release + .1;
      const cycle = origin * (release === null ? 1.12 : 1.00) - cohort * .44 - hash(i * 2.91) * .28;
      const a = cycle + row * .08;
      let x = row * .71 + .19 * Math.sin(a * 2.01 + i);
      let y = .065 + .038 * Math.sin(a * 6.9);
      let z = release === null
        ? -.76 - this.extent * (.51 + .49 * Math.cos(a)) - cohort * .57 - hash(i * 7.1) * .37
        : -1.17 + a * 2.12 + .18 * Math.sin(a * 2.9);
      let roll = .16 * Math.sin(a * 6.4);
      let dx = .38 * Math.cos(a * 2.01 + i);
      let dz = release === null ? this.extent * .49 * Math.sin(a) : 2.12 + .52 * Math.cos(a * 2.9);
      const crossing = epilogueAge !== null && release !== null;
      let flick=.15*Math.sin(time*8.9+i),scale=1;
      if (crossing) {
        const route=this.passage[i];
        const course=this.coursePoint,tangent=this.courseTangent;
        const position=lakePassageFish(epilogueAge,route,course,tangent,this.cursor.position);
        const before=lakePassageFish(epilogueAge-.097,route,course,tangent,this.fishBefore);
        const after=lakePassageFish(epilogueAge+.097,route,course,tangent,this.fishAfter);
        const motion=this.fishVelocity.copy(after).sub(before);
        const thrust=Math.hypot(motion.x,motion.z)/.194;
        const depart=smoothstep(epilogueAge,LAKE_FISH_FIRST+route.wait-.07,LAKE_FISH_FIRST+route.wait+.48);
        // Face the sweep once visible travel begins. During inspection do
        // not take the derivative of a held or slightly backing-up body.
        const courseAge=LAKE_FISH_FIRST+(epilogueAge-LAKE_FISH_FIRST-route.wait)*route.pace;
        const guide=lakeFishCourse(courseAge-.086,course);
        const heading=lakeFishCourse(courseAge+.086,tangent).sub(guide);
        const toward=Math.atan2(heading.x,Math.max(.015,heading.z));
        const forward=motion.z/.194;
        const moving=depart*smoothstep(thrust,.42,1.02)*smoothstep(forward,.08,.80);
        const shown=lerp(route.heading,toward,depart);
        const deviation=Math.atan2(motion.x,Math.max(.025,motion.z))-shown;
        const nose=shown+moving*clamp(deviation,-.53,.53);
        const paddle=Math.sin(epilogueAge*route.seed.frequency+route.seed.phase);
        dx=Math.sin(nose); dz=Math.cos(nose);
        x=position.x-this.site.x; y=position.y; z=position.z-this.site.z;
        flick=paddle*lerp(.092,.046,depart);
        roll=paddle*lerp(.065,.14,depart)+.24*Math.sin(nose);
        scale=1+(i===1?.15:(hash(i*13.1)-.50)*.19)*depart;
        if(i===1)this.lead.copy(position);
      } else if(rained) {
        const route=this.passage[i];
        const position=lakeRainFish(epilogueAge,route,this.cursor.position);
        const before=lakeRainFish(epilogueAge-.09,route,this.fishBefore);
        const after=lakeRainFish(epilogueAge+.09,route,this.fishAfter);
        const turn=smoothstep(epilogueAge, .40+route.arrive*.72, .95+route.arrive*.72);
        const nose=lerp(route.heading,Math.PI*.56,turn);
        const stroke=Math.atan2(after.x-before.x,after.z-before.z);
        const deviation=Math.atan2(Math.sin(stroke-nose),Math.cos(stroke-nose));
        const weight=smoothstep(Math.hypot(after.x-before.x,after.z-before.z),.028,.19);
        const aim=nose+weight*clamp(deviation,-.34,.34);
        x=position.x; y=position.y; z=position.z;
        dx=Math.sin(aim);dz=Math.cos(aim);
        roll=.11*Math.sin(epilogueAge*route.seed.frequency+route.seed.phase)+turn*.14;
        flick*=.52;
      } else if (epilogueAge !== null || chainArrival < 2.65) {
        // The same lead fish balks before the iron in the first visit
        // and after investiture. The ripple reaches each row in turn.
        const lag = (i === 1 ? 0 : .13) + cohort * .24 + hash(i * 17.2) * .12;
        const follow = (epilogueAge ?? chainArrival + .68) - lag;
        const advance = smoothstep(follow, -.14, .74);
        const turning = smoothstep(follow, .65, 1.14);
        const away = smoothstep(follow, 1.13, 2.44);
        const watch = epilogueAge !== null ? 1 :
          smoothstep(chainArrival, -.91, -.23) * (1 - smoothstep(chainArrival, 1.64, 2.65));
        const watchZ = -2.62 + advance * 1.97 - cohort * .19 - 3.20 * away;
        const watchSpeed = .25 + 1.75 * (1 - smoothstep(follow, .59, .76));
        x += watch * 1.48 * turning;
        z = lerp(z, watchZ, watch);
        dx += watch * Math.sin(Math.PI * turning) * 2.43;
        dz = lerp(dz, lerp(watchSpeed, -2.35, turning), watch);

      }
      const cursor = this.cursor;
      cursor.position.set(this.site.x + x, y, this.site.z + z);
      cursor.rotation.set(.04 * Math.sin(a * 5), Math.atan2(dx, dz) + flick, roll);
      cursor.scale.setScalar(this.size * scale * (.79 + .37 * hash(i * 9.219)));
      cursor.updateMatrix();
      this.mesh.setMatrixAt(i, cursor.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A small shoal follows an actual bend just short of the last exposed iron links. */
class MarshShoal extends Shoal {
  constructor(parent) {
    super(parent, 9, MARSH_CHAIN, 0, 1.78);
    this.course = new THREE.CatmullRomCurve3([
      vector(-4.55, 0, -5.50), vector(-4.47, 0, -2.90), vector(-4.11, 0, -.39),
      vector(-4.44, 0, .58), vector(-5.86, 0, .58), vector(-6.61, 0, -1.42),
      vector(-6.70, 0, -4.47), vector(-5.89, 0, -6.30),
    ], true);
    this.course.updateArcLengths();
    this.aim = new THREE.Vector3();
    this.pathPoint = new THREE.Vector3();
    this.leader = new THREE.Vector3();
    this.leaderAim = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.phase = .13;
    this.lastTime = null;
    this.discovered = false;
  }

  position(i, phase, out) {
    const leader = i === 1;
    const lane = leader ? .02 : (i % 3 - 1) * .69 + (hash(i * 5.17) - .5) * .21;
    const lag = leader ? 0 : .045 + Math.floor(i / 3) * .056 + hash(i * 2.91) * .024;
    const u = (phase - lag + 5) % 1;
    this.course.getPointAt(u, this.pathPoint);
    this.course.getTangentAt(u, this.aim);
    return out.set(
      this.site.x + this.pathPoint.x + this.aim.z * lane,
      .068 + .056 * Math.sin(TAU * u * 8 + i * .81),
      this.site.z + this.pathPoint.z - this.aim.x * lane,
    );
  }

  update(time, near, discovered, clueAge = Infinity) {
    const dt = clamp(time - (this.lastTime ?? time), 0, .08);
    this.lastTime = time;
    // The first fish rests within the upstream bend, then reaches the
    // iron and checks before following its curve back into the shallows.
    this.discovered ||= discovered;
    const rest = this.phase > .09 && this.phase < .21;
    const check = smoothstep(this.phase,.24,.285)*(1-smoothstep(this.phase,.305,.365));
    const speed = near ? lerp(.286,.085,check) : rest ? .011 : .22;
    this.phase = (this.phase + dt * (this.discovered ? speed : rest ? .009 : .17)) % 1;
    const read = discovered ? (1 - smoothstep(clueAge, 2.1, 3.45)) : 0;
    for (let i = 0; i < this.count; i++) {
      const cursor = this.cursor;
      this.position(i, this.phase, cursor.position);
      const heading = Math.atan2(this.aim.x, this.aim.z);
      const flick = .18 * Math.sin(time * 10.9 + i * 2.4);
      const tipBank = smoothstep(Math.abs(this.aim.x), .18, .94);
      cursor.rotation.set(.08 * flick, heading + flick, -.08 + tipBank * .42 * Math.sign(this.aim.x));
      const accent = i === 1 ? 1 + .31 * read : 1 + .085 * read;
      const size = this.size * (.79 + .37 * hash(i * 9.219)) * accent;
      const elongate = i === 1 ? 1 + .13 * read : 1;
      cursor.scale.set(size,size,size * elongate);
      cursor.updateMatrix();
      this.mesh.setMatrixAt(i, cursor.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.position(1, this.phase, this.leader);
    this.leaderAim.copy(this.aim);
  }
}

const brushVertex = /* glsl */ `
  varying vec2 vStroke;
  void main() {
    vStroke=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;
const brushFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt, uLight;
  float hashInk(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  void main() {
    float side=abs(vStroke.y*2.-1.);
    float tooth=hashInk(floor(vStroke*vec2(106.,17.))+uSalt);
    float ragged=sin(vStroke.x*37.+uSalt)*.12+(tooth-.5)*.17;
    float bristles=1.-smoothstep(.24,.98,side+ragged);
    float ends=smoothstep(0.,.12,vStroke.x)*(1.-smoothstep(.80,1.,vStroke.x));
    float flow=.69+.31*sin(vStroke.x*21.-uTime*4.6+uSalt);
    float dry=smoothstep(.21,.54,tooth+.21*sin(vStroke.x*55.+vStroke.y*6.));
    float alpha=uOpacity*bristles*ends*mix(flow,.94,dry*.65);
    if(alpha<.012)discard;
    float wash=mix(.34,.95,uLight)-side*.10;
    gl_FragColor=vec4(wash,mix(.10,.97,uLight)*bristles,tooth,alpha);
  }
`;

/** A set of connected brush strips, whose points stay on the water or follow a chain. */
class WashStrokes {
  constructor(parent, strips, samples, light, name, paint = {}) {
    this.strips = strips;
    this.samples = samples;
    const vertices = strips * samples * 2;
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(vertices * 2);
    const indices = [];
    for (let strip = 0; strip < strips; strip++) {
      for (let sample = 0; sample < samples; sample++) {
        const a = (strip * samples + sample) * 2;
        uv.set([sample / (samples - 1), 0, sample / (samples - 1), 1], a * 2);
        if (sample > 0) indices.push(a - 2, a, a - 1, a - 1, a, a + 1);
      }
    }
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const fragmentShader = paint.fragmentShader ?? brushFragment;
    const material = new THREE.ShaderMaterial({
      vertexShader: brushVertex, fragmentShader,
      side: THREE.DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uSalt: { value: strips * .71 }, uLight: { value: light } },
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = name;
    if (paint.tint) {
      this.mesh.userData.inkTint = paint.tint;
      this.mesh.userData.inkTintAmount = .94;
      material.uniforms.uSurface = { value: vector(0, 0, 0) };
      const masked = fragmentShader.replace(/gl_FragColor\s*=\s*([^;]+);/,
        'vec4 deposit=$1; if(deposit.a<.21)discard; gl_FragColor=vec4(uSurface,1.);');
      this.mesh.userData.inkSurfaceMaterial = new THREE.ShaderMaterial({
        vertexShader: brushVertex,
        fragmentShader: 'uniform vec3 uSurface;\n' + masked,
        side: THREE.DoubleSide, uniforms: material.uniforms,
      });
    } else this.mesh.userData.inkIdSuppressed = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = paint.order ?? 3;
    parent.add(this.mesh);
    this.upright = paint.upright ?? false;
    this.point = new THREE.Vector4();
    this.centers = new Float32Array(strips * samples * 4);
  }

  draw(time, opacity, shape) {
    this.mesh.visible = opacity > .015;
    if (!this.mesh.visible) return;
    this.mesh.material.uniforms.uOpacity.value = opacity;
    this.mesh.material.uniforms.uTime.value = time;
    for (let strip = 0; strip < this.strips; strip++) {
      for (let sample = 0; sample < this.samples; sample++) {
        const base = (strip * this.samples + sample) * 4;
        const { x, y, z, w } = shape(strip, sample / (this.samples - 1), this.point);
        this.centers[base] = x;
        this.centers[base + 1] = y;
        this.centers[base + 2] = z;
        this.centers[base + 3] = w;
      }
      for (let sample = 0; sample < this.samples; sample++) {
        const i = strip * this.samples + sample;
        const base = i * 4, before = sample > 0 ? base - 4 : base;
        const after = sample < this.samples - 1 ? base + 4 : base;
        const x = this.centers[base], y = this.centers[base + 1], z = this.centers[base + 2];
        const width = this.centers[base + 3];
        const dx = this.centers[after] - this.centers[before];
        const dy = this.centers[after + 1] - this.centers[before + 1];
        const dz = this.centers[after + 2] - this.centers[before + 2];
        const length = Math.hypot(dx, dz);
        const vertical = Math.abs(dy) > length * 1.4;
        const sx = this.upright ? 0 : vertical ? width : width * dz / Math.max(.0001, length);
        const sy = this.upright ? width : 0;
        const sz = this.upright ? width * .23 : vertical ? width * .24 : -width * dx / Math.max(.0001, length);
        this.positions.setXYZ(i * 2, x - sx, y - sy, z - sz);
        this.positions.setXYZ(i * 2 + 1, x + sx, y + sy, z + sz);
      }
    }
    this.positions.needsUpdate = true;
  }
}

const relayBoltFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt;
  float fiber(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  void main() {
    float along=vStroke.x;
    float tooth=fiber(floor(vStroke*vec2(113.,29.))+uSalt);
    float width=abs(vStroke.y*2.-1. + (tooth-.5)*.19);
    float end=smoothstep(0.,.064,along)*(1.-smoothstep(.89,1.,along));
    float bite=(1.-smoothstep(.48,.98,width))*end;
    float hair=(1.-smoothstep(.10,.37,width))*(.78+.22*tooth);
    float scumble=smoothstep(.43,.88,tooth)*smoothstep(.25,.77,width);
    float alpha=uOpacity*bite*(.72+.28*tooth);
    if(alpha<.015)discard;
    float pigment=clamp(.97-.85*hair-.16*scumble,.08,.97);
    gl_FragColor=vec4(1.-pigment,max(hair,.26*scumble),tooth,alpha);
  }
`;

const relayCloudFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt, uLight;
  float hashInk(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float fibers(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(hashInk(i),hashInk(i+vec2(1,0)),f.x),mix(hashInk(i+vec2(0,1)),hashInk(i+vec2(1,1)),f.x),f.y);
  }
  void main() {
    vec2 p=vStroke;
    float bank=fibers(p*vec2(7.1,3.0)+vec2(uTime*.16,uSalt));
    float load=fibers(p*vec2(14.3,11.2)+uSalt);
    float hair=fibers(p*vec2(31.,48.));
    float edge=abs(p.y*2.-1.);
    float end=smoothstep(.005,.29,min(p.x,1.-p.x)+.15*(bank-.5));
    float body=1.-smoothstep(.12,.97,edge+(load-.5)*.26);
    float alpha=uOpacity*end*body*mix(.27,.94,smoothstep(.20,.62,bank));
    if(alpha<.014)discard;
    float reserve=uLight*body*smoothstep(.25,.78,bank)*(.75+.25*hair);
    float pigment=mix(.23,.51,load)*(1.-.90*uLight);
    gl_FragColor=vec4(1.-pigment,reserve,hair,alpha);
  }
`;

const tideFunnelFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt, uLight;
  float tooth(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float wet(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(tooth(i),tooth(i+vec2(1,0)),f.x),mix(tooth(i+vec2(0,1)),tooth(i+vec2(1,1)),f.x),f.y);
  }
  void main() {
    vec2 p=vStroke;
    float grain=wet(p*vec2(89.,21.)+uSalt);
    float flow=wet(vec2(p.x*12.-uTime*2.6,p.y*7.1+uSalt));
    float dry=wet(p*vec2(39.,19.)+vec2(-uTime*4.7,uSalt));
    float edge=abs(p.y*2.-1. + (flow-.5)*.22);
    float fill=1.-smoothstep(.45,.96,edge+(grain-.5)*.15);
    float end=smoothstep(.01,.19,p.x)*(1.-smoothstep(.83,1.,p.x));
    float fray=(1.-smoothstep(.048,.22,abs(p.y-.69+(flow-.5)*.21)))
      *smoothstep(.44,.76,dry)*smoothstep(.27,.70,flow);
    float alpha=uOpacity*fill*end*(.66+.34*grain);
    if(alpha<.013)discard;
    float pigment=(.64+.32*flow)*(1.-.88*fray);
    gl_FragColor=vec4(1.-pigment,.91*fray,grain,alpha);
  }
`;

const lakeCrestFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt, uLight;
  void main() {
    float s=vStroke.x, across=vStroke.y;
    float grain=fract(sin(dot(floor(vStroke*vec2(175.,39.))+uSalt,vec2(54.93,37.62)))*14153.2);
    float lobe=.13*sin(s*44.+uSalt)+.08*sin(s*83.);
    float width=1.-smoothstep(.43,.99,abs(across*2.-1.+lobe));
    float tips=smoothstep(.01,.15,s)*(1.-smoothstep(.81,.995,s));
    float crown=(1.-smoothstep(.03,.30,abs(across-.28+lobe*.29)))
      *smoothstep(.18,.79,grain+.3*sin(s*30.+uTime*2.7));
    float ink=.34+.52*crown+.09*grain;
    gl_FragColor=vec4(ink,.16+.74*crown,grain,uOpacity*width*tips*(.62+.38*grain));
  }
`;

const sluiceCurrentFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt;
  float salt(vec2 p) {
    return fract(sin(dot(p,vec2(34.71,61.74)))*19261.48);
  }
  void main() {
    float s=vStroke.x, across=vStroke.y;
    float paper=salt(floor(vStroke*vec2(129.,31.))+uSalt);
    float river=.043*sin(s*36.-uTime*3.)+.029*sin(s*77.+uSalt);
    float start=smoothstep(.009,.105,s);
    float tip=1.-smoothstep(.81,.997,s);
    float ink=(1.-smoothstep(.10,.35,abs(across-.30+river)))
      *( .71+.29*smoothstep(.18,.76,paper));
    float reserve=(1.-smoothstep(.025,.16,abs(across-.61+river)))
      *smoothstep(.16,.62,paper+.16*sin(s*46.-uTime*4.));
    float core=max(ink,reserve*.80);
    gl_FragColor=vec4(mix(.18+.08*paper,.97,reserve),
      .09+.88*reserve,paper,uOpacity*start*tip*core);
  }
`;

const relayMarkFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt, uLight;
  float inkHash(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  void main() {
    vec2 p=vStroke;
    float bristle=inkHash(floor(p*vec2(109.,17.))+uSalt);
    float teeth=(bristle-.5)*.17+.07*sin(p.x*28.+uSalt);
    float breadth=abs(2.*p.y-1.+teeth);
    float frayed=1.-smoothstep(.45,.99,breadth);
    float ends=smoothstep(.0,.15,p.x)*(1.-smoothstep(.85,1.,p.x));
    float pale=(1.-smoothstep(.045,.31,abs(p.y-.65+.13*sin(p.x*24.))))
      *smoothstep(.31,.67,bristle)*smoothstep(.08,.42,p.x);
    float ink=(.79+.13*bristle)*(1.-.89*pale);
    float coverage=uOpacity*frayed*ends*(.79+.21*bristle);
    if(coverage<.016)discard;
    gl_FragColor=vec4(1.-ink,pale*.96,bristle,coverage);
  }
`;

const relayCurrentInk = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity,uTime,uSalt;
  float tooth(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float blood(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(tooth(i),tooth(i+vec2(1,0)),f.x),
      mix(tooth(i+vec2(0,1)),tooth(i+vec2(1,1)),f.x),f.y);
  }
  void main() {
    vec2 p=vStroke;
    float s=p.x;
    float wet=blood(vec2(s*11.-uTime*.57,p.y*5.1+uSalt));
    float toothInk=blood(vec2(s*72.-uTime*3.8,p.y*33.+uSalt*3.));
    float split=sin(s*38.7+uSalt)*.07+(wet-.5)*.14;
    float across=abs(p.y*2.-1.+split);
    float front=smoothstep(.0,.23,s)*(1.-smoothstep(.92,1.,s));
    float footprint=1.-smoothstep(.42,.98,across+(toothInk-.5)*.26);
    float spill=1.-smoothstep(.73,1.,across);
    float bristles=.65+.35*smoothstep(.15,.66,toothInk+.24*sin(4.+p.y*59.1+s*12.));
    float gutter=(1.-smoothstep(.025,.149,across))*smoothstep(.25,.76,wet+.22*toothInk);
    float hair=(1.-smoothstep(.012,.039,abs(across-.27-.11*wet)))*smoothstep(.28,.72,toothInk);
    float reserve=clamp(gutter*.84+hair*.30,0.,.95);
    float alpha=uOpacity*front*max(footprint*bristles,spill*.27);
    if(alpha<.014)discard;
    gl_FragColor=vec4(.056+.12*toothInk+.76*reserve,reserve,.38+.55*wet,alpha);
  }
`;

const relayLockedFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uOpacity, uTime, uSalt;
  float tooth(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float wash(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(tooth(i),tooth(i+vec2(1,0)),f.x),
               mix(tooth(i+vec2(0,1)),tooth(i+vec2(1,1)),f.x),f.y);
  }
  void main() {
    vec2 p=vStroke;
    float dust=tooth(floor(p*vec2(179.,39.))+uSalt);
    float ink=wash(p*vec2(16.,5.)+uSalt);
    float transverse=abs(p.y*2.-1.+.15*(ink-.5));
    float wet=(1.-smoothstep(.20,.97,transverse))*(.76+.24*ink);
    float rim=1.-smoothstep(.11,.58,transverse+.07*(dust-.5));
    float pale=(1.-smoothstep(.035,.16,abs(p.y-.63+(ink-.5)*.25)))
      *smoothstep(.21,.64,dust)*smoothstep(.12,.55,ink);
    float alpha=uOpacity*max(wet*.78,rim)*(.80+.20*dust);
    if(alpha<.014)discard;
    float pigment=(.72+.18*ink)*(1.-.89*pale);
    gl_FragColor=vec4(1.-pigment,pale*.88,dust,alpha);
  }
`;


const relayBoundaryMist = /* glsl */ `
  varying vec3 vRadial;
  varying vec2 vStroke;
  uniform vec3 uExit;
  uniform float uOpening,uAge,uOpacity;
  float inkHash(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float mist(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(inkHash(i),inkHash(i+vec2(1,0)),f.x),
               mix(inkHash(i+vec2(0,1)),inkHash(i+vec2(1,1)),f.x),f.y);
  }
  void main() {
    vec2 p=vStroke;
    vec3 radial=normalize(vRadial);
    float tilt=abs(uExit.y)*uOpening;
    float cloud=mist(vec2(p.x*14.+uAge*.27,p.y*7.9+uAge*.31));
    float fiber=mist(vec2(p.x*75.-uAge*.42,p.y*31.));
    float dragged=.085*sin(p.x*31.4-uAge*2.)+.075*(cloud-.5);
    float shoulder=1.-smoothstep(.035,mix(.265,.48,tilt),abs(p.y-.5+dragged));
    float wet=smoothstep(.18,.61,cloud*.75+fiber*.25);
    float air=dot(radial,uExit)+.024*(cloud-.50);
    float wake=uOpening*smoothstep(.841,.971,air);
    float lips=uOpening*smoothstep(.807,.862,air)*(1.-smoothstep(.903,.967,air))*.44;
    float thin=(.15+.39*wet)*shoulder*(1.-.96*wake);
    float alpha=uOpacity*max(thin,lips*shoulder);
    if(alpha<.014)discard;
    float reserve=clamp(.16+.22*fiber+.64*lips,0.,.95);
    gl_FragColor=vec4(.40+.23*cloud+.32*lips,reserve,fiber,alpha);
  }
`;

/** A clipped belt of ink fog whose unbroken position lies on the danger sphere. */
class RelayBoundary {
  constructor(parent) {
    const geometry=new THREE.SphereGeometry(1,81,26);
    const uniforms={
      uAge:{value:0},uOpacity:{value:0},uOpening:{value:0},uExit:{value:vector(0,0,1)},
    };
    const material=new THREE.ShaderMaterial({
      vertexShader:`
        varying vec3 vRadial;
        varying vec2 vStroke;
        void main(){
          vStroke=uv;vRadial=position;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:relayBoundaryMist, uniforms, side:THREE.DoubleSide,
      transparent:true,depthWrite:false,forceSinglePass:true,
    });
    this.mesh=new THREE.Mesh(geometry,material);
    this.mesh.name='锁雷范围 · 薄墨掠风';
    this.mesh.renderOrder=5;
    this.mesh.frustumCulled=false;
    this.mesh.userData.inkIdSuppressed=true;
    this.mesh.visible=false;
    parent.add(this.mesh);
  }

  draw(field, age, opacity, exit, opening) {
    this.mesh.visible=field!=null&&opacity>.015;
    if(!this.mesh.visible)return;
    this.mesh.position.set(field.x,field.y,field.z);
    this.mesh.scale.setScalar(field.radius);
    const {uAge,uOpacity,uOpening,uExit}=this.mesh.material.uniforms;
    uAge.value=age;
    uOpacity.value=opacity;
    uOpening.value=opening;
    if(exit)uExit.value.copy(exit);
  }
}

const floodFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uAge, uOpacity;
  float tooth(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float wash(vec2 p) {
    vec2 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(tooth(i),tooth(i+vec2(1,0)),f.x),
               mix(tooth(i+vec2(0,1)),tooth(i+vec2(1,1)),f.x),f.y);
  }
  void main() {
    vec2 uv=vStroke;
    float breakup=wash(uv*vec2(10.,22.)+vec2(uAge*1.4,-uAge*3.));
    float fiber=wash(uv*vec2(33.,131.)+vec2(2.7,-uAge*16.));
    float cross=uv.y-.676+(breakup-.5)*.057+.024*sin(uv.x*19.-uAge*4.);
    float lip=1.-smoothstep(.022,.100,abs(cross));
    float split=(1.-smoothstep(.008,.055,abs(cross-.096+(fiber-.5)*.038)))
      *smoothstep(.24,.77,breakup);
    float ragged=(1.-smoothstep(.018,.072,abs(cross-.17+(breakup-.5)*.16)))
      *smoothstep(.32,.83,fiber);
    float endFade=smoothstep(.014,.20,min(uv.x,1.-uv.x)+(breakup-.5)*.075);
    float belly=smoothstep(.08,.39,uv.y)*(1.-smoothstep(.81,.99,uv.y));
    float alpha=uOpacity*endFade*belly;
    if(alpha<.018)discard;
    float reserve=clamp(lip*(.72+.28*fiber)+.70*split+.46*ragged,0.,.98);
    float body=.38+.37*belly+.18*breakup;
    float lifted=reserve*(.56+.36*lip);
    gl_FragColor=vec4(1.-clamp(body*(1.-lifted),0.,.95),reserve,fiber,alpha);
  }
`;

/** Ink wave sheets share the gate opening and the incoming waterline. */
class SluiceFlood {
  constructor(parent) {
    this.widthSamples = 37;
    this.profile = [
      [-3.72, 0], [-2.83, .06], [-2.14, .15], [-1.57, .29], [-1.09, .49],
      [-.70, .69], [-.35, .89], [.02, 1], [.31, .91], [.49, .66],
      [.75, .34], [1.13, .15], [1.80, .025], [2.44, 0],
    ];
    this.center = this.createSheet(parent, this.widthSamples, '潮头穿过海闸');
    this.reflected = [-1, 1].map(side => ({
      ...this.createSheet(parent, 21, side < 0 ? '西闸墩回冲' : '东闸墩回冲'), side,
    }));
    this.through = this.createSheet(parent, 25, '出闸分流');
  }

  createSheet(parent, columns, name) {
    const rows = this.profile.length;
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(columns * rows * 3), 3)
      .setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(columns * rows * 2), triangles = [];
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const at = column * rows + row;
        // Space the material's crest at the geometric crown.
        const across = row <= 7 ? row / 7 * .676 : .676 + (row - 7) / (rows - 8) * .324;
        uv.set([column / (columns - 1), across], at * 2);
        if (column && row) triangles.push(at - rows - 1, at - rows, at - 1, at - 1, at - rows, at);
      }
    }
    geometry.setAttribute('position', positions);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(triangles);
    const material = new THREE.ShaderMaterial({
      vertexShader: brushVertex, fragmentShader: floodFragment,
      side: THREE.DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true,
      uniforms: { uAge: { value: 0 }, uOpacity: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.userData.inkIdSuppressed = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    parent.add(mesh);
    return { mesh, positions, columns };
  }

  get meshes() {
    return [this.center.mesh, ...this.reflected.map(sheet => sheet.mesh), this.through.mesh];
  }

  paint(sheet, age, opacity) {
    sheet.mesh.visible = opacity > .012;
    if (!sheet.mesh.visible) return false;
    sheet.mesh.material.uniforms.uAge.value = age;
    sheet.mesh.material.uniforms.uOpacity.value = opacity;
    return true;
  }

  update(site, age, height, from, clearance) {
    const force = age < 2.2 ? smoothstep(age, .008, .15) * (1 - smoothstep(age, 1.48, 2.2)) : 0;
    const flow = Math.sign(site.z - from.z) || Math.sign(Math.cos(from.angle)) || 1;
    const release = smoothstep(clearance, .55, 1.35);
    const flowOpen = smoothstep(clearance, .85, 1.68);
    const rebound = smoothstep(age, .32, .55) * (1 - smoothstep(age, .89, 1.49));
    this.updateReflection(site, age, height, flow, rebound);
    this.updateThrough(site, age, height, flow, flowOpen * force);
    const face = force * (1 - flowOpen * .75);
    if (!this.paint(this.center, age, face)) return;
    const positions = this.center.positions;
    const beforeImpact = smoothstep(age, .015, SEA_GATE_IMPACT);
    const incoming = Math.atan2(site.x - from.x, site.z - from.z);
    const heading = from.angle + Math.atan2(Math.sin(incoming - from.angle), Math.cos(incoming - from.angle)) * beforeImpact;
    const straighten = smoothstep(age, .20, SEA_LATCH_BREAK);
    const dx = Math.sin(heading) * (1 - straighten);
    const dz = lerp(Math.cos(heading), flow, straighten);
    const length = Math.hypot(dx, dz) || 1;
    const forwardX = dx / length, forwardZ = dz / length;
    const centerX = lerp(from.x - forwardX * .72, site.x, beforeImpact);
    const centerZ = lerp(from.z - forwardZ * .72, site.z - flow * .48, beforeImpact);
    const compression = smoothstep(age, .25, SEA_GATE_IMPACT) * (1 - release);
    const heightGain = (.53 + .80 * beforeImpact + compression * .49) * force * (1 - release * .58);
    const rows = this.profile.length;
    for (let column = 0; column < this.widthSamples; column++) {
      const cross = column * 2 / (this.widthSamples - 1) - 1;
      const round = Math.max(0, 1 - cross * cross);
      const split = .90 + .10 * Math.sin(cross * 8.65 - age * 5.4)
        + .09 * Math.cos(cross * 15.9 + age * 2.5);
      for (let row = 0; row < rows; row++) {
        const [profileZ, profileY] = this.profile[row];
        const along = profileZ * (1 - compression * .29) - cross * cross * (1.13 + compression * .38)
          + .13 * Math.sin(cross * 13.8 + age * 4) * round;
        const projectedZ = centerZ + forwardZ * along;
        const localZ = (projectedZ - site.z) * flow;
        const pinched = (1 - smoothstep(Math.abs(localZ - .18), .65, 3.2)) * straighten;
        const span = lerp(1.62, 2.90, beforeImpact);
        const width = lerp(span, 1.78, pinched);
        const x = centerX + forwardX * along + forwardZ * cross * width;
        const incomingZ = projectedZ - forwardX * cross * width;
        const z = site.z + flow * Math.min((incomingZ - site.z) * flow, -.22 + compression * .06);
        const y = height(x, z) + .02 + profileY * heightGain * round ** .67 * split;
        positions.setXYZ(column * rows + row, x, y, z);
      }
    }
    positions.needsUpdate = true;
  }

  updateReflection(site, age, height, flow, rebound) {
    const turn = smoothstep(age, .35, 1.19);
    for (const sheet of this.reflected) {
      if (!this.paint(sheet, age, rebound * .94)) continue;
      const side = sheet.side;
      const lift = (.43 + (side === 1 ? .22 : .06)) * rebound;
      const distance = Math.max(0, age - .37) * (4.3 + (side === 1 ? .44 : -.13));
      const centerX = site.x + side * (1.53 + distance * (.79 + .13 * turn));
      const centerZ = site.z - flow * (.50 + distance * (.34 + .47 * turn));
      const directionX = side * (.90 - .13 * turn);
      const directionZ = -flow * (.43 + .20 * turn);
      const rows = this.profile.length;
      for (let column = 0; column < sheet.columns; column++) {
        const cross = column * 2 / (sheet.columns - 1) - 1;
        const round = Math.max(0, 1 - cross * cross);
        for (let row = 0; row < rows; row++) {
          const [offset, elevation] = this.profile[row];
          const along = offset * (.37 + turn * .18) - cross * cross * .57;
          const across = cross * (.74 + turn * .69);
          const x = centerX + directionX * along + directionZ * across;
          const z = centerZ + directionZ * along - directionX * across;
          const y = height(x, z) + .028 + elevation * lift * round ** .53;
          sheet.positions.setXYZ(column * rows + row, x, y, z);
        }
      }
      sheet.positions.needsUpdate = true;
    }
  }

  updateThrough(site, age, height, flow, openness) {
    const sheet = this.through;
    if (!this.paint(sheet, age, openness * .97)) return;
    const travel = Math.max(0, age - .81);
    const crest = .28 + travel * (9.3 + travel * .77);
    const rows = this.profile.length;
    for (let column = 0; column < sheet.columns; column++) {
      const cross = column * 2 / (sheet.columns - 1) - 1;
      const round = Math.max(0, 1 - cross * cross);
      for (let row = 0; row < rows; row++) {
        const [offset, elevation] = this.profile[row];
        const depth = Math.max(-.09, crest + offset * 1.44 - cross * cross * 1.29);
        const fan = smoothstep(depth, .8, 8.7);
        const width = 1.64 + 2.82 * fan;
        const x = site.x + cross * width + .23 * fan * Math.sin(depth * .67);
        const z = site.z + flow * depth;
        const sides = .49 + .37 * smoothstep(Math.abs(cross), .17, .55);
        const y = height(x, z) + .026 + elevation * openness * (sides + fan * .15) * round ** .48;
        sheet.positions.setXYZ(column * rows + row, x, y, z);
      }
    }
    sheet.positions.needsUpdate = true;
  }
}

function marshChainLink(t, point) {
  return point.set(-3.64 + t * 4.99,
    .023 + t * .50 + .085 * Math.sin(Math.PI * t),
    1.17 - 1.53 * t + .12 * Math.sin(t * 7));
}

function marshStage(environment, root) {
  const shore = makeSite(root, '苇根天锁', MARSH_CHAIN);
  assembled(environment, shore, [
    ringBlock(1.28, -.32, -.30, 1.02, .63, .79, 72, -.06),
    ringBlock(1.11, .18, -.36, .54, .47, .40, 89, .12),
    ringBlock(.62, -.21, .32, .51, .33, .68, 73, .09),
  ], tone.slate, '苇汀铁链根座');
  const clasp = attach(shore, '沉在苇根外的锁扣', -2.88, .16, .91);
  clasp.rotation.set(-.96, .17, .29);
  assembled(environment, clasp, [
    new THREE.TorusGeometry(.25, .054, 6, 16).scale(1.15, .84, 1),
    box(.07, -.22, .012, .28, .17, .12, -.17),
  ], tone.iron, '铁锁搭扣');
  vermilionTag(environment, clasp, .10, -.31, -.095, .74, -.12);
  const chain = new Chain(shore, .217, 15, '半埋锈链', tone.iron);
  chain.update(marshChainLink);
  const shoal = new MarshShoal(root);
  const rings = new WashStrokes(root, 8, 12, .63, '苇汀鱼纹');
  const wake = new WashStrokes(root, 9, 16, .14, '掉头小银鱼的尾纹');
  const tailFlick = new WashStrokes(root, 5, 13, .82, '回游鱼群转身溅水');
  const headWake = new WashStrokes(root, 3, 19, .74, '领鱼探到铁链前的回水', {
    fragmentShader: lakeCrestFragment, tint: '#647869', order: 4,
  });
  const trappedWake = new WashStrokes(root, 3, 16, .65, '波纹绕过半沉锁扣', {
    fragmentShader: lakeCrestFragment, tint: '#6d7e68', order: 4,
  });
  return { root, chain, clasp, shoal, rings, wake, headWake, trappedWake, tailFlick };
}

function spentReed(environment,parent){
  const root=attach(parent,'闸口漂过的枯苇');
  root.visible=false;
  const blade=[],vein=[],faces=[],guides=[];
  const stations=[
    [-.69,-.015,.014],[-.59,-.042,.046],[-.37,-.046,.094],[-.14,-.019,.16],
    [.07,.024,.147],[.24,.080,.109],[.30,.106,.039],[.40,.145,.089],
    [.57,.192,.053],[.77,.205,.006],
  ];
  for(const [i,[z,x,span]] of stations.entries()){
    const high=Math.sin(i*.43)*.028;
    const fade=Math.sin(Math.PI*i/(stations.length-1));
    blade.push(x-span*.82,high-.019*fade,z-.007,x,high+.015*fade,z,x+span,high+.035*fade,z+.004);
    guides.push(.09+.23*fade,.04,.28,.13,.11+.27*fade,.17);
    const strip=.021*(.36+.64*fade);
    vein.push(x-strip,high+.016*fade+.008,z,x+strip,high+.016*fade+.008,z);
    if(i===stations.length-1)continue;
    const a=i*3;
    faces.push(a,a+3,a+1,a+1,a+3,a+4,a+1,a+4,a+2,a+2,a+4,a+5);
  }
  const mesh=(points,index,pigment,ink)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    if(ink)geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(ink,2));
    return environment.add(root,geometry,[0,0,0],pigment);
  };
  const leaf=mesh(blade,faces,{tint:'#a98956',amount:.78,
    profile:{...inkProfile,toneRange:[.18,.32],reserveStrength:.22}},guides);
  leaf.rotation.y=Math.PI*.5;
  const ribs=[];
  for(let i=0;i<stations.length-1;i++){
    const a=i*2;
    ribs.push(a,a+2,a+1,a+1,a+2,a+3);
  }
  mesh(vein,ribs,{tint:'#795d3d',amount:.73,profile:{...inkProfile,toneRange:[.29,.49]}}).rotation.y=Math.PI*.5;
  return root;
}

function lakeStage(environment, root) {
  const sluice = makeSite(root, '湖口旧闸', LAKE_SLUICE);
  const bases = [], caps = [], timbers = [];
  for (const [index, side] of [-1, 1].entries()) {
    const x = side * 2.40;
    const ground = environment.heightAt(LAKE_SLUICE.x + x, LAKE_SLUICE.z + .14);
    const floor = Number.isFinite(ground) ? Math.min(-.32, ground - .18) : -.36;
    bases.push(ringBlock(x, floor, .14, 1.21, .83 - floor, 1.0, 61 + index * 5, side * .09));
    bases.push(ringBlock(x - side * .06, .70, .19, .79, .78, .63, 74 + index * 5, side * -.12));
    caps.push(ringBlock(x - side * .03, 1.37, .15, 1.18, .22, .86, 83 + index * 5, side * .09));
    timbers.push(box(x - side * .14, .60, -.13, .22, 1.26, .25, side * .055));
  }
  assembled(environment, sluice, bases, tone.slate, '旧闸两座石墩');
  assembled(environment, sluice, caps, tone.edge, '闸顶缺角盖石');
  assembled(environment, sluice, timbers, tone.timber, '浸旧的湖闸槽木');
  // The worn sill lies flat under the fish. Its pale interruption marks
  // exactly which line connects the two posts under the released chain.
  const sill=attach(sluice,'两座闸墩之间的旧卧石');
  const bed=[-1.63,-.59,.45,1.49].map((x,i)=>ringBlock(x,-.34,.05+Math.sin(i*2.37)*.045,
    1.04+i*.024,.247,.62+.063*(i%2),294+i*13,(i-1.6)*.023));
  assembled(environment,sill,bed,{tint:'#8c8b75',amount:.37,
    profile:{...inkProfile,toneRange:[.08,.23],reserveStrength:.30}},'浅水下的闸底踏面');
  sill.visible=false;
  const chain = new Chain(sluice, .177, 19, '湖口挡水铁链');
  const looseChain = new Chain(sluice, .177, 8, '闸西断链');
  const tag = vermilionTag(environment, sluice, -.37, .24, -.21, .69, .10);
  const loweredGrate = attach(sluice, '天锁压下旧闸三根水栅', -.16, 0, -.096);
  loweredGrate.visible = false;
  const bars = [-.95, .08, 1.03].map((x,i)=>ringBlock(x,-.33,-.005,.21,.91+i*.045,.22,152+i*12,.035*i));
  assembled(environment,loweredGrate,bars,tone.iron,'沉到鱼群面前的旧铁栅');
  assembled(environment,loweredGrate,[
    box(.02,.23,-.045,2.28,.095,.105,.021),
    box(-.13,.33,-.25,.47,.28,.14,-.06),
  ],tone.bronze,'铁栅横撑与承锁铁楔');
  const shoal = new Shoal(root, 9, LAKE_SLUICE, 3.25, 1.55);
  const rings = new WashStrokes(root, 11, 14, .73, '闸脚回水');
  const tidePaint = { fragmentShader: tideFunnelFragment, tint: '#58685d', order: 3 };
  const eddy = new WashStrokes(root, 3, 28, .23, '湖面回涌墨纹', tidePaint);
  const sluiceCurrent = new WashStrokes(root, 3, 22, .23, '由涡心拢向闸脚的潮线', tidePaint);
  const crest = new WashStrokes(root, 3, 23, .84, '卷到铁链脚的低浪', {
    fragmentShader: lakeCrestFragment, tint: '#536d63', order: 5, upright: true,
  });
  const footSplash = new WashStrokes(root, 12, 14, .91, '旧闸脚的回浪飞白');
  const reflection = new WashStrokes(root, 9, 14, .14, '闸脚散开的波纹');
  const releaseCurrent = new WashStrokes(root, 3, 27, .53, '铁链落下后先过闸的水', {
    fragmentShader: sluiceCurrentFragment, tint: '#465d54', order: 5,
  });
  const passageWake = new WashStrokes(root, 5, 14, .46, '闸口游鱼的短波');
  const rainWakes = new WashStrokes(root, 3, 15, .68, '听雨散游的三道白尾');
  const closingWater = new WashStrokes(root, 3, 33, .31, '闸前回卷的湖水', {
    fragmentShader: sluiceCurrentFragment, tint: '#576a61', order: 3,
  });
  const openingWater = new WashStrokes(root, 3, 33, .47, '闸下贯通两侧的湖水', {
    fragmentShader: sluiceCurrentFragment, tint: '#4e7166', order: 3,
  });
  const floatingLeaves = attach(sluice, '随闸口水势转向的荷叶');
  floatingLeaves.visible = false;
  const reedLeaf=spentReed(environment,sluice);
  for (const [i, radius] of [.40, .30, .48].entries()) {
    const leaf = environment.add(floatingLeaves, lotusLeaf(radius, 0, 49 + i * 13), [0, 0, 0], {
      tint: '#536e5b', amount: .86, profile: { ...inkProfile, toneRange: [.33, .57], reserveStrength: .34 },
    });
    leaf.name = '水上残荷';
  }
  return { root, chain, looseChain, tag, loweredGrate, shoal, rings, eddy, sluiceCurrent, crest, footSplash, reflection,
    releaseCurrent, passageWake, rainWakes, closingWater, openingWater, floatingLeaves, reedLeaf, sill };
}

function drawLakeEndingCurrent(view, time, age, opened, closed, waterY) {
  const rush = smoothstep(age, .02, .71);
  const turn = smoothstep(age, .65, 1.99);
  const slack = smoothstep(age, 1.76, 2.91);
  const reversal = smoothstep(age, .22, .66) * (1 - smoothstep(age, 2.29, 3.25));
  view.closingWater.draw(time, closed ? reversal * .94 : 0, (strip, t, point) => {
    const row = strip - 1;
    const lobe = Math.sin(Math.PI * t);
    const spread = lerp(2.23, 3.62, turn) + row * .22;
    const x = LAKE_SLUICE.x + spread * (t * 2 - 1) + .56 * turn * lobe;
    const z = LAKE_SLUICE.z - 2.93 + 2.73 * rush - turn * (1.56 + 1.44 * slack)
      - (1 - lobe) * (.77 + .53 * turn) - row * (.21 + .34 * turn);
    return point.set(x, waterY + .039 + strip * .008, z,
      (.15 + .26 * lobe + .06 * turn) * (strip === 1 ? 1 : .63));
  });
  const spill = smoothstep(age, LAKE_CHAIN_PULL - .015, LAKE_CHAIN_PULL + .36)
    * (1 - smoothstep(age, 3.13, 3.78));
  view.openingWater.draw(time, opened ? spill * .97 : 0, (strip, t, point) => {
    const row = strip - 1;
    const nose = Math.max(0, age - LAKE_CHAIN_PULL);
    const leaf=lakeReedCourse(age,view.shoal.wakePoint);
    const head = Math.min(7.1, Math.max(.36+3.91*nose,leaf.z-LAKE_SLUICE.z+.30));
    const run = lerp(-3.16 - .23 * strip, head - .31 * Math.abs(row), t);
    const fan = smoothstep(run, .18, 5.9);
    const aimed=smoothstep(run,-1.28,head);
    const x = lerp(LAKE_SLUICE.x-.22,leaf.x,aimed)+row*(.41+fan*.64)
      + .09*Math.sin(run*2.22+strip);
    const z = LAKE_SLUICE.z + run;
    return point.set(x, waterY + .037 + strip * .008, z,
      (.26 + .29 * fan) * (strip === 1 ? 1.33 : .62));
  });
  view.floatingLeaves.visible = closed;
  if(view.reedLeaf){
    view.reedLeaf.visible=opened;
    if(opened){
      const before=lakeReedCourse(age-.05,view.shoal.wakePoint);
      const current=lakeReedCourse(age,view.shoal.wakeTangent);
      const drift=smoothstep(age,LAKE_CURRENT_START,LAKE_CURRENT_START+.55);
      view.reedLeaf.position.set(current.x-LAKE_SLUICE.x,current.y+waterY,current.z-LAKE_SLUICE.z);
      const course=Math.atan2(current.x-before.x,current.z-before.z);
      view.reedLeaf.rotation.set(.07*Math.sin(age*6.1),lerp(-.94,course-Math.PI*.5,drift),.08*Math.sin(age*8.2));
    }
  }
  if (!closed) return;
  for (const [i, leaf] of view.floatingLeaves.children.entries()) {
    const side = i === 0 ? -1 : 1;
    const initialX = [-1.40, 1.10, 1.86][i];
    const initialZ = [-1.78, -2.38, -3.06][i];
    const late = smoothstep(age, .78 + i * .09, 2.45 + i * .17);
    const x = initialX + side * (.76 + .13 * i) * late + .27 * slack;
    const z = initialZ + rush * (.99 + .15 * i) - late * (1.28 + .20 * i) - .56 * slack;
    const lift = .17 * Math.sin(Math.PI * late);
    leaf.position.set(x, waterY + .126 + lift, z);
    leaf.rotation.set(.056 * Math.sin(age * 4.1 + i) + lift * .44,
      i * 2.33 + side * 1.74 * late,
      .064 * Math.sin(age * 3.1 + i * 1.89));
  }
}

function seaStage(environment, root) {
  const sluice = makeSite(root, '沧溟海闸', ENDING_ROUTE_SITES.sea);
  const bases = [], caps = [], timber = [];
  for (const [index, side] of [-1, 1].entries()) {
    const x = side * 2.71, z = .15 + index * .36;
    // Offset stone braces read as part of a reef, with a break below the tide.
    bases.push(ringBlock(x + side * .46, -.84, z + .24, 2.16, 1.21, 2.60, 49 + index * 11, side * .07));
    bases.push(ringBlock(x, -.11, z, 1.22, 2.77, 1.15, 88 + index * 11, side * -.16));
    bases.push(ringBlock(x + side * .82, -.25, z + .47, 1.05, 1.77, 1.17, 81 + index * 13, side * -.16));
    caps.push(ringBlock(x - side * .14, 2.43, z, 1.48, .39, 1.34, 92 + index * 9, side * .10));
    timber.push(box(x - side * .40, 1.09, z - .45, .23, 2.45, .24, side * .034));
  }
  assembled(environment, sluice, bases, tone.slate, '迎潮石墩');
  assembled(environment, sluice, caps, tone.edge, '海闸顶石');
  assembled(environment, sluice, timber, tone.timber, '拉闸导轨');
  const grate = attach(sluice, '拔升海闸栅', 0, 0, .18);
  const teeth = [];
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * .57;
    const height = 1.55 + .13 * hash(i * 7.43);
    const tooth = attach(grate, '闸齿', x, .43);
    assembled(environment, tooth, [
      ringBlock(0, -1.31, 0, .30 + .035 * hash(i * 4.1), height, .31, 189 + i * 9, .045 * (i % 3 - 1)),
    ], tone.timber, '旧木');
    teeth.push(tooth);
  }
  assembled(environment, grate, [box(0, .47, -.13, 4.64, .22, .22, -.015)], tone.timber, '闸栅上梁');
  const brace = attach(grate, '闸栅底梁', -.02, -.39, .06);
  assembled(environment, brace, [box(0, 0, 0, 4.54, .15, .19, .03)], tone.timber, '断蚀底梁');
  const catchBolt = attach(sluice, '海闸底下的铁闩', 1.70, .40, -.31);
  const latchHook = attach(grate, '咬住铁闩的木箍', 1.57, .27, -.30);
  assembled(environment, latchHook, [
    ringBlock(0, -.25, 0, .47, .51, .34, 103, .07),
    box(.16, -.06, -.175, .46, .16, .10, .085),
  ], tone.iron, '闩槽与包铁');
  const latchFragments = [];
  for (const side of [-1, 1]) {
    const latch = attach(catchBolt, '断闩', side * .21);
    assembled(environment, latch, [
      ringBlock(0, -.18, 0, .44, .35, .24, side * 7 + 71, side * .10),
      box(side * .21, -.04, -.07, .49, .17, .19, side * .15),
    ], tone.iron, '锁铁');
    latchFragments.push(latch);
  }
  assembled(environment, sluice, [
    ringBlock(2.39, .10, -.29, .37, .48, .30, 49, -.10),
    new THREE.TorusGeometry(.24, .058, 6, 16).translate(2.38, .38, -.44),
  ], tone.bronze, '埋入迎潮石的锁环');
  const latchTrace = new WashStrokes(root, 16, 8, .95, '断闩与木屑');
  const thrust = new WashStrokes(root, 13, 18, .92, '由蛟首推出的潮锋');
  const tag = vermilionTag(environment, grate, .29, .60, -.30, .78, -.10);
  const chain = new Chain(sluice, .23, 43, '海底长锁');
  const foam = new WashStrokes(root, 17, 17, 1, '逆行白浪');
  const foamShadow = new WashStrokes(root, 9, 17, .13, '逆浪墨骨');
  const tidePaint = { fragmentShader: tideFunnelFragment, tint: '#354c55', order: 4 };
  const inwardTide = new WashStrokes(root, 3, 32, 0, '盘龙拢入海潮', tidePaint);
  const guidedTide = new WashStrokes(root, 4, 26, 0, '收拢冲向闸门的潮线', tidePaint);
  const pierWake = new WashStrokes(root, 8, 23, 0, '双墩外的迎潮墨口', tidePaint);
  const spray = new WashStrokes(root, 25, 11, .94, '开闸飞白');
  const flood = new SluiceFlood(root);
  return { root, grate, teeth, brace, latchFragments, latchTrace, thrust, tag, chain, foam, foamShadow, inwardTide, guidedTide, pierWake, spray, flood };
}

function mountainStage(environment, root) {
  const site = ENDING_ROUTE_SITES.mountain;
  const crag = makeSite(root, '千山引雷链桩', site);
  const ground = Math.max(.12, environment.heightAt(site.x, site.z));
  assembled(environment, crag, [
    ringBlock(.24, ground - .30, .17, 2.78, 1.27, 2.05, 15, -.43),
    ringBlock(-.45, ground + .05, .39, 1.28, 2.42, 1.62, 48, .34),
    ringBlock(-.28, ground + .73, .04, 1.56, 2.85, 1.45, 39, .34),
    ringBlock(-.11, ground + 2.78, .02, 1.05, 1.57, .96, 93, .14),
  ], tone.slate, '江岛断脊');
  assembled(environment, crag, [
    ringBlock(.08, ground + 3.49, .04, .90, .39, .74, 82, -.08),
    ringBlock(0, ground + 3.76, 0, .57, Math.max(.82, site.y - ground - 4.10), .52, 70),
    ringBlock(0, site.y - .47, 0, .88, .28, .81, 69),
  ], tone.edge, '山腰引雷石桩');
  const contact = assembled(environment, crag, [
    new THREE.TorusGeometry(.36, .108, 8, 20).rotateY(.15).translate(0, site.y - .27, -.08),
    box(0, site.y - .43, -.035, .30, .57, .29),
  ], tone.patina, '引雷铁环');
  const strikeSeat = assembled(environment, crag, [
    new THREE.TorusGeometry(.36, .114, 8, 20).rotateY(.15).translate(0, site.y - .27, -.08),
    ringBlock(0, site.y - .67, -.04, .46, .26, .38, 157),
  ], tone.strikeSeat, '雷烧过的赭铜环座');
  strikeSeat.visible = false;
  assembled(environment, crag, [
    new THREE.TorusGeometry(.37, .032, 5, 16, Math.PI * .97).rotateZ(.74).rotateY(.15).translate(0, site.y - .27, -.177),
    box(0, site.y - .62, -.19, .35, .07, .03, .033),
  ], tone.bronze, '引雷环磨亮的铜沿');
  const tag = vermilionTag(environment, crag, 0, site.y - .77, -.31, .71, -.09);
  const chain = new Chain(crag, .225, RELAY_LINKS, '崖上紧绷的天锁', tone.patina);
  const localPaint = new THREE.Group();
  localPaint.position.set(site.x,0,site.z);
  root.add(localPaint);
  const chargeLinks = new ChargedLinks(localPaint, chain);
  const brokenLinks = relayDebris(crag,new THREE.TorusGeometry(.24,.05,6,17,Math.PI*1.11).scale(1.23,.84,1));
  const lightning = { fragmentShader: relayBoltFragment, tint: '#2b4261' };
  const downstroke = new WashStrokes(root, 3, 23, 1, '劈中铁环的雷', { ...lightning, order: 8 });
  const ringLoad = new WashStrokes(root, 5, 16, 1, '铁环聚雷', { ...lightning, order: 7 });
  const pulse = new WashStrokes(root, 5, 24, 1, '沿链反击的雷光', { ...lightning, order: 8 });
  const chargedShadow = new WashStrokes(root, 2, 31, 0, '沿链翻卷的浓墨雷脉', {
    fragmentShader: relayCurrentInk, tint: '#253341', order: 8,
  });
  const sparks = new WashStrokes(root, 16, 7, .82, '链桩雨雷飞屑');
  const cloudPaint = { fragmentShader: relayCloudFragment, upright: true };
  const cloudBack = new WashStrokes(root, 6, 18, .05, '云背浓墨', { ...cloudPaint, order: 4 });
  const cloudVeil = new WashStrokes(root, 9, 22, .93, '遮住天锁的云脚', { ...cloudPaint, order: 10 });
  const cloudSeam = new WashStrokes(root, 5, 24, 1, '断链处炸开的云缝', { ...lightning, order: 13 });
  const crackInk = new WashStrokes(root, 3, 24, 0, '断环的焦墨', {
    fragmentShader: relayCurrentInk, tint: '#3c3440', order: 12,
  });
  const lockPaint = { fragmentShader: relayMarkFragment, tint: '#40596b', order: 5 };
  const copperPaint = { fragmentShader: relayMarkFragment, tint: '#9a5e36', order: 6 };
  const fixedPaint = { fragmentShader: relayLockedFragment, tint: '#95603d', order: 6 };
  const warning = new WashStrokes(root, 7, 19, 0, '天雷落域的横向墨迹', lockPaint);
  const lockElevation = new WashStrokes(root, 4, 20, 0, '天雷落域的纵向墨迹', { ...lockPaint, upright: true });
  const fixedPerimeter = new WashStrokes(root, 1, 80, 0, '固定在铜环处的雷圈', fixedPaint);
  const fogBoundary = new RelayBoundary(root);
  const escapeWind = new WashStrokes(root, 4, 21, .11, '雷域外的疏云', {
    fragmentShader: relayCloudFragment, order: 5,
  });
  const escapeReserve = new WashStrokes(root, 3, 18, .93, '飞出雷域的云痕', {
    fragmentShader: relayCloudFragment, order: 7,
  });
  const approachTrace = new WashStrokes(root, 4, 20, 0, '铁环吸引雷丝', lockPaint);
  const copperHalo = new WashStrokes(root, 5, 20, 0, '引雷环的赭铜光', { ...copperPaint, upright: true });
  return { root, chain, chargeLinks, brokenLinks, contact, strikeSeat, tag, downstroke, ringLoad, pulse, chargedShadow, sparks, cloudBack, cloudVeil, cloudSeam, crackInk,
    warning, lockElevation, fixedPerimeter, fogBoundary, escapeWind, escapeReserve, approachTrace, copperHalo };
}

const builders = [marshStage, lakeStage, seaStage, mountainStage];
const waterLine = -.075;
const LAKE_CHAIN_PULL = 1.54;
const LAKE_FISH_FIRST = 1.61;
const LAKE_CURRENT_START = LAKE_CHAIN_PULL + .015;
const lakeImpact = { x: LAKE_SLUICE.x + 1.91, y: .20, z: LAKE_SLUICE.z - .31 };
function lakeLinkLift(age, t){
  const carried=age-.23*(1-t);
  if(carried<=0||carried>=1.45)return 0;
  const raise=smoothstep(carried,0,.105);
  const hang=1-smoothstep(carried,.165,.39);
  const knock=Math.sin((carried-.10)*18)*Math.exp(-3.75*Math.max(0,carried-.10));
  return (.55*raise*hang+.24*raise*knock)*Math.sin(t*Math.PI)**.63;
}

const ageOf = (at, time) => Number.isFinite(at) ? Math.max(0, time - at) : Infinity;

export class EndingForeshadow {
  constructor(environment, scene) {
    this.environment = environment;
    this.parent = attach(scene, '天锁伏笔');
    this.stages = new Map();
    this.events = {};
    this.shoreLook = { point: new THREE.Vector3(), strength: 0 };
    this.relayExitDirection = new THREE.Vector3();
  }

  reset() {
    this.events = {};
    this.shoreLook.strength = 0;
    this.seaGateFrom = null;
    this.seaCoilCenter = null;
    this.seaCoilTurn = 1;
    this.lakeCoilCenter = null;
    this.lakeCoilTurn = 1;
    this.relayEscape = null;
    this.relayExit = null;
    this.relayPerimeter = null;
    for (const view of this.stages.values()) {
      view.root.visible = false;
      view.shoal?.reset?.();
    }
  }

  event(event, time) {
    if (event.type !== 'endingRoute') return;
    this.events[event.kind] = time;
    if (event.kind === 'gate-open') this.seaGateFrom = event.from;
    if (event.kind === 'relay-lock') this.relayExit = null;
    if (event.kind === 'relay-escape') {
      const from = event.from;
      this.relayExit = from;
      this.relayExitDirection.set(from.x - event.x, from.y - event.y, from.z - event.z).normalize();
    }
    if (event.kind === 'relay-strike') this.relayEscape = event.from;
  }

  prepare(stage, ink) {
    if (this.stages.has(stage)) return this.stages.get(stage);
    const root = attach(this.parent, '水路' + (stage + 1));
    const view = builders[stage](this.environment, root);
    // The opaque, mineral-tinted props belong to the existing ink pass.
    // Brush ribbons write directly into the ink buffer and keep their materials.
    const effects = Object.values(view).flatMap(value => {
      if (value instanceof SluiceFlood) return value.meshes;
      return value instanceof WashStrokes || value instanceof RelayBoundary ? [value.mesh] : value instanceof ChargedLinks ? [value.mesh.parent] : [];
    });
    const owners = effects.map(mesh => mesh.parent);
    for (const mesh of effects) mesh.removeFromParent();
    ink.register(root, { occlusionProxy: false });
    for (const record of ink.records) {
      if (record.mesh.isInstancedMesh && view.root.getObjectById(record.mesh.id)) supportInstancing(record.material);
    }
    effects.forEach((mesh,i)=>owners[i].add(mesh));
    this.stages.set(stage, view);
    return view;
  }

  update(stage, ink, game, time, { active = true, epilogue = null, epilogueAge = 0, water } = {}) {
    this.shoreLook.strength = 0;
    this.shoreLook.lake = stage === 1;
    this.shoreLook.marsh = stage === 0;
    const view = builders[stage] && active ? this.prepare(stage, ink) : null;
    for (const candidate of this.stages.values()) candidate.root.visible = candidate === view;
    if (view) {
      const route = game.endingRoute ?? {};
      if (stage === 0) this.updateMarsh(view, time, game, Boolean(epilogue));
      else if (stage === 1) this.updateLake(view, time, game, epilogue === 'hidden' ? epilogueAge : null,
        epilogue ? epilogueAge : null, epilogue, water);
      else if (stage === 2) this.updateSea(view, time, route, game, water);
      else this.updateMountain(view, time, route, game);
    }
  }

  updateMarsh(view, time, game, epilogue) {
    const tip = MARSH_CHAIN.tip;
    const near = epilogue || Math.hypot(game.p.x - tip.x, game.p.z - tip.z) < 6.75;
    const seen = game.endingRoute?.marshSeenAt != null;
    const eventAge = epilogue ? Infinity : ageOf(this.events['chain-seen'], time);
    const shoal = view.shoal;
    shoal.update(time, near, epilogue || seen, eventAge);
    const phase = shoal.phase;
    const lead = shoal.leader;
    const close = smoothstep(phase,.16,.24) * (1 - smoothstep(phase,.38,.47));
    const until = 1 - smoothstep(eventAge,2.45,3.48);
    if (near && seen && !epilogue) {
      const look = this.shoreLook;
      look.point.set(lerp(tip.x, lead.x, .57), .24, lerp(tip.z, lead.z, .57));
      look.strength = smoothstep(eventAge,.035,.46) * until;
    }
    const ripple = near && seen ? close * until : 0;
    view.headWake.draw(time,ripple*.88,(strip,t,p)=>{
      const aim=shoal.leaderAim;
      const width=strip===0?.66:.48;
      const across=(t-.5)*2*width;
      const bow=Math.sin(t*Math.PI)*(.38-.09*strip)-.11*strip;
      return p.set(lead.x+across*aim.z+aim.x*bow,waterLine+.031+.023*Math.sin(t*Math.PI),
        lead.z-across*aim.x+aim.z*bow,.026+.045*Math.sin(t*Math.PI));
    });
    const knock = near && seen ? smoothstep(phase,.248,.315)*(1-smoothstep(phase,.389,.54))*until : 0;
    view.trappedWake.draw(time,knock*.96,(strip,t,p)=>{
      const a=(t-.5)*1.54-strip*.17;
      const radius=.39+strip*.14+Math.max(0,phase-.270)*(3.7+strip*.16);
      return p.set(tip.x-.08+Math.cos(a+1.92)*radius,waterLine+.037,
        tip.z-.13+Math.sin(a+1.92)*radius,.028+.026*Math.sin(t*Math.PI));
    });
    const tug = knock>0 ? Math.sin((phase-.275)*52)*knock*.055 : 0;
    if(tug!==0||view.chainTug){
      view.chain.update((t,point)=>{
        marshChainLink(t,point);
        const spring=(1-t)**1.62*tug;
        point.y+=spring;
        point.z-=.72*spring;
        return point;
      });
      view.clasp.position.y=.16+tug*.62;
      view.clasp.rotation.z=.29+tug*.77;
    }
    view.chainTug=tug;
    view.wake.draw(time, .63, (strip, t, p) => {
      const side = strip % 2 ? 1 : -1;
      const head = view.shoal.position(strip, view.shoal.phase - (.029 + (1 - t) * .095), p);
      const aim = view.shoal.aim;
      const spread = side * (.067 + (1 - t) * .24);
      return p.set(head.x + aim.z * spread, waterLine + .027, head.z - aim.x * spread, .032 + .069 * (1 - t));
    });
    const sweep = smoothstep(phase, .34, .42) * (1 - smoothstep(phase, .54, .66));
    view.tailFlick.draw(time, sweep * .73, (strip, t, p) => {
      const head = view.shoal.position(strip * 2, view.shoal.phase - .055, p);
      const aim = view.shoal.aim, spread = (t - .5) * .82;
      const x = head.x + aim.z * spread - aim.x * (.17 + Math.sin(t * Math.PI) * .23);
      const z = head.z - aim.x * spread - aim.z * (.17 + Math.sin(t * Math.PI) * .23);
      return p.set(x, waterLine + .062 + Math.sin(t * Math.PI) * .095, z, .065 + strip * .008);
    });
    view.rings.draw(time, .22, (strip, t, p) => {
      const cycle = (time * .40 + strip * .12) % 1;
      const a = (t - .5) * 1.68 + strip * .73;
      const radius = .25 + .53 * cycle;
      return p.set(
        MARSH_CHAIN.x - 2.63 + Math.cos(a) * radius + (strip % 3 - 1) * .65,
        waterLine,
        MARSH_CHAIN.z - 1.66 + Math.sin(a) * radius - (strip % 4) * .59,
        .025,
      );
    });
  }

  updateLake(view, time, game, release, epilogueAge, ending, water) {
    const epilogue = epilogueAge !== null;
    const rained = ending === 'ordained';
    const rattle = ageOf(this.events['chain-rattle'], time);
    const waveHit = LAKE_WAVE_HIT;
    const shiverAge = epilogue ? Infinity : rattle - waveHit;
    const shiver = lakeLinkLift(shiverAge,.43);
    const freed = release !== null;
    // The stone remains below still water until the fallen chain draws
    // the first shallow sheet off its upper edge.
    const sluiceDraw=freed?smoothstep(release,.71,1.34):0;
    view.sill.visible=sluiceDraw>0;
    view.sill.position.y=lerp(-.16,0,sluiceDraw);
    const opening = freed ? smoothstep(release, LAKE_CHAIN_START, LAKE_CHAIN_PULL) : 0;
    const split = opening > 0;
    const sealLake = ending==='locked';
    view.loweredGrate.visible=sealLake;
    if(sealLake){
      const closure=smoothstep(epilogueAge,.27,.81);
      const ring=Math.max(0,epilogueAge-.78);
      const recoil=Math.sin(ring*28)*Math.exp(-ring*7.5);
      view.loweredGrate.position.y=.25-.38*closure+.027*recoil;
      view.loweredGrate.rotation.x=-.21*(1-closure)+.07*recoil;
    }
    view.looseChain.mesh.visible = split;
    if (split) {
      const snap = Math.sin(Math.PI * opening);
      const hanging = (side, t, point) => {
        const sag = Math.sin(t * Math.PI * .5);
        point.set(
          side * (2.34 - t * lerp(2.34, 1.10, opening)),
          .61 - sag * lerp(.46, .78, smoothstep(opening, .34, 1)) + snap * t * .16,
          -.15 + lerp(sag * .16, t ** 1.46 * (.72 - .20 * side), opening),
        );
      };
      view.chain.update((t, point) => hanging(1, t, point), 10, snap * 2.5);
      view.looseChain.update((t, point) => hanging(-1, t, point), 9, snap * 2.5);
      hanging(1, .92, view.tag.position);
      view.tag.position.z -= .20;
      view.tag.position.y += .095;
      view.tag.rotation.set(-.49 * opening, 0, lerp(.50, 1.18, opening));
    } else {
      view.chain.update((t, point) => {
        const slack = Math.sin(Math.PI * t);
        const lift = lakeLinkLift(shiverAge,t);
        return point.set(-2.34 + t * 4.68, .61 - slack * .46 + lift, -.15 + slack * .16 + lift * 1.18);
      }, view.chain.capacity, rattle < 1.8 ? rattle * 7 : 0);
      view.tag.position.set(freed ? .18 : -.37, .24 + shiver, -.21 + shiver * 1.18);
      view.tag.rotation.set(-shiver * 2.0, 0, freed ? .50 : .10 + shiver * 2.5);
    }
    view.shoal.update(time, release, epilogueAge, shiverAge,rained);
    drawLakeEndingCurrent(view, time, epilogueAge ?? 0, freed, ending === 'locked',
      water?.position.y ?? waterLine);
    const rainWake=rained?smoothstep(epilogueAge,.65,.98)*(1-smoothstep(epilogueAge,1.67,2.22)):0;
    view.rainWakes.draw(time,rainWake*.72,(strip,t,point)=>{
      const route=view.shoal.passage[[1,0,5][strip]];
      const lead=lakeRainFish(epilogueAge-.10-t*.33,route,view.shoal.wakePoint);
      const peel=Math.sin(Math.PI*t);
      return point.set(LAKE_SLUICE.x+lead.x-.30,waterLine+.026,
        LAKE_SLUICE.z+lead.z+(strip===0?-.18:.15)*peel,.019+.069*peel);
    });
    const currentAge = freed ? release - LAKE_CURRENT_START : -1;
    const clearFlow = smoothstep(currentAge, 0, .145) * (1 - smoothstep(currentAge, .79, 1.12));
    view.releaseCurrent.draw(time, clearFlow * .93, (strip,t,point) => {
      // A first small current sweeps through the gap before the lead fish.
      // The wake after it is still painted from the fish's actual route.
      const lead = LAKE_FISH_FIRST + Math.max(0,currentAge) * 1.62 + .185;
      const at = lead - (1-t)*(.60+.12*strip) - .068*strip;
      const course = lakeFishCourse(at,view.shoal.wakePoint);
      const normal = lakeFishCourse(at+.035,view.shoal.wakeTangent).sub(course);
      if(normal.lengthSq()<.00001)normal.set(0,0,1);
      else normal.normalize();
      const bow = Math.sin(Math.PI*t);
      const spread = (strip-1)*(.145+.48*bow);
      return point.set(course.x+normal.z*spread,waterLine+.042+bow*.016,
        course.z-normal.x*spread,(.046+.216*bow)*(strip===1?1:.63));
    });
    const swim = freed ? smoothstep(release, LAKE_FISH_FIRST+.12, LAKE_FISH_FIRST+.53) : 0;
    view.passageWake.draw(time, swim * .84, (strip,t,point) => {
      const age = release - .025 - t*(strip===0?.53:strip<=2?.76:.95)-(strip>2?.18:0);
      const wake = lakeFishCourse(age,view.shoal.wakePoint);
      const normal = lakeFishCourse(age+.023,view.shoal.wakeTangent).sub(wake).normalize();
      const side = strip===0?0:strip%2?-1:1;
      const trail = side*(.082 + .42*t + (strip>2 ? .30*t : 0)) + .08*Math.sin(t*9.4+age*3.1);
      return point.set(wake.x+normal.z*trail, waterLine+.023, wake.z-normal.x*trail,
        (.017+.053*t)*(1-.66*strip/5));
    });
    const coil = LAKE_SLUICE.coil;
    const pose = game.pose;
    const near = pose?.center ? Math.hypot(pose.center.x - coil.x, pose.center.z - coil.z) : Infinity;
    const charge = epilogue ? 0 : smoothstep(pose?.wind ?? 0, .21, .64) * (1 - smoothstep(near, 4.3, 7.9));
    if (charge > .04 && (rattle === Infinity || rattle < .12)) {
      this.lakeCoilCenter = { x: lerp(coil.x, pose.center.x, .58), z: lerp(coil.z, pose.center.z, .58) };
      this.lakeCoilTurn = Math.sign(game.motion?.bend) || this.lakeCoilTurn || 1;
    }
    const center = this.lakeCoilCenter ?? coil;
    if (!epilogue && rattle < 2.68) {
      const look = this.shoreLook;
      const incoming = smoothstep(rattle, .07, waveHit);
      look.point.set(lerp(center.x, lakeImpact.x, lerp(.29, .72, incoming)), lakeImpact.y + .26,
        lerp(center.z, lakeImpact.z, lerp(.31, .79, incoming)));
      look.strength = smoothstep(rattle, .02, .49) * (1 - smoothstep(rattle, 1.45, 2.68));
    }
    const turn = this.lakeCoilTurn || 1;
    const surge = epilogue ? 0 : 1 - smoothstep(rattle, .56, 2.24);
    const eddyLoad = Math.max(charge, surge * .87);
    view.eddy.draw(time, epilogue ? .12 : .32 + eddyLoad * .51, (strip, t, p) => {
      const a = turn * (time * (1.24 + eddyLoad * .34) + strip * 2.07 + t * (1.7 + strip * .25));
      const radius = lerp(2.95 + eddyLoad * .93, .87 + strip * .12, t ** .86);
      const x = lerp(coil.x, center.x, eddyLoad) + radius * Math.cos(a);
      const z = lerp(coil.z, center.z, eddyLoad) + radius * Math.sin(a);
      return p.set(x, waterLine + .023 + eddyLoad * .036, z, (.12 + eddyLoad * .29) * (.32 + .68 * Math.sin(t * Math.PI)));
    });
    const contactX = lakeImpact.x, contactZ = lakeImpact.z;
    const currentX = center.x + .58, currentZ = center.z - .56;
    const dx = contactX - currentX, dz = contactZ - currentZ;
    const inv = 1 / Math.max(.001, Math.hypot(dx, dz));
    const waveTravel = smoothstep(rattle, .075, waveHit);
    const incoming = epilogue ? 0 : smoothstep(rattle, .02, .22) * (1 - smoothstep(rattle, waveHit, waveHit + .29));
    view.sluiceCurrent.draw(time, incoming * .68, (strip, t, p) => {
      const side = strip === 0 ? 0 : (strip - 1.5) * 2;
      const advance = lerp(.06, waveTravel, t);
      const aside = side * (.91 - advance * .71) + Math.sin(t * 4.1 + side * .8) * (1 - advance) * .39;
      return p.set(lerp(currentX,contactX,advance)+dz*inv*aside,waterLine+.048,
        lerp(currentZ,contactZ,advance)-dx*inv*aside,(strip===0?.38:.22)*Math.sin(Math.PI*t)**.55);
    });
    view.crest.draw(time, incoming * .96, (strip, t, p) => {
      const distance = Math.sin(Math.PI*t);
      const width = lerp(1.34,.65,waveTravel) - strip * .10;
      const across = (t-.5)*2*width + .11*Math.sin(t*11 + strip*2.1);
      const advance = waveTravel-.072*strip-.14*(1-distance);
      const crest = .10 + distance**1.7*(.23+.52*waveTravel)*(1-.24*strip);
      return p.set(lerp(currentX,contactX,advance)+dz*inv*across,waterLine+crest,
        lerp(currentZ,contactZ,advance)-dx*inv*across,(.065+.19*distance)*(1-.25*strip));
    });
    const recoil = epilogue ? 0 : smoothstep(shiverAge,0,.085) * (1 - smoothstep(shiverAge,.47,1.78));
    view.footSplash.draw(time, recoil * .98, (strip, t, p) => {
      const step = Math.max(0, shiverAge - .024 * strip - (1 - t) * .19);
      const lateral = (hash(strip * 10.9) - .48) * 3.6;
      const y = waterLine + Math.max(0, (1.5 + 2.9 * hash(strip * 3.2)) * step - step * step * 3.4);
      return p.set(contactX + step * lateral, y + .065, contactZ - step * (1.4 + hash(strip * 7.7) * 2.7), .034 + .046 * hash(strip * 8.5));
    });
    const settling = freed ? Math.max(0, release - 1.29) : shiverAge;
    const ripple = freed
      ? smoothstep(release, 1.29, 1.51) * (1 - smoothstep(release, 2.02, 2.76))
      : recoil;
    view.reflection.draw(time, ripple * (freed ? .86 : .75), (strip, t, p) => {
      const radius = .22 + Math.max(0, settling - strip * (freed ? .036 : .068)) * 2.62;
      const angle = Math.PI * (1.01 + .91 * t) + .12 * Math.sin(strip + t * 8);
      const x = (freed ? LAKE_SLUICE.x + 1.23 : contactX) + Math.cos(angle) * radius + .09 * strip;
      const z = (freed ? LAKE_SLUICE.z + .27 : contactZ) + Math.sin(angle) * radius * .77;
      return p.set(x, waterLine + .024, z, .035 + .029 * hash(strip * 17.8));
    });
    view.rings.draw(time, freed ? .16 : .27 + Math.max(0, 1 - rattle) * .30, (strip, t, p) => {
      const cycle = (time * .48 + strip * .14) % 1;
      const a = (t - .5) * (1.45 + hash(strip + 7) * .85) + strip * .78;
      const radius = .42 + cycle * 1.33;
      return p.set(
        LAKE_SLUICE.x + (strip % 2 ? -.93 : 1.17) + Math.cos(a) * radius,
        waterLine,
        LAKE_SLUICE.z - 1.06 - cycle * .37 + Math.sin(a) * radius,
        .034 + cycle * .028,
      );
    });
  }

  updateSea(view, time, route, game, water) {
    const site = ENDING_ROUTE_SITES.sea;
    const opened = route.gateAt != null;
    const gateAge = ageOf(this.events['gate-open'], time);
    const source = this.seaGateFrom ?? { x: site.coil.x, z: site.z - 3.9, angle: 0 };
    const approachAngle = Math.atan2(site.x - source.x, site.z - source.z);
    const from = { ...source, angle: source.angle ?? approachAngle };
    const impact = smoothstep(gateAge, SEA_GATE_IMPACT - .055, SEA_GATE_IMPACT + .056)
      * (1 - smoothstep(gateAge, SEA_LATCH_BREAK - .025, .64));
    const catchRelease = smoothstep(gateAge, SEA_LATCH_BREAK, .62) * (1 - smoothstep(gateAge, .73, .97));
    const opening = opened ? smoothstep(gateAge, SEA_CHAIN_TAUT, 1.07) : 0;
    const settled = opened ? smoothstep(gateAge, 1.11, 2.2) : 0;
    const snag = gateAge > SEA_CHAIN_TAUT && gateAge < 1.8
      ? .14 * Math.sin((gateAge - SEA_CHAIN_TAUT) * 25) * (1 - settled) * opening : 0;
    const lift = opening * 3.18 + (opening - settled) * .35;
    const flow = Math.sign(site.z - from.z) || Math.sign(Math.cos(from.angle)) || 1;
    view.grate.position.y = lift + snag + catchRelease * .33;
    view.grate.position.z = .18 + flow * (impact * .21 + catchRelease * .31);
    view.grate.rotation.x = -flow * (impact * .14 + catchRelease * .28);
    view.grate.rotation.z = -opening * .10 + snag * .11 - impact * .046 + catchRelease * .14;
    view.brace.position.z = .06 + impact * .26;
    view.brace.rotation.y = impact * .12;
    view.teeth.forEach((tooth, i) => {
      const bend = Math.max(0, 1 - ((i - 3.8) / 4.1) ** 2);
      tooth.rotation.x = -flow * impact * (.065 + bend * .31);
      tooth.rotation.z = impact * .027 * (i - 3.5);
    });
    view.tag.rotation.z = -.10 + snag * 2.8 + impact * .14;
    view.tag.rotation.x = -impact * .39 + snag * 1.8;
    // The tide pushes the released grate into a short hinge swing before
    // the underwater length straightens and draws it up by its center.
    const taut = smoothstep(gateAge, SEA_CHAIN_TAUT, .99);
    const links = 14 + Math.round(taut * 29);
    view.chain.update((t, point) => point.set(
      .37 + Math.sin(t * 2.95) * (1.66 - taut * 1.20) - t * taut * 1.98,
      .42 + view.grate.position.y * (1 - t * (1 - taut))
        + lerp(-1.08 * Math.sin(t * Math.PI * .75), t * 15.4 + snag * 2 * t, taut),
      .02 + flow * (impact * .23 + catchRelease * .29) * (1 - t) + t * (5.42 + taut * 7.3)
        + taut * Math.sin(t * 2.7) * 1.92,
    ), links, taut * 4,.94*taut);
    const latchAge = Math.max(0, gateAge - SEA_LATCH_BREAK);
    for (const [i, latch] of view.latchFragments.entries()) {
      const side = i === 0 ? -1 : 1;
      const boundAge = Math.min(1.2, latchAge);
      latch.visible = latchAge < .77;
      latch.position.set(side * (.21 + boundAge * (i ? 1.3 : 3.7)),
        impact * .09 + (i ? 1.0 : 2.8) * boundAge - boundAge * boundAge * 4.9,
        flow * impact * .14 - flow * (.80 + i * 1.11) * boundAge);
      latch.rotation.set(boundAge * 5.9, side * boundAge * 8, side * boundAge * 5.1);
    }

    const charge = clamp(route.seaCoil ?? 0, 0, 1);
    const ready = route.seaReady;
    const influx = opened && gateAge < 1.8 ? smoothstep(gateAge, 0, .22) * (1 - settled) : 0;
    const height = (x, z) => water?.userData.sampleSurface?.(x, z, time, game.p) ?? waterLine;
    const coilCenter = game.pose?.center;
    if (!opened && !ready && charge > 0 && coilCenter) {
      this.seaCoilCenter = { x: lerp(site.coil.x, coilCenter.x, .54), z: lerp(site.coil.z, coilCenter.z, .54) };
      this.seaCoilTurn = Math.sign(game.motion?.bend) || this.seaCoilTurn || 1;
    }
    if (!opened && !ready && charge <= 0) this.seaCoilCenter = null;
    const center = this.seaCoilCenter ?? site.coil;
    const turn = this.seaCoilTurn || 1;
    const funnel = opened ? 1 - smoothstep(gateAge, .04, .25) : ready ? 1 : charge;
    const orbitPressure = funnel * (ready ? .73 : .95);
    view.inwardTide.draw(time, orbitPressure, (strip, t, p) => {
      const a = turn * (time * (ready ? 1.06 : 1.65) + 2.09 * strip + t * (2.33 + .16 * strip));
      const r = lerp(4.36 - funnel * .33, 1.01 + .12 * strip, t ** .81)
        + .12 * Math.sin(a * 2 + strip);
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const bow = Math.sin(t * Math.PI) ** .76;
      return p.set(x, height(x, z) + .103 + funnel * .075 * bow, z,
        (.22 + .43 * funnel) * (.38 + .62 * bow));
    });
    const approach = ready ? seaGateApproach(game.p) : null;
    const aiming = approach?.inReach && game.p.y < 2.3;
    const facing = approach?.aligned && game.p.y < 2.3;
    const lead = ready || opened ? funnel : smoothstep(charge, .52, .97) * .48;
    const flowFrom = ready ? game.p : center;
    view.guidedTide.draw(time, lead * (facing ? 1 : .66), (strip, t, p) => {
      const dx = site.x - flowFrom.x, dz = site.z - flowFrom.z;
      const inv = 1 / Math.max(.01, Math.hypot(dx, dz));
      const side = strip % 2 ? 1 : -1;
      const strand = Math.floor(strip / 2);
      const step = lerp(.11, .98, t);
      const swell = Math.sin(t * Math.PI);
      const distance = (lerp(facing ? 1.85 : 2.72, .82, t ** .63) + strand * .53) * side
        + .19 * Math.sin(t * 10.0 - time * 3.1 + strip) * swell;
      const x = lerp(flowFrom.x, site.x, step) + dz * inv * distance;
      const z = lerp(flowFrom.z, site.z, step) - dx * inv * distance;
      return p.set(x, height(x, z) + .135 + .10 * swell, z,
        (strand ? .29 : .62) * (.53 + .47 * swell) * (.80 + .20 * lead) * (aiming ? 1.32 : 1));
    });
    const gateWater = !opened ? (aiming ? .89 : ready ? .54 : .32) : (1 - smoothstep(gateAge, 1.32, 2.04)) * .59;
    view.pierWake.draw(time, gateWater, (strip, t, p) => {
      const side = strip % 2 ? -1 : 1;
      const rank = Math.floor(strip / 2);
      const entrySide = Math.sign(flowFrom.z - site.z) || -1;
      const toward = .56 + .44 * t;
      const radius = (1.23 + rank * .24) * (.87 + .13 * Math.sin(time * 2.5 + strip * 1.9));
      const angle = (t - .5) * (1.48 + rank * .34) + side * .83;
      const x = site.x + side * (2.51 + Math.cos(angle) * radius * .44 - .49 * toward);
      const z = site.z + entrySide * (.18 + (1 - toward) * 1.1 + radius * Math.sin(angle) * .43);
      const width = (.23 - rank * .025) * (aiming ? 1.28 : 1) * (.55 + .45 * Math.sin(t * Math.PI));
      return p.set(x, height(x, z) + .082 + width * .16, z, width);
    });
    const clearHeight = Math.max(0, view.grate.position.y - .89);
    view.flood.update(site, gateAge, height, from, clearHeight);
    view.thrust.draw(time, gateAge < .71 ? smoothstep(gateAge, 0, .15) * (1 - smoothstep(gateAge, .46, .71)) * .94 : 0, (strip, t, p) => {
      const phase = smoothstep(gateAge, .025, SEA_GATE_IMPACT);
      const leadingX = lerp(from.x, site.x, phase);
      const leadingZ = lerp(from.z, site.z - flow * .40, phase);
      const row = (strip % 7 - 3) * .27;
      const side = Math.sign(row);
      const dx = Math.sin(approachAngle), dz = Math.cos(approachAngle);
      const length = 2.7 + phase * 2.5 + hash(strip * 8.3) * 1.3;
      const trail = (1 - t) * length + .17 * Math.sin(strip * 3.1);
      const offset = row + side * (1 - t) * (.38 + phase * .72);
      const x = leadingX - dx * trail + dz * offset;
      const z = leadingZ - dz * trail - dx * offset;
      const rise = (.19 + phase * .66) * smoothstep(t, .63, 1) * (1 - Math.abs(row) * .49);
      return p.set(x, height(x, z) + .07 + rise, z, .034 + phase * .034 + hash(strip * 3.7) * .034);
    });
    view.latchTrace.draw(time, latchAge > 0 && latchAge < .63 ? (1 - smoothstep(latchAge, .13, .63)) * .90 : 0, (strip, t, p) => {
      const age = Math.max(0, latchAge - hash(strip * 8.51) * .06 - (1 - t) * .11);
      const x = site.x + 1.82 + (hash(strip * 11.79) - .72) * age * 6.3;
      const y = .43 + age * (2.15 + hash(strip * 7.25) * 3.3) - age * age * 5.8;
      const z = site.z - .27 - (hash(strip * 12.4) - .43) * age * 5.7;
      return p.set(x, Math.max(height(x, z), y), z, .018 + hash(strip * 6.6) * .029);
    });
    view.spray.draw(time, gateAge < 1.55 ? (1 - smoothstep(gateAge, .48, 1.55)) * .84 : 0, (strip, t, p) => {
      const side = strip % 2 ? -1 : 1;
      const start = side * (1.42 + .81 * hash(strip * 12.73));
      const age = Math.max(0, gateAge - SEA_GATE_IMPACT - hash(strip * 5.3) * .26 - (1 - t) * .17);
      const drift = side * (1.48 + hash(strip * 8.11) * 3.2);
      const x = site.x + start + drift * age;
      const rebounds = strip % 4 < 2;
      const z = site.z + (rebounds ? -1 : 1) * (.83 + hash(strip * 2.83) * 6.8) * age + .25 * hash(strip * 9.5);
      const rise = Math.max(0, (4.15 + hash(strip * 7.43) * 4.35) * age - 7.1 * age * age);
      return p.set(x, height(x, z) + .04 + rise, z, (.016 + hash(strip * 8.23) * .071) * (1 - age * .44));
    });
    const wake = (strip, t, p) => {
      const phase = (time * .46 + strip * .129) % 1;
      const twist = (strip % 2 ? -.38 : .44) + (hash(strip * 5.12) - .5) * .43;
      const length = 1.1 + hash(strip * 4.59) * 2.56;
      const forward = Math.min(1, phase + (t - .50) * .22 * length / 3.0);
      const z = site.z - 18.9 * (1 - forward) + Math.sin(t * 2.6 + phase * 4) * .41
        + (strip % 3 - 1) * .68;
      const x = site.x - 8.6 * (1 - forward) ** 1.55
        + (strip % 6 - 2.5) * (.61 + .71 * (1 - phase)) + Math.sin(phase * 9 + t * 2.1) * twist;
      const width = (.027 + hash(strip * 11.3) * .095 + charge * .072 + influx * .12) * (1 - .44 * phase);
      return p.set(x, height(x, z) + .059, z, width);
    };
    view.foamShadow.draw(time, (opened ? .15 : .46) + influx * .31, wake);
    view.foam.draw(time, (opened ? .34 : .59) + charge * .27 + influx * .24, (strip, t, p) => {
      if (strip < 9 || opened) {
        wake(strip + 3, t, p);
        p.x += .14;
        p.y += .022;
        p.z -= .03;
        return p;
      }
      const coil = site.coil, ordinal = strip - 9;
      const phase = time * (ready ? 1.8 : .99) + ordinal * 1.13;
      const a = phase + t * (ready ? 1.29 : .95);
      const radius = (2.6 + .49 * ordinal + t * .59) * (1 - .18 * charge);
      const x = coil.x + Math.cos(a) * radius;
      const z = coil.z + Math.sin(a) * radius;
      return p.set(x, height(x, z) + .075 + charge * .05 * Math.sin(t * Math.PI), z, .075 + charge * .16);
    });
  }

  updateMountain(view, time, route, game) {
    const site = ENDING_ROUTE_SITES.mountain;
    const gate = route.gateAt != null;
    const strikeAge = ageOf(this.events['relay-strike'], time);
    view.root.visible = gate;
    if (!gate) return;
    const discharged=Math.max(0,strikeAge-RELAY_SNAP);
    const broken=Number.isFinite(strikeAge)&&strikeAge>=RELAY_SNAP;
    const conductorHead=lerp(.015,RELAY_JOINT_T+.028,smoothstep(strikeAge,.135,RELAY_SNAP));
    const envelope=smoothstep(strikeAge,.090,.23)*(1-smoothstep(strikeAge,RELAY_SNAP+.015,RELAY_SNAP+.25));
    const sway=.04*Math.sin(time*2.2);
    const upperRise=broken?smoothstep(discharged,0,.37):0;
    const lowerFall=broken?smoothstep(discharged,0,.34):0;
    const path=(t,p)=>{
      const load=Math.exp(-(((t-conductorHead)/.145)**2))*envelope;
      const lower=t<RELAY_JOINT_T?lowerFall*t**2.6:0;
      const upper=t>RELAY_JOINT_T?upperRise:0;
      const recoil=broken&&t<RELAY_JOINT_T?Math.sin(discharged*13.3-t*8.2)*Math.exp(-discharged*3.4)*lower*.83:0;
      return p.set(
        t*-4.36+Math.sin(t*2.9)*.82+sway*Math.sin(t*11)+recoil-load*.17*Math.sin(t*21-time*16)-upper*1.16,
        site.y-.29+t*17.42-.74*Math.sin(t*Math.PI)-lower*4.41+upper*3.51,
        -.072+t*14.3+Math.sin(t*2.7)*1.5-lower*2.02+upper*1.42,
      );
    };
    view.chain.update(path,view.chain.capacity,sway*17,0,broken?RELAY_JOINT:-1);
    view.chargeLinks.draw(conductorHead,envelope,broken,strikeAge);
    view.tag.rotation.z = -.09 + sway * 1.41;
    const jointX=RELAY_CLOUD_JOINT[0],jointY=site.y+RELAY_CLOUD_JOINT[1],jointZ=RELAY_CLOUD_JOINT[2];
    for(const {mesh,side} of view.brokenLinks){
      mesh.visible=broken&&discharged<1.44;
      if(!mesh.visible)continue;
      const t=discharged;
      mesh.position.set(jointX+side*(.11+t*(side>0?2.38:1.63)),
        jointY+.06+t*(side>0?.68:1.18)-7.6*t*t,jointZ-.07+t*(side>0?.98:-.54));
      mesh.rotation.set(t*(side>0?6.1:4.6),t*side*7.7,.40*side+t*side*4.1);
    }

    const charge = 1 - smoothstep(strikeAge, .14, .35);
    const travelling = .84*envelope;
    const cloudArrival=smoothstep(strikeAge,RELAY_SNAP-.09,RELAY_SNAP+.05)*(1-smoothstep(strikeAge,RELAY_SNAP+.27,RELAY_SNAP+.69));
    view.strikeSeat.visible = route.relayAt != null && strikeAge > .10;
    view.contact.visible = !view.strikeSeat.visible;
    const crackCloud = (strip, t, p, foreground) => {
      const stripe = strip - (foreground ? 3.9 : 2.5);
      const x = (t - .5) * (foreground ? 22 : 19) + stripe * .46;
      const roll = Math.sin(t * Math.PI) * (.39 + .21 * stripe);
      const wave = Math.sin(t * 8.5 + strip * 1.07 + time * .21) * .42;
      const slit = cloudArrival * Math.exp(-((x / 3.42)**2));
      return p.set(
        site.x+jointX+x+time*.011+Math.sign(x)*slit*.55,
        jointY + (foreground?.81:.53)+stripe*.31+roll+wave+(stripe<0?-3.17:3.38)*slit,
        site.z+jointZ+(foreground?-1.6:5.8)+(t-.5)*2.22+.23*stripe,
        (foreground?1.19:1.51)+.14*hash(strip*4.51)-slit*.51,
      );
    };
    view.cloudBack.draw(time, .36 + cloudArrival * .25, (strip, t, p) => crackCloud(strip, t, p, false));
    const tipReserve=smoothstep(conductorHead,.58,.79)*envelope;
    view.cloudVeil.draw(time, .90 - .59*Math.max(cloudArrival,tipReserve), (strip, t, p) => crackCloud(strip, t, p, true));
    view.downstroke.draw(time, (1 - smoothstep(strikeAge, .076, .25)) * .97, (strip, t, p) => {
      const noise = (hash(Math.floor(t * 21) * 8.1 + strip * 7.37) - .5) * .64;
      const taper = Math.sin(t * Math.PI * .89);
      const branch = strip === 0 ? 0 : (strip === 1 ? 1 : -1) * 2.56 * smoothstep(t, .44, .88);
      const x = site.x + t * -5.8 + Math.sin(t * 8.4) * .53 + (noise + branch) * taper;
      const z = site.z - .08 + t * 4.55 + Math.sin(t * 13.4) * .62 * taper + noise * .76 * taper;
      return p.set(x, site.y - .23 + t * (strip ? 11.1 : 16.1), z, (strip ? .091 : .34) * (.79 + taper * .21));
    });
    view.ringLoad.draw(time, charge * .96, (strip, t, p) => {
      const a = t * 1.44 + strip * 1.43 + strikeAge * 3.1;
      const radius = .38 + strip * .078 + .049 * Math.sin(t * 23.2 + strip);
      return p.set(site.x + Math.cos(a) * radius,
        site.y - .22 + Math.sin(a) * radius, site.z - .145 + .18 * Math.sin(a * 1.7 + strip),
        strip === 0 ? .15 : .081);
    });
    view.chargedShadow.draw(time, Math.min(.98,1.18*travelling), (strip,t,p)=>{
      const head=Math.min(conductorHead,broken?RELAY_JOINT_T:.90);
      const u=lerp(Math.max(0,head-.28+strip*.045),head,t);
      const {x,y,z}=path(u,p);
      const spool=Math.sin(t*Math.PI)*(.59+.17*strip);
      const tip=smoothstep(t,.20,.70);
      const width=(.28+spool)*(.61+.53*tip);
      const roll=Math.sin(t*19.42+strip*.87)*(.11+strip*.22);
      return p.set(site.x+x+roll,y-.06*strip,site.z+z-.12+strip*.26*Math.sin(t*10.5),width);
    });
    view.pulse.draw(time, travelling * .97, (strip, t, p) => {
      const head=Math.min(conductorHead,broken?RELAY_JOINT_T:.90);
      const tail=Math.max(0,head-.24+.021*strip);
      const u = lerp(tail, head, t);
      const { x, y, z } = path(u, p);
      const branch=Math.sin(t*Math.PI)*(strip-2)*.21;
      const jitter=(hash(Math.floor(u*112)*1.72+strip*2.25)-.5)*.30*Math.sin(t*Math.PI);
      return p.set(site.x+x+branch+jitter,y+.03,site.z+z-.09+branch*.58,strip===2?.146:.044);
    });
    const crack=broken?(1-smoothstep(discharged,.065,.39)):0;
    view.crackInk.draw(time,crack*.89,(strip,t,p)=>{
      const side=strip%2?-1:1,spread=(1.34+strip*.29+discharged*2.2)*t;
      const dab=Math.sin(t*14.2+strip*.76)*.24;
      return p.set(site.x+jointX+side*spread,jointY+dab+t*(strip-1)*.84,
        site.z+jointZ-.26+.31*Math.sin(t*3.6+strip*2.5),.49+.15*Math.sin(t*Math.PI));
    });
    view.cloudSeam.draw(time,crack,(strip,t,p)=>{
      const side=strip%2?-1:1,reach=(2.36+strip*.36)*t;
      const seam=Math.sin(t*11.7+strip*2.04)*.19+(hash(Math.floor(t*19)*7.83+strip)-.5)*.28;
      return p.set(site.x+jointX+side*reach,jointY+seam+t*(strip-2)*.57,
        site.z+jointZ-.12+Math.sin(t*5.2+strip)*.47,strip===0?.37:.106);
    });
    view.sparks.draw(time, strikeAge < .91 ? (1 - smoothstep(strikeAge, .11, .91)) * .95 : 0, (strip, t, p) => {
      const a = strip * 2.39996;
      const age = Math.max(0, strikeAge - (1 - t) * .13);
      const radius = age * (1.4 + hash(strip * 13.44) * 4.4);
      const y = site.y - .12 + age * (1.6 + hash(strip * 5.97) * 3.9) - age * age * 6.1;
      return p.set(site.x + radius * Math.cos(a), y, site.z + radius * Math.sin(a), .031 + hash(strip * 11.2) * .031);
    });

    const strike = route.mountainStrike;
    const locked = strike?.lockedAt != null;
    const copperLocked = locked && strike.relay;
    const approaching = route.relayAt == null && !locked;
    const nearIron = Math.hypot(game.p.x - site.x, game.p.z - site.z);
    const trace = approaching ? (strike ? .49 : .33) * (1 - smoothstep(nearIron, 9.8, 18.5)) : 0;
    const settledHalo = route.relayAt != null ? .70 * (1 - smoothstep(strikeAge, .72, 1.77)) : 0;
    const halo = copperLocked ? .96 : .44 + (strike && !locked ? .20 * (route.mountainCharge ?? 0) : 0);
    view.copperHalo.draw(time, route.relayAt == null ? halo : settledHalo, (strip, t, p) => {
      const a = TAU * ((strip + t * .83) / 5) + .11 * Math.sin(time * 3.4);
      const swell = Math.sin(Math.PI * t);
      const radius = (.63 + .14 * hash(strip * 11.94)) * (copperLocked ? 1.13 : 1) + settledHalo * .31;
      return p.set(site.x + Math.cos(a) * radius, site.y - .25 + Math.sin(a) * radius,
        site.z - .31 + .18 * Math.cos(a * 1.13), (.087 + .079 * swell) * (copperLocked ? 1.29 : 1));
    });
    view.approachTrace.draw(time, trace, (strip, t, p) => {
      const side = strip % 2 ? -1 : 1;
      const source = strike ?? game.p;
      const d = Math.hypot(source.x - site.x, source.z - site.z);
      const slopeX = (site.x - source.x) / Math.max(.01, d);
      const slopeZ = (site.z - source.z) / Math.max(.01, d);
      const toward = lerp(.41, .97, t);
      const branch = side * (.54 + .15 * strip) * Math.sin(t * Math.PI)
        + .13 * Math.sin(t * 14 - time * 3 + strip);
      return p.set(lerp(source.x, site.x, toward) + slopeZ * branch,
        lerp(source.y - .13, site.y - .13, toward) + .12 * Math.sin(t * Math.PI),
        lerp(source.z, site.z, toward) - slopeX * branch, .044 + .046 * Math.sin(t * Math.PI));
    });
    const radius = strike?.radius ?? 0;
    const intensity = strike ? (locked ? .86 : .47) * (.89 + .11 * Math.sin(game.time * (locked ? 17 : 11))) : 0;
    view.warning.draw(time, copperLocked ? 0 : intensity, (strip, t, p) => {
      const a = TAU * ((strip + t * (locked ? .92 : .73)) / 7) + (locked ? 0 : time * .41);
      return p.set(strike.x + radius * Math.cos(a), strike.y + .06, strike.z + radius * Math.sin(a),
        (locked ? .166 : .094) * (.60 + .40 * Math.sin(t * Math.PI)));
    });
    view.lockElevation.draw(time, locked && !copperLocked ? intensity * .55 : 0, (strip, t, p) => {
      const pitch = (t - .5) * .67 + (strip % 2 ? -1.02 : 1.02);
      const heading = strip < 2 ? -.37 : 1.17;
      const run = radius * Math.cos(pitch);
      return p.set(strike.x + Math.cos(heading) * run,
        strike.y + radius * Math.sin(pitch), strike.z + Math.sin(heading) * run,
        .104 * (.71 + .29 * Math.sin(t * Math.PI)));
    });

    // The intact centerline remains the actual strike radius. Ink pools on
    // the side away from the dragon and thins into paper on its escape side.
    const ghost = route.relayAt != null ? .57 * (1 - smoothstep(strikeAge, .065, .36)) : 0;
    const nearbyField = locked ? strike : ghost > .015 ? this.relayPerimeter : null;
    if (copperLocked) {
      this.relayPerimeter = { x: strike.x, y: strike.y, z: strike.z, radius };
    }
    const field = copperLocked ? strike : ghost > .015 ? this.relayPerimeter : null;
    const crossAge = ageOf(this.events['relay-escape'], time);
    const crossing = Boolean(this.relayExit);
    const fogFade = copperLocked ? .79 : .54 * ghost;
    const open = crossing ? smoothstep(crossAge, 0, .087) * (1 - smoothstep(crossAge, .29, .76)) : 0;
    view.fogBoundary.draw(field, time, fogFade, this.relayExitDirection, open);
    const escape = this.relayExit ?? this.relayEscape;
    const escapeAngle = escape ? Math.atan2(escape.z - site.z, escape.x - site.x) : Math.PI * .5 - game.p.angle;
    view.fixedPerimeter.draw(time, field ? (copperLocked ? .98 : ghost) : 0, (_strip, t, p) => {
      const a = t * TAU;
      const escapeSide = crossing ? smoothstep(Math.cos(a - escapeAngle), -.08, .92) : 0;
      const width = lerp(.185, .085, escapeSide) * (.92 + .08 * Math.sin(a * 9.0 + 1.2));
      return p.set(field.x + field.radius * Math.cos(a), field.y + .027,
        field.z + field.radius * Math.sin(a), width);
    });
    this.drawRelayEscape(view, time, nearbyField, game.p, copperLocked);
  }

  drawRelayEscape(view, time, field, player, locked) {
    const elapsed = ageOf(this.events['relay-escape'], time);
    const witness = this.relayExit && elapsed < .76;
    if (!field || !locked && !witness) {
      view.escapeWind.mesh.visible = view.escapeReserve.mesh.visible = false;
      return;
    }
    if(witness){
      const direction=this.relayExitDirection;
      const headingX=Math.sin(this.relayExit.angle),headingZ=Math.cos(this.relayExit.angle);
      const reveal=smoothstep(elapsed,0,.075);
      const trailing=reveal*(1-smoothstep(elapsed,.28,.76));
      const curtain=(strip,t,p)=>{
        const side=strip%2?1:-1;
        const tier=Math.floor(strip*.5);
        const radial=field.radius+.15+elapsed*(.7+.39*tier)+t*(.42+elapsed*2.4);
        const spread=side*(.27+t*.49+elapsed*(1.7+.18*tier));
        const curl=Math.sin(t*Math.PI)*(.19+.16*tier)*reveal;
        return p.set(field.x+direction.x*radial+headingZ*spread+headingX*curl,
          field.y+direction.y*radial-.26+t*.26+tier*.12+curl+elapsed*.25,
          field.z+direction.z*radial-headingX*spread+headingZ*curl,
          (.26+.095*tier)*(.52+.48*Math.sin(t*Math.PI)));
      };
      view.escapeWind.draw(time,trailing*.91,curtain);
      view.escapeReserve.draw(time,trailing*.88,curtain);
      return;
    }
    const headingX = Math.sin(player.angle), headingZ = Math.cos(player.angle);
    const traceY = player.y - .37;
    const x = player.x - field.x, y = traceY - field.y, z = player.z - field.z;
    const reach = x * headingX + z * headingZ;
    const discriminant = reach * reach + field.radius * field.radius - x * x - y * y - z * z;
    const lead = discriminant >= 0 ? -reach + Math.sqrt(discriminant) : -1;
    view.escapeReserve.mesh.visible=false;
    view.escapeWind.draw(time, lead < 0 || this.relayExit ? 0 : .59, (strip, t, p) => {
      const spread=(strip-1.5)*.41*Math.sin(t*Math.PI);
      const ahead=lead+.21+1.85*t+.18*strip;
      return p.set(
        player.x + headingX*ahead + headingZ*spread,
        traceY + Math.sin(t*Math.PI)*.13-.08*strip,
        player.z + headingZ*ahead - headingX*spread,
        .14 + .085 * Math.sin(t * Math.PI),
      );
    });
  }

}
