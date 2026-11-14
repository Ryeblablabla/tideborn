import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LivingWorld } from '../world-v2.js';
import { previewAttackIntent } from '../weapon-combat.js';
import { FORM_BY_STAGE, PLAYABLE_FORMS, STAGES, firstChapterForForm } from '../rules.js';
import { BLESSING_RAIN_AT } from '../heaven-finale.js';
import { InkDragon } from './dragon.js';
import { inkWater } from './materials.js';
import { InkCamera } from './camera.js';
import {
  ChapterView, SEA_TO_MOUNTAIN_BOSS_SINK, SEA_TO_MOUNTAIN_DURATION, SEA_TO_MOUNTAIN_SPLASH,
  SEA_TO_MOUNTAIN_WINGBEAT,
} from './chapter-view.js';
import { ChapterSpray } from './chapter-spray.js';
import { prepareChapterInk } from './chapter-prewarm.js';
import { ChapterBreaker } from './chapter-breaker.js';
import { ChapterFlightWake } from './chapter-flight-wake.js';
import { ChapterWingGrowthInk } from './chapter-wing-growth-ink.js';
import { BlessingRain, courtRainLanding } from './blessing-rain.js';
import { updateChapterCliff } from './chapter-vista.js';
import { ClawSurface } from './claw-surface.js';
import { createOcean } from './ocean.js';
import { ValleyMist } from './mist.js';
import { applyMountainRiver } from './river-ink.js';
import { InkCombatStyle } from './combat-style.js';
import { InkWarnings } from './warnings.js';
import { InkImpactEffects } from './impact-effects.js';
import { ShallowContact } from './shallow-contact.js';
import { WaterCombat } from './water-combat.js';
import { WeaponStrokes } from './weapon-strokes.js';
import { BodySignals } from './body-signals.js';
import { CrabChargeWarning } from './charge-warning.js';
import { ReedVisibility } from './reed-visibility.js';
import { InkVortexFields, INK_VORTEX_KINDS } from './vortex-fields.js';
import { InkWondersVisual } from './wonders-visual.js';
import { CascadeEffects } from './cascade-effects.js';
import { ClearContacts } from './clear-contacts.js';
import { DragonArtsVisual } from './dragon-arts-visual.js';
import { CombatEmphasis } from './combat-emphasis.js';
import { CombatFraming } from './combat-framing.js';
import { BeamScorchPlants } from './beam-scorch-plants.js';
import { EndingForeshadow, MARSH_CHAIN, LAKE_SLUICE, RELAY_CLOUD_JOINT, RELAY_SNAP } from './ending-foreshadow.js';
import { prepareGatePawTargets, updateHeavenFinale } from './heaven-finale.js';
import { prepareEpilogueRain, scheduleEpiloguePreparation, updateEndingEpilogue } from './ending-epilogue.js';
import { GateFeather } from './gate-feather.js';
import { EndingGrade } from './ending-grade.js';
import { GateContactWash } from './gate-contact-wash.js';
import './style.css';
import {InkEnvironment}from'./environment.js';
import {InkFauna, INK_FOOD, createInkFoodGeometry} from './fauna.js';
import { FOOD_KINDS as foodKinds, clearFoodSwallows, noteFoodSwallow, updateFoodAppearance } from './food-appearance.js';
import {supportInstancing}from'./instanced-ink.js';

const heavenPreviewOrigin={x:0,z:0,angle:0};
const SEA_GATE_SHOT_DURATION=2.1;
const RELAY_SHOT_DURATION=1.8;

