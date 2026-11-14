import { canDisplaceEnemy } from './encounters.js';
import { CASCADE_CARDS } from './market-choices.js';

const rules = {
  wind: {
    sources: ['storm', 'tail', 'claw', 'bite', 'ring', 'echo', 'stonecrest', 'windkite'],
    radius: 15, duration: 1.64, cooldown: 8.8, power: 3.65,
  },
  fire: {
    sources: ['fire', 'breach', 'emberwings'], status: 'burn',
    radius: 17, duration: 1.58, cooldown: 8.2, power: 3.55,
  },
  thunder: {
    sources: ['lightning', 'serpent', 'thunder'], status: 'charge',
    radius: 20, duration: 1.43, cooldown: 8.4, power: 3.58,
  },
  water: {
    sources: ['water', 'bubble', 'rain', 'hoarfrost'], status: 'wet',
    radius: 16, duration: 1.75, cooldown: 8.8, power: 3.60,
  },
  poison: {
    sources: ['poison', 'mist'], status: 'poison',
    radius: 19, duration: 2.16, cooldown: 9.3, power: 3.32,
  },
};

export const CASCADE_ROUTES = Object.freeze(Object.fromEntries(Object.entries(rules).map(([kind, rule]) => [
  kind, Object.freeze({ ...CASCADE_CARDS[kind], ...rule }),
])));

const position = ({ x, y, z }) => ({ x, y, z });
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const living = enemy => enemy.hp > 0 && !enemy.boss;
const nearHeight = (a, b, slack = 3.6) => Math.abs(a.y - b.y) <= slack;
const HANDOFF_LIFE = 5.6;
const HANDOFF_SCAN = .12;
const HANDOFF_SETTLE = .26;
const HANDOFF_MIN_AIM = .20;
const HANDOFF_GROUP_RADIUS = 7.6;
const CLEAR_FOLLOW_WINDOW = 3.8;
const CLEAR_FOLLOW_SPACING = 3.6;
const WATER_FAN_TRAVEL = .32;
const THUNDER_BRANCH_MAX = 18;
const WIND_GATHER_TIME = .52;
const WIND_LOCK_TIME = .17;
const GALE_SPORE_FRONT = 'gale-spore-front';
const GALE_SPORE_HIT = 'gale-spore-hit';
const GALE_SPORE_TRAVEL = .82;
const GALE_SPORE_HOLD = 1.55;
const THAW_THUNDER_LIFE = 4.2;
const THAW_THUNDER_RADIUS = 8.7;
const THAW_THUNDER_HIT = 'thaw-thunder-hit';
const thawChargeSources = new Set(['spark','lightning','serpent','thunder','cascade-thunder']);
const handoffPulseDelay = {poison:.36,wind:.34,fire:.28,water:.27,thunder:.20};
const combine = (point, direction, along, across = 0) => ({
  x: point.x + direction.x * along - direction.z * across,
  y: point.y,
  z: point.z + direction.z * along + direction.x * across,
});

function heading(player, seed, directional) {
  const reach = horizontal(player, seed);
  const forward = { x: Math.sin(player.angle), z: Math.cos(player.angle) };
  if (reach < 1.3) return forward;
  const aimed = { x: (seed.x - player.x) / reach, z: (seed.z - player.z) / reach };
  // A fish tagged by the tail can die behind the dragon after it has already
  // turned toward the next shoal. Don't send the wave backwards in that case.
  return directional && forward.x * aimed.x + forward.z * aimed.z < .6 ? forward : aimed;
}

function eventData(cascade) {
  return {
    id: cascade.id, kind: cascade.kind, ...cascade.center, radius: cascade.radius,
    direction: cascade.direction, duration: cascade.duration, rank: cascade.rank,
    hitCount: cascade.targets.size, killCount: cascade.kills, handoff: cascade.handoff, doctrine: cascade.doctrine,
  };
}

function schedule(cascade, job) {
  if (job.at <= cascade.duration - .04) cascade.pending.push(job);
}

function pulse(game, cascade, { center, depth, radius, width = radius, from = center, to = center, direction = cascade.direction,
  detail, travelTime, carrierFrom, carrierId, preparing, receiverIds, leg, sources, innerRadius }) {
  game.emit('cascadePulse', {
    ...eventData(cascade), ...center, radius, width, depth, from, to, direction, detail, travelTime,
    carrierFrom, carrierId, preparing, receiverIds, leg, sources, innerRadius,
  });
}

function resolveHit(game, cascade, enemy, from, depth, damage, status, detail, leg, presentation) {
  if (!living(enemy) || cascade.hits >= cascade.hitLimit) return false;
  if (status) enemy[status] = Math.max(enemy[status] || 0, 3.5);
  cascade.hits++;
  cascade.targets.add(enemy.id);
  const to = position(enemy);
  game.damage(enemy, damage, detail===GALE_SPORE_HIT?'cascade-poison':'cascade-'+cascade.kind, from);
  const killed = enemy.hp <= 0;
  if (killed) {
    cascade.kills++;
    cascade.clearedRadius = Math.max(cascade.clearedRadius, horizontal(cascade.center, to));
    if (game.time >= cascade.nextBreakAt) {
      if (game.time - cascade.breakStartedAt > .23) {
        cascade.breakStartedAt = game.time;
        cascade.breakKills = 0;
      }
      if (++cascade.breakKills >= 5) {
        cascade.nextBreakAt = game.time + .44;
        cascade.breakStartedAt = -Infinity;
        game.emit('cascadeBreak', {...eventData(cascade), ...to});
      }
    }
    if (cascade.rank === 3 && (cascade.kind === 'poison' || cascade.kind === 'fire')) cascade.fallen.push({...to,targetId:enemy.id});
  }
  game.emit('cascadeHit', {
    ...eventData(cascade), ...to, from, to, depth, targetId: enemy.id, targetRadius: enemy.radius, killed, detail, leg,
    ...(detail===THAW_THUNDER_HIT?{artId:cascade.thawThunder.artId}:presentation),
  });
  return killed;
}

export function storeThawThunder(game, art, targets) {
  if (game.cultivation.cascade !== 'thunder' || game.cultivation.cascadeRank < 2 || game.boss || game.practice) return;
  const killed = targets.filter(target => target.killed);
  if (killed.length < 2) return;
  const center = killed.reduce((sum,target)=>({x:sum.x+target.x/killed.length,y:sum.y+target.y/killed.length,
    z:sum.z+target.z/killed.length}),{x:0,y:0,z:0});
  if(game.thawThunder)game.emit('dragonArtReaction',{...thawThunderEvent(game.thawThunder),reaction:'thaw-thunder-cancel'});
  game.thawThunder = {artId:art.id,art,stage:game.stage,center,killed,expiresAt:game.time+THAW_THUNDER_LIFE,
    nextWetAt:game.time};
  game.emit('dragonArtReaction',{...thawThunderEvent(game.thawThunder),reaction:'thaw-thunder-store',
    from:center,to:center,radius:THAW_THUNDER_RADIUS,duration:THAW_THUNDER_LIFE,targets:killed});
}

function thawThunderEvent(mist) {
  return {...mist.center,id:mist.artId,kind:'frost',stage:mist.stage};
}

function inThawMist(game,mist,enemy) {
  return mist.killed.some(target=>horizontal(target,enemy)<=THAW_THUNDER_RADIUS&&nearHeight(target,enemy,4.4)&&
    clearFollowPassage(game,target,enemy));
}

export function noteThawThunder(game,type,event) {
  const mist=game.thawThunder;
  if (!mist || mist.expiresAt<=game.time || mist.stage!==game.stage ||
      type!=='hit' || !event.wet || event.amount<=0 || !thawChargeSources.has(event.source) ||
      mist.art.hitTargets.has(event.targetId)) return;
  if(!inThawMist(game,mist,event))return;
  mist.charge={...position(event),id:event.targetId,source:event.source,at:game.time};
}

function findThawThunderGroup(game,mist,exclude) {
  const {charge,art}=mist;
  const candidates=game.enemiesNear(charge,23).filter(enemy=>living(enemy)&&enemy.id!==charge.id&&
    !art.hitTargets.has(enemy.id)&&!art.locked.has(enemy.id)&&!art.iceFork.hits.has(enemy.id)&&!exclude?.has(enemy.id)&&
    horizontal(enemy,charge)>4.5&&horizontal(enemy,charge)<=22&&nearHeight(enemy,charge,7));
  let best;
  for(const anchor of candidates) {
    const to=position(anchor), from=charge;
    const crest={x:(from.x+to.x)*.5,y:(from.y+to.y)*.5+3.5,z:(from.z+to.z)*.5};
    if(!clearFollowPassage(game,from,crest)||!clearFollowPassage(game,crest,to))continue;
    const targets=candidates.filter(enemy=>horizontal(enemy,to)<=7.2&&nearHeight(enemy,to,4.1)&&
      clearFollowPassage(game,to,enemy)).slice(0,12);
    if(targets.length<3)continue;
    const score=targets.length+.14*targets.filter(enemy=>enemy.wet>0).length+.025*horizontal(from,to);
    if(!best||score>best.score)best={to,crest,targets,score};
  }
  return best;
}

