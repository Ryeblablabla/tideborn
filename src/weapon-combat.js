import { techniqueStats } from './cultivation.js';
import { knockBackEnemy } from './encounters.js';
import { ENEMY_RADIUS_LIMIT } from './enemy-grid.js';
import { castTechniqueArt, isTechniqueArt } from './technique-arts.js';
import { beamRainPlacement } from './dragon-arts.js';

const center = ({ x, y, z }) => ({ x, y, z });
const contactPoint = ({ x, y, z, radius }) => ({ x, y, z, radius });
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const windups = { fang: .19, tail: .28, drop: .22 };
const tailIndex = path => Math.max(0,Math.floor((path.length-1)*.74));
export const SHOT_CONTACT_MARGIN=.38;
const hasClaws = game => game.form >= 2;

export function attackOrigin(game, id) {
  if (id !== 'tail') return game.p;
  const trail = game.bodyPath;
  return trail[tailIndex(trail)] || game.p;
}

function strikeHeading(game,kind) {
  if(kind!=='tail')return game.p.angle;
  const path=game.bodyPath,index=tailIndex(path);
  const fore=path[Math.max(0,index-1)],aft=path[Math.min(path.length-1,index+1)];
  if(!fore||!aft||Math.hypot(fore.x-aft.x,fore.z-aft.z)<.01)return game.p.angle;
  return Math.atan2(fore.x-aft.x,fore.z-aft.z);
}

function targetInArc(origin, target, reach, axis) {
  if (target.hp <= 0 || distance(origin,target) > reach+Math.min(.6,target.radius)) return false;
  if (axis === null) return true;
  const x = target.x-origin.x, z = target.z-origin.z;
  return Math.sin(axis)*x+Math.cos(axis)*z >= .27*Math.hypot(x,z)
    && Math.abs(target.y-origin.y)<1.25+Math.min(.45,target.radius);
}

function findTarget(game, origin, reach, axis = null) {
  const boss=game.boss;
  if(boss?.bossPlan?.phase==='recovery'&&targetInArc(origin,boss,reach,axis))return boss;
  let selected = null, nearest = Infinity;
  for (const target of game.enemiesNear(origin, reach + .6)) {
    if (!targetInArc(origin,target,reach,axis)) continue;
    const d = distance(origin,target);
    if (d < nearest) { nearest=d; selected=target; }
  }
  return selected;
}

function findRainTarget(game, origin, technique, fallback) {
  if(game.stage!==3 || !game.dragonScorch?.lanes.length)return fallback;
  const near=game.enemiesNear(origin,technique.range+.6)
    .filter(enemy=>!enemy.boss&&targetInArc(origin,enemy,technique.range,null))
    .sort((a,b)=>distance(origin,a)-distance(origin,b)||a.id-b.id)
    .slice(0,8);
  let target=fallback,best=0;
  for(const enemy of near) {
    const rating=beamRainPlacement(game,enemy,technique.radius);
    if(rating===null)continue;
    const score=rating-distance(origin,enemy)*.032;
    if(score>best){best=score;target=enemy;}
  }
  return target;
}

function piercingTarget(game,origin,technique,nearest) {
  if(technique.pierce<=1||(nearest===game.boss&&nearest.bossPlan?.phase==='recovery'))return nearest;
  const flight=technique.range+2.1;
  const crowd=[];
  for(const enemy of game.enemiesNear(origin,flight+ENEMY_RADIUS_LIMIT)){
    if(enemy.hp<=0)continue;
    const x=enemy.x-origin.x,y=enemy.y-origin.y,z=enemy.z-origin.z;
    const length=Math.hypot(x,y,z);
    if(length<=flight+enemy.radius)crowd.push({enemy,x,y,z,length});
  }
  if(crowd.length<2)return nearest;
  crowd.sort((a,b)=>a.length-b.length);
  let selected=nearest,best=1;
  for(const aim of crowd.slice(0,12)){
    if(aim.length>technique.range+Math.min(.6,aim.enemy.radius))break;
    if(aim.length<.15)continue;
    const nx=aim.x/aim.length,ny=aim.y/aim.length,nz=aim.z/aim.length;
    let contacts=0;
    for(const target of crowd){
      const along=target.x*nx+target.y*ny+target.z*nz;
      if(along<=0||along>flight)continue;
      const radius=target.enemy.radius+SHOT_CONTACT_MARGIN;
      if(target.length**2-along**2<radius**2)contacts++;
      if(contacts>=technique.pierce)return aim.enemy;
    }
    if(contacts>best){best=contacts;selected=aim.enemy;}
  }
  return selected;
}

