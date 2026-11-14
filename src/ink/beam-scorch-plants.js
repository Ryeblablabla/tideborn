import { Box3, Color, MathUtils } from 'three';

const { clamp, smoothstep } = MathUtils;
const CHAR = new Color('#30241c');
const ASH = new Color('#181e1a');
const WET_ASH = new Color('#344543');
const MAX_SCORCHED = 56;
const ALIGHT = 4.6;
const RESTORED = 9.4;

/** Bend and char registered foliage where it intersects the live breath. */
export class BeamScorchPlants {
  constructor() {
    this.bounds = new Box3();
    this.roots = new WeakMap();
    this.plants = [];
    this.liveRoots = new Set();
    this.active = new Map();
    this.overrides = [];
    this.lastLanes = new WeakSet();
    this.revision = -1;
    this.stage = -1;
  }

  reset() {
    this.restore();
    this.active.clear();
    this.lastLanes = new WeakSet();
    this.plants.length = 0;
    this.liveRoots.clear();
    this.revision = this.stage = -1;
  }

  collect(root, materials) {
    if (!root || this.liveRoots.has(root)) return;
    this.liveRoots.add(root);
    let plants = this.roots.get(root);
    if (plants) {
      this.plants.push(...plants);
      return;
    }
    plants = [];
    root.traverse(plant => {
      if (!plant.userData.shoreCanopy && !plant.userData.beamScorchPine) return;
      const {min, max} = this.bounds.setFromObject(plant);
      const tall = Boolean(plant.userData.beamScorchPine);
      const x = (min.x + max.x) * .5;
      const z = (min.z + max.z) * .5;
      const top = max.y;
      const bottom = tall ? min.y + .36 * (top - min.y) : min.y;
      const radius = Math.max(.18, .38 * Math.max(max.x - min.x, max.z - min.z));
      const parts = [];
      plant.traverse(mesh => {
        if (!mesh.isMesh || !mesh.userData.inkTint) return;
        const tone = materials.get(mesh)?.uniforms.uToneRange?.value;
        parts.push({mesh, tone, color:new Color()});
      });
      if (parts.length && Number.isFinite(x + top + z)) {
        plants.push({plant, root, x, z, bottom, top, ground:min.y, radius, tall, parts});
      }
    });
    this.roots.set(root, plants);
    this.plants.push(...plants);
  }

  refresh(world) {
    const {environment} = world;
    const {stage, frontier} = environment;
    if (this.stage === stage && this.revision === frontier.revision) return;
    if (this.stage !== stage) this.active.clear();
    this.stage = stage;
    this.revision = frontier.revision;
    this.plants.length = 0;
    this.liveRoots.clear();
    const materials = new Map(world.inkDragon.ink.records.map(record => [record.mesh,record.material]));
    this.collect(environment.cache.get(stage),materials);
    for (const {root} of frontier.chunks.values()) this.collect(root,materials);
    for (const plant of this.active.keys()) {
      if (!this.liveRoots.has(plant.root)) this.active.delete(plant);
    }
  }

  heat(world, art, time, origin) {
    if (art?.kind !== 'beam' || !['sweep','echo'].includes(art.phase) || !origin) return;
    const angle = art.sweepAngle ?? art.angle;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    const echo = art.phase === 'echo';
    const length = (art.beamLength ?? art.radius) * (echo ? .78 : 1);
    const width = (art.beamWidth ?? 1.2) * (echo ? .68 : 1);
    const slope = art.beamPitch ?? 0;
    let openLength = length;
    // A stone ridge shields plants behind the actual line of breath.
    for (let distance=2; distance<length; distance+=1.3) {
      if (world.environment.heightAt(origin.x + x * distance, origin.z + z * distance) <= origin.y + slope*distance + .15) continue;
      openLength = distance + .55;
      break;
    }
    for (const plant of this.plants) {
      const {radius, bottom, top} = plant;
      const dx = plant.x - origin.x;
      const dz = plant.z - origin.z;
      const along = dx * x + dz * z;
      if (along < .3 || along > openLength + radius) continue;
      const lift = origin.y + slope*along;
      const across = Math.abs(dx * z - dz * x);
      if (across > radius + width * .78 || lift < bottom - width * .46 || lift > top + width * .46) continue;
      const intensity = 1 - .40 * clamp(across / (radius + width), 0, 1);
      this.ignite(plant,time,x,z,intensity);
    }
  }

