import * as THREE from 'three';
import { createBeamGroundVisuals, createSpaceArtVisuals } from './dragon-arts-space.js';
import { createStasisArtVisuals } from './dragon-arts-stasis.js';
import { createDragonArtHitAccents, dragonArtHitPriority } from './dragon-art-hit-accents.js';
import { createDragonArtHeroBeats } from './dragon-art-hero-beat.js';
import { createDragonArtDeathPlates } from './dragon-art-death-plates.js';
import { TechniqueArtVisual } from './technique-art-visual.js';
import { surfaceHeightSampler } from './warnings.js';

const COLORS = {
  stone: '#766653', frost: '#85cad0', rift: '#382443',
  abyss: '#273735', beam: '#a95832',
};
const count = 960;
const MAX_MARKS = 160;
const MAX_REACTIONS = 14;
const MAX_REVEALS = 7;
const MAX_FRAGMENTS = 185;
const {clamp, smoothstep} = THREE.MathUtils;
const revealShader = /* glsl */ `
  uniform sampler2D tDragonRevealDepth;
  uniform vec2 uDragonRevealSize;
  uniform vec4 uDragonRevealShape[${MAX_REVEALS}];
  uniform vec4 uDragonRevealDepth[${MAX_REVEALS}];
  uniform int uDragonRevealCount;
  uniform float uDragonScenicAlpha;

  float dragonScenicCoverage(float competingWash) {
    vec2 uv = gl_FragCoord.xy / uDragonRevealSize;
    float open = 0.;
    for (int i = 0; i < ${MAX_REVEALS}; i++) {
      if (i >= uDragonRevealCount) break;
      vec4 shape = uDragonRevealShape[i];
      vec2 delta = abs((uv - shape.xy) / shape.zw);
      if (max(delta.x, delta.y) >= 1.) continue;
      vec4 gate = uDragonRevealDepth[i];
      if (gate.x > texture2D(tDragonRevealDepth, shape.xy).r ||
          gate.y > texture2D(tDragonRevealDepth, uv).r) continue;
      float brush = sin(7.1 * delta.x + 2.3 * delta.y) * .045;
      float grain = 1. - smoothstep(.16, 1., dot(delta, delta) + brush);
      open = max(open, grain * gate.z * mix(1.,competingWash,gate.w));
    }
    return uDragonScenicAlpha * (1. - open);
  }
`;

class DragonArtReveals {
  constructor(resolution, ...layers) {
    this.position = new THREE.Vector3();
    this.near = new THREE.Vector3();
    this.reveal = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.candidates = [];
    this.depth = {value:null};
    this.shapes = {value:Array.from({length:MAX_REVEALS},()=>new THREE.Vector4())};
    this.gates = {value:Array.from({length:MAX_REVEALS},()=>new THREE.Vector4())};
    this.count = {value:0};
    this.resolution = resolution;
    this.layers = [];
    for (const root of layers) root.traverse(object => {
      const material = object.material;
      if (!material?.isShaderMaterial) return;
      // The stone footings and shards belong to individuals and should remain intact.
      if (object.isInstancedMesh) return;
      const weight = {value:1};
      this.layers.push({weight, sweep:root === layers[0]});
      Object.assign(material.uniforms, {
        tDragonRevealDepth:this.depth, uDragonRevealSize:{value:resolution}, uDragonRevealCount:this.count,
        uDragonRevealShape:this.shapes, uDragonRevealDepth:this.gates, uDragonScenicAlpha:weight,
      });
      // Frost fill supplies its own weight so drawn cracks can survive above a quieted wash.
      const fragment = material.fragmentShader;
      material.fragmentShader = '#define DRAGON_REVEAL\n' + revealShader + (fragment.includes('dragonScenicCoverage(')
        ? fragment : fragment.replace(/gl_FragColor\s*=\s*(vec4\(.+?\));/,
          `gl_FragColor = $1; gl_FragColor.a *= dragonScenicCoverage(${object.userData.scenicWash ? '.72' : '0.'});`));
    });
  }