export function previewAttackIntent(game) {
  const lead = .12;
  const origin = game.p;
  let mods, selected;
  for (const weapon of game.cultivation.weapons) {
    const shootIn = Math.max(0, weapon.cd);
    if (shootIn >= (selected?.shootIn ?? lead)) continue;
    const technique = techniqueStats(weapon, mods ??= game.cultivation.modifiers());
    const claw = technique?.id === 'fang';
    if (!claw && technique?.kind !== 'projectile') continue;
    const target = findTarget(game, origin, technique.range, claw ? origin.angle : null);
    if (!target) continue;
    selected = { target, shootIn, technique, claw };
  }
  if (!selected) return undefined;
  const { target, shootIn, technique, claw } = selected;
  const progress = Math.max(0, (shootIn - .03) / (lead - .03));
  return { target: claw ? target : piercingTarget(game, origin, technique, target),
    shootIn, claw: claw && hasClaws(game), prepare: 1 - progress * progress * (3 - 2 * progress) };
}

function launch(game, from, target, technique, weapon) {
  const x = target.x-from.x, z = target.z-from.z;
  const speed = technique.id === 'needle' ? 24 : technique.id === 'breach' ? 13 : 17;
  const aim = Math.atan2(x,z), length = Math.hypot(x,z);
  const total = Math.max(.15,Math.hypot(length,target.y-from.y));
  const planar=speed*length/total, dy=speed*(target.y-from.y)/total;
  const fan = technique.id === 'breach' ? .21 : technique.id === 'mist' ? .17 : .113;
  const count = Math.max(1,Math.min(9,technique.projectiles+game.buffs.multi));
  const kind = technique.id;
  const life = (technique.range+2.1)/speed;
  const muzzleBlend = Math.max(.04,Math.min(.18,(length-target.radius)/speed*.46));
  const volleyHits=count>1 ? new Map() : null;
  for(let i=0;i<count;i++) {
    const angle=aim+(i-(count-1)*.5)*fan;
    game.shots.push({
      id:game.nextId++, ...center(from),
      vx:Math.sin(angle)*planar, vy:dy, vz:Math.cos(angle)*planar,
      life,startLife:life,muzzleBlend,
      damage:game.stats().damage*technique.power, pierce:technique.pierce,
      hitIds:new Set(), volleyHits, kind, element:technique.element, tier:weapon.tier,
    });
  }
  game.emit('shoot',{...center(from),to:center(target),weapon:technique.id,kind,count,tier:weapon.tier});
}

function beginStrike(game, origin, target, technique, weapon) {
  const kind = technique.id === 'tail' ? 'tail' : technique.kind === 'pulse' ? 'water' : hasClaws(game) ? 'claw' : 'bite';
  const time = windups[technique.id] || .18;
  const heading = strikeHeading(game,kind);
  const side = Math.cos(heading)*(target.x-origin.x)-Math.sin(heading)*(target.z-origin.z)<0 ? -1 : 1;
  const strike = {
    id:game.nextStrikeId++,target,technique,kind,side,windup:time,
    tier:weapon.tier, releaseAt:game.time+time, stage:game.stage,
    angle:game.p.angle, from:center(origin), aim:contactPoint(target),
    damage:game.stats().damage*technique.power,
  };
  game.weaponStrikes.push(strike);
  if(kind==='claw'||kind==='bite')game.clawAttack=strike;
  const cue = kind==='claw'||kind==='bite' ? 'clawStart' : 'weaponWindup';
  game.emit(cue,{
    ...strike.from,to:strike.aim,targetId:target.id,strikeId:strike.id,releaseAt:strike.releaseAt,strike:kind,side,windup:time,
    radius:technique.radius||technique.range,tier:weapon.tier,
  });
}