function updateThawThunder(game) {
  const mist=game.thawThunder;
  if(!mist)return;
  if(mist.stage!==game.stage||game.time>=mist.expiresAt||game.boss||game.cultivation.cascade!=='thunder'||
      game.cultivation.cascadeRank<2) {
    game.thawThunder=null;
    game.emit('dragonArtReaction',{...thawThunderEvent(mist),reaction:'thaw-thunder-cancel'});
    return;
  }
  if(game.time>=mist.nextWetAt) {
    mist.nextWetAt=game.time+.20;
    for(const enemy of game.enemiesNear(mist.center,18)) {
      if(living(enemy)&&inThawMist(game,mist,enemy))enemy.wet=Math.max(enemy.wet,2.25);
    }
  }
  const active=game.activeCascade;
  if(!mist.charge||game.activeDragonArt?.id===mist.artId||game.cascadeReserve||
      (active ? active.kind!=='thunder'||active.thawThunder : game.time<game.nextCascadeAt&&
        (game.cascadeFollowed!==false||game.time-game.lastCascadeStartedAt<CLEAR_FOLLOW_SPACING)))return;
  if(game.time<(mist.nextScan??0))return;
  mist.nextScan=game.time+.12;
  const group=findThawThunderGroup(game,mist,active?.targets);
  if(!group)return;
  const {to,crest,targets}=group;
  const from=mist.charge;
  const arrival=.48;
  const receiverIds=targets.map(target=>target.id);
  const job={artId:mist.artId,art:mist.art,from,to,crest,targets,at:game.time+arrival};
  game.thawThunder=null;
  if(!active) {
    startCascade(game,'thunder',game.cultivation.cascadeRank,targets[0],undefined,new Set(mist.art.hitTargets),job);
  } else {
    active.thawThunder=job;
    active.duration=Math.max(active.duration,job.at-active.started+.20);
  }
  game.emit('dragonArtReaction',{...thawThunderEvent(mist),reaction:'thaw-thunder-release',from,to,points:[from,crest,to],
    radius:7.2,width:7.2,windup:.12,travel:.36,duration:arrival,receiverIds,
    targets:targets.map(target=>({...position(target),id:target.id})),cloudFrom:mist.center,contactId:from.id,source:from.source});
}

function settleThawThunder(game,cascade) {
  const relay=cascade.thawThunder;
  if(!relay||relay.done||game.time<relay.at)return;
  relay.done=true;
  const {art,targets,to,crest}=relay;
  let hit=false;
  for(const enemy of targets) {
    if(!living(enemy)||cascade.targets.has(enemy.id)||art.hitTargets.has(enemy.id)||art.iceFork.hits.has(enemy.id)||
        horizontal(enemy,to)>7.6||!nearHeight(enemy,to,4.4)||!clearFollowPassage(game,crest,enemy))continue;
    if(cascade.hits>=cascade.hitLimit)break;
    hit=true;
    cascade.infected.add(enemy.id);
    resolveHit(game,cascade,enemy,crest,0,cascade.power*(enemy.wet>0?1.22:1),'charge',THAW_THUNDER_HIT);
  }
  if(!hit)game.emit('dragonArtReaction',{...to,id:relay.artId,kind:'frost',stage:game.stage,reaction:'thaw-thunder-cancel'});
}

export function openCascadeFollowThrough(game, art) {
  const kind = game.cultivation.cascade;
  if (game.practice || game.drill || game.boss || game.stage < 2 || game.stage >= 4 ||
      art.rank < 2 || art.killCount < 8 || !art.lastBreak || game.cascadeReserve ||
      !Object.hasOwn(CASCADE_ROUTES, kind) || game.cultivation.cascadeRank < 2 ||
      game.time >= game.nextCascadeAt || game.cascadeFollowed !== false) return;
  game.cascadeAfterClear = {art,kind,from:art.lastBreak,at:game.time,ordinaryAt:game.nextCascadeAt};
}

function reserveAfterClear(game, kind, rank, enemy, source) {
  const earned = game.cascadeAfterClear;
  if (!earned || earned.kind !== kind || earned.art.stage !== game.stage || rank < 2 || game.boss ||
      game.cascadeFollowed !== false || game.time - game.lastCascadeStartedAt < CLEAR_FOLLOW_SPACING ||
      game.nextCascadeAt !== earned.ordinaryAt || game.time >= Math.min(earned.at+CLEAR_FOLLOW_WINDOW,earned.ordinaryAt-.42) ||
      source.startsWith('dragon-art-')) return;
  const reserve = {id:earned.art.id,kind,rank,stage:game.stage,art:earned.art,from:earned.from,
    at:game.time,scanAt:game.time+HANDOFF_SCAN,revision:0,afterClear:true,
    expiresAt:Math.min(earned.at+CLEAR_FOLLOW_WINDOW,earned.ordinaryAt),primerId:enemy.id,primer:position(enemy)};
  const result = selectHandoff(game, reserve, handoffPrey(game,reserve,false));
  if (!result) return;
  game.cascadeAfterClear = null;
  game.cascadeReserve = reserve;
  game.emit('cascadeReserve',{...reserve.from,id:reserve.id,kind,rank,art:reserve.art.kind,
    artId:reserve.art.id,stage:reserve.stage,expiresAt:reserve.expiresAt,afterClear:true,primerId:enemy.id});
  announceHandoff(game, reserve, result);
}

export function maybeStartCascade(game, enemy, source) {
  const kind = game.cultivation.cascade;
  if (game.practice || game.stage < 1 || game.stage >= 4 || game.status !== 'playing' ||
    game.activeCascade || game.cascadeReserve || source.startsWith('cascade-') ||
    !Object.hasOwn(CASCADE_ROUTES, kind)) return;
  const rule = CASCADE_ROUTES[kind];
  const prepared = rule.sources.includes(source) ||
    (rule.status && enemy[rule.status] > 0) || (kind === 'thunder' && enemy.wet > 0);
  if (!prepared) return;
  const rank = Math.min(3, Math.max(1, game.cultivation.cascadeRank ?? 1));
  if (game.time < (game.nextCascadeAt || 0)) {
    reserveAfterClear(game,kind,rank,enemy,source);
    return;
  }
  const nearby = game.enemiesNear(enemy,11).filter(target => living(target) && nearHeight(enemy, target) &&
    horizontal(enemy, target) < 11);
  if (nearby.length < 4) return;

  const art = game.activeDragonArt;
  if (canReserve(game, art, kind, rank, enemy)) {
    const from = position(enemy);
    game.cascadeReserve = {id:art.id,kind,rank,stage:game.stage,art,from,at:game.time,scanAt:game.time,revision:0};
    game.emit('cascadeReserve', {...from,id:art.id,kind,rank,art:art.kind,artId:art.id,stage:game.stage,expiresAt:game.time+HANDOFF_LIFE});
    trackHandoff(game,game.cascadeReserve,true);
    return;
  }
  startCascade(game, kind, rank, enemy);
}

function canReserve(game, art, kind, rank, enemy) {
  if (!art || game.stage < 2 || game.boss || game.drill || rank < 2 ||
      !art.hitTargets || art.hitTargets.has(enemy.id) || game.time-art.startedAt>.80) return false;
  // Wet crests, live thunder and sidewind can be the physical primer of an art.
  if (art.kind==='stone'&&kind==='water'||art.kind==='frost'&&(kind==='thunder'||kind==='water')||
      art.kind==='rift'&&kind==='wind'||art.kind==='abyss'&&kind==='wind') return false;
  const center = art.kind==='beam' ? game.p : art.center;
  if (!nearHeight(enemy,center,art.height+.5) || horizontal(center,enemy)>art.radius*.88) return false;
  if (art.kind!=='beam') return true;
  const ahead = heading(game.p,enemy,false);
  return ahead.x*art.direction.x+ahead.z*art.direction.z > .62;
}

function cancelHandoff(game, reserve, reason) {
  const aim=reserve.aim;
  if (!aim) return;
  reserve.previousAim=aim;
  reserve.aim=null;
  game.emit('cascadeHandoffCancel',{id:reserve.id,artId:reserve.art.id,kind:reserve.kind,stage:reserve.stage,
    revision:reserve.revision,from:reserve.from,to:aim.to,reason,afterClear:reserve.afterClear});
}

function handoffBearing(game, enemy) {
  const {p}=game;
  const dx=enemy.x-p.x, dz=enemy.z-p.z;
  const reach=Math.hypot(dx,dz);
  return {reach,along:dx*Math.sin(p.angle)+dz*Math.cos(p.angle)};
}

function handoffPrey(game, reserve, active) {
  const {art,from,kind}=reserve;
  const inner=art.center ?? from;
  const directional=kind==='wind'||kind==='water';
  return game.enemiesNear(game.p,27).filter(enemy=>{
    if (!living(enemy)||art.hitTargets.has(enemy.id)||art.echoTargets?.has(enemy.id)||art.captures?.has(enemy.id)||
        art.locked?.has(enemy.id)||horizontal(from,enemy)<=5.6||!nearHeight(enemy,game.p,6.0)) return false;
    if (active && (horizontal(inner,enemy)<art.radius*.89&&nearHeight(enemy,inner,art.height+.2) ||
        art.echoCenter&&horizontal(art.echoCenter,enemy)<(art.echoRadius??5)&&nearHeight(enemy,art.echoCenter,art.height))) return false;
    const {reach,along}=handoffBearing(game,enemy);
    if (reserve.afterClear && (Math.abs(enemy.y-from.y)>7.2 || horizontal(from,enemy)>25 || along<0 ||
        !nearHeight(enemy,reserve.primer,5.2) || horizontal(enemy,reserve.primer)>=13)) return false;
    return reach<27 && (directional ? along>=2.4 : along>=-reach*.46);
  });
}