  ignite(plant,time,x,z,intensity,grounded=false) {
    const previous = this.active.get(plant);
    if (previous) {
      previous.last = time;
      if(grounded){
        previous.grounded=true;
        previous.intensity=Math.max(previous.intensity,intensity);
      }
      return;
    }
    if (this.active.size < MAX_SCORCHED) {
      this.active.set(plant, {first:time, last:time, x, z, intensity, grounded});
    }
  }

  heatGround(lanes,gameTime,startedAt,time) {
    for (const lane of lanes) {
      if (gameTime > (lane.expires??(startedAt+lane.expiresAt))) continue;
      const fresh = !this.lastLanes.has(lane);
      if (!fresh && !lane.doused?.length) continue;
      if (fresh) this.lastLanes.add(lane);
      for (const plant of this.plants) {
        const {x,z,ground,radius} = plant;
        const dx=x-lane.x,dz=z-lane.z;
        const along=dx*lane.direction.x+dz*lane.direction.z;
        if(along < lane.length/6-radius || along > lane.length+radius)continue;
        const across=Math.abs(dx*lane.direction.z-dz*lane.direction.x);
        if(across > lane.width+radius*.62)continue;
        // Only inspect portions of the lane with an actual near-ground sample.
        const floor = lane.points.find(sample => Math.abs(sample.y-ground)<.70 &&
          Math.hypot(sample.x-x,sample.z-z) < lane.length/10+radius);
        if(!floor)continue;
        if(lane.doused?.some(area=>along>=area.from&&along<=area.to)) {
          const mark=this.active.get(plant);
          if(mark)mark.wetAt ??= time;
        } else if(fresh) this.ignite(plant,time,lane.direction.x,lane.direction.z,.90,true);
      }
    }
  }

  update(world, art, time, origin, scorch=null, gameTime, visible=true) {
    this.restore();
    if(!visible)return;
    if (!this.active.size && art?.kind !== 'beam' && !scorch?.lanes?.length) return;
    this.refresh(world);
    this.heat(world,art,time,origin);
    const source=scorch?.art??art;
    if(source) this.heatGround(scorch?.lanes??source.scorchLanes??[],gameTime??(source.startedAt+source.age),source.startedAt,time);
    for (const [entry, mark] of this.active) {
      const age = time - mark.last;
      if (age >= RESTORED) {
        this.active.delete(entry);
        continue;
      }
      const {plant, tall, parts} = entry;
      const elapsed = time - mark.first;
      const pressure = smoothstep(elapsed + .024,0,.18) * (1 - smoothstep(age,ALIGHT,RESTORED)) * mark.intensity;
      if (pressure < .01) continue;
      const lean = pressure * (tall ? mark.grounded?.52:.27 : 1.12);
      const height = 1 - pressure * (tall ? mark.grounded?.43:.15 : mark.grounded?.67:.46);
      this.overrides.push(entry);
      entry.rotationX = plant.rotation.x;
      entry.rotationZ = plant.rotation.z;
      entry.height = plant.scale.y;
      plant.rotation.x += mark.z * lean;
      plant.rotation.z -= mark.x * lean;
      plant.scale.y *= height;
      const tint = mark.wetAt!==undefined ? WET_ASH : elapsed < .50 ? CHAR : ASH;
      for (const part of parts) {
        const data = part.mesh.userData;
        part.tint = data.inkTint;
        part.amount = data.inkTintAmount;
        data.inkTint = part.color.set(part.tint).lerp(tint,pressure * (tall ? .88 : 1));
        const amount = part.amount ?? .55;
        data.inkTintAmount = amount + (1 - amount) * pressure * .89;
        if (part.tone) {
          part.lightTone = part.tone.x;
          part.darkTone = part.tone.y;
          part.tone.x += Math.max(0,.36-part.tone.x) * pressure;
          part.tone.y += Math.max(0,.77-part.tone.y) * pressure;
        }
      }
    }
  }

  restore() {
    for (const {plant, rotationX, rotationZ, height, parts} of this.overrides) {
      plant.rotation.x = rotationX;
      plant.rotation.z = rotationZ;
      plant.scale.y = height;
      for (const {mesh, tint, amount, tone, lightTone, darkTone} of parts) {
        mesh.userData.inkTint = tint;
        mesh.userData.inkTintAmount = amount;
        tone?.set(lightTone,darkTone);
      }
    }
    this.overrides.length = 0;
  }
}
