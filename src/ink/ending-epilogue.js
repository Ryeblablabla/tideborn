import { MathUtils, Vector3 } from 'three';
import { sampleSpine } from '../motion.js';
import { LOCK_LAKE_DURATION } from '../heaven-finale.js';
import { applyMountainRiver } from './river-ink.js';
import { lakeFishCourse, lakeReedCourse } from './ending-foreshadow.js';
import { EpilogueRain } from './epilogue-rain.js';
import { projectRainDragon } from './camera.js';

const { clamp, lerp, smootherstep } = MathUtils;
const pan = new Vector3();
const fish = new Vector3();
const reed = new Vector3();
const valleyCut = 2.39;
const marshCut = 4.55;
const head = new Vector3(), tail = new Vector3(), projected = new Vector3();
const correctionTarget = new Vector3();

export function prepareEpilogueRain(world) {
  if (world.epilogueRain) return;
  const rain = world.epilogueRain = new EpilogueRain(world.scene);
  const court = world.blessingRain;
  const renderer = world.renderer;
  const restore = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mipLevel = renderer.getActiveMipmapLevel();
  renderer.setRenderTarget(world.inkDragon.ink.target);
  try {
    void Promise.all([rain.rings, rain.streaks, court.fall, court.stone].map(mesh =>
      renderer.compileAsync(mesh, world.epilogueCamera, world.scene))).catch(error => console.warn(error));
  } finally {
    renderer.setRenderTarget(restore, face, mipLevel);
  }
}

export function scheduleEpiloguePreparation(world, finale) {
  if (world.epiloguePreparation === finale) return;
  world.epiloguePreparation = finale;
  const { environment, inkDragon, endingSigns } = world;
  const destinations = finale.ending === 'ordained' ? [3, 1] : [1];
  const stages = destinations.filter(stage => !environment.cache.has(stage) ||
    stage === 1 && !endingSigns.stages.has(stage));
  if (finale.ending === 'ordained') prepareValleyPigment(world, environment.cache.get(3));
  function prepareNext(deadline) {
    if (world.epiloguePreparation !== finale || !['audience', 'blessing', 'stomp', 'lock'].includes(finale.phase)) return;
    do {
      const stage = stages[0];
      const root = environment.prepareStageSlice(stage, inkDragon.ink);
      if (root) {
        if (stage === 3) prepareValleyPigment(world, root);
        if (stage === 1 && !endingSigns.stages.has(stage)) {
          endingSigns.prepare(stage, inkDragon.ink).root.visible = false;
        }
        stages.shift();
      }
    } while (stages.length && deadline?.timeRemaining() > 6);
    if (stages.length) queuePreparation(prepareNext);
  }
  if (stages.length) queuePreparation(prepareNext);
}

function prepareValleyPigment(world, root) {
  if (!root || world.epiloguePigmentRoot === root) return;
  world.epiloguePigmentRoot = root;
  const { renderer, scene, epilogueCamera, inkDragon } = world;
  const ink = inkDragon.ink;
  const anchors = new Set(['江右墨崖', '灰青长肩', '千山·石青主峰']);
  const records = ink.records.filter(({ mesh }) => anchors.has(mesh.name) && mesh.parent === root);
  const restore = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const level = renderer.getActiveMipmapLevel();
  try {
    renderer.setRenderTarget(ink.target);
    // Compile the same material and render-target variant as the ink pass.
    // Compile only the cold landscape families observed at the rain cut.
    const pending = records.map(({ mesh, material }) => {
      const original = mesh.material;
      try {
        mesh.material = material;
        return renderer.compileAsync(mesh, epilogueCamera, scene);
      } finally {
        mesh.material = original;
      }
    });
    void Promise.all(pending).catch(error => console.warn(error));
  } finally {
    renderer.setRenderTarget(restore, face, level);
  }
}

function queuePreparation(callback) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(callback, { timeout: 100 });
  else setTimeout(callback, 24);
}