function handoffGroup(center, prey) {
  return prey.filter(enemy=>nearHeight(enemy,center,3.6)&&horizontal(enemy,center)<HANDOFF_GROUP_RADIUS);
}

function handoffMinimum(active) {
  // While the original art is still in flight, three real bodies can anchor
  // the aim. The normal four-body discharge requirement still applies.
  return active ? 3 : 4;
}

function handoffTravel(from, to) {
  return Math.min(.42,Math.max(.20,horizontal(from,to)/42));
}

function clearFollowPassage(game, from, to) {
  if (game.stage !== 3 || !game.terrainHeight) return true;
  for (const t of [.2,.4,.6,.8]) {
    const height = game.terrainHeight(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t);
    if (height+.35 > from.y+(to.y-from.y)*t) return false;
  }
  return true;
}

function selectHandoff(game, reserve, prey) {
  const active=game.activeDragonArt?.id===reserve.art.id;
  let result;
  for (const enemy of prey) {
    const group=handoffGroup(enemy,prey);
    if(group.length<handoffMinimum(active)) continue;
    if(reserve.afterClear&&!clearFollowPassage(game,reserve.from,enemy))continue;
    const {reach,along}=handoffBearing(game,enemy);
    const fore=along/Math.max(1,reach);
    const score=group.length + .18*Number(enemy.cascadeShoal) - reach*.036 + fore*1.1;
    if (!result || score>result.score) result={enemy,group,score};
  }
  return result;
}

function announceHandoff(game, reserve, {enemy,group}) {
  group=group.toSorted((a,b)=>horizontal(a,enemy)-horizontal(b,enemy)||a.id-b.id).slice(0,10);
  const previous=reserve.previousAim;
  const to=position(enemy);
  const receiverIds=group.map(unit=>unit.id);
  const targets=group.map(unit=>({id:unit.id,...position(unit)}));
  const aimedAt=game.time;
  const expiresAt=reserve.expiresAt??reserve.at+HANDOFF_LIFE;
  reserve.aim={to,enemy,receiverIds,targets,aimedAt};
  reserve.revision++;
  game.emit('cascadeHandoffAim',{...to,id:reserve.id,artId:reserve.art.id,art:reserve.art.kind,kind:reserve.kind,
    rank:reserve.rank,stage:reserve.stage,from:reserve.from,to,receiverIds,targets,aimedAt,age:game.time-reserve.at,
    expiresAt,duration:expiresAt-game.time,travel:handoffTravel(reserve.from,to),
    retargeted:Boolean(previous),previousTo:previous?.to,revision:reserve.revision,
    afterClear:reserve.afterClear,primerId:reserve.primerId});
}

function trackHandoff(game, reserve, active) {
  const prey=handoffPrey(game,reserve,active);
  if (reserve.aim) {
    const {enemy,to,receiverIds}=reserve.aim;
    const anchor=prey.includes(enemy) && horizontal(to,enemy)<3.6 ? enemy : to;
    const sample=handoffGroup(anchor,prey);
    const same=sample.filter(unit=>receiverIds.includes(unit.id));
    const minimum=Math.min(3,Math.ceil(receiverIds.length*.5));
    const spread=sample.length>=3&&same.length>=minimum;
    if (spread) {
      if (!same.includes(enemy)) reserve.aim.enemy=same[0];
      delete reserve.aim.lostAt;
      return sample;
    }
    if (active && !reserve.aim.lostAt) {reserve.aim.lostAt=game.time;return;}
    if (active && game.time-reserve.aim.lostAt<.23) return;
    cancelHandoff(game,reserve,'group-lost');
  }
  const result=selectHandoff(game,reserve,prey);
  if(result)announceHandoff(game,reserve,result);
}

function releaseCascadeReserve(game, reserve) {
  if (game.stage!==reserve.stage || game.cultivation.cascade!==reserve.kind ||
      game.time>=(reserve.expiresAt??reserve.at+HANDOFF_LIFE) || reserve.afterClear&&game.boss) {
    cancelHandoff(game,reserve,'expired');
    game.cascadeReserve=null;
    return;
  }
  if (game.status!=='playing') return;
  const active=game.activeDragonArt?.id===reserve.art.id;
  if (game.time>=reserve.scanAt) {
    reserve.scanAt=game.time+HANDOFF_SCAN;
    trackHandoff(game,reserve,active);
  }
  if (active) return;
  reserve.after ??= game.time;
  if(game.time-reserve.after<HANDOFF_SETTLE||!reserve.aim||game.time-reserve.aim.aimedAt<HANDOFF_MIN_AIM) return;
  // The last check can cancel or explicitly replace a stale reservation before
  // spending anything. A newly announced replacement gets its own windup.
  const prior=reserve.aim;
  const cohort=trackHandoff(game,reserve,false);
  if (reserve.aim!==prior||!cohort||cohort.length<4) return;
  const {art,from,kind,rank}=reserve;
  const {enemy,aimedAt,to:aimTo}=reserve.aim;
  const to=position(enemy);
  if(reserve.afterClear&&!clearFollowPassage(game,from,to)){
    cancelHandoff(game,reserve,'blocked');
    return;
  }
  const targets=cohort.toSorted((a,b)=>horizontal(a,enemy)-horizontal(b,enemy)||a.id-b.id).slice(0,10)
    .map(unit=>({id:unit.id,...position(unit)}));
  const receiverIds=targets.map(unit=>unit.id);
  const length=horizontal(from,to);
  const direction={x:(to.x-from.x)/length,z:(to.z-from.z)/length};
  const travel=handoffTravel(from,to);
  const firstPulseAt=game.time+Math.max(handoffPulseDelay[kind],travel);
  game.cascadeReserve=null;
  startCascade(game,kind,rank,enemy,{from,to,aimTo,receiverIds,targets,direction,travel,firstPulseAt,
    aimId:reserve.id,revision:reserve.revision,aimedAt,art:art.kind,artId:art.id,heldFor:game.time-reserve.at,
    afterClear:reserve.afterClear,primerId:reserve.primerId},
    new Set([...art.hitTargets,...(art.echoTargets??[])]));
}

function startCascade(game, kind, rank, enemy, handoff, excluded, thawThunder) {
  const rule = CASCADE_ROUTES[kind];
  const equipped = new Set(game.cultivation.weapons.map(weapon => weapon.id));
  const support = game.cultivation.weapons.reduce((sum, weapon) =>
    sum + (rule.primary.includes(weapon.id) || rule.complement.includes(weapon.id) ? 1 + (weapon.tier - 1) * .45 : 0), 0);
  const strength = 1 + (rank - 1) * .25 + Math.min(.58, support * .105);
  const spread = 1 + (rank - 1) * .19 + Math.min(.13, support * .023);
  const center = handoff?.to ?? position(enemy);
  const doctrine = rank === 3 && game.stage >= 2 ? game.cultivation.cascadeDoctrine : null;
  const directional = kind === 'water' || kind === 'wind';
  const direction = handoff&&directional ? handoff.direction : heading(game.p, enemy, directional);
  const lead = (enemy.x - game.p.x) * direction.x + (enemy.z - game.p.z) * direction.z;
  const waterOrigin = handoff?.afterClear ? combine(center,direction,1.1 - 2.8*spread) :
    combine({...position(game.p),y:center.y},direction,Math.min(2,Math.max(-3.5,lead-5)));
  const origin = kind === 'water' ? waterOrigin : center;
  const cascade = {
    kind, rank, center, origin, direction, doctrine, stage: game.stage, id: game.nextId++,
    started: game.time, duration: rule.duration + (rank === 3 && (kind === 'poison' || kind === 'fire') ? .46 : 0),
    radius: rule.radius * spread * (kind==='water' && doctrine==='lane' ? 1.28 : 1), spread,
    power: game.stats().damage * rule.power * strength, hitLimit: (kind === 'poison' ? 88 : 56) + (rank - 1) * 12,
    targets: new Set(), infected: new Set(), hits: 0, kills: 0, clearedRadius: 0, pending: [], fallen: [],
    nextBreakAt:0, breakStartedAt:-Infinity, breakKills:0, thawThunder,
    alternate: new Set(rule.complement.filter(id => equipped.has(id))), handoff, excluded,
    shoal: enemy.cascadeShoalId, primer: Boolean(enemy.cascadeShoal),
  };
  if(kind==='thunder' && (doctrine==='rise'||doctrine==='fork'))cascade.bolts=new Set();
  if(doctrine==='host')cascade.carriers=[];
  game.activeCascade = cascade;
  game.cascadeAfterClear = null;
  game.cascadeFollowed = Boolean(handoff?.afterClear || thawThunder);
  game.lastCascadeStartedAt = game.time;
  game.nextCascadeAt = handoff?.afterClear || thawThunder ? Math.max(game.nextCascadeAt??0,game.time+CLEAR_FOLLOW_SPACING) :
    game.time + Math.max(6.2, rule.cooldown - .55 * (rank - 1));
  if (thawThunder) {
    // Use the ordinary cooldown while spending this cascade's one discharge at the flank.
    game.nextCascadeAt=Math.max(game.nextCascadeAt,game.time+Math.max(6.2,rule.cooldown-.55*(rank-1)));
  } else if (kind==='wind' && (doctrine==='gyre'||doctrine==='gale')) {
    cascade.windGather={center, carried:new Set()};
    const first=Math.max(.10,(handoff?.firstPulseAt??game.time)-game.time);
    schedule(cascade,{at:first,windPhase:'open',depth:0});
  } else if (kind === 'water' || kind === 'wind') {
    const times = kind === 'water' ? doctrine==='lane' ? [.27,.53,.81,1.10] : [.27,.63,1.01,1.37] : [.34,.69,1.02,1.36];
    const offset=handoff ? handoff.firstPulseAt-game.time-times[0] : 0;
    times.forEach((at, depth) => schedule(cascade, { at:at+offset, depth }));
  } else {
    schedule(cascade, { at: handoff ? handoff.firstPulseAt-game.time : handoffPulseDelay[kind], depth: 0, from: center });
    if(rank === 3 && (kind === 'poison' || kind === 'fire') && doctrine!=='host') schedule(cascade, {
      at: doctrine==='cinder' ? .58 : doctrine==='crown' ? .66 : doctrine==='basin' ? 1.03 : kind==='poison' ? 1.24 : .91,
      front: true, depth: doctrine ? 3 : 4,
    });
  }
  game.emit('cascadeStart', eventData(cascade));
}