export class InkWorld extends LivingWorld {
  constructor(canvas){
    super(canvas);document.body.classList.add('ink-art');this.isInk=true;
    this.chapterArrivals={1:{x:0,y:.82,z:0,angle:0},2:{x:0,y:.86,z:-4.8,angle:0},3:{x:0,y:11.6,z:-2.8,angle:0}};
    this.cameraMode='field';this.studyStage=3;this.inkCamera=new InkCamera(this.flatCamera);
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.chapterView=new ChapterView();
    this.chapterSpray=new ChapterSpray();
    this.chapterRevealPoint=new THREE.Vector3();
    this.chapterBreaker=new ChapterBreaker();
    this.chapterFlightWake=new ChapterFlightWake();
    this.chapterWingGrowthInk=new ChapterWingGrowthInk();
    this.blessingRain=new BlessingRain(this.scene);
    this.scene.add(this.chapterBreaker.root,this.chapterFlightWake.mesh,this.chapterWingGrowthInk.mesh);
    this.clawSurface=new ClawSurface();
    this.ocean=createOcean();this.scene.add(this.ocean.root);
    this.scene.background=new THREE.Color('#f5f2e9');this.renderer.setClearColor('#f5f2e9');this.scene.fog=new THREE.Fog('#f5f2e9',48,125);
    this.dome.visible=false;this.clouds.visible=false;this.sunHalo.visible=false;this.flashLight.intensity=0;
    this.inkDragon=new InkDragon(this.scene,this.renderer);
    this.mist = new ValleyMist(this.inkDragon.ink);
    this.reedVisibility = new ReedVisibility(this.inkDragon.ink);
    this.foodModels = new Map();
    this.ready = this.inkDragon.ready.then(() => {
      const ink = this.inkDragon.ink;
      this.environment.register(ink);
      this.fauna = new InkFauna(this.scene, ink);
      for (const kind of [...foodKinds, 'shed']) {
        const mesh = new THREE.InstancedMesh(createInkFoodGeometry(kind), new THREE.MeshBasicMaterial(), 520);
        const { tint, strength, name } = INK_FOOD[kind];
        mesh.name = name;
        mesh.userData.inkTint = tint;
        mesh.userData.inkTintAmount = strength;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        ink.register(mesh, {strokes:false, geometryInfluence:0, toneRange:[.11,.48], reserveStrength:.27});
        supportInstancing(ink.records.find(record => record.mesh === mesh).material);
        this.foodModels.set(kind, mesh);
      }
      this.inkDragon.resize();
    });
    this.studyCamera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.1,250);this.studyCamera.position.set(12,15,15);
    this.orbit=new OrbitControls(this.studyCamera,canvas);this.orbit.target.set(0,7,-4);this.orbit.enableDamping=true;this.orbit.enabled=false;this.orbit.minDistance=4;this.orbit.maxDistance=45;this.orbit.maxPolarAngle=Math.PI*.48;
    this.combatStyle=new InkCombatStyle(this.combat);
    this.inkWarnings=new InkWarnings(this.scene);
    this.inkImpacts=new InkImpactEffects(this.scene);
    this.shallowContact=new ShallowContact(this.scene);
    this.waterCombat=new WaterCombat(this.water);
    this.weaponStrokes=new WeaponStrokes(this.scene);
    this.clawPalm=new THREE.Vector3();
    this.clawRay=new THREE.Raycaster();
    this.bodySignals=new BodySignals(this.scene);
    this.crabChargeWarning=new CrabChargeWarning(this.scene);
    this.vortexFields=new InkVortexFields(this.scene);
    this.combat.spatialFields=INK_VORTEX_KINDS;
    this.wonderVisuals=new InkWondersVisual(this.scene);
    this.dragonArts=new DragonArtsVisual(this.renderer,this.inkDragon.ink);
    this.combatEmphasis=new CombatEmphasis(this.inkDragon.ink);
    this.combatFraming=new CombatFraming();
    this.beamScorchPlants=new BeamScorchPlants();
    this.beamScorchMuzzle=new THREE.Vector3();
    this.cascadeEffects=new CascadeEffects(this.renderer,this.inkDragon.ink);
    this.clearContactBeat=new ClearContacts();
    this.clearContacts=this.clearContactBeat.visible;
    this.endingSigns=new EndingForeshadow(this.environment,this.scene);
    this.gateFeather=new GateFeather(this.scene,this.inkDragon.ink);
    this.endingGrade=new EndingGrade(this.inkDragon.ink);
    this.gateContactWash=new GateContactWash();
    this.epilogueCamera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.08,220);
    this.epilogueWash=document.createElement('div');
    this.epilogueWash.setAttribute('aria-hidden','true');
    this.epilogueWash.style.cssText='position:fixed;inset:0;pointer-events:none;background:#f5f2e9;z-index:2;opacity:0';
    document.body.append(this.epilogueWash);
    this.resize();
  }
  createWater(){return inkWater();}
  createWorld(){
    this.water.rotation.x=-Math.PI/2;this.water.position.y=-.12;this.water.userData.inkPaperSupport=true;this.bobbing=[];
    this.environment=new InkEnvironment(this.decor);this.obstacles=this.environment.obstacles;
  }
  setStage(stage){this.stage=stage;}
  prepareChapterTransition(body){
    this.valleyPreparation??=new Promise(resolve=>setTimeout(resolve,0)).then(async()=>{
      const {ink}=this.inkDragon;
      const valley=this.environment.prepareStage(3,ink);
      const [incoming]=await Promise.all([
        this.inkDragon.load(FORM_BY_STAGE[3]),this.chapterSpray.prepare(this.renderer),
      ]);
      try{
        this.inkDragon.prepareTransitionLength(incoming,FORM_BY_STAGE[2],body);
      }catch(error){
        console.warn('应龙躯干网格预分配未完成',error);
      }
      await prepareChapterInk(this,valley,incoming).catch(error=>{
        console.warn('千山水墨着色器预热未完成',error);
      });
    }).catch(error=>{
      this.valleyPreparation=null;
      throw error;
    });
    return this.valleyPreparation;
  }
  finishChapterTransition(game,transition){
    this.chapterView.finish(game,transition,this.environment.mountainRiver);
    this.chapterExitAge = 0;
  }
  reset(){
    super.reset();
    this.center.set(0,0,0);
    this.inkCamera.mode=null;
    this.enemyCamera=null;
    this.combatClearFocus=null;
    this.lastCombatStop=-Infinity;
    this.combatClearPocket=null;
    this.combatEmphasis?.reset();
    this.combatFraming?.reset();
    this.clearContactBeat?.reset();
    this.fauna?.crowd.clear();
    this.chapterView?.reset();
    this.chapterExitAge = undefined;
    this.clawSurface?.clear();
    this.inkDragon.resetMotion?.();
    this.inkImpacts?.reset();
    this.cascadeEffects?.reset();
    this.dragonArts?.reset();
    this.beamScorchPlants?.reset();
    clearFoodSwallows(this);
    this.weaponStrokes?.reset();
    this.bodySignals?.reset();
    this.crabChargeWarning?.reset();
    this.endingSigns?.reset();
    this.wonderVisuals?.reset();
    this.relayView=null;
    this.relayLead=null;
    this.seaGateView=null;
    this.epilogueStage=null;
    this.epilogueFlightAge=null;
    this.epiloguePreparation=null;
    if(this.epilogueWash)this.epilogueWash.style.opacity=0;
    this.clawContact=null;
    this.pendingClawHit=null;
    this.pendingWaterHits?.clear();
    this.environment.clearFrontier?.();
    this.environment.setStage(0,this.inkDragon.ink);
  }
  retryGate(){
    this.inkCamera.mode=null;
    this.inkDragon.resetMotion();
    this.inkImpacts.reset();
    this.hitStop=0;
    this.shake=0;
  }
  holdsEndingReveal(game){
    const view=game.stage===2?this.seaGateView:game.stage===3?this.relayView:null;
    const duration=game.stage===2?SEA_GATE_SHOT_DURATION:RELAY_SHOT_DURATION;
    return Boolean(view&&this.t-view.at<duration);
  }
  endingRevealCaption(game){
    if(!this.holdsEndingReveal(game))return null;
    if(game.stage===2){
      return this.t-this.seaGateView.at>=1.06?'海闸已开。长链没入远处云山。':'';
    }
    const age=this.t-this.relayView.at;
    return age<.30?'':age<.93?'雷击铁环，沿长链上行。':'云后传来一声断响。';
  }
  resize(){
    super.resize();const h=Math.min(1080,Math.max(600,Math.round(innerHeight*Math.min(devicePixelRatio||1,1.25))));this.width=Math.round(h*innerWidth/innerHeight);this.height=h;this.renderer.setSize(this.width,h,false);
    this.inkCamera?.resize();
    this.inkDragon?.resize();
    if(this.studyCamera){this.studyCamera.aspect=innerWidth/innerHeight;this.studyCamera.updateProjectionMatrix();}
    if(this.epilogueCamera){this.epilogueCamera.aspect=innerWidth/innerHeight;this.epilogueCamera.updateProjectionMatrix();}
  }
  event(event){
    this.combatEmphasis.event(event,this.t,this.stage);
    this.combatFraming.event(event,this.t,this.stage);
    this.clearContactBeat.event(event,this.t,this.stage);
    if(event.type==='dragonArtBreak'||event.type==='cascadeBreak'){
      const ensemble=event.type==='dragonArtBreak'&&(event.kind==='stone'||event.kind==='abyss');
      this.combatClearFocus={x:event.x,y:event.y,z:event.z,stage:event.stage,at:this.t,
        weight:event.type==='cascadeBreak'?.51:.75+Math.min(.25,(event.burstKills??5)*.028),ensemble};
      if(ensemble)this.combatClearPocket=this.combatClearFocus;
      if(ensemble&&!this.reducedMotion.matches&&this.t-this.lastCombatStop>.88){
        this.hitStop=Math.max(this.hitStop,event.kind==='stone'?.068:.050);
        this.lastCombatStop=this.t;
      }
    }
    this.wonderVisuals?.event(event,this.t);
    this.dragonArts?.event(event,this.t,this);
    this.endingSigns?.event(event,this.t);
    if(event.type==='endingRoute'&&event.kind==='relay-lock'&&event.relay){
      this.relayLead={point:new THREE.Vector3(event.x,event.y,event.z),origin:event.from,at:this.t,duration:event.duration};
    }else if(event.type==='endingRoute'&&event.kind==='relay-escape'&&this.relayLead){
      this.relayLead.escape=event.from;
    }else if(event.type==='endingRoute'&&event.kind==='relay-strike'){
      this.relayView={...(this.relayLead??{point:new THREE.Vector3(event.x,event.y,event.z),origin:event.from}),
        escape:event.from,at:this.t};
      this.relayLead=null;
    }else if(event.type==='hazardImpact'&&event.relay&&!event.conducted){
      this.relayLead=null;
    }else if(event.type==='endingRoute'&&event.kind==='gate-open'){
      this.seaGateView={point:new THREE.Vector3(event.x,event.y,event.z),from:event.from,at:this.t};
    }
    if(typeof event.type==='string'&&event.type.startsWith('cascade')){
      this.cascadeEffects.event(event,this.t);
      return;
    }
    if(event.type==='kill'&&event.cascade)return;
    if(event.type==='eat')noteFoodSwallow(this,event);
    if(event.type==='hit')this.fauna?.contact?.(event,this.enemyMeshes.get(event.targetId));
    const charge=event.type==='bossCharge'&&event.attack==='crab-charge';
    const atWater=this.stage===0||this.stage<3&&(event.y??.7)<1.8;
    const waterAction=atWater&&(event.type==='dash'||event.type==='ringBurst');
    if(event.type==='arc'){
      this.inkImpacts.addArc(event,this.t);
      this.flashLight.intensity=.75;
      this.flashLight.position.set(event.to.x,event.to.y+2,event.to.z);
    }else if(charge)this.crabChargeWarning.event(event);
    else if(event.type!=='bossWave'&&event.type!=='evolve'&&!waterAction)super.event(event);
    if(waterAction&&event.type==='ringBurst'){
      this.shake=Math.max(this.shake,.18);
      this.hitStop=Math.max(this.hitStop,.035);
    }
    this.inkDragon.event(event);
    this.waterCombat.event(event,this.stage,this.t);
    let stroke=event;
    const spine=this.inkDragon.spine;
    if(event.type==='weaponStrike'&&event.strike==='tail'&&!event.cancelled&&spine.stage===FORM_BY_STAGE[this.stage]&&spine.motion){
      const point=spine.atDistance(spine.motion.length*.74/spine.scale,this.paintedStrike??=new THREE.Vector3()).multiplyScalar(spine.scale);
      const span=Math.hypot(point.x-event.x,point.y-event.y,point.z-event.z);
      const fit=Math.min(1,.62/Math.max(.01,span));
      stroke={...event,x:event.x+(point.x-event.x)*fit,y:event.y+(point.y-event.y)*fit,z:event.z+(point.z-event.z)*fit};
    }
    const closeHit=event.type==='hit'&&event.strikeId!=null&&['claw','bite'].includes(event.source);
    const pulseHit=event.type==='hit'&&atWater&&event.source==='water'&&event.strikeId!=null&&!event.guarded&&!event.boss;
    const hitMesh=event.type==='armorBreak'||event.type==='hit'&&(event.boss||closeHit)?this.enemyMeshes.get(event.targetId):null;
    if(pulseHit){
      const contacts=this.pendingWaterHits??=new Map();
      if(contacts.size<6&&!contacts.has(event.targetId))contacts.set(event.targetId,{event,time:this.t,stage:this.stage});
    }else if(closeHit&&event.source==='claw'&&!event.guarded&&this.clawContact?.strikeId===event.strikeId&&
       this.clawContact.targetId===event.targetId){
      this.pendingClawHit={event,time:this.t,stage:this.stage,side:this.clawContact.side};
    }else this.weaponStrokes.event(stroke,this.t,hitMesh,this.camera);
    this.bodySignals.event(event,this.t);
    if(event.type==='clawRelease'){
      this.clawContact=event.strike==='claw'&&!event.cancelled&&event.hit
        ? {strikeId:event.strikeId,targetId:event.targetId,side:event.side} : null;
    }else if(event.type==='hurt'||event.type==='evolve')this.clawContact=null;
    if(event.type==='clawRelease'&&event.hit){
      this.shake=Math.max(this.shake,.17);
      this.hitStop=Math.max(this.hitStop,.043);
    }
    if(event.type==='hazardImpact'&&!event.conducted)this.inkImpacts.add(event,this.t);
    if(event.type==='evolve'){
      this.inkImpacts.reset();
      this.cascadeEffects.reset();
      this.dragonArts.reset();
      this.beamScorchPlants.reset();
      this.clawSurface.clear();
      this.combatEmphasis.reset();
      this.clearContactBeat.reset();
      this.combatFraming.reset();
      this.combatClearFocus=null;
      this.combatClearPocket=null;
      this.pendingClawHit=null;
      this.pendingWaterHits?.clear();
    }
  }

  drawClawContact(stage,active){
    const pending=this.pendingClawHit;
    this.pendingClawHit=null;
    if(!pending||!active||pending.stage!==stage)return;

    const {event,time,side}=pending;
    const target=this.enemyMeshes.get(event.targetId);
    const creature=target?.userData.creature;
    const motion=this.inkDragon.motion;
    const action=motion.action;
    let mark=event;
    if(creature?.isMesh&&action?.id===event.strikeId&&action.kind==='claw'&&action.release?.hit&&this.inkDragon.stage===FORM_BY_STAGE[stage]){
      const anchor=motion.clawSurface?.point;
      const palm=anchor
        ? this.inkDragon.active.actor.clawTip?.(this.clawPalm,motion.clawSurface.digit)
        : this.inkDragon.active.actor.frontPalm?.(this.clawPalm,side);
      if(palm){
        if(anchor){
          if(palm.distanceToSquared(anchor)<.0225){
            this.clawRay.ray.direction.set(event.x-event.from.x,event.y-event.from.y,event.z-event.from.z);
            if(this.clawRay.ray.direction.lengthSq()<.0001)
              this.clawRay.ray.direction.set(Math.sin(this.inkDragon.motion.heading),0,Math.cos(this.inkDragon.motion.heading));
            palm.copy(anchor).addScaledVector(this.clawRay.ray.direction.normalize(),-.15);
          }
          mark={...event,x:anchor.x,y:anchor.y,z:anchor.z,from:{x:palm.x,y:palm.y,z:palm.z}};
        }else{
          const ray=this.clawRay;
          ray.ray.origin.copy(palm);
          ray.ray.direction.set(event.x-palm.x,event.y-palm.y,event.z-palm.z).normalize();
          ray.far=.85;
          creature.updateWorldMatrix(true,false);
          const surface=ray.intersectObject(creature,false)[0];
          if(surface&&surface.distance>.015)mark={...event,from:{x:palm.x,y:palm.y,z:palm.z}};
        }
      }
    }
    this.weaponStrokes.event(mark,time,target,this.camera);
  }
  renderCombat(game,motion,handoff){
    const action=motion.action;
    const prey=action?.kind==='claw'?this.enemyMeshes.get(action.targetId):null;
    const pull=prey?this.clawSurface.displacement(action,motion.contactAge):null;
    if(pull)prey.position.add(pull);
    try{
      this.combatStyle.render(this,this.scene,this.camera,this.t,game,handoff);
    }finally{
      if(pull)prey.position.sub(pull);
    }
  }
  drawWaterContacts(stage,active){
    if(!this.pendingWaterHits?.size)return;
    if(active)for(const {event,time,stage:originStage} of this.pendingWaterHits.values()){
      if(originStage===stage)this.weaponStrokes.event(event,time,this.enemyMeshes.get(event.targetId),this.camera);
    }
    this.pendingWaterHits.clear();
  }
  fadeOccluders(){}
  makeEnemy(e){return this.fauna?this.fauna.make(e,this.stage):super.makeEnemy(e);}
  remove(mesh){if(mesh.userData.inkFauna)this.fauna.remove(mesh);else super.remove(mesh);}
  studyFrame(stage) {
    const time = this.t;
    const height = [1, 1.2, 2, 12, 15][stage];
    const length = this.studyLength || 18;
    const spacing = .65 * (1 + stage * .08);
    const spine = Array.from({ length: Math.ceil(length) + 1 }, (_, i) => ({
      x: Math.sin(time * .62 - i * .26) * (stage >= 3 ? 1.25 : 1.6),
      y: height + Math.sin(i * .23 - time * 1.4) * .17 + (stage === 4 ? Math.max(-4, 1 - i * .23) : 0),
      z: 3 - i * spacing,
    }));
    return {stage, spine, heading: 0, length, density: 1, time, position: spine[0]};
  }
  playFrame(game) {
    const {p,stage:chapter,form}=game;
    let intent;
    const claw=game.clawAttack;
    if(game.status==='playing'&&(claw?.kind==='claw'||claw?.kind==='bite')&&claw.target?.hp>0){
      intent={target:claw.target,clawIn:claw.releaseAt-game.time};
    }else if(game.status==='playing'&&chapter<4){
      const xAhead=Math.sin(p.angle),zAhead=Math.cos(p.angle);
      let prey,nearest=1.55;
      for(const food of game.food){
        if(food.grace>0)continue;
        const x=food.x-p.x,z=food.z-p.z;
        if(Math.abs(x)>nearest||Math.abs(z)>nearest||x*xAhead+z*zAhead<.16)continue;
        const distance=Math.hypot(x,food.y-p.y,z);
        if(distance<nearest){nearest=distance;prey=food;}
      }
      if(prey)intent={target:prey,bite:true,prepare:1-THREE.MathUtils.smoothstep(nearest,.72,1.55)};
      else intent=previewAttackIntent(game);
    }else if(chapter===4&&game.finale){
      intent=game.finale.phase==='audience'?{target:game.ascentTarget,settle:.92,arrived:true}:null;
    }else if(chapter===4&&game.ascentTarget){
      const target=game.ascentTarget;
      const distance=Math.hypot(target.x-p.x,target.z-p.z);
      intent={target,settle:1-THREE.MathUtils.smoothstep(distance,3.5,11),arrived:game.status==='won'};
    }
    return {stage:form,chapter,spine:game.bodyPath,trail:game.trail,heading:p.angle,position:p,
      length:p.body,density:p.density,time:this.t,intent,finale:game.finale};
  }
  project(x,z,y=0) {
    const point=new THREE.Vector3(x,y,z).project(this.camera);
    return {x:(point.x+1)*this.width/2,y:(1-point.y)*this.height/2,
      visible:point.z>=-1&&point.z<=1&&Math.abs(point.x)<=1.12&&Math.abs(point.y)<=1.12};
  }
  present(game,dt,options={}){
    if(!this.inkDragon?.active){this.renderer.render(this.scene,this.camera);return;}
    const study=!!options.study,menu=!!options.menu,stage=study?this.studyStage:game.stage;
    const transition=!study&&!menu?options.chapterTransition:null;
    const finale=!study&&!menu?game.finale:null;
    if(finale?.phase==='audience'||finale?.phase==='stomp'||finale?.phase==='lock'){
      scheduleEpiloguePreparation(this,finale);
      if(finale.phase==='audience')prepareEpilogueRain(this);
    }
    const seaReveal=stage===2&&this.seaGateView&&!transition&&!menu&&!study?this.t-this.seaGateView.at:Infinity;
    const liveRelay=stage===3&&!transition&&!menu&&!study;
    const relayAiming=liveRelay?game.endingRoute?.mountainStrike:null;
    const relayTracking=Boolean(relayAiming?.relay&&this.relayLead);
    const relayReveal=liveRelay&&this.relayView?this.t-this.relayView.at:Infinity;
    const storyShot=seaReveal<SEA_GATE_SHOT_DURATION||relayReveal<RELAY_SHOT_DURATION;
    const showCombat=!menu&&!study&&!transition&&!storyShot&&stage<4;
    const handoff=this.combatEmphasis.update(this.t,stage,showCombat,game.p);
    const combatView=showCombat&&!this.reducedMotion.matches&&game.status==='playing'&&!relayTracking
      ? this.combatFraming.view(this.t,stage,game) : null;
    const contacts=this.clearContactBeat.update(this.t,stage,showCombat&&!relayTracking&&game.status==='playing',this.reducedMotion.matches);
    this.player.visible=false;this.body.forEach(b=>b.visible=false);this.spines.forEach(b=>b.visible=false);this.feet.visible=false;this.playerShadow.visible=false;
    this.foodMesh.visible=false;this.foodGlow.visible=false;this.dome.visible=false;this.clouds.visible=false;this.sunHalo.visible=false;
    this.scene.fog.color.set('#f5f2e9');this.renderer.setClearColor('#f5f2e9');this.scene.background.set('#f5f2e9');
    this.airIslands.forEach(g=>g.visible=false);this.sky.visible=false;
    this.endingGrade.update(finale,game.p);
    if(finale?.ending!=='locked')this.gateFeather.hide();
    if(finale?.phase!=='blessing'){
      this.blessingRain.update(null);
      this.environment.landmark?.userData.wetCourtRoof?.update(null,null);
    }
    if(updateEndingEpilogue(this,game,finale,{marsh:MARSH_CHAIN,lake:LAKE_SLUICE}))return;
    let frame;
    if(study||menu)frame=this.studyFrame(study?stage:0);
    else frame=this.playFrame(game);
    if(stage===3&&handoff&&!this.reducedMotion.matches&&!game.finale)frame.combatHandoff=handoff;
    if(transition)frame=this.chapterView.transitionFrame(game,frame,transition,this.environment.mountainRiver);
    const anchor = stage === 4 ? (study ? heavenPreviewOrigin : game.ascentOrigin ?? heavenPreviewOrigin) : null;
    this.environment.setStage(stage, this.inkDragon.ink, anchor);
    const chapterAge = transition?.switched ? transition.age : undefined;
    this.environment.setChapterValleyPaint(chapterAge);
    this.environment.chapterInkForeground?.setAge(chapterAge);
    this.environment.updateFrontier?.(stage,this.inkDragon.ink,frame.position,!study&&!menu&&game.exploring?game.worldSeed:null);
    updateChapterCliff(this.environment.cache.get(3), chapterAge);
    if (!study && !menu) {
      game.setShore(stage<2||stage===2&&game.exploring?this.environment.heightAt:null);
    }
    this.environment.update(this.t);
    this.endingSigns.update(stage,this.inkDragon.ink,game,this.t,{active:!study&&!menu&&(!transition||stage!==2),water:this.water});
    if(stage===3)applyMountainRiver(this.water,this.environment.mountainRiver,frame.position.z,game.exploring&&!study&&!menu?game.worldSeed:null);
    if (!study && !menu) {
      game.setTerrain(stage === 3 ? this.environment.heightAt : null);
    }
    // Keep the contact mesh available for the dragon pose. The previous
    // presentation camera gives selection hysteresis across neighboring frames.
    const faunaCamera=this.enemyCamera??this.inkCamera.flat;
    const detail=faunaCamera?this.fauna?.crowd.update(game,this.t,faunaCamera,this.enemyMeshes,{
      hidden:study||menu||stage>=4||storyShot,transition,
      contactTarget:this.inkDragon.motion.action?.targetId,
    }):null;
    this.syncEnemies(game,detail??game.enemies,true);
    this.fauna?.update(this.t,game);
    for (const [id,enemy] of this.enemyMeshes){
      const defeatedBoss=transition&&!transition.switched&&id===game.boss?.id;
      enemy.visible=!study&&!menu&&!storyShot&&(!transition||(defeatedBoss&&transition.age<SEA_TO_MOUNTAIN_BOSS_SINK));
      if(defeatedBoss){
        const age=transition.age;
        const origin=this.chapterView.seaOrigin;
        const { clamp, smootherstep }=THREE.MathUtils;
        const heading=origin?.angle??frame.heading;
        const carry=1-(1-clamp(age/.30,0,1))**3;
        const sink=smootherstep(age,.08,.54);
        const player=(origin??frame.position);
        const dx=enemy.position.x-player.x, dz=enemy.position.z-player.z;
        const crossX=Math.cos(heading),crossZ=-Math.sin(heading);
        const forwardX=Math.sin(heading),forwardZ=Math.cos(heading);
        const lateral=dx*crossX+dz*crossZ, ahead=dx*forwardX+dz*forwardZ;
        // An almost aligned shell rolls away from the jaw. When the
        // handoff already presents two outlines, keep the smaller recoil.
        const overlap=(1-smootherstep(Math.abs(lateral),.33,3.3))
          *(1-smootherstep(Math.abs(ahead),4.7,10));
        const bank=Math.abs(lateral)>.12?Math.sign(lateral):-((origin?.peelSide)??1);
        const roll=carry*(1.50+3.1*overlap);
        enemy.position.x+=bank*roll*crossX+.62*carry*overlap*forwardX;
        enemy.position.z+=bank*roll*crossZ+.62*carry*overlap*forwardZ;
        enemy.position.y-=5.8*sink;
        const creature=enemy.userData.creature;
        if(creature){
          const rise=smootherstep(age,0,.12)*(1-smootherstep(age,.19,.39));
          creature.position.y+=rise*.98*overlap;
          creature.rotation.z+=bank*(.38*carry+.50*sink);
        }
      }
    }
    for (const map of [this.shotMeshes,this.hazardMeshes]) for (const mesh of map.values()) mesh.visible = !study && !menu && !transition && !storyShot;
    this.water.material.uniforms.uStage.value=stage;
    if(stage===2&&!study&&!menu){
      frame.seaPose=this.water.userData.seaPose?.(this.t,frame,game);
      if(transition?.age>=.26 && !this.chapterView.bossRipples && game.boss){
        const {x,z}=game.boss;
        this.waterCombat.event({type:'hazardImpact',x,y:.72,z,surface:true,radius:2.65},stage,this.t);
        this.chapterView.bossRipples=true;
      }
      if(transition&&!this.chapterView.splashed&&transition.age>=SEA_TO_MOUNTAIN_SPLASH){
        const {x,z}=frame.position;
        this.waterCombat.event({type:'dash',x,z,y:.95,surface:true,fx:Math.sin(frame.heading),fz:Math.cos(frame.heading),speed:6.7},stage,this.t);
        this.chapterView.splashed=true;
      }
    }
    const motion=this.inkDragon.motion;
    if(!study&&!menu&&!transition&&!storyShot)frame.dragonArt=game.activeDragonArt;
    const claw=motion.action;
    const contact=this.pendingClawHit?.event;
    const realHit=contact&&claw&&contact.strikeId===claw.id&&contact.targetId===claw.targetId||
      this.clawSurface.action===claw;
    const holding=!study&&!menu&&frame.stage===3&&this.inkDragon.stage===frame.stage
      &&claw?.kind==='claw'&&claw.release?.hit&&realHit;
    const prey=holding&&claw.target?.radius<=1
      ? this.enemyMeshes.get(claw.targetId)?.userData.creature
      : null;
    if(prey?.isMesh){
      const age=claw.releasedAt===undefined?0:claw.age+dt-claw.releasedAt;
      frame.clawSurface=this.clawSurface.sample(claw,prey,age);
    }else if(this.clawSurface.action)this.clawSurface.clear();
    frame.gatePawTargets=prepareGatePawTargets(this.environment.landmark,finale);
    if(finale?.phase==='lock')frame.lockLandingLandmark=this.environment.landmark;
    if(finale?.phase==='audience'&&finale.age>1.45&&finale.age<4.15){
      frame.courtLandmark=this.environment.landmark;
    }
    this.inkDragon.update(frame,dt);
    this.inkDragon.setVisible(true);
    if(finale?.phase==='blessing'){
      frame.blessingActor=this.inkDragon.active?.actor;
      const landmark=this.environment.landmark;
      if(landmark){
        const storm=this.blessingRain.update(finale,frame.blessingActor,landmark,BLESSING_RAIN_AT,game.p);
        frame.rainTarget=storm?.localLanding??courtRainLanding(landmark,game.p,this.rainTarget??=new THREE.Vector3());
        landmark.userData.wetCourtRoof?.update(finale,storm);
      }
    }
    if(stage===4){
      const contactShot=finale?.phase==='stomp'||finale?.phase==='audience'||finale?.ending==='locked';
      const actor=this.inkDragon.active?.actor;
      if(finale?.phase==='audience')frame.courtActor=actor;
      const courtToes=frame.courtLandmark?actor?.courtContacts:null;
      frame.finalPaws=contactShot?actor?.finaleContacts?.():null;
      if(courtToes&&frame.finalPaws){
        [frame.finalPaws.courtToe,frame.finalPaws.courtFarToe]=courtToes;
      }
      if(finale?.ending==='locked'){
        if(frame.finalPaws&&finale.elapsed>=14.77)frame.finalPaws.stairClaw=this.inkDragon.active.actor.lockedClawPoint?.(
          this.environment.landmark,this.stairClaw??=new THREE.Vector3());
        if(frame.finalPaws&&finale.elapsed>=13.0)frame.finalPaws.muzzle=this.inkDragon.muzzle(this.muzzleContact??=new THREE.Vector3());
        this.gateFeather.update(game,finale,frame.finalPaws?.wingSeat?.[1]);
      }
      updateHeavenFinale(this.environment.landmark,finale?game:null,dt,frame.finalPaws,finale?.phase==='stomp'&&Boolean(frame.gatePawTargets));
      this.gateContactWash.update(this.environment.landmark,finale,frame.finalPaws);
    }
    if(prey?.isMesh&&motion.action===claw&&motion.contactAge===0){
      this.clawSurface.capture(claw,prey,this.inkDragon.active.actor,frame.heading);
      motion.clawSurface=this.clawSurface.sample(claw,prey,0);
    }
    if(frame.seaPose)frame.seaMuzzle=this.inkDragon.muzzle(this.seaMuzzle??=new THREE.Vector3());
    const focus=frame.position;
    this.orbit.enabled=study&&this.cameraMode==='orbit';
    if (this.orbit.enabled) {
      const wingStudy = stage === 4;
      const key = wingStudy ? '4' : stage + ':' + frame.length;
      if (this.orbitKey !== key) {
        this.orbitKey = key;
        if (wingStudy) {
          // Keep both wing roots in the same framing while the body slider changes.
          this.orbit.target.set(focus.x - .6, focus.y, focus.z - 4.2);
          this.studyCamera.position.set(focus.x + 3.4, focus.y + 12.4, focus.z + 5.1);
        } else {
          const length = frame.length * .65 * (1 + stage * .08);
          this.orbit.target.set(focus.x, focus.y, focus.z - length * .42);
          this.studyCamera.position.set(focus.x + length * .72, focus.y + length * .36, focus.z + length * .08);
        }
      }
      const zoom = wingStudy ? .82 * Math.min(1, this.studyCamera.aspect / 1.43) : 1;
      if (this.studyCamera.zoom !== zoom) {
        this.studyCamera.zoom = zoom;
        this.studyCamera.updateProjectionMatrix();
      }
      this.camera = this.studyCamera;
      this.orbit.update();
    } else {
      let chapterExit = 0;
      if (stage === 3 && transition?.switched) {
        chapterExit = THREE.MathUtils.smootherstep(transition.age, 8.55, SEA_TO_MOUNTAIN_DURATION);
      } else if (stage === 3 && this.chapterExitAge !== undefined) {
        this.chapterExitAge += dt;
        chapterExit = 1 - THREE.MathUtils.smootherstep(this.chapterExitAge, .22, 1.42);
        if (chapterExit === 0) this.chapterExitAge = undefined;
      }
      const clear = this.combatClearFocus;
      const clearAge = clear ? this.t-clear.at : Infinity;
      if (clearAge > .82) this.combatClearFocus = null;
      const impact = handoff && !this.reducedMotion.matches ? handoff : clear && clearAge <= .82 && !this.reducedMotion.matches && !menu && !storyShot &&
        !transition && game.status === 'playing' && clear.stage === stage
        ? {...clear,gain:clear.weight*(1-THREE.MathUtils.smoothstep(clearAge,.18,.72))} : null;
      this.camera = this.inkCamera.set(frame, dt, {
        menu, study, chapter:stage, forceFollow: this.cameraMode === 'follow',
        landmark: this.environment.landmark,
        ascending: Boolean(game.ascentTarget),
        ascentOrigin: study ? null : game.ascentOrigin,
        finale,
        terrainHeight: stage === 3 ? this.environment.cameraHeightAt : null,
        mountainRiver: stage === 3 ? this.environment.mountainRiver : null,
        chapterExit, impact,
        riftView:this.reducedMotion.matches||transition||storyShot||game.finale ? null : this.combatEmphasis.riftView,
        combatView, clearCombatView: !showCombat || this.reducedMotion.matches || relayTracking,
        steadyCombat: !impact && (this.reducedMotion.matches || menu || storyShot || Boolean(transition)),
        shoreLook: stage<2&&!transition&&!this.reducedMotion.matches?this.endingSigns.shoreLook:null,
      });
    }
    if(transition){
      this.camera=this.chapterView.compose(this.camera,frame,transition,stage===3?this.environment.heightAt:null);
    }else if(!menu&&!study){
      const evolving=this.inkDragon.shapeChange?.to.stage===frame.stage||this.inkDragon.evolvingTo===frame.stage;
      this.camera=this.chapterView.apply(this.camera,frame,evolving,dt);
    }else this.chapterView.reset();
    if(seaReveal<SEA_GATE_SHOT_DURATION)this.frameSeaGate(seaReveal);
    if(relayTracking)this.frameRelay(this.relayLead,-Math.max(0,relayAiming.impactAt-game.time));
    else if(relayReveal<RELAY_SHOT_DURATION)this.frameRelay(this.relayView,relayReveal);
    this.combatEmphasis.compose(this.camera,this.reducedMotion.matches,frame.dragonArt);
    if(finale?.phase==='blessing'&&finale.age>2.49){
      const landmark=this.environment.landmark;
      const wet=landmark?.userData.wetCourtRoof;
      if(wet?.root.visible){
        const join=this.rainHandoff??={finale:null,lip:new THREE.Vector3(),drip:new THREE.Vector3()};
        join.finale=finale;
        landmark.localToWorld(join.lip.copy(wet.runoff.lip)).project(this.camera);
        landmark.localToWorld(join.drip.copy(wet.runoff.drip)).project(this.camera);
      }
    }
    this.enemyCamera=this.camera;
    this.reedVisibility.update(stage,frame,this.camera,dt,!menu&&!study,this.environment.frontier.revision);
    this.water.userData.updateSurface(this.t,stage,frame,game,this.environment.frontier.banksAt(frame.position),this.inkDragon.spine);
    this.environment.frontier.updateLandmarks?.(this.t,this.water,frame.position);
    const inPlay=!study&&!menu&&!transition&&stage<4;
    const combatVisible=inPlay&&!storyShot;
    const warningHazards=relayAiming?game.hazards.filter(hazard=>hazard!==relayAiming):game.hazards;
    this.inkWarnings.update(warningHazards,stage,combatVisible,game.p,this.water,game.boss);
    if(stage===3&&inPlay)this.fauna?.setFlightTraceOccluders?.(this.inkDragon.palette,
      this.inkDragon.active?.bridge.root,this.inkDragon.active?.actor.root);
    this.waterCombat.update(this.t,stage,frame,game,!study&&!menu&&stage<3&&seaReveal>=SEA_GATE_SHOT_DURATION);
    this.shallowContact.update(game,stage<2&&!study&&!menu,this.water.position.y);
    this.ocean.update(this.t,stage,this.camera,frame,this.water.userData.crestContact);
    this.chapterBreaker.update(transition&&!transition.switched?transition.age:0,this.chapterView.seaOrigin,frame.position);
    updateFoodAppearance(this,combatVisible?game.food:[],stage,focus,game.time,combatVisible);
    this.drawClawContact(stage,combatVisible);
    this.drawWaterContacts(stage,combatVisible);
    this.weaponStrokes.update(this.t,combatVisible);
    this.bodySignals.update(frame,this.t,combatVisible,this.inkDragon.spine,this.camera,this.inkDragon.active?.bridge);
    this.crabChargeWarning.update(game,inPlay);
    this.combat.root.visible=combatVisible;
    this.combat.nodes.visible=combatVisible&&(game.pose.wind>.46||game.pose.s>.46||game.pose.ring>.46);
    this.vortexFields.update(game.zones,this.t,combatVisible,focus);
    this.inkImpacts.update(this.t,combatVisible);
    if (this.bossShield && (menu || study)) this.bossShield.visible = false;
    const clear=this.combatClearPocket;
    const clearAge=clear?this.t-clear.at:Infinity;
    if(clearAge>.70)this.combatClearPocket=null;
    const relayPocket=combatVisible?this.combatEmphasis.visible.find(front=>
      front.route==='stone-march'||front.route==='abyss-transfer'):null;
    const pocket=contacts[0]??relayPocket??handoff??(clear?.ensemble&&clear.stage===stage&&combatVisible&&clearAge<.70
      ? {...clear,gain:(this.reducedMotion.matches?.58:1)*(1-THREE.MathUtils.smoothstep(clearAge,.20,.70))} : null);
    this.mist.update(stage,this.t,this.camera,inPlay&&game.boss?.type===8,dt,frame.chapterWing,
      this.environment.mountainRiver,game.exploring&&!study&&!menu?game.worldSeed:null,pocket,0,contacts[1]);
    this.wonderVisuals.update(game,this.t,combatVisible,this.water,this.camera,frame,this.inkDragon,relayTracking);
    const beam=combatVisible&&game.activeDragonArt?.kind==='beam'?game.activeDragonArt:null;
    this.environment.beamScorch.update(stage,game.time,focus,game.dragonScorch,combatVisible&&stage>=2);
    this.beamScorchPlants.update(this,beam,this.t,beam?this.inkDragon.muzzle(this.beamScorchMuzzle):null,
      combatVisible?game.dragonScorch:null,game.time,combatVisible);
    const raining=finale?.phase==='blessing';
    this.chapterFlightWake.update(raining?finale:transition,this.inkDragon.active?.actor,frame.heading,
      raining?BLESSING_RAIN_AT-.16:SEA_TO_MOUNTAIN_WINGBEAT);
    this.chapterWingGrowthInk.update(transition,this.inkDragon.active?.actor,this.camera);
    try {
      this.renderCombat(game,motion,contacts[0]?{...contacts[0],strength:contacts[0].gain}:handoff);
    } finally {
      this.beamScorchPlants.restore();
    }
    const cascadeFocus=relayPocket?.route==='abyss-transfer'?relayPocket:handoff;
    this.cascadeEffects.render(this.camera,game,this.t,combatVisible,cascadeFocus,relayTracking?relayAiming:null,contacts);
    this.dragonArts.render(this.camera,game,this.t,combatVisible,this);
    if(transition){
      const head=this.chapterRevealPoint;
      if(!this.inkDragon.muzzle(head))head.set(frame.position.x,frame.position.y,frame.position.z);
      head.project(this.camera);
      this.chapterSpray.render(this.renderer,transition.age,head.x*.5+.5,head.y*.5+.5,this.inkDragon,transition.switched);
    }
    if(this.modelStatus&&study){this.stageSelect.value=String(stage);const info=this.inkDragon.inspect();this.modelStatus.textContent=`原模续长 ${(info.totalLength||1).toFixed(2)}× · ${info.skinJoints?info.skinJoints+' 骨骼':'连续曲面'}`;}
  }
  frameRelay(view,age){
    const {point,origin}=view;
    const {clamp,smootherstep,lerp}=THREE.MathUtils;
    const duration=view.duration??1.40;
    const approach=smootherstep(age,-duration,Math.min(-.67,-duration+.58));
    const fade=age<0?approach:1-smootherstep(age,1.53,RELAY_SHOT_DURATION);
    const rise=smootherstep(age,.29,RELAY_SNAP+.14);
    const settle=smootherstep(age,RELAY_SNAP+.15,1.60);
    const away=(this.relayEscape??=new THREE.Vector3()).set(Math.sin(origin.angle),0,Math.cos(origin.angle));
    const portrait=this.camera.aspect<1;
    const rotation=(this.relayRotation??=new THREE.PerspectiveCamera());
    rotation.aspect=this.camera.aspect;
    rotation.fov=portrait?68:49;
    rotation.updateProjectionMatrix();
    if(!view.shoulder){
      // Compare both shoulders in projection. Preserve a side-on view of
      // the expected crossing and prefer clear terrain behind that corridor.
      const across=(this.relayAcross??=new THREE.Vector3()).set(away.z,0,-away.x);
      const ridge=(this.relayRidge??=new THREE.Vector3()).copy(point).add(new THREE.Vector3(-1.22,6.24,5.86));
      const crest=(this.relayCrest??=new THREE.Vector3());
      const screen=(this.relayProjection??=new THREE.Vector3());
      let best=-Infinity;
      const span=portrait?31.2:18.8;
      const lift=portrait?12.4:11.4;
      for(const side of [-1,1])for(const skew of [-.24,.14]){
        const candidate=across.clone().multiplyScalar(side).addScaledVector(away,skew).normalize();
        rotation.position.copy(point).addScaledVector(candidate,span).addScaledVector(away,-1.5);
        rotation.position.y=Math.max(point.y+lift,this.environment.heightAt(rotation.position.x,rotation.position.z)+3.2);
        crest.copy(point).addScaledVector(away,portrait?1.17:2.32);
        crest.y+=1.15;
        rotation.lookAt(crest);
        rotation.updateMatrixWorld();
        const ringX=screen.copy(point).project(rotation).x;
        const chainX=screen.copy(ridge).project(rotation).x;
        let distance=0, terrain=0, cropping=0;
        for(const step of [3,6.4,9.5,-6.0]){
          crest.copy(point).addScaledVector(away,step);
          const projected=screen.copy(crest).project(rotation);
          const exitX=projected.x;
          if(step<0){
            cropping+=Math.max(0,Math.abs(exitX)-.84)*4;
            continue;
          }
          distance+=Math.abs(exitX-ringX);
          cropping+=Math.max(0,Math.abs(exitX)-.82)*2.4;
          if((exitX-ringX)*(chainX-ringX)>0)distance-=Math.abs(chainX-ringX)*.38;
          const behind=crest.addScaledVector(candidate,-5.5);
          terrain+=Math.max(0,this.environment.heightAt(behind.x,behind.z)-point.y+1.4)*.057;
        }
        const tether=this.camera.getWorldDirection(this.relayForward??=new THREE.Vector3());
        const score=distance-cropping-terrain-.24*Math.abs(tether.dot(candidate));
        if(score>best){best=score;view.shoulder=candidate;}
      }
    }
    const side=view.shoulder;
    // Hold a stationary witness until the strike has already hit. The
    // player crosses the fixed field in world space without panning with it.
    const sideDistance=(portrait?31.2:18.8)+(portrait?-.6:2.0)*rise;
    const eye=(this.relayEye??=new THREE.Vector3()).copy(point).addScaledVector(side,sideDistance)
      .addScaledVector(away,-1.5+2.1*rise);
    const rock=this.environment.heightAt(eye.x,eye.z);
    eye.y=Math.max(eye.y+(portrait?12.4:11.4)+(portrait?9.5:7.7)*rise-.28*settle,rock+3.2);
    const aim=(this.relayAim??=new THREE.Vector3()).copy(point).addScaledVector(away,portrait?1.17:2.32);
    aim.y+=1.15;
    const joint=(this.relayJointAim??=new THREE.Vector3()).set(...RELAY_CLOUD_JOINT).add(point);
    aim.lerp(joint,rise*(portrait?.85:.86));
    aim.y-=.26*settle;
    rotation.position.copy(eye);
    rotation.lookAt(aim);
    this.camera.position.lerp(eye,fade);
    this.camera.quaternion.slerp(rotation.quaternion,fade);
    this.camera.fov=lerp(this.camera.fov,clamp(rotation.fov-rise*(portrait?3.9:7.2),40,72),fade);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
  advanceEndingReveal(game,dt){
    if(game.status!=='playing')return;
    if(game.stage===2&&this.seaGateView?.from){
      const {point,from,at}=this.seaGateView;
      game.crossSeaGate(point,from,this.t-at+dt,dt);
    }else if(game.stage===3&&this.relayView){
      game.glideFromRelay(this.relayView.point,this.t-this.relayView.at,dt);
    }
  }
  frameSeaGate(age){
    const {point,from}=this.seaGateView;
    const {smootherstep,lerp}=THREE.MathUtils;
    const emphasis=smootherstep(age,0,.29)*(1-smootherstep(age,1.24,SEA_GATE_SHOT_DURATION));
    const drift=smootherstep(age,.49,1.67);
    const side=(from?.x??point.x)<point.x?-1:1;
    const entry=Math.sign(point.z-(from?.z??point.z-1))||1;
    const sweep=smootherstep(age,.09,.55);
    const eye=(this.seaGateEye??=new THREE.Vector3()).set(point.x+side*(3.2-drift*1.4),6.1+drift*.92,point.z-entry*(10.1-drift*.8));
    const aim=(this.seaGateAim??=new THREE.Vector3()).set(lerp(from?.x??point.x,point.x,sweep),
      1.12+drift*1.15,lerp(from?.z??point.z,point.z+entry*(1.1+drift*3.1),sweep));
    const rotation=(this.seaGateRotation??=new THREE.PerspectiveCamera());
    rotation.position.copy(eye);
    rotation.lookAt(aim);
    this.camera.position.lerp(eye,emphasis*.92);
    this.camera.quaternion.slerp(rotation.quaternion,emphasis*.91);
    this.camera.fov=lerp(this.camera.fov,this.camera.aspect<1?66:53,emphasis);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
  installControls({study,play}){
    const panel=document.createElement('aside');panel.className='ink-toolbar';panel.innerHTML=`<div class="ink-toolbar-heading"><strong>潜鳞 · 山海墨游</strong><span>四形原模 · 曲面续长</span></div><div class="ink-tool-row"><button data-ink-action="play">开始游历</button><button data-ink-action="study">观形</button></div><div class="ink-tool-row ink-study-options"><label>形态 <select aria-label="观形形态">${PLAYABLE_FORMS.map(form=>`<option value="${form}" ${form===3?'selected':''}>${STAGES[firstChapterForForm(form)].name}</option>`).join('')}</select></label><label>身长 <input aria-label="观形身长" type="range" min="8" max="60" value="18"></label></div><div class="ink-tool-row"><label>镜头 <select aria-label="水墨镜头"><option value="field">俯瞰</option><option value="follow">贴身随龙</option><option value="orbit">观形转台</option></select></label><small class="ink-model-status"></small></div>`;
    panel.querySelector('[data-ink-action=play]').addEventListener('click',()=>{document.body.classList.remove('ink-study');this.cameraMode='field';panel.querySelector('[aria-label=水墨镜头]').value='field';play();});
    panel.querySelector('[data-ink-action=study]').addEventListener('click',()=>{document.body.classList.add('ink-study');this.cameraMode=this.studyStage===4?'orbit':'follow';panel.querySelector('[aria-label=水墨镜头]').value=this.cameraMode;study();});
    panel.querySelector('[aria-label=观形形态]').addEventListener('change',e=>{this.studyStage=Number(e.target.value);document.body.classList.add('ink-study');study();});
    panel.querySelector('[aria-label=观形身长]').addEventListener('input',e=>this.studyLength=Number(e.target.value));
    panel.querySelector('[aria-label=水墨镜头]').addEventListener('change',e=>{this.cameraMode=e.target.value;if(this.cameraMode==='orbit'){document.body.classList.add('ink-study');study();}});
    this.modelStatus=panel.querySelector('.ink-model-status');this.stageSelect=panel.querySelector('[aria-label=观形形态]');document.body.append(panel);return panel;
  }
}