  update(art, camera, time, marks, feed, depth, frostRelay, competing, steam) {
    this.depth.value = depth;
    const {count, candidates, position, near, reveal, direction} = this;
    count.value = 0;
    candidates.length = 0;
    let strikeWeight = 0;
    if (steam?.gain > .04) {
      candidates.push({subject:{...steam.point,radius:Math.min(2.6,steam.reach*.5)},weight:steam.gain*.93,score:20});
    }
    if (frostRelay?.gain > .04) {
      candidates.push({subject:{...frostRelay.point,radius:1.55},weight:frostRelay.gain*.92,score:19});
    }
    for (const group of competing) {
      for (const [index,subject] of group.points.entries()) {
        candidates.push({subject,weight:Math.min(.85,group.gain),score:10+group.gain-index*.55,competing:true});
      }
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const mark = marks[i];
      const age = time - mark.at;
      if (age < 0 || age > .34 || !mark.killed && !mark.shell && dragonArtHitPriority(mark) < 3) continue;
      const release = 1 - smoothstep(age,.115,.34);
      const follow = mark.impact==='stone-quarry'||mark.impact==='abyss-undertow'||mark.impact==='abyss-steamwake'||
        mark.impact==='frost-thunder-fork'||mark.impact==='frost-temper-rush'||mark.impact==='beam-conduit'||
        mark.impact==='beam-quench'||mark.impact==='rift-seam';
      strikeWeight = Math.max(strikeWeight,release);
      candidates.push({subject:mark, weight:release*.94, score:(follow?8:4)+release*(mark.killed||mark.shell?3:2)});
    }
    const stasis = art?.kind === 'stone' || art?.kind === 'frost';
    const shatter = stasis && (art.phase === 'shatter' || art.phase === 'echo' && art.echoPhase !== 'lock');
    const running = stasis && !shatter;
    if (running) {
      for (const enemy of art.locked?.values() ?? []) {
        if (enemy.hp <= 0 && !art.shells?.has(enemy.id)) continue;
        candidates.push({subject:enemy, weight:.83, score:4.1});
      }
    } else if (art?.kind === 'abyss' || art?.kind === 'rift') {
      for (const enemy of feed) {
        candidates.push({subject:enemy, weight:art.captures?.has(enemy.id)?.83:.58,
          score:art.captures?.has(enemy.id)?4.5:3.8});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    direction.setFromMatrixColumn(camera.matrixWorld,2);
    const projection = camera.projectionMatrix.elements;
    const width = this.resolution.x, height = this.resolution.y;
    let competingCount = 0;
    for (const {subject,weight,competing=false} of candidates) {
      if (count.value === MAX_REVEALS) break;
      if (competing && competingCount === 3) continue;
      const radius = clamp((subject.targetRadius ?? subject.radius ?? .72)*(competing?1.32:1),.48,1.8);
      position.set(subject.x,subject.y+radius*.42,subject.z);
      reveal.copy(position).project(camera);
      if (reveal.z < -1 || reveal.z > 1 || Math.abs(reveal.x) > .99 || Math.abs(reveal.y) > .99) continue;
      const viewZ = camera.isPerspectiveCamera
        ? Math.max(1,-near.copy(position).applyMatrix4(camera.matrixWorldInverse).z) : 1;
      const spanX = clamp((radius*1.50+.45)*projection[0]*.5/viewZ,12/width,66/width);
      const spanY = clamp((radius*1.04+.37)*projection[5]*.5/viewZ,8/height,41/height);
      const x = reveal.x*.5+.5, y = reveal.y*.5+.5;
      let intersects = false;
      for (let i = 0; i < count.value; i++) {
        const other = this.shapes.value[i];
        if (Math.hypot((x-other.x)/(spanX+other.z),(y-other.y)/(spanY+other.w)) < .52) {
          intersects = true;
          break;
        }
      }
      if (intersects) continue;
      const centerDepth = near.copy(position).addScaledVector(direction,radius*1.12).project(camera).z*.5+.5;
      const nearbyDepth = near.copy(position).addScaledVector(direction,radius*.86).project(camera).z*.5+.5;
      this.shapes.value[count.value].set(x,y,spanX,spanY);
      this.gates.value[count.value].set(centerDepth-.000035,nearbyDepth-.000019,weight,Number(competing));
      count.value++;
      if (competing) competingCount++;
    }
    const crest = shatter ? 1 - smoothstep(art.phaseAge??0,.06,.39) : strikeWeight;
    for (const {weight,sweep} of this.layers) {
      weight.value = 1 - (sweep ? .15 : .31) * crest;
    }
  }
}

const vertexShader = `
  varying vec3 vColor;
  void main() {
    vColor = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
  }`;
const fragmentShader = `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  varying vec3 vColor;
  void main() {
    float depth = texture2D(tDepth, gl_FragCoord.xy/uResolution).r;
    if(gl_FragCoord.z > depth + .00006) discard;
    gl_FragColor = vec4(vColor, .86);
    #include <colorspace_fragment>
  }`;

export class DragonArtsVisual {
  constructor(renderer, ink) {
    this.renderer = renderer;
    this.ink = ink;
    this.scene = new THREE.Scene();
    this.space = createSpaceArtVisuals();
    this.beamGround = createBeamGroundVisuals();
    this.stasis = createStasisArtVisuals();
    this.accents = createDragonArtHitAccents();
    this.hero = createDragonArtHeroBeats();
    this.deaths = createDragonArtDeathPlates();
    this.techniques = new TechniqueArtVisual();
    this.scene.add(this.beamGround.root, this.space.root, this.stasis.root, this.hero.root, this.accents.root, this.deaths.root, this.techniques.mesh);
    this.resolution = new THREE.Vector2();
    this.reveals = new DragonArtReveals(this.resolution,this.space.root,this.stasis.root);
    this.socket = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.left = new THREE.Vector3();
    this.absorptionFeed = [];
    this.absorptionCells = new Map();
    this.projection = new THREE.Vector3();
    this.pose = new THREE.Object3D();
    this.color = new THREE.Color();
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {tDepth:{value:null}, uResolution:{value:this.resolution}},
    });
    this.shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1), this.material, count);
    this.shards.frustumCulled = false;
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.setColorAt(0, this.color);
    this.shards.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.shards.renderOrder = 6;
    this.scene.add(this.shards);
    this.reset();
  }

  reset() {
    this.marks = [];
    this.frostContact = null;
    this.reactions = [];
    this.breaks = [];
    this.lastWaterContact = -Infinity;
    this.shards.count = 0;
    this.space.reset();
    this.beamGround.reset();
    this.stasis.reset();
    this.accents.reset();
    this.hero.reset();
    this.deaths.reset();
    this.techniques.reset();
  }

  event(event, time, world) {
    this.techniques.event(event,time);
    this.deaths.capture(event,time,world);
    this.hero.event(event,time,this.marks);
    const {type, kind} = event;
    if (!COLORS[kind]) return;
    if (!Number.isFinite(event.x + event.y + event.z)) return;
    if(kind==='frost'&&type==='dragonArtStart')this.frostContact=null;
    if(kind==='frost'&&type==='dragonArtImpact'&&event.phase==='shatter'&&
      (event.killed||event.shell||event.amount>0)&&!this.frostContact){
      this.frostContact={id:event.id,x:event.x,y:event.y,z:event.z,at:time};
    }
    if (type === 'dragonArtBreak') {
      this.breaks.push({...event, at:time});
      if (this.breaks.length > 5) this.breaks.shift();
      return;
    }
    if (type === 'dragonArtReaction') {
      this.reactions.push({...event, at:time});
      if (this.reactions.length > MAX_REACTIONS) this.reactions.shift();
      return;
    }
    if (type !== 'dragonArtImpact' || event.impact === 'lock' || !event.shell && !event.killed && !event.amount) return;
    if (this.marks.length >= MAX_MARKS) {
      let weakest = 0, priority = Infinity;
      for (let i = 0; i < this.marks.length; i++) {
        const mark = this.marks[i];
        if (time - mark.at > 1.05) {
          weakest = i;
          priority = 0;
          break;
        }
        const candidate = dragonArtHitPriority(mark);
        if (candidate >= priority) continue;
        weakest = i;
        priority = candidate;
      }
      if (priority > dragonArtHitPriority(event)) return;
      this.marks.splice(weakest,1);
    }
    this.marks.push({...event, at:time});
  }

  warm(camera) {
    return this.renderer.compileAsync(this.scene,camera);
  }

  addBeamWaterContact(world, art, origin, time) {
    if (art?.kind !== 'beam' || art.stage>=3 || !['sweep','echo'].includes(art.phase) || time-this.lastWaterContact<.20) return;
    const azimuth = art.sweepAngle ?? art.angle;
    const {sin, cos} = Math;
    const waterY = world.water.position.y;
    const ground = world.environment.heightAt;
    const stage=art.stage;
    const water=surfaceHeightSampler(world.water,waterY);
    for (const distance of [4, 7, 11, 16, 22, 28]) {
      if (distance > (art.beamLength??art.radius)*(art.phase==='echo'?.78:1)) break;
      const x = origin.x + sin(azimuth) * distance;
      const z = origin.z + cos(azimuth) * distance;
      const beamY = origin.y + distance*(art.beamPitch??0);
      const land=ground(x,z);
      const surface=water?.(x,z)??waterY;
      if (land>=surface+.12 || Math.abs(surface-beamY)>=1.25) continue;
      this.lastWaterContact=time;
      world.waterCombat.event({type:'beamContact',x,y:surface,z,surface:true,
        radius:art.beamWidth*1.55,fx:sin(azimuth),fz:cos(azimuth)},stage,time);
      break;
    }
  }

  paintFragments(time,heroWeight,relay,competing,steam) {
    const {shards, pose, color} = this;
    let written = 0;
    this.marks = this.marks.filter(mark => time - mark.at < 1.05);
    for (let i = this.marks.length - 1; i >= 0 && written < MAX_FRAGMENTS; i--) {
      const mark = this.marks[i];
      const age = Math.max(0,time - mark.at);
      const {kind, x,y,z,killed,targetId, from} = mark;
      if(mark.impact==='frost-temper-rush')continue;
      const stone = kind === 'stone', frost = kind === 'frost';
      const resonance=mark.impact==='resonance';
      const absorbed=mark.absorbed===true;
      const quiet = frost && mark.id===steam?.id ? steam.gain : 0;
      const closeToArc = frost && relay?.gain > .20 &&
        Math.hypot(x-relay.point.x,(y-relay.point.y)*1.28,z-relay.point.z)<8;
      const overlap = competing.reduce((weight,group) => Math.max(weight,group.gain *
        (1-smoothstep(Math.hypot(x-group.x,(y-group.y)*1.45,z-group.z),1.65,group.radius+2))),0);
      if (closeToArc && !killed && !mark.shell && !resonance) continue;
      if (heroWeight > .30 && (stone || kind === 'abyss') && !resonance) continue;
      const lifetime = absorbed ? .27 : stone ? .75 : frost ? .49 : .40;
      if (age > lifetime || !killed && !mark.shell && !resonance && age > .18) continue;
      const pieces = quiet > .35 ? 1 : closeToArc ? 2 : absorbed ? 2 : (stone || frost ? 2 : 1) + (killed || mark.shell ? 2 : 0);
      const strength = (killed || mark.shell ? 1 : .47) * (1 - smoothstep(age,lifetime*.33,lifetime))
        * (closeToArc ? .75 : 1) * (1-quiet*.81) * (resonance ? 1 : 1-.55*overlap*(killed ? smoothstep(age,.09,.27) : 1));
      for (let j=0; j<pieces && written<MAX_FRAGMENTS; j++) {
        const seed = j*2.39996 + (targetId ?? x+z) * .61;
        const travel = age * (1.6 + j%5*.69);
        const draw=absorbed&&from?THREE.MathUtils.smoothstep(age,0,.23):0;
        const pull=absorbed?1-draw:1;
        pose.position.set(THREE.MathUtils.lerp(x,from?.x??x,draw)+Math.cos(seed)*travel*pull+Math.sin(seed)*.23*pull,
          THREE.MathUtils.lerp(y,from?.y??y,draw)+.29*pull+age*(1.45+j%4*.55)*pull-age*age*(stone?4.5:2.4)*pull,
          THREE.MathUtils.lerp(z,from?.z??z,draw)+Math.sin(seed)*travel*pull+Math.cos(seed)*.23*pull);
        pose.rotation.set(seed+age*7, seed*.7+age*3, age*3-seed);
        const width = (.15 + .045 * (j%4)) * strength * (resonance?1.42:1) * pull;
        pose.scale.set(width*(frost?.48:1), width*(frost?2.1:1.12), width);
        pose.updateMatrix();
        shards.setMatrixAt(written,pose.matrix);
        color.set(j%4===0?(resonance&&frost?'#e4fffa':'#f8f1d8'):COLORS[kind]).multiplyScalar(.69+(j%5)*.12);
        shards.setColorAt(written++,color);
      }
    }
    shards.count = written;
    if(written) {
      shards.instanceMatrix.clearUpdateRanges();
      shards.instanceMatrix.addUpdateRange(0,written*16);
      shards.instanceMatrix.needsUpdate = true;
      shards.instanceColor.clearUpdateRanges();
      shards.instanceColor.addUpdateRange(0,written*3);
      shards.instanceColor.needsUpdate = true;
    }
  }

  canSee(point,camera) {
    const p=this.projection.set(point.x,point.y,point.z).project(camera);
    return p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.17&&Math.abs(p.y)<1.19;
  }

  gatherPulledEnemies(game,art,camera) {
    const feed=this.absorptionFeed;
    feed.length=0;
    if (art?.kind!=='rift'&&art?.kind!=='abyss') return feed;
    const cells=this.absorptionCells;
    cells.clear();
    for (const {enemy} of art.captures?.values() ?? []) {
      if (enemy.hp<=0||!this.canSee(enemy,camera)) continue;
      const p=this.projection;
      const cell=Math.floor((p.x+1.2)*3)+8*Math.floor((p.y+1.2)*3);
      const used=cells.get(cell)??0;
      if (used>=4) continue;
      cells.set(cell,used+1);
      feed.push(enemy);
      if(feed.length===20)break;
    }
    for (const enemy of game.enemies) {
      if (art.captures?.has(enemy.id)) continue;
      if (enemy.hp<=0||enemy.dragonArtPull!==art.id||game.time-enemy.dragonArtPullAt>.11) continue;
      if (!this.canSee(enemy,camera)) continue;
      feed.push(enemy);
      if(feed.length===26)break;
    }
    return feed;
  }

  render(camera, game, time, active, world) {
    const {renderer, ink, space, stasis, accents, hero, deaths, beamGround} = this;
    const art = game.activeDragonArt;
    const scorch=game.dragonScorch?.stage===game.stage ? game.dragonScorch :
      art?.scorchLanes?.length ? {art,lanes:art.scorchLanes} : null;
    if (!active || (!art && !this.marks.length && !this.reactions.length && !this.breaks.length && !scorch?.lanes.length
      && !scorch?.reservoirs?.length
      && !this.techniques.visible && !hero.beats.length && !hero.fronts.length && !hero.rainTurns.length
      && !hero.outlets.length && !hero.massClears.length && !deaths.active.length)) return;
    const depth = ink.target?.depthTexture;
    if(!depth) return;
    renderer.getDrawingBufferSize(this.resolution);
    this.material.uniforms.tDepth.value = depth;
    beamGround.update(scorch,camera,depth,this.resolution,game.time,world.environment.heightAt);
    hero.update(camera,time,depth,this.resolution,world,game.stage,art,scorch,game.time);
    deaths.update(time,camera,depth,this.resolution,world.clearContacts);
    const handoff = world.combatEmphasis?.visible[0];
    const crowd=(world.clearContacts??[]).find(group=>group.major&&group.id===art?.id);
    const heroWeight=Math.max(hero.prominence(art,time),(crowd?.gain??0)*.84);
    const frostRelay=this.techniques.frostFocus(time);
    const steam=hero.frostTemperFocus(art?.id,time);
    const feed = this.gatherPulledEnemies(game,art,camera);
    const competing=art ? (world.clearContacts??[]).filter(group=>group.sourceType==='cascadeHit') : [];
    this.reveals.update(art,camera,time,this.marks,feed,depth,frostRelay,competing,steam);
    const dragon=world.inkDragon;
    let origin = art?.origin ?? art;
    if (art && (art.kind === 'stone' || art.kind === 'frost')) {
      space.reset();
      const hit=this.frostContact;
      stasis.update(art,camera,art,{depth,resolution:this.resolution,
        firstImpact:hit?.id===art.id?{...hit,age:Math.max(0,time-hit.at)}:null,heroWeight,
        relay:Math.max(frostRelay?.gain??0,handoff?.route==='frost-thunder-fork'?handoff.strength:0),
        steam:Math.max(steam?.gain??0,(crowd?.gain??0)*.81),
        reducedMotion:world.reducedMotion.matches});
    } else {
      stasis.reset();
      if(art) {
        const actor=dragon.active?.actor;
        if (art.kind === 'beam') origin=dragon.muzzle(this.socket)??origin;
        if (art.kind === 'rift') {
          origin={
            muzzle:dragon.muzzle(this.socket)??origin,
            left:actor?.clawTip?.(this.left,1,-1) ?? actor?.frontPalm?.(this.left,-1),
            right:actor?.clawTip?.(this.right,1,1) ?? actor?.frontPalm?.(this.right,1),
          };
        }
        space.update(art,camera,origin,depth,this.resolution,{
          time, marks:this.marks, feed,heroWeight,
        });
      } else space.reset();
    }
    this.addBeamWaterContact(world,art,origin,time);
    this.paintFragments(time,heroWeight,frostRelay,competing,steam);
    this.reactions = this.reactions.filter(reaction => time - reaction.at < (reaction.duration??.75) + (reaction.reaction==='conductive-front'?.24:0));
    this.breaks = this.breaks.filter(burst => time - burst.at < .46);
    accents.update(art,camera,{time,marks:this.marks,feed,reactions:this.reactions,breaks:this.breaks,depth,resolution:this.resolution,
      world,stage:game.stage,zones:game.zones,gameTime:game.time,heroBeats:hero.beats,deathPlates:deaths.ids,steam});
    this.techniques.update(game,time,depth,this.resolution);
    if(!art&&!this.shards.count&&!accents.root.visible&&!hero.root.visible&&!beamGround.root.visible&&!deaths.active.length&&!this.techniques.mesh.count)return;
    const previous = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.scene,camera);
    } finally {
      renderer.autoClear = previous;
    }
  }
}