function sampleTargets(game, cascade, origin, radius, test = () => true) {
  return game.enemiesNear(origin,radius).filter(enemy => living(enemy) &&
    !cascade.excluded?.has(enemy.id) &&
    nearHeight(enemy, origin, game.stage === 3 ? 5.2 : 3.6) &&
    horizontal(enemy, cascade.center) <= cascade.radius &&
    horizontal(enemy, origin) <= radius && test(enemy))
    .sort((a, b) => horizontal(a, origin) - horizontal(b, origin) || a.id - b.id);
}

function burningBursts(game, cascade, job) {
  const radius = (job.depth === 0 ? 7.5 : 5.3) * cascade.spread;
  const draft = cascade.alternate.has('coil') ? 1.05 + job.depth * .23 : 0;
  const center = combine(job.from, cascade.direction, draft);
  const targets = sampleTargets(game, cascade, center, radius).slice(0, job.depth === 0 ? 10 : 6);
  if (!targets.length && job.depth) return;
  pulse(game, cascade, { center, from: job.from, to: center, depth: job.depth, radius });
  for (const enemy of targets) {
    const volatile = cascade.alternate.has('mist') && enemy.poison > 0 ? 1.27 : 1;
    const killed = resolveHit(game, cascade, enemy, job.from, job.depth, cascade.power *
      volatile * (enemy.burn > 0 ? 1.15 : 1) * (1 - .095 * job.depth), 'burn');
    if (killed && !cascade.doctrine && job.depth < 3 && cascade.pending.length < 20) {
      schedule(cascade, { at: job.at + .27 + .012 * (enemy.id % 5), depth: job.depth + 1, from: position(enemy) });
    }
  }
}

function thunderBranches(game, cascade, job) {
  if (job.bolt) {
    landThunderBranch(game,cascade,job);
    return;
  }
  const water = cascade.alternate.size;
  const seedRadius = cascade.doctrine==='fork' ? 5.5 : 8.7;
  const radius = (job.depth === 0 ? seedRadius : 6.4 + water * .55) * cascade.spread;
  const targets = sampleTargets(game, cascade, job.from, radius, enemy => !cascade.infected.has(enemy.id) &&
    !cascade.bolts?.has(enemy.id) &&
    (job.depth === 0 || enemy.wet > 0 || enemy.charge > 0 ||
      (cascade.primer && enemy.cascadeShoal && (cascade.shoal == null || enemy.cascadeShoalId === cascade.shoal))))
    .slice(0, job.depth === 0 ? 7 + Number(water > 0) : 3 + Number(cascade.rank > 1));
  if (!targets.length && job.depth) return;
  pulse(game, cascade, { center: job.from, depth: job.depth, radius });
  const conductors = cascade.bolts ? new Set(targets.filter(enemy=>enemy.wet > 0 || enemy.charge > 0 ||
    cascade.primer && enemy.cascadeShoal)) : null;
  for (const enemy of targets) cascade.infected.add(enemy.id);
  for (const [index, enemy] of targets.entries()) {
    if (cascade.primer && enemy.cascadeShoal) enemy.wet = Math.max(enemy.wet, 2);
    resolveHit(game, cascade, enemy, job.from, job.depth,
      cascade.power * (enemy.wet > 0 ? 1.22 : 1) * (1 - .07 * job.depth), 'charge');
    // Each struck body conducts once, even if it survives the first flash.
    if (conductors?.has(enemy)) planThunderBranch(game,cascade,position(enemy),job.at,job.depth);
    const branch = cascade.bolts ? job.depth < 2 && index < 3 : job.depth < 5 && cascade.pending.length < 18;
    if (branch) schedule(cascade, {
      at: job.at + .15 + .015 * index, depth: job.depth + 1, from: position(enemy),
    });
  }
}

function thunderReach(cascade, from, enemy) {
  const rising = cascade.doctrine==='rise';
  const height = enemy.y-from.y;
  const range = rising ? 11.5 : 10.8;
  return horizontal(from,enemy) <= range && Math.hypot(horizontal(from,enemy),height) >= 3 &&
    (rising ? height >= 2.1 && height <= 8.4 : Math.abs(height) <= 2.35);
}

function planThunderBranch(game, cascade, from, at, depth) {
  if (depth >= 4 || cascade.bolts.size >= THUNDER_BRANCH_MAX || at + .27 >= cascade.duration) return;
  const rising = cascade.doctrine==='rise';
  const candidates = game.enemiesNear(from,12).filter(enemy => living(enemy) &&
    (enemy.wet > 0 || enemy.charge > 0) && !cascade.infected.has(enemy.id) &&
    !cascade.bolts.has(enemy.id) && !cascade.excluded?.has(enemy.id) &&
    horizontal(cascade.center,enemy) < cascade.radius && thunderReach(cascade,from,enemy) &&
    clearFollowPassage(game,from,enemy));
  const lateral = enemy => (enemy.x-from.x)*cascade.direction.z-(enemy.z-from.z)*cascade.direction.x;
  const ordered = candidates.sort((a,b) => {
    const reach = enemy=>horizontal(from,enemy);
    return rising ? (b.y-a.y)*.65 + (reach(a)-reach(b))*.20 || a.id-b.id :
      Math.abs(lateral(b))-Math.abs(lateral(a)) + (reach(a)-reach(b))*.25 || a.id-b.id;
  });
  const destinations = rising ? ordered.slice(0,1) : [-1,1].map(side=>ordered.find(enemy=>lateral(enemy)*side>=2.1)).filter(Boolean);
  for (const enemy of destinations) {
    if (cascade.bolts.size >= THUNDER_BRANCH_MAX) break;
    const to = position(enemy);
    const travelTime = rising ? .23 : .18;
    const detail = rising ? 'rise-bolt' : 'fork-bolt';
    const leg = cascade.bolts.size + 1;
    cascade.bolts.add(enemy.id);
    schedule(cascade,{at:at+travelTime,depth:depth+1,bolt:{from,to,enemy,detail,leg}});
    pulse(game,cascade,{center:to,radius:.8,width:rising?.92:.68,depth:depth+1,from,to,detail,travelTime,
      leg,preparing:true,receiverIds:[enemy.id]});
  }
}

function landThunderBranch(game,cascade,job) {
  const {from,to:planned,enemy,detail,leg}=job.bolt;
  const to=position(enemy);
  if (!living(enemy)||!(enemy.wet>0||enemy.charge>0)||
      horizontal(planned,to)>3||cascade.infected.has(enemy.id)||
      !thunderReach(cascade,from,enemy)||!clearFollowPassage(game,from,to)) return;
  cascade.infected.add(enemy.id);
  const rising=cascade.doctrine==='rise';
  pulse(game,cascade,{center:to,radius:.8,width:rising?1.15:.85,depth:job.depth,from,to,detail,leg,
    travelTime:0,preparing:false,receiverIds:[enemy.id]});
  resolveHit(game,cascade,enemy,from,job.depth,cascade.power*(rising?1.14:1.01)*(enemy.wet>0?1.22:1),
    'charge',detail,leg);
  planThunderBranch(game,cascade,to,job.at,job.depth);
}

