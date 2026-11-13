import * as THREE from 'three';
import { createInkFoodGeometry, FAUNA_REGION, INK_FOOD, smoothFaunaSeams } from './fauna-geometry.js';
import { supportInstancing } from './instanced-ink.js';

export const FOOD_KINDS = Object.freeze(['fish', 'shrimp', 'carp', 'cloud', 'gold']);
const reedFryKind = 'reed-fry';
const lakeShrimpKind = 'lake-shrimp';
const airborneKind = 'air-mote';
const condensedAirKind = 'air-spindle';
const lootKind = 'battle-scale';
const localKinds = {
  0: [reedFryKind],
  1: ['fish', lakeShrimpKind],
  2: ['sea-shoal', 'sea-scallop', 'sea-spiral'],
  3: [airborneKind, condensedAirKind, 'air-seed'],
};
const ordinaryKinds = new Set(['fish', reedFryKind, 'shrimp', lakeShrimpKind, 'sea-shoal', 'sea-scallop', airborneKind, condensedAirKind, lootKind]);
const singlePrey = new Set(['fish', reedFryKind, 'shrimp', lakeShrimpKind, 'carp']);
const states = new WeakMap();
const { lerp, smoothstep } = THREE.MathUtils;

const shoreReach = [[7.5, 22], [8.5, 26], [8.5, 27], [6, 20]];
const distantInk = {
  fish: .12, [reedFryKind]: .12, shrimp: .14, [lakeShrimpKind]: .14, carp: .32, cloud: .46, gold: .67, shed: .62,
  'sea-shoal': .043, 'sea-scallop': .058, 'sea-spiral': .27,
  [airborneKind]: .053, [condensedAirKind]: .053, 'air-seed': .27, [lootKind]:.065,
};
const closeInk = { fish: .73, [reedFryKind]: .70, 'sea-shoal': .79, 'sea-scallop': .90, [lootKind]:.77 };

function foodKind(item,stage) {
  if(item.shed)return 'shed';
  if(item.battleLoot&&item.rank<2)return lootKind;
  return localKinds[stage]?.[item.rank]??FOOD_KINDS[item.rank];
}

function shapeSilverfish(geometry, reedFry) {
  const { position, faunaPaint, inkGuides } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const body = faunaPaint.getZ(i) === FAUNA_REGION.body;
    const tail = z < -.29;
    // A broad shallow flank with close-set fins, seen from the water camera.
    const width = body ? 1.55 : tail ? 1.03 : lerp(1.40, .74, smoothstep(Math.abs(x), .074, .214));
    const front = reedFry && z > 0 ? z * .72 : z;
    const shortTail = reedFry && tail ? -.29 + (front + .29) * .66 : front;
    position.setXYZ(i, x * width * (reedFry ? 1.24 : 1), y * (reedFry ? .59 : .68), shortTail * .97);
    if (body) {
      const dorsal = Math.sin(faunaPaint.getY(i) * Math.PI * 2);
      const along = faunaPaint.getX(i);
      const flank = smoothstep(dorsal, .22, .92) * (1 - smoothstep(along, .54, .90));
      inkGuides.setXY(i, inkGuides.getX(i) * .64, Math.max(inkGuides.getY(i), (reedFry ? .62 : .48) * flank));
    }
  }
  position.needsUpdate = true;
  inkGuides.needsUpdate = true;
  geometry.computeVertexNormals();
  smoothFaunaSeams(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function installPresence(mesh, material) {
  const presence = new THREE.InstancedBufferAttribute(
    new Float32Array(mesh.instanceMatrix.count * 2), 2,
  ).setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFoodPresence', presence);
  const varying = 'varying vec2 vFoodPresence;\n';
  material.vertexShader = varying + 'attribute vec2 aFoodPresence;\n' + material.vertexShader
    .replace('void main() {', 'void main() { vFoodPresence=aFoodPresence;');
  material.fragmentShader = varying + material.fragmentShader
    .replace(
      'gl_FragColor = vec4(reflectance,paperReserve,grain,1.0);',
      `// A faint mark deposits less ink without replacing a dark background with paper.
      float foodInk=(1.-reflectance)*(1.-paperReserve)*vFoodPresence.x*vFoodPresence.y;
      if(foodInk<.006)discard;
      gl_FragColor=vec4(0.,0.,grain,foodInk);`,
    );
  // A faint pickup lets the water or cloud behind it show through.
  material.transparent = true;
  material.depthWrite = false;
  material.forceSinglePass = true;
  material.needsUpdate = true;
  return presence;
}

function createLocalFood(world, ink, kind) {
  const capacity = world.foodModels.get('cloud').instanceMatrix.count;
  const geometry = createInkFoodGeometry(kind === reedFryKind ? 'fish' : kind);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), capacity);
  const { name, tint, strength } = kind === reedFryKind ? {name:'苇汀银鱼',tint:'#537780',strength:.45} : INK_FOOD[kind];
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.inkTint = tint;
  mesh.userData.inkTintAmount = strength;
  world.scene.add(mesh);
  ink.register(mesh, {
    strokes: false,
    geometryInfluence: 0,
    occlusionProxy: false,
    toneRange: [.11, .46],
    reserveStrength: .36,
  });
  const material = ink.records.find(record => record.mesh === mesh).material;
  supportInstancing(material);
  world.foodModels.set(kind, mesh);
  return mesh;
}

