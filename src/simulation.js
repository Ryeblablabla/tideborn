import { STAGES, FOOD, UPGRADES, freshSave, random, clamp, dist, TAU, flightBand, waveDuration } from './rules.js';
import { MotionReader, sampleSpine, insidePolygon, polygonArea } from './motion.js';
import { Cultivation, TALENTS } from './cultivation.js';
import { SHOT_CONTACT_MARGIN, cancelWeaponStrikes, fireTechnique, updateWeaponCombat } from './weapon-combat.js';
import { canDisplaceEnemy, chapterPackDelay, enemyHeight, enemyProfile, enemyType, updateEnemy, updateEnemyHazards, updateEnemySpawns } from './encounters.js';
import { ambientLimit, ambientPosition } from './food-habitat.js';
import { recordTrialHit } from './trial-hits.js';
export const DENSITY=[1,1.65,2.72,4.49,7.4];
export const AIR_ISLANDS=[{x:-13,y:7,z:-8,rx:4,ry:2,rz:3},{x:15,y:11,z:4,rx:4,ry:2.5,rz:3},{x:-4,y:14,z:23,rx:3,ry:2,rz:3},{x:26,y:6,z:-25,rx:5,ry:2,rz:4},{x:-30,y:12,z:12,rx:4,ry:2,rz:3}];
export const distance3=(a,b)=>Math.hypot(a.x-b.x,(a.y??.7)-(b.y??.7),a.z-b.z);
const ELEMENTS=['storm','lightning','fire','poison','rain'];
const BOSS_OPENING=[2.45,2.65,1.35,1.55];
const turnDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const smooth=(lo,hi,x)=>{const t=clamp((x-lo)/(hi-lo),0,1);return t*t*(3-2*t);};
export class Game {
  constructor({seed=Date.now(),meta={},chapterArrivals,flightRoute,starter,unlocked}={}){
    this.chapterArrivals=chapterArrivals;
    this.flightRoute=flightRoute;
    this.rng=random(seed);this.nextId=1;this.status='playing';this.stage=0;this.time=0;this.meta={...freshSave().meta,...meta};
    this.foodRng=random(seed^0x235af12b);this.foodPockets=[];
    this.p={x:0,y:.7,z:0,angle:0,mass:12.5+this.meta.heart*1.5,peakMass:12.5+this.meta.heart*1.5,body:12.5,density:1,hp:100,qi:75,invul:0,dash:0,dashCD:0,altitude:8};
    this.food=[];this.enemies=[];this.shots=[];this.hazards=[];this.zones=[];this.events=[];this.obstacles=[];
    this.buffs=Object.fromEntries([...UPGRADES,...TALENTS].map(u=>[u.id,0]));this.genome=['rain','storm','lightning','fire','poison'];
    this.cultivation=new Cultivation(random(seed^0x3a458b1),{starter,unlocked});
    this.cultivation.weapons[0].cd=.3;
    this.waveTime=0;this.waveStart={kills:0,eaten:0};this.waveOverflow=0;this.waveTalents=0;
    this.weaponStrikes=[];this.clawAttack=null;this.nextStrikeId=1;
    this.essence=0;this.xp=0;this.level=1;this.levelNeed=24;this.pendingLevels=0;this.choices=[];
    this.kills=0;this.eaten=0;this.gold=0;this.bossKills=0;this.boss=null;this.reserve=0;
    this.attackCD=.3;this.spawnCD=.55;this.openingHunt=true;this.foodCD=0;this.chapterPack=seed&1;this.hordeCD=chapterPackDelay(this.stage);this.combo=0;this.comboCD=0;this.maxCombo=0;this.ascend=0;
    this.elementCD={lightning:4,fire:5,storm:5,rain:7};this.motion=new MotionReader();this.pose={wind:0,s:0,ring:0,loop:null};this.windEnergy=0;this.ring=null;this.ringCD=0;this.windZone=null;this.echoes=[];
    this.metrics={wind:0,serpent:0,rings:0,bursts:0,reactions:0,steam:0,thunder:0,toxic:0,lost:0,recovered:0,condensed:0};
    this.trail=Array.from({length:240},(_,i)=>({x:0,y:.7,z:-i*.2,t:-i*.04}));this.syncBody();this.bodyPath=sampleSpine(this.trail,this.p.body,.65,this.p);
  }
  emit(type,data={}){if(type==='reaction'){this.lastReaction=data.name;this.reactionAt=this.time;}this.events.push({type,y:this.p.y,...data});if(this.events.length>350)this.events.shift();}
  stats(){const p=this.p,d=DENSITY[this.stage],mods=this.cultivation.modifiers();
    const maxMass=Math.max(8,(38+this.buffs.vitality*3)*mods.mass)*d;
    const damage=(11+this.stage*3.1+Math.sqrt(p.body)*.55)*mods.damage*(1+this.buffs.power*.16+this.meta.fang*.08);
    return {damage,mods,
      hp:Math.ceil(Math.max(p.mass,Math.min(maxMass,p.peakMass))*8*Math.pow(d,.25)),maxMass,
      magnet:2.1*(1+this.buffs.magnet*.26+this.meta.tide*.12)*mods.magnet,
      speed:(5.7+this.stage*.45)*mods.speed,
      cooldown:Math.max(.13,.6*Math.pow(.86,this.buffs.haste)/(1+this.stage*.12))*mods.cooldown,
      range:(12+this.stage*1.5)*mods.range,density:d};
  }
  syncBody(){const p=this.p;p.density=DENSITY[this.stage];p.mass=clamp(p.mass,0,this.stats().maxMass);p.body=Math.max(3,p.mass/p.density);p.hp=p.mass*8*Math.pow(p.density,.25);}
  organs(){const n=Math.min(10,Math.max(1,Math.floor(this.p.body/4)));return Array.from({length:n},(_,i)=>({index:i*4+2,type:this.genome[i%this.genome.length],power:Math.pow(this.p.density,.35)}));}
  strength(kind){const base=(this.buffs[kind]||0)+(kind==='storm'&&this.stage>=2?2:kind==='lightning'&&this.stage>=3?2:kind==='poison'&&this.stage>=1?1:0);return base?base+this.organs().filter(o=>o.type===kind).reduce((sum,o)=>sum+o.power*.3,0):0;}
  onLand(x,z,padding=0) {
    if (this.shoreHeight && this.stage < 2) {
      const shore = this.shoreHeight;
      if (shore(x,z) > .16) return true;
      return padding > 0 && (shore(x+padding,z)>.16 || shore(x-padding,z)>.16 ||
        shore(x,z+padding)>.16 || shore(x,z-padding)>.16);
    }
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
    if (this.shoreHeight && this.stage < 2) {
      if (!this.onLand(entity.x,entity.z,radius)) return;
      const origin=previous || (entity===this.p ? this.trail[0] : null);
      if (origin && !this.onLand(origin.x,origin.z,radius)) {
        // Keep the free component of the movement and slide along the shore.
        const tryX=!this.onLand(entity.x,origin.z,radius);
        const tryZ=!this.onLand(origin.x,entity.z,radius);
        if(tryX && (!tryZ || Math.abs(entity.x-origin.x)>=Math.abs(entity.z-origin.z))) entity.z=origin.z;
        else if(tryZ) entity.x=origin.x;
        else {entity.x=origin.x;entity.z=origin.z;}
        return;
      }
      // Spawns can start inside a bank. Choose the closest clear ring.
      for(let distance=.75;distance<=12;distance*=1.65)for(let i=0;i<12;i++){
        const angle=i*TAU/12;
        const x=entity.x+Math.cos(angle)*distance,z=entity.z+Math.sin(angle)*distance;
        if(this.onLand(x,z,radius))continue;
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
    const cap=this.stats().maxMass,total=this.p.mass+amount,overflow=Math.max(0,total-cap);
    if(overflow>0){
      const unit=5*this.p.density;
      const previous=Math.floor(this.reserve/unit);
      this.reserve+=overflow;
      const material=Math.min(6-this.waveOverflow,Math.floor(this.reserve/unit)-previous);
      this.waveOverflow+=material;
      this.cultivation.earn(material);
    }
    this.p.mass=Math.min(cap,total);this.p.peakMass=Math.max(this.p.peakMass,this.p.mass);this.syncBody();
  }
  eat(f){
    if(f.shed){this.gainMass(f.mass);this.metrics.recovered+=f.mass;this.p.qi=Math.min(100,this.p.qi+2);this.emit('recover',{...f});return;}
    const waterLoot=f.battleLoot&&this.stage<3;
    const value=FOOD[f.rank].xp;this.eaten++;this.xp+=value;this.essence=Math.min(STAGES[this.stage].need,this.essence+value);
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
    if(f.materials)this.cultivation.earn(f.materials);
    this.emit('eat',{x:f.x,y:f.y,z:f.z,rank:f.rank,stage:this.stage,foodId:f.id,phase:f.phase,battleLoot:f.battleLoot,
      foodHeading:f.foodHeading,swallowedAt:this.time});
    if(f.rank===4){this.gold++;const id=ELEMENTS[Math.floor(this.rng()*ELEMENTS.length)];this.buffs[id]++;this.genome.unshift(id);this.genome=this.genome.slice(0,10);this.emit('mutation',{id});}
    while(this.xp>=this.levelNeed){this.xp-=this.levelNeed;this.level++;this.levelNeed=Math.floor(24+this.level*8);this.pendingLevels++;}
  }
  offerUpgrade(){
    if(this.practice||!this.pendingLevels||!this.waveTalents||this.status!=='market')return;
    const families={body:['肉身','mint'],breath:['吐息','blue'],element:['五行','purple'],general:['灵材','gold']};
    this.choices=this.cultivation.talentOffers().map(choice=>{
      const [tag,color]=families[choice.family];
      return {...choice,tag,color};
    });
  }
  choose(index){
    if(this.status!=='market'||!this.choices[index]||!this.waveTalents||!this.pendingLevels)return false;
    const choice=this.choices[index];
    if(!this.cultivation.applyTalent(choice.id).ok)return false;
    this.pendingLevels--;
    this.waveTalents--;
    this.buffs[choice.id]++;
    this.syncBody();
    this.choices=[];
    this.emit('chosen',{id:choice.id,name:choice.name});
    this.offerUpgrade();
    return true;
  }
  showMarket(){
    this.status='market';
    this.emit('market');
  }
  updateMarket(dt){
    if(this.practice||this.status!=='playing'||this.stage>=4)return;
    this.waveTime+=dt;
    const first=this.cultivation.wave===1;
    const duration=waveDuration(this.stage,this.cultivation.wave);
    const firstThreshold=first&&this.essence>=STAGES[this.stage].need;
    if(this.boss||(!firstThreshold&&this.waveTime<duration))return;
    if(!firstThreshold&&this.waveTime<duration+1.35&&(this.p.dash>0||this.weaponStrikes.length))return;
    const kills=this.kills-this.waveStart.kills, eaten=this.eaten-this.waveStart.eaten;
    this.cultivation.settleWave({kills,eaten});
    this.waveStart={kills:this.kills,eaten:this.eaten};
    this.cultivation.open(this.stage);
    this.waveTalents=Math.min(this.pendingLevels,first?1:2);
    this.showMarket();
    this.offerUpgrade();
  }
  leaveMarket(){
    if(this.status!=='market')return false;
    this.cultivation.close();
    this.choices=[];
    this.waveTime=0;
    this.waveOverflow=0;
    this.hordeCD=Math.min(this.hordeCD,waveDuration(this.stage,this.cultivation.wave)*.52);
    this.status='playing';
    return true;
  }
  dash(){if(this.status!=='playing'||this.p.dashCD>0)return false;this.p.dash=.34;this.p.dashCD=3.5;this.p.invul=Math.max(this.p.invul,.6);this.emit('dash',{x:this.p.x,z:this.p.z});return true;}
  steer(x,z,speed,dt){
    const p=this.p,strength=Math.min(1,Math.hypot(x,z));
    if(strength<=.05){
      if(p.dash>0){p.x+=Math.sin(p.angle)*speed*2.8*dt;p.z+=Math.cos(p.angle)*speed*2.8*dt;}
      return;
    }
    const aim=Math.atan2(x,z);
    if(!p.steerStarted){p.angle=aim;p.steerStarted=true;}
    let delta=turnDelta(p.angle,aim);
    if(Math.abs(delta)>Math.PI-.035)delta=(p.turnSide||1)*Math.PI;
    if(Math.abs(delta)>.12)p.turnSide=Math.sign(delta);
    const long=smooth(12,46,p.body);
    const turning=smooth(.46,2.53,Math.abs(delta));
    const dashing=p.dash>0;
    const travelSpeed=speed*(dashing?2.8:strength)*(1-(.23+.10*long)*turning);
    const radius=(.59+.97*long+this.stage*.19)*(dashing?1.38:1);
    const response=delta*(1-Math.exp(-dt*(13.8-long*4.1)));
    const maximum=travelSpeed/radius*dt;
    const change=clamp(response,-maximum,maximum);
    // Heading and displacement sample the same arc, so a new key cannot
    // jump the head sideways and leave a sharp corner for the spine to follow.
    const half=change*.5;
    const chord=travelSpeed*dt*(Math.abs(half)>.0001?Math.sin(half)/half:1);
    p.x+=Math.sin(p.angle+half)*chord;
    p.z+=Math.cos(p.angle+half)*chord;
    p.angle+=change;
  }
  spawnEnemy(type,x,z,y){
    if(this.enemies.length>=200)return null;
    const angle=this.rng()*TAU, range=18+this.rng()*8;
    type=enemyType(this.stage,type,this.rng);
    const profile=enemyProfile(type);
    const hp=(profile.hp+this.stage*18)*(1+this.time*.0007);
    const phase=this.rng()*TAU;
    const enemy={
      id:this.nextId++,type,role:profile.role,habitat:profile.habitat,
      x:x??clamp(this.p.x+Math.sin(angle)*range,-68,68),y:y??enemyHeight(this,type,phase),
      z:z??clamp(this.p.z+Math.cos(angle)*range,-68,68),hp,maxHp:hp,radius:profile.radius,
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
    if(this.enemies.length>=200)this.enemies.pop();
    const height=this.stage===2?1.04:this.p.y;
    const enemy=this.spawnEnemy(5+this.stage,this.p.x+Math.sin(angle)*12,this.p.z+Math.cos(angle)*12,height);
    Object.assign(enemy,{
      hp:stage.bossHp,maxHp:stage.bossHp,boss:true,role:'boss',habitat:this.stage===3?'sky':'water',
      radius:2.1+this.stage*.25,speed:.95,attack:BOSS_OPENING[this.stage],attackIndex:0,bossPlan:null,
    });
    this.stayInWater(enemy,1);
    this.boss=enemy;
    this.emit('boss',{name:stage.boss,x:enemy.x,y:enemy.y,z:enemy.z});
  }
  damage(e,amount,source='bubble',origin=null,strikeId=null,trialHits=null,branch=false){
    if(e.hp<=0||this.stage>=4)return;
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
    const before=e.hp;
    e.hp-=amount;e.hit=.12;
    if(trialHits)recordTrialHit(this,trialHits,e.id,before-Math.max(0,e.hp),branch);
    const from=origin?{x:origin.x,y:origin.y??e.y,z:origin.z}:null;
    this.emit('hit',{x:e.x,y:e.y,z:e.z,from,radius:e.radius,targetId:e.id,strikeId,
      amount:Math.round(amount),source,boss:e.boss,guarded});
    if(e.hp>0)return;this.kills++;this.combo++;this.comboCD=3;this.maxCombo=Math.max(this.maxCombo,this.combo);this.p.qi=Math.min(100,this.p.qi+1.4);this.emit('kill',{x:e.x,y:e.y,z:e.z,type:e.type});
    if(this.marketTrial)return;
    if(e.boss){this.evolve();return;}
    const material=e.elite ? 4 : e.type>=2&&(e.id+this.cultivation.wave*3)%4===0 ? 1 : 0;
    const rank=this.stage>=2&&this.rng()<.006?4:this.rng()<.055?Math.min(3,this.stage+1):this.rng()<.55?1:0;
    this.spawnFood(e.x,e.z,rank,{y:e.y,materials:material,life:material||rank>=3?38:this.stage<3?23:14,battleLoot:true});
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
    this.food=this.food.filter(item=>Math.abs(item.x)<66&&Math.abs(item.z)<66);
    Object.assign(p,{x:arrival.x,y:arrival.y,z:arrival.z,angle:arrival.angle,altitude:arrival.y,dash:0});
    this.bodyPath=sampleSpine(this.trail,p.body,.65*(1+this.stage*.08),p);
  }
  evolve(){
    const before=this.p.body,oldMass=this.p.mass;this.bossKills++;this.stage++;this.boss=null;this.essence=0;
    this.chapterPack=0;this.hordeCD=chapterPackDelay(this.stage);
    this.food=this.food.filter(item=>!item.ambient);this.foodPockets=[];this.foodCD=0;
    this.p.mass=oldMass*1.06+DENSITY[this.stage]*2;this.p.peakMass=this.p.mass;this.syncBody();this.p.invul=3;this.p.qi=100;this.metrics.condensed++;
    this.hazards=[];this.zones=[];this.enemies=[];this.shots=[];this.weaponStrikes=[];this.clawAttack=null;this.echoes=[];this.ring=null;this.windZone=null;this.motion.reset();
    const arrival=this.chapterArrivals?.[this.stage];
    if(arrival)this.arriveInChapter(arrival);
    this.emit('evolve',{x:this.p.x,z:this.p.z,stage:this.stage,before,after:this.p.body,density:this.p.density});
    if(this.stage===2||this.stage===3){this.p.altitude=arrival?.y??(this.stage===2?1.25:10);this.p.manualHeightUntil=this.time+4;for(const f of this.food)f.y=this.stage===2?.6+this.rng()*1.2:7+this.rng()*4;this.refillFood();this.emit('takeoff',{stage:this.stage,x:this.p.x,z:this.p.z});}
    if(this.stage===4){this.status='ascending';this.ascend=0;this.ascentOrigin={x:this.p.x,z:this.p.z,angle:this.p.angle};this.ascentTarget={x:this.p.x+Math.sin(this.p.angle)*48,y:27,z:this.p.z+Math.cos(this.p.angle)*48};}

  }
  hurt(amount,point){
    if(this.p.invul>0||this.status!=='playing')return;
    amount*=this.cultivation.modifiers().guard;
    const p=this.p,old=p.body,loss=Math.min(p.mass,amount/(8*Math.pow(p.density,.25)));p.mass-=loss;this.syncBody();p.invul=.85;this.metrics.lost+=loss;
    if(this.weaponStrikes.length)cancelWeaponStrikes(this);
    const tail=point||this.bodyPath.at(-1)||p,recoverable=loss*Math.min(.75,.48+this.buffs.growth*.04),n=Math.min(5,Math.max(1,Math.ceil(loss/p.density)));
    for(let i=0;i<n;i++)this.spawnFood(tail.x+(this.rng()-.5)*1.6,tail.z+(this.rng()-.5)*1.6,2,{y:tail.y,shed:true,mass:recoverable/n,grace:.8,life:18});
    const contact=point ? {x:point.x,y:point.y,z:point.z} : null;
    this.emit('hurt',{amount,x:tail.x,y:tail.y,z:tail.z,contact,lost:Math.max(0,old-p.body)});if(p.mass<=0){this.status='dead';this.emit('end',{win:false});}
  }
  nearest(range,from=this.p){let best=null,dd=range;for(const e of this.enemies)if(e.hp>0){const d=distance3(e,from);if(d<dd+e.radius){dd=d;best=e;}}return best;}
  shoot(){
    const weapon=this.cultivation.weapons.find(item=>this.cultivation.getWeapon(item.id)?.kind==='projectile');
    return Boolean(weapon&&fireTechnique(this,weapon));
  }
  addZone(kind,data){
    const power=clamp(data.power||1,.3,8),radius=clamp(data.radius||3,1,10),life=clamp((data.life||5)*(1+this.meta.alchemy*.06),.5,12);
    const old=this.zones.find(z=>z.kind===kind&&z.weaponAnchor===data.weaponAnchor&&distance3(z,data)<Math.min(2,radius*.35)&&kind!=='ring');
    if(old){old.life=Math.max(old.life,life);old.power=Math.min(8,Math.max(old.power,power)+.15);old.radius=Math.min(10,Math.max(old.radius,radius));if(data.damageFactor)old.damageFactor=Math.max(old.damageFactor||0,data.damageFactor);if(data.trialHits)old.trialHits=data.trialHits;return old;}
    if(this.zones.length>=28){const i=this.zones.findIndex(z=>z!==this.ring&&z!==this.windZone);if(i>=0)this.zones.splice(i,1);else return null;}
    const z={...data,id:this.nextId++,kind,x:data.x,y:data.y??this.p.y,z:data.z,radius,power,life,maxLife:life,tick:0,age:0,reactCD:0,energy:0};this.zones.push(z);this.emit('field',{kind,x:z.x,y:z.y,z:z.z,radius});return z;
  }
  lightning(target,power=1,source='lightning',origin=this.p,cast){
    if(!target)return;
    let e=target,previous={...origin},conductive=false;
    const stage=this.stage, used=new Set(), relays=[];
    const n=cast?.chain??Math.min(14,2+Math.ceil(power)+Math.floor(this.organs().length/2));
    const damage=cast?.damage??this.stats().damage*(.9+power*.16);
    const nextEnemy=(from,reach)=>{
      let next=null, nearest=reach;
      for(const enemy of this.enemies){
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
      this.damage(e,damage*(wet?1.4:1),source,null,null,cast?.trialHits);
      if(this.stage!==stage)return;
      previous=end;
      if(e.hp<=0&&wet&&this.meta.conduit>=1&&source!=='thunder'&&this.stage<4){const remnant=this.addZone('thunder',{...end,radius:2.4,life:3,power:1});if(remnant)remnant.energy=Math.min(6,remnant.energy+1.4);}
      const next=nextEnemy(end,(wet?7:4.5)+this.meta.conduit*.3);
      if(!next)break;
      e=next;
      conductive=wet;
    }
    for(const relay of relays){
      const branch=nextEnemy(relay,5.6);
      if(!branch)continue;
      const to={x:branch.x,y:branch.y,z:branch.z};
      this.emit('arc',{from:relay,to,power:power*.66,source,conductive:true,branch:true});
      branch.charge=1;
      this.damage(branch,damage*.5*(branch.wet>0?1.4:1),source,relay,null,cast?.trialHits,true);
      if(this.stage!==stage)return;
      break;
    }
    if(source!=='thunder')for(const z of this.zones)if(['steam','cloud','thunder'].includes(z.kind)&&distance3(z,previous)<z.radius+3){const fresh=z.kind!=='thunder';z.kind='thunder';z.energy=Math.min(12,z.energy+power*2+this.meta.conduit*.5);z.life=Math.max(z.life,5);if(fresh){this.metrics.reactions++;this.metrics.thunder++;this.emit('reaction',{name:'雷云共鸣',x:z.x,y:z.y,z:z.z});}}
  }
  element(kind){const level=this.strength(kind);if(!level)return;const target=this.nearest(18);if(!target)return;
    if(kind==='lightning')this.lightning(target,level,'lightning',{x:target.x+1,y:target.y+9,z:target.z-2});
    else this.addZone(kind==='rain'?'rain':kind,{x:target.x,y:target.y,z:target.z,radius:2.5+Math.sqrt(level)*.6,power:level,life:4.8});
  }
  updatePose(dt){
    const p=this.p;if(this.stage>=2)for(let i=1;i<this.trail.length;i++)this.trail[i].y+=(p.y-this.trail[i].y)*Math.min(1,dt*.85);
    const first=this.trail[0];if(Math.hypot(p.x-first.x,p.z-first.z, p.y-first.y)>.12){this.trail.unshift({x:p.x,y:p.y,z:p.z,t:this.time});if(this.trail.length>1100)this.trail.length=1100;}
    this.bodyPath=sampleSpine(this.trail,p.body,.65*(1+this.stage*.08),p);this.pose=this.motion.update(p,this.time,this.bodyPath);const pose=this.pose,mult=1+this.buffs.coil*.2+this.meta.coil*.08;
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
    let strikes=0;for(const e of [...this.enemies])if(e.hp>0&&Math.abs(e.y-z.y)<3.5&&insidePolygon(e,z.polygon)){
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
        for(const e of this.enemies){
          if(!canDisplaceEnemy(e))continue;
          const d=distance3(e,z);
          if(d>=z.radius+2||d<=.3)continue;
          const previous={x:e.x,y:e.y,z:e.z};
          const pull=dt*(2.3+z.power*.25)*(1-d/(z.radius+3))*(rainfed&&e.wet>0?1.55:1);
          e.x+=(z.x-e.x)/d*pull;
          e.z+=(z.z-e.z)/d*pull;
          e.y+=(z.y-e.y)/d*pull;
          this.stayInWater(e,.4,previous);
        }
        for(const other of this.zones)if(other!==z&&distance3(other,z)<z.radius+other.radius){if(other.kind==='fire')z.flame=3;if(other.kind==='poison')z.toxic=3;if(['rain','steam','cloud'].includes(other.kind))z.rain=3;}
        if(z.toxic&&!z.wasToxic){z.wasToxic=true;this.metrics.toxic++;this.metrics.reactions++;this.emit('reaction',{name:'万毒归流 · 毒风聚煞',x:z.x,y:z.y,z:z.z});}if(z.flame&&!z.wasFlame){z.wasFlame=true;this.metrics.reactions++;this.emit('reaction',{name:'风助火势 · 炎舞风暴',x:z.x,y:z.y,z:z.z});}
        z.flame=Math.max(0,(z.flame||0)-dt);z.toxic=Math.max(0,(z.toxic||0)-dt);z.rain=Math.max(0,(z.rain||0)-dt);
      }
      if(z.kind==='fire'&&z.reactCD<=0){const moisture=this.zones.find(q=>['rain','storm'].includes(q.kind)&&distance3(z,q)<z.radius+q.radius);const wetEnemy=this.enemies.some(e=>e.hp>0&&e.wet>0&&distance3(e,z)<z.radius);
        if((this.stage<2&&z.age>.9)||moisture||wetEnemy){z.reactCD=3;this.addZone('steam',{x:z.x,y:z.y+1,z:z.z,radius:z.radius*.9,power:1,life:5.5});this.metrics.reactions++;this.metrics.steam++;this.emit('reaction',{name:'火水相激 · 蒸汽成云',x:z.x,y:z.y,z:z.z});}}
      if(z.kind==='steam'&&z.age>2.5)z.kind='cloud';
      if(this.meta.alchemy>=1&&['steam','cloud','thunder'].includes(z.kind)&&distance3(this.p,z)<z.radius+1){this.p.qi=Math.min(100,this.p.qi+dt*1.4);this.gainMass(dt*.012*Math.min(3,this.meta.alchemy));}
      if(z.tick>0)continue;z.tick=.35;
      if(z.kind==='thunder'&&z.energy>0){const e=this.nearest(z.radius+2,z);if(e){z.energy-=.7;this.lightning(e,1.4+this.meta.conduit*.1,'thunder',{x:z.x,y:z.y+4,z:z.z},{trialHits:z.trialHits});}}
      for(const e of [...this.enemies]){
        if(e.hp<=0||Math.abs(e.y-z.y)>Math.max(2.2,z.radius*.65))continue;const contained=z.kind==='ring'?insidePolygon(e,z.polygon):distance3(e,z)<z.radius+e.radius;if(!contained)continue;
        if(['rain','steam','cloud','ring'].includes(z.kind)||z.rain||this.buffs.rain&&z.kind==='storm')e.wet=5;
        if(z.kind==='poison'||z.toxic)e.poison=4;
        if(z.kind==='fire'||z.flame)e.burn=3;
        if(['fire','storm','ring','poison'].includes(z.kind)){const scale=z.kind==='ring'?.3+(z.charge||0)*.12:.24+z.power*.08;this.damage(e,s.damage*scale*(z.damageFactor??1)*(1+((z.flame?1:0)+(z.toxic?1:0))*.3),z.kind,null,null,z.trialHits);}
      }
    }this.zones=this.zones.filter(z=>z.life>0);
  }
  step(dt,input={}){
    dt=clamp(dt,0,.05);if(!dt)return;
    if(this.status==='ascending'){
      this.ascend+=dt;this.time+=dt;const p=this.p,target=this.ascentTarget||{x:p.x,y:27,z:p.z+48},dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),speed=Math.min(4.2,d*1.2);
      p.x+=(dx/Math.max(.01,d)*speed+(input.x||0)*1.35)*dt;p.z+=(dz/Math.max(.01,d)*speed+(input.z||0)*1.35)*dt;p.y+=(target.y-p.y)*Math.min(1,dt*.23);p.altitude=p.y;
      const angle=Math.atan2(dx,dz);p.angle+=Math.atan2(Math.sin(angle-p.angle),Math.cos(angle-p.angle))*Math.min(1,dt*2.5);
      if(Math.hypot(p.x-this.trail[0].x,p.y-this.trail[0].y,p.z-this.trail[0].z)>.12)this.trail.unshift({x:p.x,y:p.y,z:p.z,t:this.time});if(this.trail.length>1100)this.trail.length=1100;
      for(let i=1;i<this.trail.length;i++)this.trail[i].y+=(p.y-this.trail[i].y)*Math.min(1,dt*.35);this.bodyPath=sampleSpine(this.trail,p.body,.65*(1+this.stage*.08),p);
      if(this.ascend>12&&d<4&&p.y>24){this.status='won';this.emit('end',{win:true});}return;
    }
    if(this.status!=='playing')return;this.time+=dt;const p=this.p,s=this.stats();if(this.practice){p.invul=100;p.qi=Math.max(85,p.qi);this.trainingSpawnCD=(this.trainingSpawnCD||0)-dt;if(this.trainingSpawnCD<=0&&this.enemies.length<5){this.trainingSpawnCD=2;const a=this.time*2.4,e=this.spawnEnemy(0,Math.sin(a)*3.5,Math.cos(a)*3.5);if(e){e.speed=0;e.hp=e.maxHp=200;e.shootCD=1000;}}}
    const dashReady=p.dashCD>0&&p.dashCD<=dt;
    p.invul=Math.max(0,p.invul-dt);p.dashCD=Math.max(0,p.dashCD-dt);p.dash=Math.max(0,p.dash-dt);p.qi=Math.min(100,p.qi+dt*(1.6+this.buffs.coil*.1)*s.mods.qi);
    if(dashReady)this.emit('dashReady',{x:p.x,z:p.z,to:{x:p.x+Math.sin(p.angle),y:p.y,z:p.z+Math.cos(p.angle)}});
    const regen=s.mods.regen/(8*Math.pow(p.density,.25))+this.buffs.regen*.1;
    if(regen&&p.mass<s.maxMass)this.gainMass(dt*regen);
    const previousPosition=(this.terrainHeight||this.shoreHeight)?{x:p.x,z:p.z}:null;
    this.steer(input.x||0,input.z||0,s.speed,dt);
    if(this.stage>=2){
      const [low,high]=flightBand(this.stage);p.altitude=clamp(p.altitude,low,high);
      if(input.lift){p.altitude=clamp(p.altitude+input.lift*dt*6,low,high);p.manualHeightUntil=this.time+2;}
      else if(input.autoHeight!==false&&this.time>(p.manualHeightUntil||0)){
        const food=this.food.filter(f=>dist(f,p)<5).sort((a,b)=>dist(a,p)-dist(b,p))[0];const target=this.boss||food;
        if(target)p.altitude+=(clamp(target.y,low,high)-p.altitude)*dt*.8;
      }
      p.y+=(p.altitude-p.y)*Math.min(1,dt*1.4);
    }else p.y=.7;
    p.x=clamp(p.x,-67,67);p.z=clamp(p.z,-67,67);this.stayInWater(p,.55,previousPosition);this.updatePose(dt);
    if(this.stage===3){this.foodCD-=dt;if(this.foodCD<=0){this.foodCD=.3;this.refillFood();}}
    for(let i=this.food.length-1;i>=0;i--){const f=this.food[i];if(f.grace>0){f.grace-=dt;continue;}if(f.life!==undefined){f.life-=dt;if(f.life<=0){this.food.splice(i,1);continue;}}
      const d=distance3(p,f),reach=s.magnet+(f.rank>=3?.5:0);if(d<.8){this.food.splice(i,1);this.eat(f);}else if(d<reach){const k=Math.min(1,dt*(5+(reach-d)*6)/d);f.x+=(p.x-f.x)*k;f.z+=(p.z-f.z)*k;f.y+=(p.y-f.y)*k;}else if(d>48)this.food.splice(i,1);
    }
    this.updateMarket(dt);
    if(this.status!=='playing')return;
    if(!this.practice&&this.stage<4&&this.essence>=STAGES[this.stage].need&&!this.boss)this.summonBoss();
    const combatStage=this.stage;
    updateWeaponCombat(this,dt);
    if(this.stage!==combatStage||this.status!=='playing')return;
    for(const kind of Object.keys(this.elementCD))if(this.buffs[kind]>0){
      this.elementCD[kind]-=dt;
      if(this.elementCD[kind]<=0){this.elementCD[kind]=kind==='lightning'?3.9:6;this.element(kind);}
    }
    for(const shot of this.shots){shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.z+=shot.vz*dt;shot.life-=dt;
      for(const e of this.enemies)if(e.hp>0&&shot.life>0&&!shot.hitIds.has(e.id)&&distance3(e,shot)<e.radius+SHOT_CONTACT_MARGIN){
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
        this.damage(e,damage,shot.kind,{x:shot.x-shot.vx*dt,y:shot.y-shot.vy*dt,z:shot.z-shot.vz*dt},null,shot.trialHits);
        if(this.stage!==combatStage)return;
        if(--shot.pierce<=0)shot.life=0;else shot.damage*=.87;
      }
    }this.shots=this.shots.filter(q=>q.life>0).slice(-160);
    updateEnemySpawns(this,dt);
    const encounterStage=this.stage;
    for(const enemy of this.enemies){
      updateEnemy(this,enemy,dt,s.damage);
      if(this.stage!==encounterStage||this.status!=='playing')break;
    }
    this.enemies=this.enemies.filter(e=>e.hp>0&&(e.boss||distance3(e,p)<45));
    updateEnemyHazards(this,dt);
    this.updateFields(dt);
    for(const echo of this.echoes){echo.delay-=dt;if(echo.delay<=0){for(const e of this.enemies)if(e.hp>0&&Math.abs(e.y-echo.y)<3&&insidePolygon(e,echo.polygon))this.damage(e,echo.damage,'echo');this.emit('ringBurst',{...echo,power:.6});}}
    this.echoes=this.echoes.filter(e=>e.delay>0);this.comboCD-=dt;if(this.comboCD<=0)this.combo=0;
  }
  reward(){if(this.practice)return 0;return (this.time>=20||this.eaten>=12||this.kills>=3?2:0)+this.stage*6+Math.floor(this.kills/15)+this.gold*2+Math.floor(this.metrics.reactions/8)+(this.status==='won'?20:0);}
}
