import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LivingWorld } from '../world-v2.js';
import { previewAttackIntent } from '../weapon-combat.js';
import { InkDragon } from './dragon.js';
import { inkWater } from './materials.js';
import { InkCamera } from './camera.js';
import { ChapterView } from './chapter-view.js';
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
import './style.css';
import {InkEnvironment}from'./environment.js';
import {InkFauna, INK_FOOD, createInkFoodGeometry} from './fauna.js';
import { FOOD_KINDS as foodKinds, clearFoodSwallows, noteFoodSwallow, updateFoodAppearance } from './food-appearance.js';
import {supportInstancing}from'./instanced-ink.js';

const stageNames=['小蛇','蟒','蛟龙','虬龙','应龙'];

export class InkWorld extends LivingWorld {
  constructor(canvas){
    super(canvas);document.body.classList.add('ink-art');this.isInk=true;this.chapterArrivals={3:{x:0,y:11.6,z:-2.8,angle:0}};this.cameraMode='field';this.studyStage=3;this.inkCamera=new InkCamera(this.flatCamera);
    this.chapterView=new ChapterView();
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
    this.resize();
  }
  createWater(){return inkWater();}
  createWorld(){
    this.water.rotation.x=-Math.PI/2;this.water.position.y=-.12;this.water.userData.inkPaperSupport=true;this.bobbing=[];
    this.environment=new InkEnvironment(this.decor);this.obstacles=this.environment.obstacles;
  }
  setStage(stage){this.stage=stage;}
  reset(){
    super.reset();
    this.center.set(0,0,0);
    this.inkCamera.mode=null;
    this.chapterView?.reset();
    this.clawSurface?.clear();
    this.inkDragon.resetMotion?.();
    this.inkImpacts?.reset();
    clearFoodSwallows(this);
    this.weaponStrokes?.reset();
    this.bodySignals?.reset();
    this.crabChargeWarning?.reset();
    this.clawView=null;
    this.pendingClawHit=null;
    this.pendingWaterHits?.clear();
    this.environment.setStage(0,this.inkDragon.ink);
  }
  resize(){
    super.resize();const h=Math.min(1080,Math.max(600,Math.round(innerHeight*Math.min(devicePixelRatio||1,1.25))));this.width=Math.round(h*innerWidth/innerHeight);this.height=h;this.renderer.setSize(this.width,h,false);
    this.inkCamera?.resize();
    this.inkDragon?.resize();
    if(this.studyCamera){this.studyCamera.aspect=innerWidth/innerHeight;this.studyCamera.updateProjectionMatrix();}
  }
  event(event){
    if(event.type==='eat')noteFoodSwallow(this,event);
    if(event.type==='hit')this.fauna?.contact?.(event,this.enemyMeshes.get(event.targetId));
    const charge=event.type==='bossCharge'&&event.attack==='crab-charge';
    const atWater=this.stage<2||this.stage===2&&event.y<1.8;
    const waterAction=atWater&&(event.type==='dash'||event.type==='ringBurst');
    if(charge)this.crabChargeWarning.event(event);
    else if(event.type!=='bossWave'&&event.type!=='evolve'&&!waterAction)super.event(event);
    if(waterAction&&event.type==='ringBurst'){
      this.shake=Math.max(this.shake,.18);
      this.hitStop=Math.max(this.hitStop,.035);
    }
    this.inkDragon.event(event);
    this.waterCombat.event(event,this.stage,this.t);
    let stroke=event;
    const spine=this.inkDragon.spine;
    if(event.type==='weaponStrike'&&event.strike==='tail'&&!event.cancelled&&spine.stage===this.stage&&spine.motion){
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
    }else if(closeHit&&event.source==='claw'&&!event.guarded&&this.clawView?.strikeId===event.strikeId&&
       this.clawView.targetId===event.targetId){
      this.pendingClawHit={event,time:this.t,stage:this.stage,side:this.clawView.side};
    }else this.weaponStrokes.event(stroke,this.t,hitMesh,this.camera);
    this.bodySignals.event(event,this.t);
    if(event.strike==='claw'&&!event.cancelled&&(event.type==='clawStart'||event.type==='clawRelease'&&event.hit)){
      this.clawView={to:event.to,until:this.t+(event.type==='clawStart'?event.windup:0)+.28,
        strikeId:event.strikeId,targetId:event.targetId,side:event.side};
    }else if(event.type==='clawRelease'||event.type==='hurt'||event.type==='evolve')this.clawView=null;
    if(event.type==='clawRelease'&&event.hit){
      this.shake=Math.max(this.shake,.17);
      this.hitStop=Math.max(this.hitStop,.043);
    }
    if(event.type==='hazardImpact')this.inkImpacts.add(event,this.t);
    if(event.type==='evolve'){
      this.inkImpacts.reset();
      this.clawSurface.clear();
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
    if(creature?.isMesh&&action?.id===event.strikeId&&action.kind==='claw'&&action.release?.hit&&this.inkDragon.stage===stage){
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
  renderCombat(game,motion){
    const action=motion.action;
    const prey=action?.kind==='claw'?this.enemyMeshes.get(action.targetId):null;
    const pull=prey?this.clawSurface.displacement(action,motion.contactAge):null;
    if(pull)prey.position.add(pull);
    try{
      this.combatStyle.render(this,this.scene,this.camera,this.t,game);
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
    const {p,stage}=game;
    let intent;
    const claw=game.clawAttack;
    if(game.status==='playing'&&(claw?.kind==='claw'||claw?.kind==='bite')&&claw.target?.hp>0){
      intent={target:claw.target,clawIn:claw.releaseAt-game.time};
    }else if(game.status==='playing'){
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
    }else if(stage===4&&game.ascentTarget){
      const target=game.ascentTarget;
      const distance=Math.hypot(target.x-p.x,target.z-p.z);
      intent={target,settle:1-THREE.MathUtils.smoothstep(distance,3.5,11),arrived:game.status==='won'};
    }
    return {stage,spine:game.bodyPath,trail:game.trail,heading:p.angle,position:p,
      length:p.body,density:p.density,time:this.t,intent};
  }
  project(x,z,y=0) {
    const point=new THREE.Vector3(x,y,z).project(this.camera);
    return {x:(point.x+1)*this.width/2,y:(1-point.y)*this.height/2,
      visible:point.z>=-1&&point.z<=1&&Math.abs(point.x)<=1.12&&Math.abs(point.y)<=1.12};
  }
  inputDirection(x,z){return this.inkCamera.input(x,z);}
  pointer(x,y){return this.inkCamera.pointer(x,y,this.lastHeight,this.camera);}
  present(game,dt,options={}){
    if(!this.inkDragon?.active){this.renderer.render(this.scene,this.camera);return;}
    const study=!!options.study,menu=!!options.menu,stage=study?this.studyStage:game.stage;
    this.player.visible=false;this.body.forEach(b=>b.visible=false);this.spines.forEach(b=>b.visible=false);this.feet.visible=false;this.playerShadow.visible=false;
    this.foodMesh.visible=false;this.foodGlow.visible=false;this.dome.visible=false;this.clouds.visible=false;this.sunHalo.visible=false;
    this.scene.fog.color.set('#f5f2e9');this.renderer.setClearColor('#f5f2e9');this.scene.background.set('#f5f2e9');
    this.airIslands.forEach(g=>g.visible=false);this.sky.visible=false;
    let frame;
    if(study||menu)frame=this.studyFrame(study?stage:0);
    else frame=this.playFrame(game);
    const anchor = stage === 4 ? (study ? {x:0,z:0,angle:0} : game.ascentOrigin || game.p) : null;
    this.environment.setStage(stage, this.inkDragon.ink, anchor);
    if (!study && !menu) {
      game.setShore(stage < 2 ? this.environment.heightAt : null);
    }
    this.environment.update(this.t);
    if(stage===3)applyMountainRiver(this.water,this.environment.mountainRiver);
    if (!study && !menu) {
      game.setTerrain(stage === 3 ? this.environment.heightAt : null);
    }
    this.fauna?.update(this.t,game);
    for (const enemy of this.enemyMeshes.values()) enemy.visible = !study && !menu;
    for (const map of [this.shotMeshes,this.hazardMeshes]) for (const mesh of map.values()) mesh.visible = !study && !menu;
    this.water.material.uniforms.uStage.value=stage;
    if(stage===2&&!study&&!menu)frame.seaPose=this.water.userData.seaPose?.(this.t,frame,game);
    const motion=this.inkDragon.motion;
    const claw=motion.action;
    const contact=this.pendingClawHit?.event;
    const realHit=contact&&claw&&contact.strikeId===claw.id&&contact.targetId===claw.targetId||
      this.clawSurface.action===claw;
    const holding=!study&&!menu&&stage===3&&this.inkDragon.stage===stage
      &&claw?.kind==='claw'&&claw.release?.hit&&realHit;
    const prey=holding&&claw.target?.radius<=1
      ? this.enemyMeshes.get(claw.targetId)?.userData.creature
      : null;
    if(prey?.isMesh){
      const age=claw.releasedAt===undefined?0:claw.age+dt-claw.releasedAt;
      frame.clawSurface=this.clawSurface.sample(claw,prey,age);
    }else if(this.clawSurface.action)this.clawSurface.clear();
    this.inkDragon.update(frame,dt);
    if(prey?.isMesh&&motion.action===claw&&motion.contactAge===0){
      this.clawSurface.capture(claw,prey,this.inkDragon.active.actor,frame.heading);
      motion.clawSurface=this.clawSurface.sample(claw,prey,0);
    }
    if(frame.seaPose)frame.seaMuzzle=this.inkDragon.muzzle(this.seaMuzzle??=new THREE.Vector3());
    const focus=frame.position;
    this.orbit.enabled=study&&this.cameraMode==='orbit';
    if (this.orbit.enabled) {
      const key = stage + ':' + frame.length;
      if (this.orbitKey !== key) {
        this.orbitKey = key;
        const length = frame.length * .65 * (1 + stage * .08);
        this.orbit.target.set(focus.x, focus.y, focus.z - length * .42);
        this.studyCamera.position.set(focus.x + length * .72, focus.y + length * .36, focus.z + length * .08);
      }
      this.camera = this.studyCamera;
      this.orbit.update();
    } else {
      this.camera = this.inkCamera.set(frame, dt, {
        menu, study, center: this.center, forceFollow: this.cameraMode === 'follow',
        landmark: this.environment.landmark,
        ascentOrigin: study ? null : game.ascentOrigin,
        terrainHeight: stage === 3 ? this.environment.heightAt : null,
        mountainRiver: stage === 3 ? this.environment.mountainRiver : null,
        contact: !study&&!menu&&this.clawView?.until>this.t ? this.clawView : null,
        motion,
      });
    }
    if(!menu&&!study){
      const evolving=this.inkDragon.shapeChange?.to.stage===stage||this.inkDragon.evolvingTo===stage;
      this.camera=this.chapterView.apply(this.camera,frame,evolving,dt);
    }else this.chapterView.reset();
    this.reedVisibility.update(stage,frame,this.camera,dt,!menu&&!study);
    this.lastHeight=focus.y;
    this.water.userData.updateSurface(this.t,stage,frame,game,this.obstacles,this.inkDragon.spine);
    const inPlay=!study&&!menu&&stage<4;
    this.inkWarnings.update(game.hazards,stage,inPlay,game.p,this.water,game.boss);
    if(stage===3&&inPlay)this.fauna?.setFlightTraceOccluders?.(this.inkDragon.palette,
      this.inkDragon.active?.bridge.root,this.inkDragon.active?.actor.root);
    this.waterCombat.update(this.t,stage,frame,game,!study&&!menu&&stage<3);
    this.shallowContact.update(game,stage<2&&!study&&!menu,this.water.position.y);
    this.ocean.update(this.t,stage,this.camera,frame,this.water.userData.crestContact);
    updateFoodAppearance(this,inPlay?game.food:[],stage,focus,game.time,inPlay);
    this.drawClawContact(stage,inPlay);
    this.drawWaterContacts(stage,inPlay);
    this.weaponStrokes.update(this.t,inPlay);
    this.bodySignals.update(frame,this.t,inPlay,this.inkDragon.spine,this.camera,this.inkDragon.active?.bridge);
    this.crabChargeWarning.update(game,inPlay);
    this.combat.root.visible=inPlay;
    this.combat.nodes.visible=inPlay&&(game.pose.wind>.46||game.pose.s>.46||game.pose.ring>.46);
    for(const field of this.combat.fields.values()){
      if(INK_VORTEX_KINDS.has(field.userData.kind))field.visible=false;
    }
    this.vortexFields.update(game.zones,this.t,inPlay,focus);
    this.inkImpacts.update(this.t,inPlay);
    if (this.bossShield && (menu || study)) this.bossShield.visible = false;
    this.mist.update(stage,this.t,this.camera,inPlay&&game.boss?.type===8,dt);
    this.renderCombat(game,motion);
    if(this.modelStatus&&study){this.stageSelect.value=String(stage);const info=this.inkDragon.inspect();this.modelStatus.textContent=`曲面续长 ${(info.totalLength||1).toFixed(2)}×`;}
  }
  installControls({study,play}){
    const panel=document.createElement('aside');panel.className='ink-toolbar';panel.innerHTML=`<div class="ink-toolbar-heading"><strong>潜鳞 · 山海墨游</strong><span>五形 · 曲面续长</span></div><div class="ink-tool-row"><button data-ink-action="play">开始游历</button><button data-ink-action="study">观形</button></div><div class="ink-tool-row ink-study-options"><label>形态 <select aria-label="观形形态">${stageNames.map((s,i)=>`<option value="${i}" ${i===3?'selected':''}>${s}</option>`).join('')}</select></label><label>身长 <input aria-label="观形身长" type="range" min="8" max="60" value="18"></label></div><div class="ink-tool-row"><label>镜头 <select aria-label="水墨镜头"><option value="field">俯瞰</option><option value="follow">贴身随龙</option><option value="orbit">观形转台</option></select></label><small class="ink-model-status"></small></div>`;
    panel.querySelector('[data-ink-action=play]').addEventListener('click',()=>{document.body.classList.remove('ink-study');this.cameraMode='field';panel.querySelector('[aria-label=水墨镜头]').value='field';play();});
    panel.querySelector('[data-ink-action=study]').addEventListener('click',()=>{document.body.classList.add('ink-study');this.cameraMode='follow';panel.querySelector('[aria-label=水墨镜头]').value='follow';study();});
    panel.querySelector('[aria-label=观形形态]').addEventListener('change',e=>{this.studyStage=Number(e.target.value);document.body.classList.add('ink-study');study();});
    panel.querySelector('[aria-label=观形身长]').addEventListener('input',e=>this.studyLength=Number(e.target.value));
    panel.querySelector('[aria-label=水墨镜头]').addEventListener('change',e=>{this.cameraMode=e.target.value;if(this.cameraMode==='orbit'){document.body.classList.add('ink-study');study();}});
    this.modelStatus=panel.querySelector('.ink-model-status');this.stageSelect=panel.querySelector('[aria-label=观形形态]');document.body.append(panel);return panel;
  }
}