function rollingPoison(game, cascade, job) {
  const drift = cascade.alternate.has('coil') ? .8 + job.depth * .42 : 0;
  const center = combine(job.from, cascade.direction, drift);
  const radius = (job.depth === 0 ? 7.8 : 6.3 + job.depth * .3) * cascade.spread;
  const targets = sampleTargets(game, cascade, center, radius, enemy => !cascade.infected.has(enemy.id))
    .slice(0, job.depth === 0 ? 12 : 8);
  if (!targets.length && job.depth) return;
  pulse(game, cascade, { center, from: job.from, to: center, depth: job.depth, radius });
  for (const [index, enemy] of targets.entries()) {
    const infectedBefore = enemy.poison > 0;
    cascade.infected.add(enemy.id);
    const sear = infectedBefore ? cascade.power * 1.36 : Math.min(cascade.power * .55, enemy.maxHp * .56);
    const killed = resolveHit(game, cascade, enemy, center, job.depth, sear, 'poison');
    if (!killed && cascade.doctrine==='host' && cascade.carriers.length<3) {
      const origin=position(enemy);
      const leg=cascade.carriers.length+1;
      const nextAt=game.time+.115;
      cascade.carriers.push({enemy,origin,last:origin,leg,plantedAt:game.time,nextAt});
      pulse(game,cascade,{center:origin,carrierId:enemy.id,detail:'host-knot',preparing:true,
        travelTime:.17,width:1.5,radius:1.5,leg,depth:1,receiverIds:[enemy.id]});
    } else if (!killed) schedule(cascade, { at: job.at + .36, depth: job.depth, from: center, follow: enemy });
    // The farthest exposed bodies open a new pocket along the cloud boundary.
    const washed = cascade.alternate.has('torrent') && enemy.wet > 0;
    if ((!cascade.doctrine || cascade.doctrine==='basin' && job.depth===0 && index<3) &&
        job.depth < 3 && (infectedBefore || washed || killed || index >= targets.length - 3) && cascade.pending.length < 32) {
      schedule(cascade, { at: job.at + .38 + .025 * (index % 3), depth: job.depth + 1, from: position(enemy) });
    }
  }
}

function newPocket(game,cascade,center,radius,height=3.15) {
  return game.enemiesNear(center,radius).filter(enemy=>living(enemy)&&!cascade.excluded?.has(enemy.id)&&
    !cascade.targets.has(enemy.id)&&nearHeight(center,enemy,height)&&horizontal(center,enemy)<radius);
}

function arcDirection(from,to,fallback) {
  const span=horizontal(from,to);
  return span>.01 ? {x:(to.x-from.x)/span,z:(to.z-from.z)/span} : fallback;
}

function resolveDoctrinalHit(game,cascade,enemy,center,job) {
  const fire=cascade.kind==='fire';
  const wet=fire&&enemy.wet>0;
  if(wet)enemy.wet=Math.max(0,enemy.wet-.85);
  resolveHit(game,cascade,enemy,center,job.depth,cascade.power*(fire?wet?.88:1.24:1.13),
    fire?'burn':'poison',job.detail,job.leg);
}

function launchDoctrinalFront(game,cascade,job) {
  if (cascade.doctrine==='crown') {
    if (cascade.fallen.length<2) return;
    const sources=cascade.fallen.slice(0,8).map(({x,y,z})=>({x,y,z}));
    const center=sources.reduce((p,q)=>({x:p.x+q.x/sources.length,y:p.y+q.y/sources.length,z:p.z+q.z/sources.length}),{x:0,y:0,z:0});
    let innerRadius=0;
    for(const [index,radius] of [5.3,9.2,13.2].entries()) {
      const ring={...job,front:false,crown:true,at:job.at+.15+.24*index,center,sources,
        radius,innerRadius:Math.max(0,innerRadius-.62),leg:index+1,detail:'crown-ring'};
      schedule(cascade,ring);
      const audience=newPocket(game,cascade,center,radius).filter(enemy=>horizontal(enemy,center)>=ring.innerRadius);
      pulse(game,cascade,{...ring,from:center,to:center,preparing:true,travelTime:.15+.24*index,
        receiverIds:audience.slice(0,16).map(enemy=>enemy.id)});
      innerRadius=radius;
    }
    return;
  }
  const poison=cascade.doctrine==='basin';
  if (cascade.fallen.length<(poison?2:1)) return;
  const candidates=newPocket(game,cascade,cascade.center,cascade.radius+6,6.5).slice(0,96);
  const launchers=(job.sources ? cascade.fallen.slice(job.fallenBefore) : cascade.fallen).slice(0,18);
  let best;
  for(const anchor of candidates) {
    const to=position(anchor);
    const radius=poison?6.9:5.3;
    const nearby=newPocket(game,cascade,to,radius,3.4);
    if(nearby.length<2)continue;
    const routes=launchers.filter(from=>horizontal(from,to)>3.3&&horizontal(from,to)<(poison?17:19)&&
      nearHeight(from,to,game.stage===3?6.5:3.2)&&clearFollowPassage(game,from,to))
      .toSorted((a,b)=>horizontal(a,to)-horizontal(b,to));
    const from=routes[0];
    if(!from)continue;
    const other=poison?routes.find(route=>horizontal(route,from)>3.1):null;
    if(poison&&!other)continue;
    const score=nearby.length*2+horizontal(cascade.center,to)*.13+Number(anchor.burn>0||anchor.poison>0)*.4;
    if(!best||score>best.score)best={from,to,score,nearby,radius,sources:other?[from,other]:[from]};
  }
  if(!best)return;
  const {from,to: center,nearby,radius,sources}=best;
  const travelTime=poison?.48:.33;
  const leg=(cascade.frontSteps??0)+1;
  cascade.frontSteps=leg;
  const release={center,from,to:center,radius,sources,leg,detail:poison?'basin-flow':'cinder-path',depth:job.depth,
    direction:arcDirection(from,center,cascade.direction)};
  pulse(game,cascade,{...release,travelTime,preparing:true,receiverIds:nearby.slice(0,14).map(enemy=>enemy.id)});
  schedule(cascade,{...release,at:job.at+travelTime,doctrinal:true});
}

function settleDoctrinalFront(game,cascade,job) {
  const {center,radius,from,sources,innerRadius}=job;
  const targets=newPocket(game,cascade,center,radius).filter(enemy=>job.crown ? horizontal(enemy,center)>=innerRadius :
    sources.every(source=>clearFollowPassage(game,source,enemy)));
  const chosen=targets.toSorted((a,b)=>horizontal(a,center)-horizontal(b,center)||a.id-b.id).slice(0,job.crown?16:14);
  pulse(game,cascade,{...job,from:from??center,to:center,preparing:false,receiverIds:chosen.map(enemy=>enemy.id)});
  const fallenBefore=cascade.fallen.length;
  for(const enemy of chosen)resolveDoctrinalHit(game,cascade,enemy,center,job);
  if(job.detail==='cinder-path'&&cascade.frontSteps<2&&cascade.fallen.length>fallenBefore&&job.at+.50<cascade.duration) {
    schedule(cascade,{...job,fallenBefore,doctrinal:false,front:true,at:job.at+.16,depth:job.depth+1});
  }
}

function updatePoisonCarriers(game,cascade) {
  for(const carrier of cascade.carriers) {
    if(carrier.released||game.time<carrier.nextAt&&living(carrier.enemy))continue;
    const {enemy,origin,last,leg,plantedAt}=carrier;
    if(horizontal(enemy,cascade.center)>cascade.radius+10){carrier.released=true;continue;}
    const center=position(enemy);
    const elapsed=game.time-plantedAt;
    const radius=5.5+cascade.spread;
    const moved=horizontal(center,origin);
    const other=newPocket(game,cascade,center,radius).filter(unit=>unit!==enemy&&
      horizontal(unit,origin)>4.6&&clearFollowPassage(game,center,unit))
      .toSorted((a,b)=>horizontal(a,center)-horizontal(b,center)||a.id-b.id).slice(0,11);
    const detail='host-knot';
    if(!living(enemy)||moved>=1.45&&elapsed>=.36&&other.length>=2||elapsed>=1.55) {
      carrier.released=true;
      pulse(game,cascade,{center,from:origin,to:center,detail,carrierId:enemy.id,depth:2,radius,leg,
        direction:arcDirection(origin,center,cascade.direction),preparing:false,receiverIds:other.map(unit=>unit.id)});
      for(const unit of other)resolveDoctrinalHit(game,cascade,unit,center,{detail,leg,depth:2});
      if(living(enemy))resolveHit(game,cascade,enemy,center,2,cascade.power*.92,'poison',detail,leg);
    } else {
      pulse(game,cascade,{center,from:last,to:center,detail,radius:1.5,width:1.5,travelTime:.14,
        carrierId:enemy.id,depth:1,leg,preparing:true,receiverIds:[enemy.id]});
      carrier.last=center;
      carrier.nextAt=game.time+.115;
    }
  }
}