function intakeTrace(geometry) {
  const { position, faunaPaint } = geometry.attributes;
  if(!faunaPaint)return [];
  const rings=[];
  for(let vertex=0;vertex<position.count;vertex++){
    // Use the first body surface's ring edge, past fins and antennae.
    if(faunaPaint.getW(vertex)===0&&faunaPaint.getY(vertex)===0){
      rings.push(new THREE.Vector3().fromBufferAttribute(position,vertex));
    }
  }
  return rings;
}

function appearanceState(world) {
  const models = world.foodModels;
  const cached = states.get(models);
  if (cached) return cached;
  if (!models.has('cloud')) return null;
  const ink = world.inkDragon.ink;
  const batches = new Map();
  for (const kind of new Set([lootKind,...Object.values(localKinds).flat()])) {
    if (!models.has(kind)) createLocalFood(world, ink, kind);
  }
  for (const [kind, mesh] of models) {
    const material = ink.records.find(record => record.mesh === mesh)?.material;
    if (!material) continue;
    if (kind === 'fish' || kind === reedFryKind) shapeSilverfish(mesh.geometry,kind === reedFryKind);
    // Small ordinary marks do not replace the mineral color of the bank or
    // rock behind them. Rare shapes retain their own localized mineral tint.
    if (ordinaryKinds.has(kind)) mesh.userData.inkIdSuppressed = true;
    mesh.renderOrder = -7;
    const trace=singlePrey.has(kind)?intakeTrace(mesh.geometry):[];
    batches.set(kind, { mesh, material, presence: installPresence(mesh, material),trace });
  }
  const state = { batches, transform:new THREE.Object3D(),swallows:[],
    mouth:new THREE.Vector3(),lip:new THREE.Vector3(),direction:new THREE.Vector3(),tip:new THREE.Vector3(),
    intakePose:new THREE.Object3D(),intakeAction:null,intakeHeadFirst:false };
  states.set(models, state);
  return state;
}