function releaseStrike(game, strike, cancelled = false) {
  if (game.clawAttack===strike) game.clawAttack=null;
  if (strike.stage!==game.stage) return;
  const { technique, kind, target, damage, tier, side } = strike;
  const origin = attackOrigin(game,technique.id);
  const y = origin.y, radius = technique.radius||technique.range;
  const arc = kind==='claw'||kind==='bite' ? strike.angle : null;
  const hits = cancelled ? [] : game.enemiesNear(origin,radius+.6).filter(enemy=>
    targetInArc(origin,enemy,radius,arc)
    && (kind!=='water'||Math.abs(enemy.y-y)<1.65+enemy.radius*.24));
  const contact=hits.includes(target)?target:hits[0];
  const event = {
    ...center(origin), to:contact?contactPoint(contact):strike.aim, side, tier, radius,
    strikeId:strike.id,aimTargetId:target.id,targetId:contact?.id??null,
    releasedAt:game.time,windup:strike.windup,strike:kind,hit:Boolean(contact),cancelled,angle:strike.angle,weapon:technique.id,
  };
  game.emit(kind==='claw'||kind==='bite' ? 'clawRelease' : 'weaponStrike',event);
  const impact = kind==='water' ? 'water' : kind==='tail' ? 'tail' : kind;
  for(const enemy of hits) {
    if(game.stage!==strike.stage)break;
    const driven=technique.wetSweep&&kind==='water'&&enemy.wet>0&&Math.hypot(enemy.x-origin.x,enemy.z-origin.z)>radius*.52;
    if(kind==='water')enemy.wet=5;
    if(technique.sideBreak&&enemy.boss&&(game.stage===0||game.stage===2&&enemy.shield)&&enemy.bossPlan?.phase!=='recovery'){
      const x=origin.x-enemy.x,z=origin.z-enemy.z;
      const front=Math.sin(enemy.angle)*x+Math.cos(enemy.angle)*z;
      if(front<Math.hypot(x,z)*.22&&game.time>=(enemy.brokenArmorUntil??0)){
        enemy.brokenArmorUntil=game.time+1.35;
        game.emit('armorBreak',{...center(enemy),from:center(origin),targetId:enemy.id,strikeId:strike.id});
      }
    }
    game.damage(enemy,damage,impact,origin,strike.id);
    if(kind!=='water'||driven)knockBackEnemy(game,enemy,origin,driven?'tail':kind,tier);
  }
}

export function cancelWeaponStrikes(game) {
  for(const strike of game.weaponStrikes)releaseStrike(game,strike,true);
  game.weaponStrikes=[];
}

export function fireTechnique(game, weapon, modifiers=game.cultivation.modifiers()) {
  const technique=techniqueStats(weapon,modifiers);
  if(!technique)return false;
  const origin=attackOrigin(game,technique.tailVortex?'tail':technique.id);
  if(isTechniqueArt(technique.kind))return castTechniqueArt(game,origin,technique);
  const contact=technique.kind==='melee'&&technique.id!=='tail';
  if(contact&&game.clawAttack)return false;
  const reach=technique.kind==='pulse'?technique.radius:technique.range;
  let target=findTarget(game,origin,reach,contact?game.p.angle:null);
  if(!target)return false;
  const intent=target;
  if(technique.id==='torrent')target=findRainTarget(game,origin,technique,target);
  if(technique.kind==='melee'||technique.kind==='pulse') {
    beginStrike(game,origin,target,technique,weapon);
  } else if(technique.kind==='projectile') {
    launch(game,origin,piercingTarget(game,origin,technique,target),technique,weapon);
  } else if(technique.kind==='arc') {
    game.emit('weaponCast',{...center(origin),to:center(target),weapon:technique.id,tier:weapon.tier,kind:'arc'});
    game.lightning(target,weapon.tier,'lightning',origin,{
      damage:game.stats().damage*technique.power, chain:technique.chain, jumpReach:technique.jumpReach, wetBranch:technique.wetBranch,
    });
  } else if(technique.kind==='zone') {
    const landing=technique.tailVortex?origin:target;
    const anchor=technique.tailVortex?'tail':undefined;
    const zone=game.addZone(technique.field,{
      ...center(landing),power:weapon.tier,radius:technique.radius,life:technique.life,
      damageFactor:technique.power,weapon:technique.id,weaponAnchor:anchor,
    });
    if(!zone)return false;
    if(technique.field==='thunder')zone.energy=Math.min(12,zone.energy+(technique.energy||2));
    game.emit('weaponCast',{...center(origin),to:center(anchor?zone:target),weapon:technique.id,tier:weapon.tier,
      kind:technique.field,...(anchor?{anchor}:{}),...(intent!==target?{combined:'beam-scorch',targetId:target.id}:null)});
  }
  return true;
}

export function updateWeaponCombat(game, dt) {
  const stage = game.stage;
  const ready=[], pending=[];
  for(const strike of game.weaponStrikes)
    (game.time>=strike.releaseAt ? ready : pending).push(strike);
  game.weaponStrikes=pending;
  for(const strike of ready){
    if(game.stage!==stage||game.status!=='playing')return;
    releaseStrike(game,strike);
  }
  if(game.stage!==stage||game.status!=='playing')return;

  const mods=game.cultivation.modifiers();
  for(const weapon of game.cultivation.weapons){
    if(game.stage!==stage||game.status!=='playing')break;
    weapon.cd=Math.max(0,weapon.cd-dt);
    if(weapon.cd>0)continue;
    const technique=techniqueStats(weapon,mods);
    if(technique)weapon.cd=fireTechnique(game,weapon,mods)?technique.cooldown:.08;
  }
  game.attackCD=Math.min(1,...game.cultivation.weapons.map(weapon=>weapon.cd));
}