export function updateEndingEpilogue(world, game, finale, sites) {
  const age = finale?.age ?? 0;
  const ending = finale?.ending;
  const lookingBack = (finale?.phase === 'epilogue' || finale?.phase === 'complete')
    && (ending === 'ordained' || ending === 'dragon-king' || ending === 'locked');
  world.epilogueStage = null;
  world.epilogueWash.style.opacity = 0;
  if (!lookingBack) {
    world.epilogueRain?.hide();
    return false;
  }

  const hidden = ending === 'dragon-king';
  const locked = ending === 'locked';
  const wide = !hidden && !locked && age < valleyCut;
  const stage = wide ? 3 : !hidden && !locked && age >= marshCut ? 0 : 1;
  const sceneAge = stage === 3 || hidden || locked ? age : stage === 0 ? age - marshCut : age - valleyCut;
  const site = stage === 0 ? sites.marsh : sites.lake;
  const camera = world.epilogueCamera;
  const portrait = camera.aspect < 1;
  const reach = portrait ? 1.35 : 1;
  const dragon = wide ? flyAboveValley(world, game, age) : null;
  const arrival = wide && portrait ? 1-smootherstep(age,0,.61) : 0;
  const shoulder = wide ? smootherstep(age,.40,1.37)*(1-smootherstep(age,1.75,valleyCut)) : 0;
  const fov = wide ? (portrait ? 55-4.1*arrival+7.4*shoulder : 44+2.3*shoulder)
    : stage === 1 ? (portrait ? 51 : 41) : (portrait ? 48 : 41);
  if (!hidden && camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  if (locked) {
    // The chain stays high in the image as the school reaches it and turns.
    // End on the occupied upstream water and the empty lane beyond the iron.
    const seeChain = smootherstep(age, .17, 1.43);
    const retreat = smootherstep(age, 1.69, LOCK_LAKE_DURATION - .76);
    camera.position.set(
      site.x + lerp(portrait ? 1.6 : 2.25, portrait ? 5.36 : 5.72, seeChain) + 1.2 * retreat,
      lerp(1.62, portrait ? 4.28 : 3.56, seeChain) + .57 * retreat,
      site.z - lerp(portrait ? 5.30 : 5.00, portrait ? 9.26 : 8.2, seeChain) - .91 * retreat,
    );
    pan.set(site.x + lerp(.18, .40, seeChain), lerp(.40, .04, seeChain),
      site.z - lerp(.15, 1.25, seeChain) + (portrait ? .33 : .61) * retreat);
  } else if (wide) {
    // Trace the near shoulder while the dragon leaves the pale bend open.
    // The camera follows one flight vector, then eases its gaze to the rain.
    const glide = smootherstep(age, 0, valleyCut);
    const descend = smootherstep(age, .91, 1.72);
    camera.position.set(39 - 7.4 * glide + (portrait ? 8 : 0) - 5.1 * arrival, 27.7 - 5.9 * glide - .85 * arrival,
      24.2 + 7.4 * glide - (portrait ? 5.3 : 0) + 3.72 * arrival);
    // Leave room for the trailing body and outer wing in a narrow crop.
    pan.set(dragon.x + (portrait ? 3.0 : -.9) - 1.8 * descend + arrival,
      dragon.y - 3.25 - 9.1 * descend,
      dragon.z + (portrait ? -4.1 : 3.8) - 2.5 * descend - 1.5 * arrival);
    camera.position.lerp(projected.set(dragon.x+(portrait?14.8:15.0),dragon.y+5.1,dragon.z-14.6),shoulder*.86);
    pan.lerp(projected.set(dragon.x-1.4,dragon.y-5.2,dragon.z+2.9),shoulder*.78);
  } else if (hidden) {
    // Cut on the shared shape of the gate and sluice's vermilion seals.
    // Then give the opening between the posts back to the fish.
    const reveal = smootherstep(age, .16, .90);
    const passage = smootherstep(age, 2.12, 3.25);
    const bank = smootherstep(age, 2.46, 3.56);
    const side = lerp(portrait ? 3.65 : 4.18, portrait ? 7.05 : 9.10, passage);
    const back = lerp(portrait ? 8.6 : 7.35, portrait ? 9.55 : 6.8, passage);
    const leader = lakeFishCourse(age,fish);
    const witness=lakeReedCourse(age,reed);
    camera.position.set(site.x + lerp(portrait ? 1.38 : 2.10, side, reveal),
      lerp(2.0, 5.25 + .50 * passage, reveal),
      site.z - lerp(portrait ? 4.85 : 4.45, back, reveal));
    pan.set(lerp(site.x+.39,lerp(site.x+.08,witness.x,.23),reveal),lerp(.51,.03,reveal),
      lerp(site.z-.09,lerp(site.z-.36,witness.z,.24)+1.26*passage,reveal));
    // Hold across the two posts as the first fish clears the submerged
    // tread. Only after that crossing does the camera follow it downstream.
    const threshold = smootherstep(age, .88, 1.55) * (1-smootherstep(age, 2.31, 2.64));
    const follow = smootherstep(age, 1.84, 2.28);
    camera.position.x = lerp(camera.position.x, site.x + (portrait ? 3.15 : 4.40), threshold);
    camera.position.y = lerp(camera.position.y, (portrait ? 4.72 : 4.04) + .75*follow, threshold);
    camera.position.z = lerp(camera.position.z, site.z - (portrait ? 6.45 : 4.97) + .28*follow, threshold);
    pan.x = lerp(pan.x, site.x + .20 + .36*follow, threshold);
    pan.y = lerp(pan.y, .18, threshold);
    pan.z = lerp(pan.z, site.z - .56 + .83*follow, threshold);
    // Travel outside the east stone while the lead fish bends inwards.
    // From downstream the wake lies nearest, with the open lock behind.
    camera.position.x = lerp(camera.position.x, leader.x + (portrait ? 6.0 : 6.7) + 1.55 * Math.sin(Math.PI * bank), bank);
    camera.position.y = lerp(camera.position.y, portrait ? 3.10 : 2.36, bank);
    camera.position.z = lerp(camera.position.z, leader.z + (portrait ? 4.45 : 3.95), bank);
    pan.x = lerp(pan.x,lerp(leader.x,site.x,.28),bank);
    pan.y = lerp(pan.y,.46,bank);
    pan.z = lerp(pan.z,lerp(leader.z,site.z,.26),bank);
    const hiddenFov = lerp(lerp(portrait ? 49 : 41, portrait ? 53 : 43, reveal),portrait ? 54 : 44,bank)-threshold*(portrait ? .5 : 1.1);
    if (camera.fov !== hiddenFov) {
      camera.fov = hiddenFov;
      camera.updateProjectionMatrix();
    }
  } else if (stage === 1) {
    // Start where the valley stroke enters the water. Once the first ring
    // opens, the wet stone and chain carry the eye up to the old pavilion.
    const rise = smootherstep(sceneAge, .56, 1.68);
    const pull = smootherstep(sceneAge, .68, 1.85);
    camera.position.set(site.x + lerp(portrait ? 4.8 : 4.1, reach * 7.2, pull),
      lerp(2.0, 3.65, rise), site.z - lerp(portrait ? 11.0 : 9.4, reach * 9.2, pull));
    pan.set(site.x + lerp(.25, -.04, pull), lerp(.12, .58, rise), site.z + lerp(-.39, .51, rise));
  } else {
    // Pass the near leaves gently and rest on their reflections and chain.
    const follow = smootherstep(sceneAge, 0, 1.45);
    camera.position.set(site.x - lerp(portrait ? 7.36 : 5.9, portrait ? 6.52 : 5.4, follow),
      lerp(3.3, 3.75, follow), site.z - lerp(portrait ? 10.8 : 9.0, portrait ? 10.0 : 8.2, follow));
    pan.set(site.x - lerp(1.6, 1.0, follow), lerp(-.45, .21, follow), site.z + lerp(-.76, .83, follow));
  }
  camera.lookAt(pan);
  camera.updateMatrixWorld();
  if (wide && portrait && arrival > .001) matchRainCut(world, finale, camera, dragon, arrival);
  world.camera = camera;
  world.epilogueStage = stage;
  const handoff=wide&&world.rainHandoff?.finale===finale?world.rainHandoff:null;
  if (!hidden && !locked) {
    // Match the slope of the rain across the cut. The moving veil leaves
    // some of the water and bank visible as the next view takes over.
    const nearest = age < (valleyCut + marshCut) * .5 ? valleyCut : marshCut;
    const fromCut = age - nearest;
    const opening = age < .17;
    const sweep = opening ? age / .17 : clamp((fromCut + .17) / .34, 0, 1);
    const center = lerp(18, 82, sweep);
    const synchronized=opening&&handoff&&Math.abs(handoff.drip.x)<.88&&Math.abs(handoff.drip.y)<.91;
    const wetSide=synchronized?(handoff.drip.x*.5+.5)*100:center;
    world.epilogueWash.style.opacity = opening ? (synchronized?.25:.16)*(1-smootherstep(age,0,.17))
      : (nearest === valleyCut ? .33 : .44) * (1 - smootherstep(Math.abs(fromCut), 0, .17));
    world.epilogueWash.style.background = opening
      ? `linear-gradient(157deg, transparent ${wetSide - 36}%, #f3efe6 ${wetSide - 8}%, #f5f2e9 ${wetSide + 7}%, transparent ${wetSide + 41}%)`
      : `linear-gradient(157deg, transparent ${center - 78}%, #f3efe6 ${center - 35}%, #f5f2e9 ${center + 36}%, transparent ${center + 73}%)`;
  }

  world.environment.setStage(stage, world.inkDragon.ink);
  world.chapterFlightWake.mesh.visible = false;
  world.environment.update(world.t);
  world.endingSigns.update(stage, world.inkDragon.ink, game, world.t, {
    active: !wide, epilogue: wide ? null : hidden ? 'hidden' : ending,
    epilogueAge: locked ? sceneAge * .77 : sceneAge, water: world.water,
  });
  if (hidden || locked) world.epilogueRain?.hide();
  else {
    world.epilogueRain ??= new EpilogueRain(world.scene);
    world.epilogueRain.update(stage, sceneAge, camera, world.environment, world.water.position.y, dragon, handoff);
  }
  if (!wide) world.inkDragon.setVisible(false);
  world.combat.root.visible = false;
  world.practiceGuide.visible = false;
  if (world.bossShield) world.bossShield.visible = false;
  world.fauna?.crowd.clear();
  for (const meshes of [world.enemyMeshes, world.shotMeshes, world.hazardMeshes]) {
    for (const mesh of meshes.values()) mesh.visible = false;
  }
  for (const mesh of world.foodModels.values()) mesh.count = 0;
  const frame = { stage, position: pan, heading: 0 };
  if (wide) applyMountainRiver(world.water, world.environment.mountainRiver);
  world.water.material.uniforms.uStage.value = stage;
  world.water.userData.updateSurface(world.t, stage, frame, game, world.obstacles);
  world.ocean.update(world.t, stage, camera, frame);
  world.mist.update(stage, world.t, camera, false, .016, null, undefined, null, null, wide ? 1 : 0);
  world.inkWarnings.update([], stage, false, game.p, world.water);
  world.inkDragon.render(world.scene, camera);
  return true;
}

function matchRainCut(world, finale, camera, dragon, arrival) {
  const before=world.inkCamera.rainCutProjection;
  const actor=world.inkDragon.active?.actor;
  if(before?.finale!==finale||!actor?.pathPoints.length)return;
  const to=Math.atan2(before.tail.y-before.head.y,(before.tail.x-before.head.x)*camera.aspect);
  projectRainDragon(actor,camera,head,tail);
  const change=rainAngleDelta(rainAngle(head,tail,camera.aspect),to);
  const swing=clamp(change*.27,-.15,.15)*arrival;
  const eyeX=camera.position.x-dragon.x, eyeZ=camera.position.z-dragon.z;
  camera.position.x=dragon.x+eyeX*Math.cos(swing)+eyeZ*Math.sin(swing);
  camera.position.z=dragon.z+eyeZ*Math.cos(swing)-eyeX*Math.sin(swing);
  camera.lookAt(pan);camera.updateMatrixWorld();
  projectRainDragon(actor,camera,head,tail);
  const angle=rainAngleDelta(rainAngle(head,tail,camera.aspect),to);
  camera.rotateZ(-clamp(angle,-.29,.29)*arrival);
  const oldX=(before.head.x+before.tail.x)*.5;
  const oldY=(before.head.y+before.tail.y)*.5;
  camera.updateMatrixWorld();
  projectRainDragon(actor,camera,head,tail);
  const x=(head.x+tail.x)*.5, y=(head.y+tail.y)*.5;
  // Recenter in the solved orientation. The eye stays on the same side of
  // the valley ridge, and the rolling change is gone before the first rim.
  const depth=(head.z+tail.z)*.5;
  projected.set(x,y,depth).unproject(camera);
  correctionTarget.set(x+clamp(x-oldX,-.46,.46)*arrival,y+clamp(y-oldY,-.40,.40)*arrival,depth).unproject(camera);
  camera.position.add(correctionTarget.sub(projected));
  camera.updateMatrixWorld();
}

function rainAngle(head,tail,aspect) {
  return Math.atan2(tail.y-head.y,(tail.x-head.x)*aspect);
}

function rainAngleDelta(from,to) {
  return Math.atan2(Math.sin(to-from),Math.cos(to-from));
}

function flyAboveValley(world, game, age) {
  const before=world.inkCamera.rainCutProjection;
  const matched=world.epilogueCamera.aspect<1&&before?.finale===game.finale;
  const poseAt = time => ({ x: 7.2 - time * 5.1,
    y: 21.1 - time * 2.15 + (matched ? -1.91*time*(1-smootherstep(time,-.65,.61)) : 0),
    z: 38.3 + time * 6.2 });
  const position = poseAt(age);
  const trail = Array.from({ length: 100 }, (_, index) => poseAt(age - index * .047));
  const length = clamp(game.p.body, 13, 29);
  const heading = Math.atan2(-5.1, 6.2);
  if (world.epilogueFlightAge == null || age < world.epilogueFlightAge) world.inkDragon.resetMotion();
  const dt = clamp(age - (world.epilogueFlightAge ?? age), 0, .05);
  world.epilogueFlightAge = age;
  world.inkDragon.update({ stage: 4, heading, position, length, trail, density: game.p.density,
    spine: sampleSpine(trail, length, .858, position), time: world.t }, dt);
  world.inkDragon.setVisible(true);
  return position;
}