function writePose(transform, item, kind, time, size=1) {
  const phase = item.phase;
  let scale = .97 + item.rank * .105;
  let length = scale;
  let yaw = item.foodHeading ?? phase;
  let pitch = 0;
  let roll = 0;
  switch (kind) {
    case reedFryKind:
    case 'fish': {
      const drift = time * 1.65 + phase;
      const paddle = time * 4.8 + phase * 2;
      yaw += Math.sin(drift) * .27 + Math.sin(paddle) * .055;
      pitch = .048 * Math.cos(drift);
      roll = .13 * Math.sin(drift - .7);
      length *= 1 + .025 * Math.sin(paddle);
      break;
    }
    case 'shrimp': {
      const curl = (.5 + .5 * Math.sin(time * 3.1 + phase)) ** 3;
      yaw += Math.sin(time * 1.52 + phase) * .15;
      pitch = curl * .30 - .09;
      roll = Math.sin(time * 2.3 + phase) * .072;
      length *= 1 - curl * .18;
      break;
    }
    case lakeShrimpKind: {
      const kick = (.5+.5*Math.sin(time*2.72+phase)) ** 4;
      yaw += .17*Math.sin(time*1.11+phase);
      pitch = .19*kick-.07;
      roll = .063*Math.sin(time*1.56+phase);
      length *= 1-.11*kick;
      break;
    }
    case 'carp': {
      const wave = time * 1.8 + phase;
      yaw += Math.sin(wave) * .39;
      roll = Math.sin(wave - .35) * .12;
      pitch = Math.sin(wave * .5) * .09;
      length *= 1 + Math.sin(wave) * .04;
      break;
    }
    case 'sea-shoal': {
      const glide = time * 1.84 + phase;
      yaw += .31 * Math.sin(glide);
      pitch = .075 * Math.cos(glide);
      roll = .09 * Math.sin(glide * 1.8);
      length *= 1 + .032 * Math.sin(glide * 2.3);
      break;
    }
    case 'sea-scallop':
      yaw += .16 * Math.sin(time * .94 + phase);
      pitch = -.32 + .16 * Math.sin(time * 1.47 + phase);
      roll = .19 * Math.cos(time * 1.14 + phase);
      break;
    case 'sea-spiral':
      yaw += time * .31;
      pitch = .59 + .12 * Math.sin(time * 1.22 + phase);
      roll = .23 * Math.sin(time * 1.52 + phase);
      break;
    case airborneKind: {
      const wave = time * 1.04 + phase;
      scale = length = .80;
      yaw = phase * .32 + Math.sin(wave * .68) * .34;
      pitch = .14 + Math.sin(wave) * .12;
      roll = .19 + Math.sin(wave * .78) * .11;
      break;
    }
    case condensedAirKind: {
      const wave = time * 1.24 + phase;
      scale = length = .84;
      yaw = phase * .31 + time * .29;
      pitch = .10 + Math.sin(wave * .72) * .13;
      roll = -.24 + Math.cos(wave) * .14;
      break;
    }
    case 'air-seed':
      yaw += time * .47;
      pitch = .12 + .17 * Math.sin(time * 1.16 + phase);
      roll = .18 * Math.cos(time * .94 + phase);
      break;
    case lootKind:
      scale *= .90;
      length *= .90;
      pitch=.21*Math.sin(phase);
      roll=.17*Math.cos(phase);
      break;
    case 'cloud':
      yaw += time * .17;
      pitch = .36 + Math.sin(time * 1.1 + phase) * .19;
      roll = Math.sin(time * 1.26 + phase) * .15;
      break;
    case 'gold':
      yaw += Math.sin(time * .88 + phase) * .31;
      pitch = .31 + Math.sin(time * 1.32 + phase) * .12;
      roll = Math.sin(time * 1.02 + phase) * .086;
      break;
    case 'shed':
      scale = length = 1.05;
      yaw += Math.sin(time * .77 + phase) * .084;
      roll = Math.sin(time * 1.15 + phase) * .11;
      break;
  }
  transform.position.set(item.x, item.y, item.z);
  transform.rotation.set(pitch, yaw, roll);
  transform.scale.set(scale*size, scale*size, length*size);
  transform.updateMatrix();
}

export function noteFoodSwallow(world,event) {
  if(event.stage>1 || !Number.isInteger(event.foodId))return;
  const swallows=states.get(world.foodModels)?.swallows;
  if(!swallows)return;
  if(swallows.length>=6)swallows.shift();
  swallows.push(event);
}

export function clearFoodSwallows(world) {
  const swallows=states.get(world.foodModels)?.swallows;
  if(swallows)swallows.length=0;
}

function drawSwallows(world,state,stage,gameTime) {
  const duration=stage===0?.19:.28;
  state.swallows=state.swallows.filter(event=>event.stage===stage&&gameTime-event.swallowedAt<duration);
  if(!state.swallows.length || world.inkDragon.stage!==stage)return;
  const activeFood=world.inkDragon.motion.action;
  for(const event of state.swallows){
    if(activeFood?.kind==='eat'&&activeFood.target.foodId===event.foodId)continue;
    const kind=foodKind(event,stage),batch=state.batches.get(kind);
    if(!batch||batch.mesh.count>=batch.mesh.instanceMatrix.count)continue;
    const t=Math.max(0,(gameTime-event.swallowedAt)/duration);
    // The whole pickup reaches the lips first. It shrinks and washes out as
    // it moves behind the same posed mouth point.
    const travel=Math.min(1,t/.68);
    const pull=smoothstep(travel,0,1);
    const swallow=smoothstep(t,.68,1);
    const mouth=world.inkDragon.muzzle(state.mouth,.047*swallow);
    if(!mouth)return;
    const item={...event,x:lerp(event.x,mouth.x,pull),z:lerp(event.z,mouth.z,pull),
      y:lerp(event.y,mouth.y,pull)+(stage===0?.12:.20)*4*pull*(1-pull)};
    const index=batch.mesh.count++;
    writePose(state.transform,item,kind,world.t,1-.88*swallow);
    batch.mesh.setMatrixAt(index,state.transform.matrix);
    batch.presence.setXY(index,.96,1-swallow*swallow);
  }
}