function launchFront(game, cascade, job) {
  if (cascade.fallen.length < 2) return;
  const poison = cascade.kind === 'poison';
  const wind = cascade.alternate.has('coil');
  const climb = game.stage === 3 ? (poison ? 8.4 : 6.3) : 3.6;
  const launchers = cascade.fallen.slice()
    .sort((a,b) => horizontal(b,cascade.center) - horizontal(a,cascade.center)).slice(0, 18);
  const candidates = game.enemiesNear(cascade.center,cascade.radius+(wind?7:4.5)).filter(enemy => living(enemy) && !cascade.excluded?.has(enemy.id) && !cascade.targets.has(enemy.id) &&
    horizontal(cascade.center, enemy) >= 9.5 && horizontal(cascade.center, enemy) < cascade.radius + (wind ? 7 : 4.5));
  const candidateSet = new Set(candidates);
  const nearby = [];
  const pockets = [];
  for (const enemy of candidates) {
    // Separating elevation as well as position gives the front a route into
    // high and low flocks even if they overlap on the overhead map.
    const from = launchers.find(point => nearHeight(point, enemy, climb) &&
      horizontal(point, enemy) < (wind ? 17.5 : 15) && horizontal(point, enemy) > 3.1);
    if (!from) continue;
    let members = 0;
    for (const near of game.enemiesNear(enemy,4,nearby)) {
      if (candidateSet.has(near) && nearHeight(near, enemy, 2.65) && horizontal(near, enemy) < 4) members++;
    }
    if(members < 2) continue;
    const score = members + horizontal(cascade.center, enemy) * .28 + Math.abs(from.y - enemy.y) * .6;
    pockets.push({enemy, from, score});
  }
  pockets.sort((a,b) => b.score - a.score || a.enemy.id - b.enemy.id);
  const selected = [];
  for(const {enemy, from} of pockets) {
    if(selected.some(point => nearHeight(point, enemy, 3.5) && horizontal(point, enemy) < 7.8)) continue;
    selected.push(enemy);
    const to = position(enemy);
    const distance = horizontal(from, to);
    const direction = {x:(to.x - from.x)/distance,z:(to.z - from.z)/distance};
    const detail = poison ? 'feeder' : 'firefront';
    const radius = (poison ? 5.6 : 4.8) * (wind ? 1.16 : 1);
    const travelTime = (poison ? .37 : .22) + (selected.length-1)*.11;
    pulse(game, cascade, {center:to, depth:job.depth, radius, width:radius*1.22, from, to, direction, detail, travelTime});
    schedule(cascade, {at:job.at + travelTime, pocket:to, from,
      radius, depth:job.depth + 1});
    if(selected.length >= (poison ? 2 : 1)) break;
  }
}

function settleFront(game,cascade,job) {
  const poison = cascade.kind === 'poison';
  const targets = game.enemiesNear(job.pocket,job.radius).filter(enemy => living(enemy) && !cascade.excluded?.has(enemy.id) && !cascade.targets.has(enemy.id) &&
    nearHeight(job.pocket, enemy, 3) && horizontal(job.pocket, enemy) < job.radius)
    .sort((a,b) => horizontal(a,job.pocket) - horizontal(b,job.pocket) || a.id - b.id).slice(0, 12);
  for(const enemy of targets) {
    const killed = resolveHit(game,cascade,enemy,job.pocket,job.depth,cascade.power * (poison ? .82 : 1.16),poison?'poison':'burn');
    if(!killed && poison) schedule(cascade, {at:job.at + .27, depth:job.depth, from:job.pocket, follow:enemy});
  }
}

function crestTargets(game,cascade,mid,direction,width,thickness) {
  return sampleTargets(game,cascade,mid,Math.hypot(width,thickness),enemy=>{
    if(cascade.infected.has(enemy.id)||cascade.doctrine==='fan'&&cascade.targets.has(enemy.id))return false;
    const dx=enemy.x-mid.x,dz=enemy.z-mid.z;
    return Math.abs(dx*direction.x+dz*direction.z)<=thickness &&
      Math.abs(-dx*direction.z+dz*direction.x)<=width;
  });
}

function fanWaterFront(game,cascade,job,carrierFrom) {
  const base = Math.atan2(cascade.direction.x,cascade.direction.z);
  for(const side of [-1,1]) {
    const yaw=base+side*.77;
    const direction={x:Math.sin(yaw),z:Math.cos(yaw)};
    const center=combine(carrierFrom,direction,7.2*cascade.spread);
    const width=4.45*cascade.spread;
    const radius=2.8*cascade.spread;
    const from=combine(center,direction,0,-width),to=combine(center,direction,0,width);
    const travelTime=WATER_FAN_TRAVEL+(side>0?.065:0);
    const geometry={center,depth:job.depth+1,radius,width,from,to,direction,detail:'fan-crest',carrierFrom,leg:side};
    pulse(game,cascade,{...geometry,preparing:true,travelTime,
      receiverIds:crestTargets(game,cascade,center,direction,width,radius).map(enemy=>enemy.id)});
    schedule(cascade,{at:job.at+travelTime,depth:job.depth+1,fan:geometry});
  }
}

function landWaterFan(game,cascade,job) {
  const {center,direction,width,radius,carrierFrom,detail,leg}=job.fan;
  const targets=crestTargets(game,cascade,center,direction,width,radius)
    .filter(enemy=>clearFollowPassage(game,carrierFrom,enemy)).slice(0,16);
  pulse(game,cascade,{...job.fan,preparing:false,travelTime:0,receiverIds:targets.map(enemy=>enemy.id)});
  for(const enemy of targets) {
    resolveHit(game,cascade,enemy,center,job.depth,cascade.power*1.13,'wet',detail,leg);
  }
}

function sweep(game, cascade, job) {
  const { kind, spread, origin, center, power, infected } = cascade;
  const water = kind === 'water';
  const lane = water && cascade.doctrine==='lane';
  const fan = water && cascade.doctrine==='fan';
  if (job.fan) {
    landWaterFan(game,cascade,job);
    return;
  }
  if (fan && cascade.fanReleased) return;
  const yaw = Math.atan2(cascade.direction.x, cascade.direction.z) + (water ? 0 : (job.depth - 1.45) * .32);
  const direction = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const surge = Math.min(cascade.kills, 12) * .16;
  const pierce = cascade.alternate.has('needle') ? 1.1 : 0;
  const along = water ? (2.8 + ((lane?5.05:3.6) + pierce) * job.depth + surge) * spread
    : ((job.depth - 1.1) * 4.1 + surge * .7) * spread;
  const mid = combine(origin, direction, along);
  const tail = cascade.alternate.has('tail') ? 1.35 : 0;
  const width = ((water ? 8.0 + job.depth * 1.0 + tail : 7.1 + job.depth * .90) + surge) * spread * (lane?.58:fan?.78:1);
  const thickness = (water ? (lane?2.85:2.15) + .22 * job.depth : 5.6) * spread;
  const from = combine(mid, direction, 0, -width);
  const to = combine(mid, direction, 0, width);
  const targets = crestTargets(game,cascade,mid,direction,width,thickness);
  const crest = water ? targets.slice(0, 11 + cascade.rank * 3 + job.depth * 3) : targets;
  const detail=lane?'lane-crest':undefined;
  const pivot=fan&&!cascade.fanReleased&&job.depth<2 ? crest.find(enemy=>enemy.wet>0) : null;
  pulse(game, cascade, {center:mid,depth:job.depth,radius:thickness,width,from,to,direction,detail,
    receiverIds:lane?crest.map(enemy=>enemy.id):undefined});
  for (const enemy of crest) {
    if (!water && canDisplaceEnemy(enemy,game.time)) {
      const before = position(enemy);
      const x = direction.x * (job.depth ? .9 : .36), z = direction.z * (job.depth ? .9 : .36);
      enemy.x += x; enemy.z += z;
      game.stayInWater(enemy, .4, before);
    }
    if (!water && cascade.alternate.has('torrent')) enemy.wet = Math.max(enemy.wet, 3.5);
    if (!water && cascade.alternate.has('venom')) enemy.poison = Math.max(enemy.poison, 3.5);
    const killed = resolveHit(game, cascade, enemy, water ? mid : center, job.depth,
      power * (water ? 1 + .13 * job.depth : 1 + .18 * job.depth), water ? 'wet' : null,detail);
    if (killed) infected.add(enemy.id);
  }
  if (pivot) {
    cascade.fanReleased=true;
    fanWaterFront(game,cascade,job,position(pivot));
  }
}

function windPrey(game,cascade,center,radius) {
  return newPocket(game,cascade,center,radius,game.stage===3?5.0:3.2);
}

function windGather(game,cascade,dt) {
  const gather=cascade.windGather;
  if (!gather.started||game.time>=gather.ends) return;
  const run=cascade.galeLeg;
  const phase=Math.min(1,(game.time-gather.started)/(gather.ends-gather.started));
  const {from,to}=run??{};
  const focus=run ? {x:from.x+(to.x-from.x)*phase,y:from.y+(to.y-from.y)*phase,z:from.z+(to.z-from.z)*phase} : gather.center;
  const radius=run?run.width:gather.radius;
  const seeded = run&&cascade.stage>=2&&!cascade.sporeRelay ?
    new Map(game.techniqueArts.filter(art=>art.kind==='sporeseed').map(art=>[art.host.id,art])) : null;
  let pulled=0;
  // Only real movable bodies can be carried. Charged divers and solid terrain keep their own behavior.
  for(const enemy of windPrey(game,cascade,focus,radius).slice(0,56)) {
    if(!canDisplaceEnemy(enemy,game.time)||!clearFollowPassage(game,enemy,focus))continue;
    const dx=focus.x-enemy.x,dz=focus.z-enemy.z;
    const span=Math.hypot(dx,dz);
    if(span<.45)continue;
    const wet=cascade.alternate.has('torrent')&&enemy.wet>0;
    const gain=Math.min(.28,dt*(run?16.8:13.0)*(wet?1.26:1))/span;
    const curl=run?.17:.64*(1-phase);
    const before=position(enemy);
    enemy.x+=(dx-dz*curl)*gain;
    enemy.z+=(dz+dx*curl)*gain;
    game.stayInWater(enemy,.4,before);
    const moved=horizontal(enemy,before);
    if(moved>.012) {
      gather.carried.add(enemy.id);
      const seed=seeded?.get(enemy.id);
      if(seed)rememberGaleSeed(game,cascade,run,seed,before,moved);
      if(run&&game.cultivation.dragonArt==='rift'&&game.cultivation.dragonArtRank>=2){
        const receipt=game.galeTransport??={cascadeId:cascade.id,leg:run.number,moves:new Map(),run};
        let move=receipt.moves.get(enemy.id);
        if(!move&&receipt.moves.size<56){
          move={enemy,from:before,travel:0};
          receipt.moves.set(enemy.id,move);
        }
        if(move){move.travel+=moved;move.to=position(enemy);}
        receipt.at=game.time;
      }
      pulled++;
    }
  }
  if(pulled>=2) cascade.windFocus=focus;
}

