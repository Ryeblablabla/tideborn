import { STAGES, FORM_BY_STAGE, FOOD, UPGRADES, freshSave, random, clamp, dist, TAU, flightBand, waveDuration } from './rules.js';
import { MotionReader, sampleSpine, insidePolygon, polygonArea } from './motion.js';
import { Cultivation } from './cultivation.js';
import { marketChoices, applyMarketChoice } from './market-choices.js';
import { maybeStartCascade, noteThawThunder, updateCascade } from './cascades.js';
import { noteDragonArtEvent, resetDragonArt, updateDragonArt } from './dragon-arts.js';
import { noteTechniqueArtEvent, updateTechniqueArts } from './technique-arts.js';
import { SHOT_CONTACT_MARGIN, cancelWeaponStrikes, fireTechnique, updateWeaponCombat } from './weapon-combat.js';
import { canDisplaceEnemy, chapterPackDelay, enemyHeight, enemyProfile, enemyType, updateEnemy, updateEnemyHazards, updateEnemySpawns } from './encounters.js';
import { rewardSeaDrillKill, seaDrillDamage, updateSeaDrill } from './sea-drill.js';
import { updateFrontierCrossing } from './frontier-crossing.js';
import { ambientLimit, ambientPosition } from './food-habitat.js';
import { createEndingRoute, updateEndingRoute } from './ending-route.js';
import { createHeavenFinale, dashHeavenFinale, retryHeavenFinale, stepHeavenFinale } from './heaven-finale.js';
import { createWonders, launchWonderSword, offerWonderGrowth, resetWonders, rideWhirlpool, updateWonderCombat, updateWonders } from './wonders.js';
import { catchOathProjectile, startOathDash, updateOathDash } from './wonder-oaths.js';
import { absorbBreakwater, claimWildRelic, creditWildKill, startWildDash, updateWildDash } from './wonder-wild.js';
import { EnemyGrid, ENEMY_CAPACITY, ENEMY_RADIUS_LIMIT } from './enemy-grid.js';
export const DENSITY=[1,1,2.72,4.49,7.4];
export const AIR_ISLANDS=[{x:-13,y:7,z:-8,rx:4,ry:2,rz:3},{x:15,y:11,z:4,rx:4,ry:2.5,rz:3},{x:-4,y:14,z:23,rx:3,ry:2,rz:3},{x:26,y:6,z:-25,rx:5,ry:2,rz:4},{x:-30,y:12,z:12,rx:4,ry:2,rz:3}];
export const distance3=(a,b)=>Math.hypot(a.x-b.x,(a.y??.7)-(b.y??.7),a.z-b.z);
const ELEMENTS=['storm','lightning','fire','poison','rain'];
const BOSS_OPENING=[2.45,2.65,1.35,1.55];
const YINGLONG_CRUISE_DISTANCE=13;
const ARENA_EDGE=67;
const PLAYER_CLEARANCE=.55;
const LAKE_ARRIVAL={x:0,y:.82,z:0,angle:0};
const SHORE_CLEARANCE=.65;
const turnDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const smooth=(lo,hi,x)=>{const t=clamp((x-lo)/(hi-lo),0,1);return t*t*(3-2*t);};
const arcChord=(distance,halfTurn)=>distance*(Math.abs(halfTurn)>.0001?Math.sin(halfTurn)/halfTurn:1);
function polygonReach(origin, polygon) {
  let reach = 0;
  for (const point of polygon) {
    reach = Math.max(reach, Math.abs(point.x - origin.x), Math.abs(point.z - origin.z));
  }
  return reach;
}
export class Game {
  constructor({seed=Date.now(),meta={},chapterArrivals,flightRoute,starter,unlocked,seaToMountainTransition=false,interactiveFinale=true,openWorld=false}={}){
    this.chapterArrivals=chapterArrivals;
    this.flightRoute=flightRoute;
    this.seaToMountainTransition=seaToMountainTransition;
    this.interactiveFinale=interactiveFinale;
    this.worldSeed=seed>>>0;
    this.openWorld=openWorld;
    this.endingRoute=createEndingRoute();
    this.rng=random(seed);this.nextId=1;this.status='playing';this.stage=0;this.time=0;this.meta={...freshSave().meta,...meta};
    this.foodRng=random(seed^0x235af12b);this.foodPockets=[];
    this.wonders=createWonders();
    this.p={x:0,y:.7,z:0,angle:0,mass:12.5+this.meta.heart*1.5,peakMass:12.5+this.meta.heart*1.5,body:12.5,density:1,hp:100,qi:75,invul:0,dash:0,dashCD:0,altitude:8};
    this.food=[];this.enemies=[];this.shots=[];this.hazards=[];this.zones=[];this.events=[];this.obstacles=[];
    this.enemyGrid=new EnemyGrid();
    this.shotTargets=[];
    this.buffs=Object.fromEntries(UPGRADES.map(u=>[u.id,0]));this.genome=['rain','storm','lightning','fire','poison'];
    this.cultivation=new Cultivation(random(seed^0x3a458b1),{starter,unlocked});
    this.cultivation.weapons[0].cd=.3;
    this.waveTime=0;this.waveKills=0;this.waveForaged=0;
    this.weaponStrikes=[];this.techniqueArts=[];this.clawAttack=null;this.nextStrikeId=1;
    this.essence=0;this.choices=[];
    this.kills=0;this.eaten=0;this.gold=0;this.bossKills=0;this.boss=null;
    this.attackCD=.3;this.spawnCD=.55;this.openingHunt=true;this.foodCD=0;this.chapterPack=seed&1;this.hordeCD=chapterPackDelay(this.stage);this.combo=0;this.comboCD=0;this.maxCombo=0;this.ascend=0;
    this.elementCD={lightning:4,fire:5,storm:5,rain:7};this.motion=new MotionReader();this.pose={wind:0,s:0,ring:0,loop:null};this.windEnergy=0;this.ring=null;this.ringCD=0;this.windZone=null;this.echoes=[];
    this.metrics={wind:0,serpent:0,rings:0,bursts:0,reactions:0,steam:0,thunder:0,toxic:0,lost:0,recovered:0,condensed:0};
    this.trail=Array.from({length:240},(_,i)=>({x:0,y:.7,z:-i*.2,t:-i*.04}));this.syncBody();this.bodyPath=sampleSpine(this.trail,this.p.body,.65,this.p);
  }
  emit(type,data={}){
    if(type==='reaction'){this.lastReaction=data.name;this.reactionAt=this.time;}
    noteDragonArtEvent(this,type,data);
    noteThawThunder(this,type,data);
    noteTechniqueArtEvent(this,type,data);
    const events=this.events;
    if(events.length>=350){
      if(type==='hit'||type==='kill'||type==='absorb'||type==='dragonArtImpact')return;
      const index=events.findIndex(event=>event.type==='hit'||event.type==='kill'||
        event.type==='absorb'||event.type==='dragonArtImpact');
      events.splice(Math.max(0,index),1);
    }
    events.push({type,y:this.p.y,...data});
  }
  get form(){return FORM_BY_STAGE[this.stage];}
  get exploring(){return this.openWorld&&!this.practice&&this.stage<4;}
  get yinglongCruising(){return this.stage===4&&this.status==='playing'&&Boolean(this.ascentOrigin)&&!this.ascentTarget;}
  stats(){const p=this.p,d=DENSITY[this.form],mods=this.cultivation.modifiers(),pigment=this.wonders.pigment;
    const maxMass=Math.max(8,(38+this.buffs.vitality*3)*mods.mass)*d;
    const damage=(11+this.stage*3.1+Math.sqrt(p.body)*.55)*mods.damage*(1+this.buffs.power*.16+this.meta.fang*.08)*(pigment?.damage??1);
    return {damage,mods,
      hp:Math.ceil(Math.max(p.mass,Math.min(maxMass,p.peakMass))*8*Math.pow(d,.25)),maxMass,
      magnet:2.1*(1+this.buffs.magnet*.26+this.meta.tide*.12)*mods.magnet*(pigment?.magnet??1),
      speed:(5.7+this.stage*.45)*mods.speed,
      cooldown:Math.max(.13,.6*Math.pow(.86,this.buffs.haste)/(1+this.stage*.12))*mods.cooldown,
      range:(12+this.stage*1.5)*mods.range,density:d};
  }
  syncBody(){const p=this.p;p.density=DENSITY[this.form];p.mass=clamp(p.mass,0,this.stats().maxMass);p.body=Math.max(3,p.mass/p.density);p.hp=p.mass*8*Math.pow(p.density,.25);}
  organs(){const n=Math.min(10,Math.max(1,Math.floor(this.p.body/4)));return Array.from({length:n},(_,i)=>({index:i*4+2,type:this.genome[i%this.genome.length],power:Math.pow(this.p.density,.35)}));}
  strength(kind){const base=(this.buffs[kind]||0)+(kind==='storm'&&this.stage>=2?2:kind==='lightning'&&this.stage>=3?2:kind==='poison'&&this.stage>=1?1:0);return base?base+this.organs().filter(o=>o.type===kind).reduce((sum,o)=>sum+o.power*.3,0):0;}
  shoreLevel(x,z,padding=0) {
    const shore=this.shoreHeight;
    return padding>0?Math.max(shore(x,z),shore(x+padding,z),shore(x-padding,z),shore(x,z+padding),shore(x,z-padding)):shore(x,z);
  }
  onLand(x,z,padding=0) {
    if(this.shoreHeight&&this.stage<3)return this.shoreLevel(x,z,padding)>.16;
    return this.obstacles.some(o => ((x-o.x)/(o.rx+padding))**2+((z-o.z)/(o.rz+padding))**2 < 1);
  }
  setObstacles(o) {
    this.obstacles=o;
    this.keepFoodOffBanks();
  }
  setShore(sample) {
    if(this.shoreHeight===sample && this.shoreStage===this.stage)return;
    this.shoreHeight=sample;
    this.shoreStage=this.stage;
    if(sample)this.keepFoodOffBanks();
  }
  keepFoodOffBanks() {
    this.food=this.food.filter(food=>!this.onLand(food.x,food.z,.25));
    this.refillFood();
  }
  refillFood() {
    const limit=ambientLimit(this.stage);
    if(!limit)return;
    const ambient=this.food.reduce((count,item)=>count+Number(item.ambient===true),0);
    const needed=limit-ambient;
    for(let i=0;i<needed;i++)this.spawnFood();
  }
  setTerrain(sample) {
    if (this.terrainHeight === sample) return;
    this.terrainHeight = sample;
    if (sample) this.food = this.food.filter(food => {
      food.y = Math.max(food.y, sample(food.x,food.z) + .55);
      return food.y < flightBand(this.stage)[1];
    });
  }
  stayInWater(entity,radius=.4,previous=null){
    if (this.shoreHeight && this.stage < 3) {
      const origin=previous || (entity===this.p ? this.trail[0] : null);
      const flying=this.stage>=1&&entity===this.p;
      if(flying&&origin){
        // A descent over a bank pauses at its surface while forward travel
        // carries the dragon back over water. Keep the chosen altitude.
        const ground=this.shoreLevel(origin.x,origin.z,radius);
        if(ground>.16&&ground+SHORE_CLEARANCE<=flightBand(this.stage)[1])
          entity.y=Math.max(entity.y,ground+SHORE_CLEARANCE);
      }
      const clearLevel=flying?Math.max(.16,entity.y-SHORE_CLEARANCE+1e-5):.16;
      const blocked=(x,z)=>this.shoreLevel(x,z,radius)>clearLevel;
      if(!blocked(entity.x,entity.z))return;
      if(origin&&!blocked(origin.x,origin.z)){
        // Keep the free component of the movement and slide along the shore.
        const tryX=!blocked(entity.x,origin.z);
        const tryZ=!blocked(origin.x,entity.z);
        if(tryX && (!tryZ || Math.abs(entity.x-origin.x)>=Math.abs(entity.z-origin.z))) entity.z=origin.z;
        else if(tryZ) entity.x=origin.x;
        else {entity.x=origin.x;entity.z=origin.z;}
        return;
      }
      // Spawns can start inside a bank. Choose the closest clear ring.
      for(let distance=.75;distance<=12;distance*=1.65)for(let i=0;i<12;i++){
        const angle=i*TAU/12;
        const x=entity.x+Math.cos(angle)*distance,z=entity.z+Math.sin(angle)*distance;
        if(blocked(x,z))continue;
        entity.x=x;entity.z=z;return;
      }
      return;
    }
    if (this.stage === 3 && this.terrainHeight) {
      const height = this.terrainHeight(entity.x, entity.z) + radius + .4;
      const ceiling = flightBand(this.stage)[1];
      if (height > entity.y) {
        if (height <= ceiling) entity.y = height;
        else {
          const last = previous || (entity === this.p ? this.trail[0] : null);
          if (last) {
            const tryX=this.terrainHeight(entity.x,last.z)+radius+.4<=ceiling;
            const tryZ=this.terrainHeight(last.x,entity.z)+radius+.4<=ceiling;
            if(tryX&&(!tryZ||Math.abs(entity.x-last.x)>=Math.abs(entity.z-last.z)))entity.z=last.z;
            else if(tryZ)entity.x=last.x;
            else{entity.x=last.x;entity.z=last.z;}
          } else {
            const forwardX = Math.sin(this.p.angle);
            const forwardZ = Math.cos(this.p.angle);
            for (let i=0;i<8;i++) {
              const angle = i * TAU / 8;
              const x = this.p.x + 10 * (forwardX * Math.cos(angle) + forwardZ * Math.sin(angle));
              const z = this.p.z + 10 * (forwardZ * Math.cos(angle) - forwardX * Math.sin(angle));
            if (this.terrainHeight(x,z) + radius + .4 >= ceiling) continue;
              entity.x = x;
              entity.z = z;
              break;
            }
          }
          entity.y = Math.max(entity.y, Math.min(ceiling, this.terrainHeight(entity.x,entity.z) + radius + .4));
        }
      }
      return;
    }
    if(this.stage>=3&&(entity.y||0)>3){for(const o of AIR_ISLANDS){const dx=entity.x-o.x,dy=entity.y-o.y,dz=entity.z-o.z,rx=o.rx+radius,ry=o.ry+radius,rz=o.rz+radius,n=Math.hypot(dx/rx,dy/ry,dz/rz);if(n<1){entity.x=o.x+dx/(n||1);entity.y=o.y+dy/(n||1);entity.z=o.z+dz/(n||1);if(n<.01)entity.x=o.x+rx;}}return;}
    for(const o of this.obstacles){const dx=entity.x-o.x,dz=entity.z-o.z,n=Math.hypot(dx/(o.rx+radius),dz/(o.rz+radius));if(n<1){if(n>.001){entity.x=o.x+dx/n;entity.z=o.z+dz/n;}else entity.x=o.x+o.rx+radius;}}
  }
  spawnFood(x,z,rank,extra={}){
    if(this.food.length>=520)return null;
    const generated=x===undefined;
    const point=generated?ambientPosition(this):{x,z};
    if(!point)return null;
    const roll=generated?this.foodRng:this.rng;
    if(rank===undefined){const v=roll();rank=v<.58?0:v<.85?1:v<.965?2:v<.996?3:4;}
    const [low,high]=flightBand(this.stage);
    const y=point.y??(this.stage>=2?clamp(this.p.y+(roll()-.5)*(this.stage===2?1.8:5),Math.max(.35,low-.2),high-.5):.35);
    const f={id:this.nextId++,...point,y,rank,phase:roll()*TAU,ambient:generated,...extra};
    if(this.stage===3&&this.terrainHeight){
      const ground=this.terrainHeight(f.x,f.z)+.55;
      if(ground>high-.25)return null;
      f.y=Math.max(f.y,ground);
    }
    this.food.push(f);return f;
  }
  gainMass(amount){
    if(this.status==='dead')return;
    this.p.mass=Math.min(this.stats().maxMass,this.p.mass+amount);
    this.p.peakMass=Math.max(this.p.peakMass,this.p.mass);this.syncBody();
  }
  eat(f){
    if(f.shed){this.gainMass(f.mass);this.metrics.recovered+=f.mass;this.p.qi=Math.min(100,this.p.qi+2);this.emit('recover',{...f});return;}
    const beforeEssence=this.essence,beforeBody=this.p.body;
    const waterLoot=f.battleLoot&&this.stage<3;
    const value=FOOD[f.rank].xp;this.eaten++;this.essence=Math.min(STAGES[this.stage].need,this.essence+value);
    if(!f.battleLoot)this.waveForaged++;
    if(this.eaten===1)this.firstAbsorptionAt=this.time;
    let growth=[.18,.48,1.2,2.8,5.8][f.rank]*Math.pow(this.p.density,.55)
      *(waterLoot?1.6:1)*(1+this.buffs.growth*.2)*this.cultivation.modifiers().growth;
    if(this.boss){
      const missing=Math.max(0,Math.min(this.p.peakMass,this.stats().maxMass)-this.p.mass);
      const exposed=this.boss.bossPlan?.phase==='recovery';
      const efficiency=exposed ? .82 : f.rank>=2 ? .72 : .47;
      // Food still grows intact length. Only the damaged portion is slower
      // to repair under pressure; collected shed tissue remains fully useful.
      growth-=Math.min(growth,missing/efficiency)*(1-efficiency);
    }
    this.gainMass(growth);
    this.p.qi=Math.min(100,this.p.qi+1+f.rank*1.5);
    if(f.battleLoot){
      this.emit('absorb',{stage:this.stage,essence:this.essence-beforeEssence,growth:this.p.body-beforeBody});
      this.showAutoMeal(f);
    }else this.showMeal(f);
    if(f.rank===4){this.gold++;const id=ELEMENTS[Math.floor(this.rng()*ELEMENTS.length)];this.buffs[id]++;this.genome.unshift(id);this.genome=this.genome.slice(0,10);this.emit('mutation',{id});}
  }
  showMeal(f){
    this.emit('eat',{x:f.x,y:f.y,z:f.z,rank:f.rank,stage:this.stage,foodId:f.id,phase:f.phase,
      battleLoot:f.battleLoot,foodHeading:f.foodHeading,swallowedAt:this.time});
  }
  showAutoMeal(f){
    const p=this.p;
    if(this.stage>2||this.time<(this.nextMealAt??0)||distance3(p,f)>2.6)return;
    const dx=f.x-p.x,dz=f.z-p.z;
    if(dx*Math.sin(p.angle)+dz*Math.cos(p.angle)<-.4)return;
    if(this.stage<2&&this.onLand(p.x+dx*.5,p.z+dz*.5,.12))return;
    this.nextMealAt=this.time+.84;
    this.showMeal(f);
  }
  choose(index){
    if(this.status!=='upgrade'||!Number.isInteger(index))return false;
    const choice=this.choices[index];
    if(!choice||!(choice.kind==='wild'?claimWildRelic(this,choice):applyMarketChoice(this.cultivation,choice)))return false;
    if(choice.kind==='reorient'&&choice.system==='dragonArt'){
      const cooldown=this.nextDragonArtAt??0;
      resetDragonArt(this);
      this.nextDragonArtAt=Math.max(this.time+.6,cooldown);
    }
    this.syncBody();
    this.choices=[];
    this.status='playing';
    this.emit('chosen',{name:choice.title,changed:choice.kind==='reorient'?choice.system:null});
    return true;
  }
  updateWaveReward(dt){
    if(this.practice||this.drill||this.status!=='playing'||this.stage>=4)return;
    this.waveTime+=dt;
    if(this.wonders.active||this.activeDragonArt||offerWonderGrowth(this)||this.time<this.wonders.normalRewardAt)return;
    const first=this.cultivation.wave===1;
    const duration=waveDuration(this.stage,this.cultivation.wave);
    // An active hunt should fit several build choices between two chapter bosses.
    const huntCredit=this.waveKills*.29+this.waveForaged*.09;
    const rewardTime=this.stage>0 ? Math.max(duration*.52,duration-huntCredit) : duration;
    const firstThreshold=first&&this.essence>=STAGES[this.stage].need;
    // Leave time to see the first growth and to take in a chapter change.
    if(first&&!firstThreshold){
      if(this.eaten===0&&this.waveTime<duration+5)return;
      if(this.time<(this.firstAbsorptionAt??-Infinity)+1)return;
    }
    if(this.time<(this.rewardAfterEvolution??0))return;
    const chapterReward=this.chapterReward===this.stage;
    if(this.boss||this.activeCascade||(!chapterReward&&!firstThreshold&&this.waveTime<rewardTime))return;
    if(!chapterReward&&!firstThreshold&&this.waveTime<rewardTime+1.35&&(this.p.dash>0||this.weaponStrikes.length))return;
    this.choices=marketChoices(this.cultivation,this.stage);
    if(chapterReward)this.chapterReward=null;
    this.cultivation.wave++;
    this.waveTime=0;this.waveKills=0;this.waveForaged=0;
    this.hordeCD=Math.min(this.hordeCD,waveDuration(this.stage,this.cultivation.wave)*.52);
    if(!this.choices.length)return;
    this.status='upgrade';
    this.emit('upgrade',chapterReward?{source:'chapter'}:{});
  }
  dash(input){
    if(this.finale&&this.status==='ascending')return dashHeavenFinale(this,input);
    if(this.status!=='playing'||this.yinglongCruising||this.p.dashCD>0||this.time<this.wonders.sealedUntil)return false;
    this.p.dash=.34;this.p.dashCD=this.wonders.relics.feather?2.8:3.5;
    if(this.wonders.relics.tideStone)this.p.qi=Math.min(100,this.p.qi+10);
    this.p.invul=Math.max(this.p.invul,.6);this.emit('dash',{x:this.p.x,z:this.p.z});
    launchWonderSword(this,null,true);
    startOathDash(this);
    startWildDash(this);
    return true;
  }
  catchWonderProjectile(hazard,from){return catchOathProjectile(this,hazard,from);}
  interceptWonderProjectile(from,hazard){return absorbBreakwater(this,from,hazard);}
  retryGate(){return retryHeavenFinale(this);}
  crossSeaGate(point,from,age,dt){
    const p=this.p;
    const entrySide=Math.sign(point.z-from.z)||Math.sign(Math.cos(from.angle))||1;
    const distance=Math.hypot(point.x-from.x,point.z-from.z);
    const advance=smooth(0,.36,age);
    const clear=smooth(.73,1.76,age);
    const approach=Math.min(.91,1-.86/Math.max(.86,distance))*advance;
    const line=smooth(.25,.68,age);
    const aim=from.angle+turnDelta(from.angle,entrySide>0?0:Math.PI)*line;
    const atX=from.x+(point.x-from.x)*approach;
    const atZ=from.z+(point.z-from.z)*approach;
    p.x=atX+(point.x-atX)*line;
    p.z=atZ+(point.z-atZ)*line+entrySide*(-.86*line+6.05*clear);
    p.y=from.y+.22*(smooth(.35,.56,age)-smooth(.59,.87,age));
    p.angle=aim;
    this.stayInWater(p,PLAYER_CLEARANCE);
    p.altitude=p.y;
    this.followSkyTrail(dt);
  }
  glideFromRelay(point,age,dt){
    const p=this.p;
    const away=Math.atan2(p.x-point.x,p.z-point.z);
    const steer=(.41+.11*smooth(0,.36,age))*(p.x<point.x?-1:1);
    const heading=away+steer;
    const turn=turnDelta(p.angle,heading)*(1-Math.exp(-dt*5.3));
    const speed=2.8+(1-smooth(.46,1.65,age))*4.1;
    const previous={x:p.x,z:p.z};
    p.x+=Math.sin(p.angle+turn*.5)*speed*dt;
    p.z+=Math.cos(p.angle+turn*.5)*speed*dt;
    p.angle+=turn;
    p.y=Math.min(flightBand(3)[1],p.y+dt*(1-smooth(.4,1.7,age))*1.72);
    this.stayInWater(p,PLAYER_CLEARANCE,previous);
    p.altitude=p.y;
    this.followSkyTrail(dt);
  }
  steer(input,speed,dt){
    const p=this.p,dashing=p.dash>0;
    const long=smooth(12,46,p.body);
    let travel,change,guided=false,steeringTurn=0,steeringRadius=0;
    // Scenario scripts can supply an absolute direction and magnitude. The
    // player controls send a relative turn and keep moving with it released.
    if(input.turn===undefined&&(input.x!==undefined||input.z!==undefined)){
      const x=input.x??0,z=input.z??0,strength=Math.min(1,Math.hypot(x,z));
      let delta=0;
      if(strength>.05){
        const aim=Math.atan2(x,z);
        if(!p.steerStarted){p.angle=aim;p.steerStarted=true;}
        delta=turnDelta(p.angle,aim);
        if(Math.abs(delta)>Math.PI-.035)delta=(p.turnSide||1)*Math.PI;
        if(Math.abs(delta)>.12)p.turnSide=Math.sign(delta);
      }
      travel=speed*(dashing?2.8:strength>.05?strength:0)*dt;
      travel*=1-(.23+.10*long)*smooth(.46,2.53,Math.abs(delta));
      const radius=(.59+.97*long+this.stage*.19)*(dashing?1.38:1);
      const response=delta*(1-Math.exp(-dt*(13.8-long*4.1)));
      change=clamp(response,-travel/radius,travel/radius);
    }else{
      const requested=clamp(input.turn??0,-1,1);
      const turn=Math.abs(requested)>.06?-requested:0;
      if(turn)this.hasSteered=true;
      p.steerStarted=true;
      // Ease the pass during a bite or claw windup. The player retains their
      // heading, and a dash still takes priority over the attack slowdown.
      const target=this.clawAttack?.target;
      const closing=target?.hp>0?Math.hypot(target.x-p.x,target.z-p.z):Infinity;
      const pace=dashing?2.8:.40+.46*smooth(.50,2.65,closing);
      travel=speed*pace*dt;
      const radius=(this.practice?2.6:2.55+long*.75+this.stage*.23)*(dashing?1.5:1);
      const course=this.clearCourse(turn,radius,speed*pace);
      change=course*travel/radius;
      guided=course!==turn;
      if(!guided){steeringTurn=turn;steeringRadius=radius;}
    }
    // Sample heading and displacement on the same arc so the body can follow
    // each bend without a corner or a sideways jump on the first input.
    const half=change*.5;
    const chord=arcChord(travel,half);
    p.x+=Math.sin(p.angle+half)*chord;
    p.z+=Math.cos(p.angle+half)*chord;
    p.angle+=change;
    if(steeringTurn)rideWhirlpool(this,steeringTurn,steeringRadius,dt);
    return guided;
  }
  clearCourse(turn,radius,speed){
    const p=this.p;
    const distance=Math.max(radius*1.3,speed*.58);
    const ceiling=flightBand(this.stage)[1];
    const edge=this.exploring||this.drill?Infinity:ARENA_EDGE;
    if(!this.shoreHeight&&!this.terrainHeight&&!this.obstacles.length&&this.stage!==3&&
       Math.max(Math.abs(p.x),Math.abs(p.z))+distance<edge)return turn;

    const clearance=course=>{
      for(const fraction of [.24,.49,.74,1]){
        const length=distance*fraction,half=course*length/(2*radius);
        const chord=arcChord(length,half);
        const x=p.x+Math.sin(p.angle+half)*chord;
        const z=p.z+Math.cos(p.angle+half)*chord;
        if(Math.max(Math.abs(x),Math.abs(z))>=edge-.2)return fraction;
        if(this.stage>=1&&this.stage<3&&this.shoreHeight){
          if(this.shoreLevel(x,z,PLAYER_CLEARANCE+.12)>Math.max(.16,p.y-SHORE_CLEARANCE))return fraction;
        }else if(this.stage<3&&this.onLand(x,z,PLAYER_CLEARANCE+.12))return fraction;
        if(this.stage===3&&this.terrainHeight&&this.terrainHeight(x,z)+PLAYER_CLEARANCE+.55>ceiling)return fraction;
        if(this.stage===3&&!this.terrainHeight&&AIR_ISLANDS.some(o=>
          ((x-o.x)/(o.rx+.7))**2+((p.y-o.y)/(o.ry+.7))**2+((z-o.z)/(o.rz+.7))**2<1))return fraction;
      }
      return 2;
    };
    const intended=clearance(turn);
    if(intended===2)return turn;
    const side=Math.sign(turn)||p.guideSide||1;
    const preferred=clearance(side),alternate=clearance(-side);
    // Stay with the selected side at an even obstacle, including a head-on
    // approach where all courses initially touch the boundary.
    if(Math.max(preferred,alternate)<intended)return turn;
    p.guideSide=preferred>=alternate?side:-side;
    return p.guideSide;
  }
  spawnEnemy(type,x,z,y){
    if(this.enemies.length>=ENEMY_CAPACITY)return null;
    const angle=this.rng()*TAU, range=18+this.rng()*8;
    type=enemyType(this.stage,type,this.rng);
    const profile=enemyProfile(type);
    const hp=(profile.hp+this.stage*18)*(1+this.time*.0007);
    const phase=this.rng()*TAU;
    const edge=this.exploring?Infinity:68;
    const enemy={
      id:this.nextId++,type,role:profile.role,habitat:profile.habitat,
      x:x??clamp(this.p.x+Math.sin(angle)*range,-edge,edge),y:y??enemyHeight(this,type,phase),
      z:z??clamp(this.p.z+Math.cos(angle)*range,-edge,edge),hp,maxHp:hp,radius:profile.radius,
      speed:profile.speed+this.rng()*.28+this.stage*.10,angle,hit:0,shootCD:2.6+this.rng()*2.9,
      phase,wet:0,poison:0,burn:0,charge:0,dotCD:.5,
    };
    this.stayInWater(enemy,.6);
    this.enemies.push(enemy);
    return enemy;
  }
  summonBoss(){
    if(this.boss||this.stage>=4)return;
    const angle=this.rng()*TAU, stage=STAGES[this.stage];
    if(this.enemies.length>=ENEMY_CAPACITY){this.enemies.pop();this.enemyGrid.invalidate();}
    const height=this.stage===1?.86:this.stage===2?1.04:this.p.y;
    const enemy=this.spawnEnemy(5+this.stage,this.p.x+Math.sin(angle)*12,this.p.z+Math.cos(angle)*12,height);
    Object.assign(enemy,{
      hp:stage.bossHp,maxHp:stage.bossHp,boss:true,role:'boss',habitat:this.stage===3?'sky':'water',
      radius:2.1+this.stage*.25,speed:.95,attack:BOSS_OPENING[this.stage],attackIndex:0,bossPlan:null,
    });
    this.stayInWater(enemy,1);
    this.boss=enemy;
    this.emit('boss',{name:stage.boss,x:enemy.x,y:enemy.y,z:enemy.z});
  }
  damage(e,amount,source='bubble',origin=null,strikeId=null){
    if(e.hp<=0||this.stage>=4||this.status!=='playing')return;
    let guarded=false;
    if(e.boss){
      const opening=e.bossPlan?.phase==='recovery';
      const broken=(e.brokenArmorUntil??0)>this.time;
      if(this.stage===2&&e.shield&&!broken&&!['ring','serpent','lightning','thunder','echo'].includes(source)){
        amount*=.45;
        guarded=true;
      }
      if(this.stage===0&&!opening&&!broken&&origin&&source!=='water'){
        const x=origin.x-e.x,z=origin.z-e.z;
        const front=Math.sin(e.angle)*x+Math.cos(e.angle)*z;
        if(front>Math.max(.2,Math.hypot(x,z)*.38)){
          amount*=.34;
          guarded=true;
        }
      }
      if(opening){
        amount*=1.23;
        if(amount>0)e.lastOpeningHitAt=this.time;
      }
    }
    e.hp-=amount;e.hit=.12;
    const from=origin?{x:origin.x,y:origin.y??e.y,z:origin.z}:null;
    this.emit('hit',{x:e.x,y:e.y,z:e.z,from,radius:e.radius,targetId:e.id,strikeId,
      amount:Math.round(amount),source,boss:e.boss,guarded,wet:e.wet>0});
    if(e.hp>0)return;
    const cascade=source.startsWith('cascade-')||source.startsWith('dragon-art-');
    this.kills++;this.combo++;this.comboCD=3;this.maxCombo=Math.max(this.maxCombo,this.combo);this.p.qi=Math.min(100,this.p.qi+1.4);
    this.emit('kill',{x:e.x,y:e.y,z:e.z,enemyType:e.type,source,cascade});
    if(e.boss){
      if(this.stage===2&&this.seaToMountainTransition){
        this.status='transition';
        this.emit('chapterTransition',{x:this.p.x,z:this.p.z});
      }else this.evolve();
      return;
    }
    this.waveKills++;
    creditWildKill(this,e);
    maybeStartCascade(this,e,source);
    if(this.drill){rewardSeaDrillKill(this,e);return;}
    const rank=this.stage>=2&&this.rng()<.006?4:this.rng()<.055?Math.min(3,this.stage+1):this.rng()<.55?1:0;
    this.eat({id:e.id,x:e.x,y:e.y,z:e.z,rank,phase:e.phase,foodHeading:e.angle,battleLoot:true});
  }
  arriveInChapter(arrival) {
    const p=this.p;
    const yaw=arrival.angle-p.angle,cos=Math.cos(yaw),sin=Math.sin(yaw);
    const oldX=p.x,oldZ=p.z,raise=arrival.y-p.y;
    const rebase=point=>{
      const x=point.x-oldX,z=point.z-oldZ;
      point.x=arrival.x+x*cos+z*sin;
      point.z=arrival.z-x*sin+z*cos;
    };
    for(const point of this.trail){rebase(point);point.y+=raise;}
    for(const item of this.food)rebase(item);
    if(!this.exploring)this.food=this.food.filter(item=>Math.abs(item.x)<66&&Math.abs(item.z)<66);
    Object.assign(p,{x:arrival.x,y:arrival.y,z:arrival.z,angle:arrival.angle,altitude:arrival.y,dash:0});
    this.bodyPath=sampleSpine(this.trail,p.body,.65*(1+this.form*.08),p);
  }
  evolve(){
    const before=this.p.body,oldMass=this.p.mass,previousForm=this.form;
    resetDragonArt(this);
    this.bossKills++;this.stage++;this.boss=null;this.essence=0;
    resetWonders(this);
    this.activeCascade=null;this.cascadeReserve=null;this.cascadeAfterClear=null;this.thawThunder=null;this.galeSporeHold=null;this.nextCascadeAt=this.time+1;
    this.rewardAfterEvolution=this.time+3;
    this.chapterReward=this.stage<4?this.stage:null;
    this.chapterPack=0;this.hordeCD=chapterPackDelay(this.stage);
    this.food=this.food.filter(item=>!item.ambient);this.foodPockets=[];this.foodCD=0;
    if(this.form!==previousForm){
      const density=DENSITY[this.form];
      const condensed=oldMass*1.06+density*2;
      this.p.mass=this.stage===1?Math.max(11*density,condensed):condensed;
      this.p.peakMass=this.p.mass;
      this.syncBody();
      this.metrics.condensed++;
    }
    this.p.invul=3;this.p.qi=100;
    this.hazards=[];this.zones=[];this.enemies=[];this.shots=[];this.weaponStrikes=[];this.techniqueArts=[];this.clawAttack=null;this.echoes=[];this.ring=null;this.windZone=null;this.motion.reset();
    const arrival=this.chapterArrivals?.[this.stage]??(this.stage===1?LAKE_ARRIVAL:null);
    if(arrival)this.arriveInChapter(arrival);
    this.emit('evolve',{x:this.p.x,z:this.p.z,stage:this.stage,form:this.form,previousForm,before,after:this.p.body,density:this.p.density});
    if(this.stage===1)this.emit('takeoff',{stage:this.stage,x:this.p.x,z:this.p.z});
    if(this.stage===2||this.stage===3){this.p.altitude=arrival?.y??(this.stage===2?.86:10);for(const f of this.food)f.y=this.stage===2?.6+this.rng()*1.2:7+this.rng()*4;this.refillFood();this.emit('takeoff',{stage:this.stage,x:this.p.x,z:this.p.z});}
    if(this.stage===4){
      const {x,y,z,angle}=this.p;
      this.ascentOrigin={x,y,z,angle};
      this.p.altitude=y;
      this.p.dash=0;
    }
  }
  cruiseYinglong(dt,input){
    const p=this.p,origin=this.ascentOrigin;
    const sin=Math.sin(origin.angle),cos=Math.cos(origin.angle);
    const dx=p.x-origin.x,dz=p.z-origin.z;
    const along=dx*sin+dz*cos,across=dx*cos-dz*sin;
    const forward=input.turn===undefined?clamp((input.x||0)*sin+(input.z||0)*cos,-1,1):0;
    const steer=input.turn===undefined?clamp((input.x||0)*cos-(input.z||0)*sin,-1,1):-clamp(input.turn,-1,1);
    const ahead=along+(3.9+forward*1.5)*dt;
    const side=clamp(across+steer*3.4*dt,-7,7);
    p.x=origin.x+ahead*sin+side*cos;
    p.z=origin.z+ahead*cos-side*sin;
    const angle=origin.angle+Math.atan2(side-across,ahead-along);
    p.angle+=turnDelta(p.angle,angle)*(1-Math.exp(-dt*4));
    const low=Math.max(4,origin.y-3),high=Math.max(8,origin.y+4);
    p.altitude=clamp(p.altitude+clamp(input.lift||0,-1,1)*dt*4,low,high);
    p.y+=(p.altitude-p.y)*(1-Math.exp(-dt*5.5));
    this.time+=dt;
    this.followSkyTrail(dt);
    if(ahead<YINGLONG_CRUISE_DISTANCE)return;
    this.status='ascending';
    this.ascend=0;
    this.ascentTarget={x:origin.x+sin*48,y:27,z:origin.z+cos*48};
    if(this.interactiveFinale)createHeavenFinale(this);
    this.emit('ascend',{x:p.x,z:p.z});
  }
  followSkyTrail(dt){
    const p=this.p;
    if(Math.hypot(p.x-this.trail[0].x,p.y-this.trail[0].y,p.z-this.trail[0].z)>.12){
      this.trail.unshift({x:p.x,y:p.y,z:p.z,t:this.time});
      if(this.trail.length>1100)this.trail.length=1100;
    }
    for(let i=1;i<this.trail.length;i++)this.trail[i].y+=(p.y-this.trail[i].y)*Math.min(1,dt*.35);
    this.bodyPath=sampleSpine(this.trail,p.body,.65*(1+this.form*.08),p);
  }
  hurt(amount,point){
    if(this.p.invul>0||this.status!=='playing')return;
    amount*=this.cultivation.modifiers().guard;
    if(this.drill)amount=seaDrillDamage(this,amount);
    const p=this.p,old=p.body,loss=Math.min(p.mass,amount/(8*Math.pow(p.density,.25)));p.mass-=loss;this.syncBody();p.invul=.85;this.metrics.lost+=loss;
    if(this.weaponStrikes.length)cancelWeaponStrikes(this);
    const tail=point||this.bodyPath.at(-1)||p,recoverable=loss*Math.min(.75,.48+this.buffs.growth*.04),n=Math.min(5,Math.max(1,Math.ceil(loss/p.density)));
    for(let i=0;i<n;i++)this.spawnFood(tail.x+(this.rng()-.5)*1.6,tail.z+(this.rng()-.5)*1.6,2,{y:tail.y,shed:true,mass:recoverable/n,grace:.8,life:18});
    const contact=point ? {x:point.x,y:point.y,z:point.z} : null;
    this.emit('hurt',{amount,x:tail.x,y:tail.y,z:tail.z,contact,lost:Math.max(0,old-p.body)});if(p.mass<=0){this.status='dead';this.emit('end',{win:false});}
  }
  enemiesNear(origin, radius, output=[]) {
    return this.enemyGrid.nearby(this.enemies, origin, radius, output);
  }
  nearest(range,from=this.p){let best=null,dd=range;for(const e of this.enemies)if(e.hp>0){const d=distance3(e,from);if(d<dd+e.radius){dd=d;best=e;}}return best;}
  shoot(){
    const weapon=this.cultivation.weapons.find(item=>this.cultivation.getWeapon(item.id)?.kind==='projectile');
    return Boolean(weapon&&fireTechnique(this,weapon));
  }
  addZone(kind,data){
    const power=clamp(data.power||1,.3,8),radius=clamp(data.radius||3,1,10),life=clamp((data.life||5)*(1+this.meta.alchemy*.06),.5,12);
    const old=this.zones.find(z=>z.kind===kind&&z.weaponAnchor===data.weaponAnchor&&distance3(z,data)<Math.min(2,radius*.35)&&kind!=='ring');
    if(old){old.life=Math.max(old.life,life);old.power=Math.min(8,Math.max(old.power,power)+.15);old.radius=Math.min(10,Math.max(old.radius,radius));if(data.damageFactor)old.damageFactor=Math.max(old.damageFactor||0,data.damageFactor);return old;}
    if(this.zones.length>=28){const i=this.zones.findIndex(z=>z!==this.ring&&z!==this.windZone);if(i>=0)this.zones.splice(i,1);else return null;}
    const z={...data,id:this.nextId++,kind,x:data.x,y:data.y??this.p.y,z:data.z,radius,power,life,maxLife:life,tick:0,age:0,reactCD:0,energy:0};this.zones.push(z);this.emit('field',{kind,x:z.x,y:z.y,z:z.z,radius});return z;
  }
  lightning(target,power=1,source='lightning',origin=this.p,cast){
    if(!target)return;
    let e=target,previous={...origin},conductive=false;
    const stage=this.stage, used=new Set(), relays=[];
    const n=cast?.chain??Math.min(14,2+Math.ceil(power)+Math.floor(this.organs().length/2));
    const damage=cast?.damage??this.stats().damage*(.9+power*.16);
    const jumpReach=cast?.jumpReach??1;
    const nextEnemy=(from,reach)=>{
      let next=null, nearest=reach;
      for(const enemy of this.enemiesNear(from,reach)){
        if(enemy.hp<=0||used.has(enemy.id))continue;
        const distance=distance3(enemy,from);
        if(distance<nearest){next=enemy;nearest=distance;}
      }
      return next;
    };
    for(let i=0;i<n;i++){
      const wet=e.wet>0;
      used.add(e.id);
      const end={x:e.x,y:e.y,z:e.z};
      if(wet&&cast?.wetBranch)relays.push(end);
      this.emit('arc',{from:previous,to:end,power,source,conductive});
      e.charge=2;
      this.damage(e,damage*(wet?1.4:1),source);
      if(this.stage!==stage)return;
      previous=end;
      if(e.hp<=0&&wet&&this.meta.conduit>=1&&source!=='thunder'&&this.stage<4){const remnant=this.addZone('thunder',{...end,radius:2.4,life:3,power:1});if(remnant)remnant.energy=Math.min(6,remnant.energy+1.4);}
      const next=nextEnemy(end,((wet?7:4.5)+this.meta.conduit*.3)*jumpReach);
      if(!next)break;
      e=next;
      conductive=wet;
    }
    for(const relay of relays){
      const branch=nextEnemy(relay,5.6*jumpReach);
      if(!branch)continue;
      const to={x:branch.x,y:branch.y,z:branch.z};
      this.emit('arc',{from:relay,to,power:power*.66,source,conductive:true,branch:true});
      branch.charge=1;
      this.damage(branch,damage*.5*(branch.wet>0?1.4:1),source,relay);
      if(this.stage!==stage)return;
      break;
    }
    if(source!=='thunder')for(const z of this.zones)if(['steam','cloud','thunder'].includes(z.kind)&&distance3(z,previous)<z.radius+3){const fresh=z.kind!=='thunder';z.kind='thunder';z.energy=Math.min(12,z.energy+power*2+this.meta.conduit*.5);z.life=Math.max(z.life,5);if(fresh){this.metrics.reactions++;this.metrics.thunder++;this.emit('reaction',{name:'雷云共鸣',x:z.x,y:z.y,z:z.z});}}
  }
  element(kind){const level=this.strength(kind);if(!level)return;const target=this.nearest(18);if(!target)return;
    if(kind==='lightning')this.lightning(target,level,'lightning',{x:target.x+1,y:target.y+9,z:target.z-2});
    else this.addZone(kind==='rain'?'rain':kind,{x:target.x,y:target.y,z:target.z,radius:2.5+Math.sqrt(level)*.6,power:level,life:4.8});
  }
  updatePose(dt,guided){
    const p=this.p;
    if(this.stage>=1){
      // Mountain flight keeps more of the climbed or dived path behind the
      // head, using the same altitude follow-through as the heaven flight.
      const altitudeFollow=this.stage>=3?.35:.85;
      for(let i=1;i<this.trail.length;i++)this.trail[i].y+=(p.y-this.trail[i].y)*Math.min(1,dt*altitudeFollow);
    }
    const first=this.trail[0];if(Math.hypot(p.x-first.x,p.z-first.z, p.y-first.y)>.12){this.trail.unshift({x:p.x,y:p.y,z:p.z,t:this.time});if(this.trail.length>1100)this.trail.length=1100;}
    this.bodyPath=sampleSpine(this.trail,p.body,.65*(1+this.form*.08),p);
    // Curves forced by the bank are separate from player-cast body gestures.
    if(guided)this.motion.reset();
    this.pose=this.motion.update(p,this.time,guided?[]:this.bodyPath);
    const pose=this.pose,mult=1+this.buffs.coil*.2+this.meta.coil*.08;
    this.ringCD=Math.max(0,this.ringCD-dt);
    if(pose.wind>.75&&pose.moving&&p.qi>1){this.windEnergy=Math.min(5,this.windEnergy+dt*mult*.6);p.qi=Math.max(0,p.qi-dt*2.5);
      if(!this.windZone||!this.zones.includes(this.windZone)){this.windZone=this.addZone('storm',{...pose.center,y:p.y,radius:2.8,power:1,life:2});this.metrics.wind++;this.emit('pose',{name:'盘旋成风',kind:'wind',x:p.x,z:p.z});}
      if(this.windZone){const z=this.windZone;z.x+=(pose.center.x-z.x)*dt*3;z.z+=(pose.center.z-z.z)*dt*3;z.y=p.y;z.radius=Math.min(9,2.4+this.windEnergy+Math.sqrt(p.body)*.25);z.power=Math.min(8,1+this.windEnergy*mult);z.life=2.5;}
    }else this.windEnergy=Math.max(0,this.windEnergy-dt*.4);
    if(pose.sTrigger&&p.qi>=8){p.qi-=8;this.sBurstUntil=this.time+.65;this.metrics.serpent++;this.emit('pose',{name:'游龙引雷',kind:'s',x:p.x,z:p.z});
      const nodes=this.bodyPath.filter((_,i)=>i%4===0);for(const node of nodes.slice(0,6)){const target=this.nearest(6,node);if(target)this.lightning(target,1+this.strength('lightning')*.4+this.p.density*.15,'serpent',node);}
      this.emit('bodyArc',{points:this.bodyPath.map(q=>({...q}))});
    }
    if(pose.loop&&p.qi>2){const loop=pose.loop;
      if(!this.ring&&this.ringCD<=0){this.ring=this.addZone('ring',{...loop.center,y:p.y,radius:loop.radius,power:mult,life:1,polygon:loop.polygon,peakArea:loop.area,charge:0,lost:0});if(this.ring){this.metrics.rings++;this.emit('pose',{name:'盘龙结阵',kind:'ring',x:p.x,z:p.z});}}
      if(this.ring){const z=this.ring;z.life=1.5;z.lost=0;z.polygon=loop.polygon;z.x=loop.center.x;z.z=loop.center.z;z.y=p.y;z.radius=loop.radius;z.peakArea=Math.max(z.peakArea,loop.area);z.charge=Math.min(5,z.charge+dt*mult);z.contraction=1-loop.area/z.peakArea;p.qi=Math.max(0,p.qi-dt*3);
        if(z.contraction>.22&&z.charge>.7)this.releaseRing();
      }
    }else if(this.ring){this.ring.lost+=dt;if(this.ring.lost>.55)this.releaseRing();}
  }
  releaseRing(){const z=this.ring;if(!z)return;this.ring=null;this.ringCD=3.5;this.metrics.bursts++;const power=(1+z.charge*.6)*(1+this.buffs.coil*.2);this.emit('ringBurst',{x:z.x,y:z.y,z:z.z,radius:z.radius,power,polygon:z.polygon});
    let strikes=0;for(const e of this.enemiesNear(z,polygonReach(z,z.polygon)))if(e.hp>0&&Math.abs(e.y-z.y)<3.5&&insidePolygon(e,z.polygon)){
      e.wet=5;this.damage(e,this.stats().damage*power*1.5,'ring');if(e.hp>0&&this.strength('lightning')&&strikes++<3)this.lightning(e,1,'ring');
    }if(this.meta.coil>=1&&this.echoes.length<4)this.echoes.push({x:z.x,y:z.y,z:z.z,polygon:z.polygon.map(p=>({...p})),radius:z.radius,damage:this.stats().damage*power*.6,delay:.65});z.life=0;
  }
  updateFields(dt){
    const s=this.stats();
    for(const z of [...this.zones]){
      if(z.life<=0)continue;z.life-=dt;z.age+=dt;z.tick-=dt;z.reactCD=Math.max(0,z.reactCD-dt);
      if(z.kind==='storm'){
        const rainfed=this.stage<3&&z.y<1.65&&this.zones.some(other=>other.kind==='rain'&&other.life>0&&distance3(other,z)<z.radius+other.radius);
        if(rainfed&&!z.rainfed){
          this.metrics.reactions++;
          this.emit('reaction',{name:'合流成涡',x:z.x,y:z.y,z:z.z});
        }
        z.rainfed=rainfed;
        for(const e of this.enemiesNear(z,z.radius+2)){
          if(!canDisplaceEnemy(e,this.time))continue;
          const d=distance3(e,z);
          if(d>=z.radius+2||d<=.3)continue;
          const previous={x:e.x,y:e.y,z:e.z};
          const pull=dt*(2.3+z.power*.25)*(1-d/(z.radius+3))*(rainfed&&e.wet>0?1.55:1);
          e.x+=(z.x-e.x)/d*pull;
          e.z+=(z.z-e.z)/d*pull;
          e.y+=(z.y-e.y)/d*pull;
          this.stayInWater(e,.4,previous);
          this.enemyGrid.relocate(this.enemies,e,previous.x,previous.z);
        }
        for(const other of this.zones)if(other!==z&&distance3(other,z)<z.radius+other.radius){if(other.kind==='fire')z.flame=3;if(other.kind==='poison')z.toxic=3;if(['rain','steam','cloud'].includes(other.kind))z.rain=3;}
        if(z.toxic&&!z.wasToxic){z.wasToxic=true;this.metrics.toxic++;this.metrics.reactions++;this.emit('reaction',{name:'万毒归流 · 毒风聚煞',x:z.x,y:z.y,z:z.z});}if(z.flame&&!z.wasFlame){z.wasFlame=true;this.metrics.reactions++;this.emit('reaction',{name:'风助火势 · 炎舞风暴',x:z.x,y:z.y,z:z.z});}
        z.flame=Math.max(0,(z.flame||0)-dt);z.toxic=Math.max(0,(z.toxic||0)-dt);z.rain=Math.max(0,(z.rain||0)-dt);
      }
      if(z.kind==='fire'&&z.reactCD<=0){const moisture=this.zones.find(q=>['rain','storm'].includes(q.kind)&&distance3(z,q)<z.radius+q.radius);const wetEnemy=this.enemiesNear(z,z.radius).some(e=>e.hp>0&&e.wet>0&&distance3(e,z)<z.radius);
        if((this.stage<2&&z.age>.9)||moisture||wetEnemy){z.reactCD=3;this.addZone('steam',{x:z.x,y:z.y+1,z:z.z,radius:z.radius*.9,power:1,life:5.5});this.metrics.reactions++;this.metrics.steam++;this.emit('reaction',{name:'火水相激 · 蒸汽成云',x:z.x,y:z.y,z:z.z});}}
      if(z.kind==='steam'&&z.age>2.5)z.kind='cloud';
      if(this.meta.alchemy>=1&&['steam','cloud','thunder'].includes(z.kind)&&distance3(this.p,z)<z.radius+1){this.p.qi=Math.min(100,this.p.qi+dt*1.4);this.gainMass(dt*.012*Math.min(3,this.meta.alchemy));}
      if(z.tick>0)continue;z.tick=.35;
      if(z.kind==='thunder'&&z.energy>0){const e=this.nearest(z.radius+2,z);if(e){z.energy-=.7;this.lightning(e,1.4+this.meta.conduit*.1,'thunder',{x:z.x,y:z.y+4,z:z.z});}}
      const reach=z.kind==='ring'?polygonReach(z,z.polygon):z.radius+ENEMY_RADIUS_LIMIT;
      for(const e of this.enemiesNear(z,reach)){
        if(e.hp<=0||Math.abs(e.y-z.y)>Math.max(2.2,z.radius*.65))continue;const contained=z.kind==='ring'?insidePolygon(e,z.polygon):distance3(e,z)<z.radius+e.radius;if(!contained)continue;
        if(['rain','steam','cloud','ring'].includes(z.kind)||z.rain||this.buffs.rain&&z.kind==='storm')e.wet=5;
        if(z.kind==='poison'||z.toxic)e.poison=4;
        if(z.kind==='fire'||z.flame)e.burn=3;
        if(['fire','storm','ring','poison'].includes(z.kind)){const scale=z.kind==='ring'?.3+(z.charge||0)*.12:.24+z.power*.08;this.damage(e,s.damage*scale*(z.damageFactor??1)*(1+((z.flame?1:0)+(z.toxic?1:0))*.3),z.kind);}
      }
    }this.zones=this.zones.filter(z=>z.life>0);
  }
  step(dt,input={}){
    const remaining=this.drill?this.drill.duration-this.time:.05;
    dt=clamp(dt,0,Math.min(.05,Math.max(0,remaining)));if(!dt)return;
    if(this.yinglongCruising){this.cruiseYinglong(dt,input);return;}
    if(this.status==='ascending'){
      if(this.finale){stepHeavenFinale(this,dt,input);return;}
      this.ascend+=dt;this.time+=dt;const p=this.p,target=this.ascentTarget||{x:p.x,y:27,z:p.z+48},dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),speed=Math.min(4.2,d*1.2);
      const angle=Math.atan2(dx,dz),side=-clamp(input.turn??0,-1,1);
      p.x+=(dx/Math.max(.01,d)*speed+(input.x??Math.cos(angle)*side)*1.35)*dt;
      p.z+=(dz/Math.max(.01,d)*speed+(input.z??-Math.sin(angle)*side)*1.35)*dt;
      p.y+=(target.y-p.y)*Math.min(1,dt*.23);p.altitude=p.y;
      p.angle+=turnDelta(p.angle,angle)*Math.min(1,dt*2.5);
      this.followSkyTrail(dt);
      if(this.ascend>12&&d<4&&p.y>24){this.status='won';this.emit('end',{win:true});}return;
    }
    if(this.status!=='playing')return;this.time+=dt;const p=this.p,s=this.stats();if(this.practice){p.invul=100;p.qi=Math.max(85,p.qi);this.trainingSpawnCD=(this.trainingSpawnCD||0)-dt;if(this.trainingSpawnCD<=0&&this.enemies.length<5){this.trainingSpawnCD=2;const a=this.time*2.4,e=this.spawnEnemy(0,Math.sin(a)*3.5,Math.cos(a)*3.5);if(e){e.speed=0;e.hp=e.maxHp=200;e.shootCD=1000;}}}
    this.enemyGrid.invalidate();
    const dashReady=p.dashCD>0&&p.dashCD<=dt;
    p.invul=Math.max(0,p.invul-dt);p.dashCD=Math.max(0,p.dashCD-dt);p.dash=Math.max(0,p.dash-dt);p.qi=Math.min(100,p.qi+dt*(1.6+this.buffs.coil*.1)*s.mods.qi);
    if(dashReady)this.emit('dashReady',{x:p.x,z:p.z,to:{x:p.x+Math.sin(p.angle),y:p.y,z:p.z+Math.cos(p.angle)}});
    const regen=s.mods.regen/(8*Math.pow(p.density,.25))+this.buffs.regen*.1;
    if(regen&&p.mass<s.maxMass)this.gainMass(dt*regen);
    const previousPosition=(this.terrainHeight||this.shoreHeight)?{x:p.x,z:p.z}:null;
    const guided=this.steer(input,s.speed,dt);
    if(this.stage>=1){
      const [low,high]=flightBand(this.stage);
      p.altitude=clamp(p.altitude+clamp(input.lift??0,-1,1)*dt*6,low,high);
      p.y+=(p.altitude-p.y)*(1-Math.exp(-dt*5.5));
    }else p.y=.7;
    if(!this.exploring&&!this.drill){p.x=clamp(p.x,-ARENA_EDGE,ARENA_EDGE);p.z=clamp(p.z,-ARENA_EDGE,ARENA_EDGE);}
    this.stayInWater(p,PLAYER_CLEARANCE,previousPosition);
    updateFrontierCrossing(this);
    if(this.drill){updateSeaDrill(this,dt);if(this.status!=='playing')return;}
    this.updatePose(dt,guided);
    if(this.status==='transition')return;
    if(this.interactiveFinale&&!this.practice&&updateEndingRoute(this,dt))return;
    if(this.status!=='playing')return;
    updateWonders(this,dt);
    if(this.status!=='playing')return;
    if(this.stage===3){this.foodCD-=dt;if(this.foodCD<=0){this.foodCD=.3;this.refillFood();}}
    for(let i=this.food.length-1;i>=0;i--){const f=this.food[i];if(f.grace>0){f.grace-=dt;continue;}if(f.life!==undefined){f.life-=dt;if(f.life<=0){this.food.splice(i,1);continue;}}
      const d=distance3(p,f),reach=s.magnet+(f.rank>=3?.5:0);
      if(d<.8){this.food.splice(i,1);this.eat(f);}
      else if(d<reach){const k=Math.min(1,dt*(5+(reach-d)*6)/d);f.x+=(p.x-f.x)*k;f.z+=(p.z-f.z)*k;f.y+=(p.y-f.y)*k;}
      else if(d>48)this.food.splice(i,1);
    }
    this.updateWaveReward(dt);
    if(this.status!=='playing')return;
    if(!this.practice&&!this.drill&&this.stage<4&&this.chapterReward!==this.stage&&this.essence>=STAGES[this.stage].need&&!this.boss&&
      !this.wonders.active&&!this.wonders.market&&this.time>=this.wonders.bossReadyAt)this.summonBoss();
    const combatStage=this.stage;
    updateWeaponCombat(this,dt);
    if(this.stage!==combatStage||this.status!=='playing')return;
    updateTechniqueArts(this);
    if(this.stage!==combatStage||this.status!=='playing')return;
    updateWonderCombat(this,dt);
    if(this.stage!==combatStage||this.status!=='playing')return;
    updateOathDash(this);
    updateWildDash(this);
    for(const kind of Object.keys(this.elementCD))if(this.buffs[kind]>0){
      this.elementCD[kind]-=dt;
      if(this.elementCD[kind]<=0){this.elementCD[kind]=kind==='lightning'?3.9:6;this.element(kind);}
      if(this.status==='transition')return;
    }
    for(const shot of this.shots){shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.z+=shot.vz*dt;shot.life-=dt;
      for(const e of this.enemiesNear(shot,ENEMY_RADIUS_LIMIT+SHOT_CONTACT_MARGIN,this.shotTargets))if(e.hp>0&&shot.life>0&&!shot.hitIds.has(e.id)&&distance3(e,shot)<e.radius+SHOT_CONTACT_MARGIN){
        shot.hitIds.add(e.id);
        if(shot.element==='water'||shot.kind==='bubble')e.wet=5;
        if(shot.element==='poison'||shot.kind==='poison'){
          e.poison=3;
          this.addZone('poison',{x:e.x,y:e.y,z:e.z,radius:1.6,power:1+this.buffs.poison,life:2.5});
        }
        if(shot.element==='fire'){
          e.burn=3;
          if(e.wet>0){
            e.wet=Math.max(0,e.wet-1.4);
            const vapor=this.addZone('steam',{x:e.x,y:e.y,z:e.z,radius:2.15,power:1,life:3.6});
            if(vapor?.age<.10)this.emit('reaction',{name:'火息化云',x:e.x,y:e.y,z:e.z});
          }
        }
        let damage=shot.damage;
        if(e.boss&&shot.volleyHits){
          const previous=shot.volleyHits.get(e.id)??0;
          shot.volleyHits.set(e.id,previous+1);
          if(previous)damage*=.33;
        }
        this.damage(e,damage,shot.kind,{x:shot.x-shot.vx*dt,y:shot.y-shot.vy*dt,z:shot.z-shot.vz*dt});
        if(this.stage!==combatStage||this.status==='transition')return;
        if(--shot.pierce<=0)shot.life=0;else shot.damage*=.87;
      }
    }this.shots=this.shots.filter(q=>q.life>0).slice(-160);
    updateEnemySpawns(this,dt);
    this.enemyGrid.invalidate();
    const encounterStage=this.stage;
    for(const enemy of this.enemies){
      updateEnemy(this,enemy,dt,s.damage);
      if(this.stage!==encounterStage||this.status!=='playing')break;
    }
    if(this.status==='transition')return;
    this.enemies=this.enemies.filter(e=>e.hp>0&&(!e.wildRetreat||e.wildRetreat.until>this.time)&&
      (this.drill||e.boss||(e.x-p.x)**2+(e.y-p.y)**2+(e.z-p.z)**2<45**2));
    updateEnemyHazards(this,dt);
    this.updateFields(dt);
    if(this.status==='transition')return;
    updateCascade(this,dt);
    if(this.stage!==encounterStage||this.status!=='playing')return;
    updateDragonArt(this,dt);
    if(this.stage!==encounterStage||this.status!=='playing')return;
    for(const echo of this.echoes){
      echo.delay-=dt;
      if(echo.delay>0)continue;
      for(const e of this.enemiesNear(echo,polygonReach(echo,echo.polygon))){
        if(e.hp>0&&Math.abs(e.y-echo.y)<3&&insidePolygon(e,echo.polygon))this.damage(e,echo.damage,'echo');
        if(this.status==='transition')return;
      }
      this.emit('ringBurst',{...echo,power:.6});
    }
    this.echoes=this.echoes.filter(e=>e.delay>0);this.comboCD-=dt;if(this.comboCD<=0)this.combo=0;
  }
  reward(){if(this.practice)return 0;return (this.time>=20||this.eaten>=12||this.kills>=3?2:0)+this.stage*6+Math.floor(this.kills/15)+this.gold*2+Math.floor(this.metrics.reactions/8)+(this.status==='won'?20:0);}
}