function drawPosedFeeding(world,state,stage) {
  const dragon=world.inkDragon;
  const {action,biteProgress,biteClosure,feedSide}=dragon.motion;
  if(dragon.stage!==stage||action?.kind!=='eat'||biteClosure>=1)return;
  const {transform,mouth,lip,direction,tip,intakePose}=state;
  if(!dragon.muzzle(mouth,.057*biteClosure))return;
  const item=action.target;
  const kind=foodKind(item,stage),batch=state.batches.get(kind);
  if(!batch||batch.mesh.count>=batch.mesh.instanceMatrix.count)return;
  writePose(transform,item,kind,world.t);
  const finish=smoothstep(biteClosure,.06,.93);
  let opacity=1-finish*finish;
  if(stage<=2&&batch.trace.length>=2&&dragon.muzzle(lip)&&dragon.muzzle(direction,.04)){
    direction.sub(lip).normalize();
    if(state.intakeAction!==action){
      state.intakeHeadFirst=direction.dot(tip.set(0,0,1).applyQuaternion(transform.quaternion))>0;
      state.intakeAction=action;
    }
    intakePose.lookAt(tip.copy(direction).multiplyScalar(state.intakeHeadFirst?1:-1));
    const feed=smoothstep(biteProgress,.04,.82);
    const drawnIn=smoothstep(biteClosure,.09,.88);
    const kick=Math.sin(Math.PI*biteProgress)*(1-drawnIn);
    intakePose.rotateZ(.35*feedSide*kick);
    transform.quaternion.slerp(intakePose.quaternion,feed*(.74+.26*drawnIn));
    const entering=(batch.trace.length-1)*(state.intakeHeadFirst?drawnIn:1-drawnIn);
    const ring=Math.min(batch.trace.length-2,Math.floor(entering));
    tip.copy(batch.trace[ring]).lerp(batch.trace[ring+1],entering-ring)
      .multiply(transform.scale).applyQuaternion(transform.quaternion);
    transform.position.lerp(mouth,feed).addScaledVector(tip,-feed);
    opacity=1-smoothstep(biteClosure,.35,.94);
  }else{
    transform.position.lerp(mouth,biteProgress);
    transform.scale.multiplyScalar((1-.27*smoothstep(biteProgress,.68,1))*(1-.92*finish));
  }
  transform.updateMatrix();
  const index=batch.mesh.count++;
  batch.mesh.setMatrixAt(index,transform.matrix);
  batch.presence.setXY(index,1,opacity);
}

/** Draw the existing pickups at their game positions with distance-based ink and local motion. */
export function updateFoodAppearance(world, food, stage, focus, gameTime, showFeeding=true) {
  const state = appearanceState(world);
  if (!state) return;
  const { batches, transform } = state;
  if (state.stage !== stage) {
    // Valley haze should sample the air pickup's depth, not the river below it.
    for (const { material } of batches.values()) material.depthWrite = stage === 3;
    state.stage = stage;
  }
  for (const { mesh } of batches.values()) mesh.count = 0;

  const camera = world.camera.position;
  const eye = focus ?? camera;
  const [near, far] = shoreReach[stage] ?? shoreReach[2];
  for (const item of food) {
    const kind=foodKind(item,stage);
    const batch = batches.get(kind);
    if (!batch || batch.mesh.count >= batch.mesh.instanceMatrix.count) continue;

    const distance = Math.hypot(item.x - eye.x, item.y - eye.y, item.z - eye.z);
    const viewDistance = Math.hypot(item.x - camera.x, item.y - camera.y, item.z - camera.z);
    const ordinary = !item.shed && item.rank < 2;
    const fadeEnd = stage >= 2 && ordinary ? far - 5 : far;
    const close = 1 - smoothstep(distance, near, fadeEnd);
    const viewWash = 1 - .24 * smoothstep(viewDistance, 27, 62);
    const ink = lerp(distantInk[kind] * viewWash, closeInk[kind] ?? 1, close);
    const rare = item.shed || item.rank >= 2;
    const coverage = lerp(rare ? .79 : .51, .99, close);
    const index = batch.mesh.count++;
    writePose(transform, item, kind, world.t);
    batch.mesh.setMatrixAt(index, transform.matrix);
    batch.presence.setXY(index, ink, coverage);
  }

  if(showFeeding){
    if(state.swallows.length)drawSwallows(world,state,stage,gameTime);
    drawPosedFeeding(world,state,stage);
  }
  for (const { mesh, presence } of batches.values()) {
    mesh.visible = mesh.count > 0;
    if (!mesh.visible) continue;
    mesh.instanceMatrix.needsUpdate = true;
    presence.clearUpdateRanges();
    presence.addUpdateRange(0, mesh.count * 2);
    presence.needsUpdate = true;
  }
}