function rememberGaleSeed(game,cascade,run,seed,before,moved) {
  let receipt=seed.galeCarry;
  const actual=position(seed.host);
  if(receipt?.cascade!==cascade) {
    receipt=seed.galeCarry={cascade,from:before,travel:0,path:[before],nextAt:game.time,pulledAt:game.time};
  }
  receipt.travel+=moved;
  receipt.pulledAt=game.time;
  receipt.direction=run.direction;
  if(game.time>=receipt.nextAt&&receipt.path.length<8){
    receipt.path.push(actual);
    receipt.nextAt=game.time+.050;
  }
  if(receipt.travel>=.19&&game.time>=(receipt.hintAt??0)) {
    receipt.hintAt=game.time+.045;
    game.emit('cascadePulse',{...eventData(cascade),...actual,detail:'gale-spore-carry',preparing:true,
      from:receipt.from,to:actual,carrierFrom:receipt.from,duration:.30,travelTime:.30,leg:3,seedId:seed.id,
      hostId:seed.host.id,hostPath:[...receipt.path,actual],radius:seed.host.radius});
  }
}

function galeSporePassage(game,from,to) {
  const length=horizontal(from,to);
  const samples=Math.max(2,Math.ceil(length/1.30));
  const path=[from];
  for(let i=1;i<=samples;i++){
    const t=i/samples;
    const planned={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t+.40*Math.sin(Math.PI*t),
      z:from.z+(to.z-from.z)*t};
    const checked={...planned};
    game.stayInWater(checked,.30,path.at(-1));
    if(horizontal(checked,planned)>.27||Math.abs(checked.y-planned.y)>.52)return null;
    path.push(planned);
  }
  return path;
}

function galeSporeTarget(cascade,enemy,seed) {
  return living(enemy)&&enemy.id!==seed.host.id&&!cascade.targets.has(enemy.id)&&!cascade.excluded?.has(enemy.id)&&
    !cascade.windGather.carried.has(enemy.id)&&!cascade.galeLeg?.receivers.has(enemy.id);
}

function galeSporeRoutes(game,seed,from,receipt,first) {
  const {cascade,direction}=receipt;
  const side=point=>(point.x-from.x)*direction.z-(point.z-from.z)*direction.x;
  const candidates=game.enemiesNear(from,23).filter(enemy=>galeSporeTarget(cascade,enemy,seed)&&
    horizontal(from,enemy)>seed.radius+2.3&&horizontal(from,enemy)<=21&&nearHeight(from,enemy,6)&&
    (first ? side(enemy)*-first.sign>=3.6&&!first.ids.has(enemy.id)&&horizontal(first.to,enemy)>=7.2 :
      Math.abs(side(enemy))>=3.6)).sort((a,b)=>horizontal(from,a)-horizontal(from,b)||a.id-b.id).slice(0,42);
  const routes=[];
  for(const sign of [-1,1]) {
    if(first?.sign===sign)continue;
    const wing=candidates.filter(enemy=>side(enemy)*sign>=3.6);
    let best;
    for(const anchor of wing) {
      const to=position(anchor);
      const targets=wing.filter(enemy=>horizontal(to,enemy)<=5.15&&nearHeight(to,enemy,3.5)&&
        clearFollowPassage(game,to,enemy)).slice(0,10);
      if(targets.length<3)continue;
      const score=targets.length-.055*horizontal(from,to);
      if(best&&score<=best.score)continue;
      const points=galeSporePassage(game,from,to);
      if(points)best={to,targets,points,score,sign};
    }
    if(best)routes.push(best);
  }
  return routes.sort((a,b)=>b.score-a.score).slice(0,seed.tier>=2?2:1);
}

function launchGaleSpore(game,cascade,source,route,leg,travel,delayed=false) {
  const {seed,zoneId,from,receipt}=source;
  const {to,points,targets}=route;
  const spore={seed,zoneId,leg,from,to,points,targets};
  if(leg===4)cascade.sporeSplit=true;
  game.emit('cascadePulse',{...eventData(cascade),...to,detail:GALE_SPORE_FRONT,preparing:true,from,to,points,
    carrierFrom:receipt.from,hostId:seed.host.id,hostPath:[...receipt.path,from],seedId:seed.id,zoneId,
    radius:5.15,width:5.15,duration:travel,travelTime:travel,leg,delayed,receiverIds:targets.map(enemy=>enemy.id),
    targets:targets.map(enemy=>({...position(enemy),id:enemy.id,radius:enemy.radius}))});
  return spore;
}

function galeSporeHoldEvent(game,hold,preparing) {
  const {cascade,seed,from,zoneId}=hold;
  game.emit('cascadePulse',{...eventData(cascade),...from,detail:'gale-spore-hold',preparing,from,to:from,
    hostId:seed.host.id,seedId:seed.id,zoneId,leg:4,radius:2.4,duration:preparing?GALE_SPORE_HOLD:0});
}

export function sendGaleSpore(game,seed,zone) {
  const receipt=seed.galeCarry;
  if(!receipt||receipt.cascade.sporeRelay||game.activeCascade!==receipt.cascade||game.stage<2||
      game.stage!==receipt.cascade.stage||game.boss||game.time-receipt.pulledAt>.34||receipt.travel<.95||
      horizontal(seed.host,receipt.from)<.70)return;
  const {cascade}=receipt;
  const from=position(seed.host);
  const routes=galeSporeRoutes(game,seed,from,receipt);
  if(!routes.length)return;
  const source={seed,zoneId:zone.id,from,receipt,cascade};
  cascade.sporeRelay=true;
  const arrived=game.time-cascade.started+GALE_SPORE_TRAVEL;
  cascade.duration=Math.max(cascade.duration,arrived+.18+(routes.length>1?.10:0));
  for(const [index,route] of routes.entries()) {
    const spore=launchGaleSpore(game,cascade,source,route,index+3,GALE_SPORE_TRAVEL+index*.10);
    schedule(cascade,{at:arrived+index*.10,spore});
  }
  if(seed.tier>=2&&routes.length===1&&!game.galeSporeHold){
    const {sign,to,targets}=routes[0];
    game.galeSporeHold={...source,first:{sign,to,ids:new Set(targets.map(enemy=>enemy.id))},
      expiresAt:game.time+GALE_SPORE_HOLD,firstImpactAt:game.time+GALE_SPORE_TRAVEL,nextAt:game.time+.10};
    galeSporeHoldEvent(game,game.galeSporeHold,true);
  }
}

function updateGaleSporeHold(game) {
  const hold=game.galeSporeHold;
  if(!hold)return;
  const {cascade,seed,from,receipt}=hold;
  if(game.stage!==cascade.stage||game.boss||game.cultivation.cascade!=='wind'||game.cultivation.cascadeDoctrine!=='gale'||
      cascade.hits>=cascade.hitLimit||
      (!hold.spore&&game.time>=hold.expiresAt)) {
    game.galeSporeHold=null;
    galeSporeHoldEvent(game,hold,false);
    return;
  }
  if(hold.spore) {
    if(game.time<hold.impactAt)return;
    game.galeSporeHold=null;
    settleGaleSpore(game,cascade,hold);
    return;
  }
  if(game.time<hold.nextAt)return;
  hold.nextAt=game.time+.10;
  const [route]=galeSporeRoutes(game,seed,from,receipt,hold.first);
  if(!route)return;
  const travel=Math.max(GALE_SPORE_TRAVEL,hold.firstImpactAt+.18-game.time);
  hold.impactAt=game.time+travel;
  if(game.activeCascade===cascade) {
    const at=hold.impactAt-cascade.started;
    cascade.duration=Math.max(cascade.duration,at+.18);
    schedule(cascade,{at,spore:launchGaleSpore(game,cascade,hold,route,4,travel,true)});
    game.galeSporeHold=null;
  } else hold.spore=launchGaleSpore(game,cascade,hold,route,4,travel,true);
}

function settleGaleSpore(game,cascade,job) {
  const {seed,zoneId,leg,from,to,points,targets}=job.spore;
  const hits=[];
  for(const enemy of targets) {
    if(!galeSporeTarget(cascade,enemy,seed)||horizontal(enemy,to)>5.65||!nearHeight(enemy,to,3.9)||
        !galeSporePassage(game,points.at(-2),enemy)||cascade.hits>=cascade.hitLimit)continue;
    const contact={...position(enemy),id:enemy.id,radius:enemy.radius};
    const killed=resolveHit(game,cascade,enemy,points.at(-2),2,cascade.power*(.96+(seed.tier-1)*.095),
      'poison',GALE_SPORE_HIT,leg,{sporeSplit:Boolean(cascade.sporeSplit)});
    hits.push({...contact,killed});
  }
  game.emit('cascadePulse',{...eventData(cascade),...to,detail:GALE_SPORE_FRONT,preparing:false,from,to,points,
    hostId:seed.host.id,seedId:seed.id,zoneId,leg,duration:.48,radius:5.15,width:5.15,targets:hits,
    receiverIds:hits.map(hit=>hit.id),burstKills:hits.filter(hit=>hit.killed).length,cancelled:!hits.length});
}

function galeCandidate(game,cascade,from,previous) {
  const radius=previous?15.8:19.5;
  const width=previous?5.9:6.5;
  const forward=previous?.direction??cascade.direction;
  let best;
  for(const anchor of windPrey(game,cascade,from,radius).slice(0,80)) {
    const to=position(anchor), distance=horizontal(from,to);
    const direction=arcDirection(from,to,forward);
    const dot=direction.x*forward.x+direction.z*forward.z;
    if(distance<(previous?6.1:5.4)||dot<(previous?.number ? .1 : -.62)||!clearFollowPassage(game,from,to))continue;
    const receivers=windPrey(game,cascade,to,width).filter(enemy=>clearFollowPassage(game,from,enemy));
    if(receivers.length<(previous?3:2))continue;
    const score=receivers.length*1.15+distance*.29+dot*.64;
    if(!best||score>best.score)best={to,receivers,direction,score};
  }
  return best&&{...best,width};
}

function startGale(game,cascade,job,from,previous=null) {
  const group=galeCandidate(game,cascade,from,previous);
  if(previous&&!group)return;
  const to=group?.to??from;
  const width=group?.width??5.8;
  const direction=group?.direction??cascade.direction;
  const travel=previous?.number ? .34 : .42;
  const number=previous?2:1;
  const receivers=group?.receivers.slice(0,25).map(enemy=>enemy.id)??[];
  const leg={from,to,width,direction,number,receivers:new Set(receivers)};
  const gather=cascade.windGather;
  Object.assign(gather,{started:game.time,ends:game.time+travel});
  gather.carried.clear();
  cascade.windFocus=null;
  cascade.galeLeg=leg;
  if(game.galeTransport?.cascadeId!==cascade.id||game.galeTransport?.leg!==number)game.galeTransport=null;
  pulse(game,cascade,{center:to,from,to,radius:width,width,direction,detail:'gale-run',
    travelTime:travel,preparing:true,receiverIds:receivers,leg:number,depth:job.depth});
  schedule(cascade,{at:job.at+travel,windPhase:'gale-hit',depth:job.depth,leg});
}

function resolveWindHit(game,cascade,enemy,from,job,detail,leg) {
  if(cascade.alternate.has('torrent'))enemy.wet=Math.max(enemy.wet,3.5);
  if(cascade.alternate.has('venom'))enemy.poison=Math.max(enemy.poison,3.5);
  resolveHit(game,cascade,enemy,from,job.depth,cascade.power*(detail==='gyre-burst'?1.28:1.11),null,detail,leg);
}

function windDoctrine(game,cascade,job) {
  const gather=cascade.windGather;
  const {center}=gather;
  if(job.windPhase==='open') {
    if(cascade.doctrine==='gale') {
      startGale(game,cascade,job,center);
      return;
    }
    const radius=12.8*cascade.spread;
    Object.assign(gather,{started:game.time,ends:game.time+WIND_GATHER_TIME,radius});
    pulse(game,cascade,{center,radius,width:radius,detail:'gyre-core',preparing:true,travelTime:WIND_GATHER_TIME,
      depth:0,receiverIds:windPrey(game,cascade,center,radius).slice(0,35).map(enemy=>enemy.id)});
    schedule(cascade,{at:job.at+WIND_GATHER_TIME,windPhase:'gyre-tighten',depth:1});
    return;
  }
  if(job.windPhase==='gyre-tighten') {
    pulse(game,cascade,{center,radius:gather.radius,detail:'gyre-core',preparing:false,travelTime:WIND_LOCK_TIME,
      depth:1,receiverIds:[...gather.carried]});
    schedule(cascade,{at:job.at+WIND_LOCK_TIME,windPhase:'gyre-hit',depth:2});
    return;
  }
  if(job.windPhase==='gyre-hit') {
    const radius=8.9*cascade.spread;
    const targets=windPrey(game,cascade,center,radius)
      .filter(enemy=>clearFollowPassage(game,center,enemy))
      .toSorted((a,b)=>horizontal(center,a)-horizontal(center,b)||a.id-b.id).slice(0,34);
    pulse(game,cascade,{center,radius,detail:'gyre-burst',preparing:false,depth:job.depth,receiverIds:targets.map(enemy=>enemy.id)});
    for(const enemy of targets)resolveWindHit(game,cascade,enemy,center,job,'gyre-burst');
    return;
  }
  if(job.windPhase==='gale-next') {
    startGale(game,cascade,job,job.leg.to,job.leg);
    return;
  }
  const {from,to,width,direction,number}=job.leg;
  const span=horizontal(from,to);
  const along=enemy=>(enemy.x-from.x)*direction.x+(enemy.z-from.z)*direction.z;
  const targets=windPrey(game,cascade,from,span+width+3).filter(enemy=>{
    const travel=along(enemy);
    return travel>=-2.5&&travel<=span+3.4&&
      Math.abs((enemy.x-from.x)*direction.z-(enemy.z-from.z)*direction.x)<=width&&
      clearFollowPassage(game,from,enemy)&&(gather.carried.has(enemy.id)||horizontal(enemy,to)<=width+1.8);
  }).toSorted((a,b)=>horizontal(a,to)-horizontal(b,to)||a.id-b.id).slice(0,25);
  if(game.galeTransport?.cascadeId===cascade.id&&game.galeTransport.leg===number) {
    game.galeTransport.finished=true;
    for(const enemy of targets)job.leg.receivers.add(enemy.id);
  }
  pulse(game,cascade,{center:to,from,to,radius:width,width,direction,detail:'gale-run',preparing:false,
    receiverIds:targets.map(enemy=>enemy.id),leg:number,depth:job.depth});
  if(targets.length>=2)cascade.windFocus=to;
  for(const enemy of targets)resolveWindHit(game,cascade,enemy,from,job,'gale-run',number);
  if(number===1&&targets.length>=2)schedule(cascade,{at:job.at+.15,windPhase:'gale-next',depth:job.depth+1,leg:job.leg});
}

export function updateCascade(game, dt) {
  const follow = game.cascadeAfterClear;
  if(follow&&(game.boss||game.cultivation.cascade!==follow.kind||
      game.time>=Math.min(follow.at+CLEAR_FOLLOW_WINDOW,follow.ordinaryAt)))game.cascadeAfterClear=null;
  if (!game.activeCascade && game.cascadeReserve) releaseCascadeReserve(game,game.cascadeReserve);
  updateThawThunder(game);
  const cascade = game.activeCascade;
  if (!cascade) {
    updateGaleSporeHold(game);
    return;
  }
  if (game.stage !== cascade.stage || game.status !== 'playing') return;
  settleThawThunder(game,cascade);

  const age = game.time - cascade.started;
  if (cascade.windGather) windGather(game,cascade,dt);
  else if (cascade.kind === 'wind' && age < .62) {
    for (const enemy of sampleTargets(game, cascade, cascade.center, 12.8 * cascade.spread,
      target => canDisplaceEnemy(target,game.time))) {
      const distance = horizontal(enemy, cascade.center);
      if (distance < 1.25) continue;
      const before = position(enemy);
      const current = cascade.alternate.has('torrent') && enemy.wet > 0 ? 1.3 : 1;
      const pull = Math.min(.20, dt * (9.5 + cascade.rank) * current) / distance;
      enemy.x += (cascade.center.x - enemy.x) * pull;
      enemy.z += (cascade.center.z - enemy.z) * pull;
      game.stayInWater(enemy, .4, before);
    }
  }

  // Sorting only the pending ring, rather than the enemies, preserves a
  // deterministic beat when the frame spans more than one scheduled pulse.
  while (cascade.pending.length && cascade.hits < cascade.hitLimit) {
    cascade.pending.sort((a, b) => a.at - b.at);
    if (cascade.pending[0].at > age) break;
    const job = cascade.pending.shift();
    if (job.spore) settleGaleSpore(game,cascade,job);
    else if (job.windPhase) windDoctrine(game,cascade,job);
    else if (job.follow) {
      resolveHit(game, cascade, job.follow, job.from, job.depth, cascade.power * .88, 'poison');
    } else if (job.front) {
      if (cascade.doctrine) launchDoctrinalFront(game,cascade,job);
      else launchFront(game,cascade,job);
    } else if(job.doctrinal||job.crown)settleDoctrinalFront(game,cascade,job);
    else if (job.pocket) settleFront(game, cascade, job);
    else if (cascade.kind === 'fire') burningBursts(game, cascade, job);
    else if (cascade.kind === 'thunder') thunderBranches(game, cascade, job);
    else if (cascade.kind === 'poison') rollingPoison(game, cascade, job);
    else sweep(game, cascade, job);
  }
  if(cascade.carriers)updatePoisonCarriers(game,cascade);
  updateGaleSporeHold(game);

  if (age < cascade.duration) return;
  game.activeCascade = null;
  game.emit('cascadeEnd', { ...eventData(cascade), radius: Math.max(2.5, cascade.clearedRadius) });
}
