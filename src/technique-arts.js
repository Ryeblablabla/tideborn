import { knockBackEnemy } from './encounters.js';
import { sendGaleSpore } from './cascades.js';
import { flightBand } from './rules.js';

const point = ({x, y, z}) => ({x, y, z});
const span = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const planar = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDifference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export const isTechniqueArt = kind => kind === 'frostLine' || kind === 'fault' || kind === 'wisps' ||
  kind === 'spore' || kind === 'weir' || kind === 'kiteDraft' || kind === 'prism';

export function techniqueSlowFactor(enemy, time) {
  return enemy.boss || !(enemy.frostSlowUntil > time) ? 1 : enemy.frostSlowFactor;
}

function candidates(game, origin, reach) {
  return game.enemiesNear(origin, reach + 3).filter(enemy =>
    enemy.hp > 0 && span(enemy, origin) <= reach + Math.min(.7, enemy.radius));
}

function bestTarget(targets, value) {
  let best = null;
  let bestValue = Infinity;
  for (const enemy of targets) {
    const score = value(enemy);
    if (score >= bestValue) continue;
    best = enemy;
    bestValue = score;
  }
  return best;
}

function steam(game, enemy, radius, name) {
  const vapor = game.addZone('steam', {...point(enemy), radius, life: 2.65, power: 1});
  if (!vapor || vapor.age > .09 || vapor.techniqueNoted) return;
  vapor.techniqueNoted = true;
  game.metrics.reactions++;
  game.metrics.steam++;
  game.emit('reaction', {name, ...point(enemy)});
}

function announce(game, art) {
  const {kind, id, weapon, tier, from, to, center, radius, delay, duration, startsAt,
    orbitRadius, points, bursts, height, carrier, pickupAt, launch, anchorId} = art;
  game.emit('techniqueArtStart', {
    kind, id, weapon, tier, ...center, from, to, center, radius, delay, duration, startsAt,
    orbitRadius, points, bursts, height, carrier, pickupAt, launch, anchorId,
  });
}

function impact(game, art, enemy, from, to, detail = {}) {
  const {kind, id, weapon, tier, radius, delay, duration} = art;
  game.emit('techniqueArtImpact', {kind, id, weapon, tier, ...to, from, to, radius,
    delay, duration, targetId: enemy?.id, ...detail});
}

function baseArt(game, origin, target, technique, duration) {
  const center = point(target);
  const from = point(origin);
  return {id: game.nextId++, kind: technique.id, weapon: technique.id, tier: technique.tier,
    stage: game.stage, from, to: center, center, radius: technique.radius,
    delay: technique.delay ?? 0, duration, startsAt: game.time, expiryAt: game.time + duration,
    damage: game.stats().damage * technique.power};
}

function applyFrost(game, art, enemy, from, duration, wet, order) {
  const hot = enemy.burn > 0;
  if (hot) {
    enemy.burn = 0;
    steam(game, enemy, 2, '霜火相激 · 蒸汽成云');
  } else if (!enemy.boss) {
    const amount = wet ? .06 : .64;
    const until = game.time + duration * (wet ? 1 : .68);
    if (!(enemy.frostSlowUntil > game.time) || amount <= enemy.frostSlowFactor) {
      enemy.frostSlowFactor = amount;
      enemy.frostSlowUntil = Math.max(enemy.frostSlowUntil ?? 0, until);
    }
  }
  const to = point(enemy);
  game.damage(enemy, art.damage * (wet ? 1.08 : .85) * Math.max(.45, 1 - .105 * order), art.kind, from);
  impact(game, art, enemy, from, to, {wet, hot, order, killed: enemy.hp <= 0});
}

function castFrost(game, origin, technique) {
  const first = bestTarget(candidates(game, origin, technique.range), enemy =>
    span(enemy, origin) + (enemy.wet > 0 ? -technique.range : 0));
  if (!first) return false;
  const art = baseArt(game, origin, first, technique, .55);
  const route = [first];
  let relay = first;
  while (relay.wet > 0 && relay.burn <= 0 && route.length < technique.chain) {
    const next = bestTarget(candidates(game, relay, technique.radius), enemy =>
      enemy.wet > 0 && !route.includes(enemy) ? span(enemy, relay) : Infinity);
    if (!next) break;
    route.push(next);
    relay = next;
  }
  art.points = route.map(point);
  announce(game, art);
  let from = art.from;
  for (const [index, enemy] of route.entries()) {
    if (game.stage !== art.stage || game.status !== 'playing') break;
    applyFrost(game, art, enemy, from, technique.life, enemy.wet > 0, index);
    from = point(enemy);
  }
  return true;
}

function groundAt(game, position) {
  if (game.stage === 3) return game.terrainHeight?.(position.x, position.z) ?? Math.max(.15, position.y - 4.5);
  return Math.max(.05, game.shoreHeight?.(position.x, position.z) ?? .05);
}

function chooseFaultSites(game, origin, targets, technique) {
  const selected = [];
  const nearest = targets.sort((left, right) => span(left, origin) - span(right, origin)).slice(0, 16);
  const reach = technique.radius * 1.2;
  for (let i = 0; i < technique.columns; i++) {
    const anchor = bestTarget(nearest, candidate => {
      if (selected.some(site => planar(site, candidate) < technique.radius * 1.6)) return Infinity;
      const cover = game.enemiesNear(candidate, reach).reduce((count, enemy) => count +
        Number(enemy.hp > 0 && planar(candidate, enemy) < reach && Math.abs(enemy.y - candidate.y) < technique.height), 0);
      return span(origin, candidate) * .035 - cover - Number(candidate.boss && candidate.bossPlan?.phase === 'recovery');
    });
    if (!anchor) break;
    const x = anchor.x + Math.sin(anchor.angle) * Math.min(2.1, anchor.speed * technique.delay * .65);
    const z = anchor.z + Math.cos(anchor.angle) * Math.min(2.1, anchor.speed * technique.delay * .65);
    const site = {x, z, y: anchor.y};
    site.y = Math.max(groundAt(game, site), anchor.y - technique.height * .74);
    selected.push(site);
  }
  return selected;
}

function castFault(game, origin, technique) {
  const targets = candidates(game, origin, technique.range);
  if (!targets.length) return false;
  const sites = chooseFaultSites(game, origin, targets, technique);
  if (!sites.length) return false;
  const art = baseArt(game, origin, sites[0], technique, technique.delay + .7 + (sites.length - 1) * .19);
  art.points = sites;
  art.height = technique.height;
  art.bursts = sites.length;
  art.next = 0;
  art.struck = new Set();
  game.techniqueArts.push(art);
  announce(game, art);
  return true;
}

function updateFault(game, art, age) {
  while (art.next < art.points.length && age >= art.delay + art.next * .19) {
    const order = art.next++;
    const site = art.points[order];
    impact(game, art, null, site, site, {order, height: art.height});
    for (const enemy of game.enemiesNear(site, art.radius + 3)) {
      if (game.stage !== art.stage || game.status !== 'playing') return;
      if (enemy.hp <= 0 || art.struck.has(enemy.id) || planar(enemy, site) > art.radius + enemy.radius * .5 ||
          enemy.y < site.y - .38 || enemy.y > site.y + art.height + enemy.radius * .4) continue;
      art.struck.add(enemy.id);
      if (enemy.boss && enemy.shield && planar(site, enemy) < art.radius * .58) {
        // The crest hits the underside. The normal boss pass still applies
        // damage and clears shield behavior through its own clock.
        enemy.brokenArmorUntil = Math.max(enemy.brokenArmorUntil ?? 0, game.time + .68);
      }
      const to = point(enemy);
      game.damage(enemy, art.damage, art.kind, site);
      impact(game, art, enemy, site, to, {order, height: art.height, killed: enemy.hp <= 0});
    }
  }
}

function castWisps(game, origin, technique) {
  const first = bestTarget(candidates(game, origin, technique.range), enemy => span(enemy, origin));
  if (!first) return false;
  const art = baseArt(game, origin, first, technique, technique.delay + (technique.burst - 1) * .22 + .73);
  Object.assign(art, {next: 0, orbitRadius: technique.orbit, bursts: technique.burst, range: technique.range,
    yaw: Math.atan2(first.x - origin.x, first.z - origin.z), chosen: new Set(), flights: []});
  game.techniqueArts.push(art);
  announce(game, art);
  return true;
}

function hitWisp(game, art, {order, origin, target, targetId}) {
  for (const enemy of game.enemiesNear(target, art.radius + 3)) {
    if (game.stage !== art.stage || game.status !== 'playing') return;
    if (enemy.hp <= 0 || span(enemy, target) > art.radius + enemy.radius * .38) continue;
    const wet = enemy.wet > 0;
    if (wet) {
      enemy.wet = Math.max(0, enemy.wet - .85);
      steam(game, enemy, 1.8, '双烬过雨 · 蒸汽成云');
    }
    enemy.burn = Math.max(enemy.burn, wet ? 1.75 : 3.0);
    const to = point(enemy);
    game.damage(enemy, art.damage * (enemy.id === targetId ? 1 : .68), art.kind, origin);
    impact(game, art, enemy, origin, to, {order, wet, killed: enemy.hp <= 0});
  }
}

function updateWisps(game, art, age) {
  while (art.next < art.bursts && age >= art.delay + art.next * .22) {
    const order = art.next++;
    const yaw = art.yaw + (order === 0 ? -.88 : order === 1 ? 1.01 : Math.PI);
    const origin = {x: game.p.x + Math.sin(yaw) * art.orbitRadius, y: game.p.y + .62,
      z: game.p.z + Math.cos(yaw) * art.orbitRadius};
    const aim = bestTarget(candidates(game, origin, art.range), enemy => {
      const angle = Math.atan2(enemy.x - game.p.x, enemy.z - game.p.z);
      return span(enemy, origin) + angleDifference(angle, yaw) * 2.6 +
        (art.chosen.has(enemy.id) ? art.range * 1.6 : 0);
    });
    if (!aim) continue;
    const target = point(aim);
    const travel = .23;
    art.chosen.add(aim.id);
    art.flights.push({order, origin, target, targetId: aim.id, at: age + travel});
    impact(game, art, aim, origin, target, {order, launch: true, travel});
  }
  while (art.flights.length && age >= art.flights[0].at) {
    const flight = art.flights.shift();
    hitWisp(game, art, flight);
  }
}

function castSpore(game, origin, technique) {
  const reserved = new Set(game.techniqueArts.filter(art => art.kind === 'sporeseed').map(art => art.host.id));
  const targets = candidates(game, origin, technique.range).filter(enemy => !enemy.boss && !reserved.has(enemy.id));
  const hosts = [];
  for (let i = 0; i < technique.hosts; i++) {
    const host = bestTarget(targets, enemy => {
      if (hosts.some(selected => span(selected, enemy) < Math.max(4.1, technique.radius * 1.22))) return Infinity;
      return span(origin, enemy) - Math.min(3, enemy.speed) * 1.16 + (enemy.poison > 0 ? 1.4 : 0);
    });
    if (!host) break;
    const art = baseArt(game, origin, host, technique, technique.delay + .13);
    art.host = host;
    art.life = technique.life;
    art.power = technique.power;
    art.path = [point(host)];
    art.nextSample = game.time + .11;
    game.techniqueArts.push(art);
    hosts.push(host);
    announce(game, art);
  }
  return hosts.length > 0;
}

function updateSpore(game, art, age) {
  const host = art.host;
  const landing = point(host);
  if (age >= art.delay || host.hp <= 0) {
    const zone = game.addZone('poison', {...landing, radius: art.radius, life: art.life,
      power: art.tier, damageFactor: art.power, weapon: art.weapon, weaponAnchor: art.weapon});
    if (zone) {
      const to = point(zone);
      game.emit('techniqueArtBloom', {kind:art.kind, id:art.id, ...to, center:to,
        from:art.center, to, hostId:host.id, moved:span(art.center,landing),
        delayed:age >= art.delay, zoneId:zone.id, radius:zone.radius, duration:zone.life});
      sendGaleSpore(game,art,zone);
    }
    return true;
  }
  if (game.time >= art.nextSample && span(art.path.at(-1), landing) > .15) {
    art.path.push(landing);
    if (art.path.length > 9) art.path.shift();
    art.nextSample = game.time + .11;
  }
  return false;
}

const weirInputs = new Set(['storm','rain','steam','cloud']);
const weirReach = (center, target, direction) => (target.x-center.x)*direction.x + (target.z-center.z)*direction.z;
const acrossWeir = (center, target, direction) => (target.x-center.x)*direction.z - (target.z-center.z)*direction.x;
const alongWater = (origin,direction,meters) => ({x:origin.x+direction.x*meters,y:origin.y,z:origin.z+direction.z*meters});
const normal = (x,z) => {const length=Math.hypot(x,z)||1;return {x:x/length,z:z/length};};

function clearWeirPoint(game, site) {
  return game.stage === 3 ? !game.terrainHeight || game.terrainHeight(site.x,site.z) < site.y-.28
    : !game.onLand(site.x,site.z,.22);
}

function prepareWeirs(game, origin, technique) {
  const targets = candidates(game,origin,technique.range).sort((a,b)=>span(a,origin)-span(b,origin)).slice(0,22);
  const valid = targets.flatMap(enemy => {
    const toward = normal(origin.x-enemy.x,origin.z-enemy.z);
    if (toward.x===0 && toward.z===0) return [];
    const crossing = enemy.crossing?.until > game.time ? enemy.crossing.angle : null;
    const direction = crossing===null ? toward : {x:Math.sin(crossing),z:Math.cos(crossing)};
    const lead = Math.min(1.55,Math.max(.58,enemy.speed*.68));
    const center = alongWater(enemy,direction,lead);
    return clearWeirPoint(game,center) ? [{enemy,direction,center}] : [];
  });
  const sites=[];
  const placed=game.techniqueArts.filter(art=>art.kind==='bankweir');
  const clearance=Math.max(5,technique.radius*2);
  for(let i=0;i<technique.gates;i++) {
    const site=bestTarget(valid,({enemy,direction,center})=>{
      if (sites.some(prior=>span(prior.center,center)<clearance) ||
          placed.some(prior=>span(prior.center,center)<clearance)) return Infinity;
      let company=0;
      for(const neighbor of game.enemiesNear(enemy,technique.radius+2)) {
        if(neighbor===enemy||neighbor.hp<=0||Math.abs(neighbor.y-enemy.y)>1.65)continue;
        const projection=weirReach(center,neighbor,direction);
        if(projection<2.8&&projection>-4.4&&Math.abs(acrossWeir(center,neighbor,direction))<technique.radius) company++;
      }
      return span(origin,enemy)*.44-Math.min(7,company)*.56-Math.min(3,enemy.speed)*.45+Number(enemy.boss)*.85;
    });
    if(!site)break;
    sites.push(site);
  }
  return sites;
}

function castWeir(game, origin, technique) {
  const sites=prepareWeirs(game,origin,technique);
  for(const {center,direction} of sites) {
    const art=baseArt(game,origin,center,technique,technique.life);
    const cross={x:direction.z,z:-direction.x};
    Object.assign(art,{direction,flowLength:technique.flowLength,previous:new Map(),
      points:[alongWater(center,cross,-art.radius),alongWater(center,cross,art.radius)]});
    game.techniqueArts.push(art);
    announce(game,art);
  }
  return sites.length>0;
}

function tripWeir(game, art, age) {
  const {center,direction,radius,delay}=art;
  const present=new Map();
  for(const enemy of game.enemiesNear(center,radius+2)) {
    if(enemy.hp<=0||Math.abs(enemy.y-center.y)>1.5+enemy.radius*.33) continue;
    const side=acrossWeir(center,enemy,direction);
    if(Math.abs(side)>radius+enemy.radius*.4)continue;
    const along=weirReach(center,enemy,direction);
    const before=art.previous.get(enemy.id);
    if(age>=delay&&before!==undefined&&along*before<=0&&Math.abs(along-before)>.009) {
      const forward=Math.sign(along-before);
      return {trigger:'crossing',targetId:enemy.id,direction:{x:direction.x*forward,z:direction.z*forward},
        contact:alongWater(center,{x:direction.z,z:-direction.x},side*.65)};
    }
    present.set(enemy.id,along);
  }
  art.previous=present;
  if(age<delay+.13)return null;
  for(const zone of game.zones) {
    if(zone.life<=0||zone.weaponAnchor==='bankweir'||!weirInputs.has(zone.kind)||Math.abs(zone.y-center.y)>2.3)continue;
    const ahead=weirReach(center,zone,direction);
    const side=acrossWeir(center,zone,direction);
    if(Math.hypot(ahead,Math.max(0,Math.abs(side)-radius))>zone.radius+.25)continue;
    const sign=ahead>.45?-1:1;
    const outer=Math.max(-.55,Math.min(.55,-side/(zone.radius+2)));
    return {trigger:zone.kind,contact:center,
      direction:normal(direction.x*sign+direction.z*outer,direction.z*sign-direction.x*outer)};
  }
  return null;
}

function releaseWeir(game, art, {trigger,targetId,direction,contact}) {
  const path=[{...contact,along:0}];
  const step=art.flowLength/5;
  for(let interval=1;interval<=5;interval++) {
    const prior=path.at(-1);
    const to=alongWater(prior,direction,step);
    if(!clearWeirPoint(game,to)) {
      // On a slanted shore keep the free component and continue along the bank.
      const options=[{...to,x:prior.x},{...to,z:prior.z}].filter(site=>clearWeirPoint(game,site)&&planar(site,prior)>.45);
      if(!options.length)break;
      options.sort((a,b)=>planar(b,prior)-planar(a,prior));
      Object.assign(to,options[0]);
      direction=normal(to.x-prior.x,to.z-prior.z);
    }
    path.push({...to,along:prior.along+planar(prior,to)});
  }
  const end=path.at(-1);
  if(end.along<.75)return false;
  art.flow={path, from:0, at:game.time, duration:.54+.016*end.along,
    hits:new Set(), nextRain:1, radius:art.radius*.68};
  art.expiryAt=game.time+art.flow.duration+.12;
  game.emit('techniqueArtRelease',{kind:art.kind,id:art.id, ...path[0], center:point(path[0]),
    from:point(path[0]),to:point(end),points:path.map(point),radius:art.flow.radius,
    duration:art.flow.duration,trigger,targetId});
  return true;
}

function sampleWeirPath({path}, distance) {
  const index=path.findIndex((site,index)=>index>0&&site.along>=distance);
  const [a,b]=index<0?path.slice(-2):path.slice(index-1,index+1);
  const axis=normal(b.x-a.x,b.z-a.z);
  return alongWater(a,axis,Math.min(b.along,distance)-a.along);
}

function updateWeir(game, art, age) {
  if(!art.flow) {
    const trip=tripWeir(game,art,age);
    return trip ? !releaseWeir(game,art,trip) : false;
  }
  const flow=art.flow;
  const length=flow.path.at(-1).along;
  const front=length*Math.min(1,(game.time-flow.at)/flow.duration);
  const last=sampleWeirPath(flow,flow.from);
  const current=sampleWeirPath(flow,front);
  const direction=normal(current.x-last.x,current.z-last.z);
  const band=planar(current,last);
  const spanRadius=flow.radius;
  const limit=16+art.tier*3;
  for(const enemy of game.enemiesNear(current,spanRadius+band+1)) {
    if(flow.hits.size>=limit)break;
    if(game.stage!==art.stage||game.status!=='playing')return true;
    if(enemy.hp<=0||flow.hits.has(enemy.id)||Math.abs(enemy.y-current.y)>1.65+enemy.radius*.24)continue;
    const ahead=weirReach(last,enemy,direction);
    if(ahead<-enemy.radius*.56||ahead>band+enemy.radius*.56||Math.abs(acrossWeir(last,enemy,direction))>spanRadius+enemy.radius*.43) continue;
    flow.hits.add(enemy.id);
    enemy.wet=Math.max(enemy.wet,4.2);
    knockBackEnemy(game,enemy,alongWater(enemy,direction,-1),'tail',art.tier);
    const to=point(enemy);
    game.damage(enemy,art.damage*(1-.27*front/length),'water',last);
    impact(game,art,enemy,last,to,{wet:true,killed:enemy.hp<=0});
  }
  if(front>=flow.nextRain && game.stage===art.stage) {
    const trail=sampleWeirPath(flow,flow.nextRain);
    game.addZone('rain',{...trail,radius:Math.max(1.1,Math.min(2,spanRadius*.83)),
      life:2.6,power:1,weaponAnchor:'bankweir'});
    flow.nextRain+=Math.max(2.8,length*.31);
  }
  flow.from=front;
  return front>=length;
}

const looseFields=new Set(['poison','steam','cloud','fire']);
const wetKiteFields=new Set(['rain','steam','cloud']);
const climbPath=([a,b,c,d],t)=>{
  const u=1-t;
  const c0=u*u*u,c1=3*u*u*t,c2=3*u*t*t,c3=t*t*t;
  return {x:a.x*c0+b.x*c1+c.x*c2+d.x*c3,
    y:a.y*c0+b.y*c1+c.y*c2+d.y*c3,z:a.z*c0+b.z*c1+c.z*c2+d.z*c3};
};

function kiteRoute(game,from,to,loaded) {
  const length=planar(from,to);
  const direction=normal(to.x-from.x,to.z-from.z);
  const side=Math.min(3.35,length*.32)*(loaded?1:.63);
  const rise=(loaded?1.9:1.35)+Math.min(2.3,length*.12)+Math.max(0,to.y-from.y)*.35;
  const shoulder=side*(Math.cos(game.p.angle)*direction.z+Math.sin(game.p.angle)*direction.x<0?-1:1);
  const bend=(fraction,lift,lateral)=>({x:from.x+(to.x-from.x)*fraction+direction.z*lateral,
    y:from.y+(to.y-from.y)*fraction+lift,z:from.z+(to.z-from.z)*fraction-direction.x*lateral});
  return [from,bend(.30,rise,shoulder),bend(.67,rise*.85,shoulder*.55),to];
}

function clearKiteRoute(game,route) {
  const ground=game.stage===3?game.terrainHeight:game.shoreHeight;
  return !ground||[.15,.32,.50,.70,.86].every(t=>{
    const sample=climbPath(route,t);
    return ground(sample.x,sample.z)+.23<=sample.y;
  });
}

function kiteFlightTime(from,to) {
  return .37+Math.min(.55,span(from,to)*.028);
}

function kitePickupTime(origin,field) {
  return Math.min(.30,.10+span(origin,field)*.018);
}

function findKiteField(game, origin, technique) {
  const busy=new Set(game.techniqueArts.filter(art=>art.sourceField).map(art=>art.sourceField.id));
  const fields=game.zones.filter(zone=>zone.life>=1.32&&looseFields.has(zone.kind)&&zone.weaponAnchor!=='windkite'&&
    !busy.has(zone.id)&&span(zone,origin)<=technique.range+zone.radius*.32)
    .sort((a,b)=>span(a,origin)-span(b,origin)).slice(0,4);
  for(const field of fields){
    const radius=technique.radius+.8;
    const pickupAt=kitePickupTime(origin,field);
    const targets=candidates(game,field,technique.gustRange).filter(enemy=>!enemy.boss&&
      planar(field,enemy)>Math.max(4.8,field.radius+radius)&&Math.abs(enemy.y-field.y)<=technique.climb&&
      field.life>=pickupAt+kiteFlightTime(field,enemy)+.88)
      .sort((a,b)=>span(field,a)-span(field,b)).slice(0,16);
    const selected=bestTarget(targets,enemy=>{
      if(!clearKiteRoute(game,kiteRoute(game,field,enemy,true)))return Infinity;
      const company=game.enemiesNear(enemy,radius+1).filter(other=>other.hp>0&&other!==enemy&&span(other,enemy)<radius+1).length;
      const served=game.zones.some(zone=>zone.life>.6&&zone.kind===field.kind&&span(zone,enemy)<zone.radius*.77);
      const inherited=field.kind==='poison'?enemy.poison>0:field.kind==='fire'?enemy.burn>0:enemy.wet>0;
      return span(field,enemy)*.14-Math.min(5,company)*1.6+Number(served)*6+Number(inherited)*1.6;
    });
    if(selected)return {field,selected};
  }
  return null;
}

function castKite(game, origin, technique) {
  const choice=findKiteField(game,origin,technique);
  const target=choice?.selected??bestTarget(candidates(game,origin,technique.range*.82), enemy=>
    clearKiteRoute(game,kiteRoute(game,origin,enemy,false))?span(origin,enemy):Infinity);
  if(!target)return false;
  const source=choice?.field;
  const from=point(source??origin),to=point(target);
  const points=kiteRoute(game,from,to,Boolean(source));
  const pickupAt=source?kitePickupTime(origin,source):0;
  const flight=kiteFlightTime(from,to);
  const duration=pickupAt+flight;
  const art=baseArt(game,origin,target,technique,duration+.10);
  Object.assign(art,{sourceField:source,carrier:source?.kind,points,pickupAt,flight,
    from,launch:point(origin),life:technique.life,gustRange:technique.gustRange,climb:technique.climb,hit:new Set()});
  game.techniqueArts.push(art);
  announce(game,art);
  return true;
}

function moistKiteLanding(game,landed,radius) {
  return game.zones.some(zone=>zone.life>0&&wetKiteFields.has(zone.kind)&&span(zone,landed)<zone.radius+radius*.65) ||
    game.enemiesNear(landed,radius+1).some(enemy=>enemy.hp>0&&enemy.wet>0&&span(enemy,landed)<radius+enemy.radius);
}

const kiteRainName = 'kite-downpour';
const rainSources = new Set(['steam','cloud']);

function kiteRainReceivers(game, site, radius) {
  return game.enemiesNear(site,radius+1.6).filter(enemy=>enemy.hp>0&&!enemy.boss&&
    Math.abs(enemy.y-site.y)<=Math.max(1.9, radius*.82)&&planar(enemy,site)<radius+enemy.radius*.45);
}

function prepareKiteRain(game,art,deposit) {
  if (art.tier<2||!deposit||!rainSources.has(deposit.kind)||deposit.life<.56) return;
  const from=point(deposit);
  const radius=Math.min(4.4,art.radius*(art.tier>=3?1.24:1.14));
  const ground=game.stage===3?game.terrainHeight:game.shoreHeight;
  const incoming=normal(from.x-art.from.x,from.z-art.from.z);
  const minimum=Math.max(2.8,deposit.radius+.65);
  const range=Math.min(14,art.gustRange*.75);
  const options=candidates(game,from,range).filter(enemy=>!enemy.boss&&planar(enemy,from)>minimum&&
    Math.abs(enemy.y-from.y)<Math.max(3.5,art.climb));
  options.sort((a,b)=>span(a,from)-span(b,from)||a.id-b.id);
  let best=null;
  for(const target of options.slice(0,18)) {
    const to=point(target);
    const direction=normal(to.x-from.x,to.z-from.z);
    const forward=incoming.x*direction.x+incoming.z*direction.z;
    if(forward<-.28)continue;
    const spanDistance=planar(to,from);
    const altitude=Math.max(from.y,to.y)+2.25+Math.min(1.8,spanDistance*.18);
    const via={x:to.x-direction.x*.82,y:altitude,z:to.z-direction.z*.82};
    if(ground&&[.24,.52,.81].some(t=>ground(from.x+(via.x-from.x)*t,from.z+(via.z-from.z)*t)+.23>
        from.y+(via.y-from.y)*t+Math.sin(t*Math.PI)*1.15))continue;
    const group=kiteRainReceivers(game,to,radius);
    const newTargets=group.filter(enemy=>span(enemy,deposit)>deposit.radius+enemy.radius*.35);
    if(!newTargets.length)continue;
    const fresh=newTargets.filter(enemy=>enemy.wet<=0).length;
    const existing=game.zones.some(zone=>zone.life>.4&&zone.kind==='rain'&&span(zone,to)<zone.radius*.68);
    const score=Math.min(newTargets.length,6)*1.25+Math.min(fresh,4)*.55+
      Math.min(2,Math.max(0,from.y-to.y))*.26+forward*.85-spanDistance*.12-Number(existing)*1.45;
    if(!best||score>best.score)best={to,via,score,receiverIds:newTargets.slice(0,12).map(enemy=>enemy.id)};
  }
  if(!best)return;
  const {via,to,receiverIds}=best;
  const spent=Math.min(.82,deposit.life*.60);
  const windup=.22;
  const duration=.56+Math.min(.28,planar(from,to)*.031);
  deposit.life-=spent;
  art.expiryAt=game.time+duration+.1;
  art.downpour={sourcePoint:from,via,to,sourceId:deposit.id,carrier:deposit.kind,spent,radius,
    receiverIds,windup,duration,at:game.time+duration};
  game.emit('techniqueArtRelease',{kind:art.kind,id:art.id,stage:game.stage,secondary:kiteRainName,...from,
    from,to,via,sourcePoint:from,points:[from,via,to],radius,carrier:deposit.kind,sourceId:deposit.id,
    spent,receiverIds,windup,duration});
}

function landKiteRain(game,art) {
  const {sourcePoint,via,to,sourceId,carrier,spent,radius,duration}=art.downpour;
  if(game.time<art.downpour.at)return false;
  const zone=game.addZone('rain',{...to,radius,power:1,life:.65+spent*1.55,weapon:art.weapon,
    weaponAnchor:kiteRainName,carriedFrom:sourceId});
  if(!zone)return true;
  const targets=kiteRainReceivers(game,to,radius).sort((a,b)=>span(a,to)-span(b,to)||a.id-b.id).slice(0,12);
  const detail={secondary:kiteRainName,stage:game.stage,sourcePoint,via,sourceId,carrier,spent,radius,
    destinationId:zone.id,duration};
  game.metrics.reactions++;
  game.emit('reaction',{name:'鸢雨回落',...to});
  game.emit('techniqueArtBloom',{kind:art.kind,id:art.id,...to,...detail,from:via,to,center:to,
    receiverIds:targets.map(enemy=>enemy.id)});
  for(const enemy of targets) {
    if(game.stage!==art.stage||game.status!=='playing')break;
    const before=enemy.hp;
    const burning=enemy.burn>0;
    enemy.burn=0;
    enemy.wet=Math.max(enemy.wet,4.5);
    const falloff=1-.25*Math.min(1,planar(enemy,to)/radius);
    game.damage(enemy,art.damage*(burning?.82:.66)*falloff,'windkite',via);
    impact(game,art,enemy,via,point(enemy),{...detail,wet:true,burning,amount:before-Math.max(0,enemy.hp),killed:enemy.hp<=0});
  }
  return true;
}

function settleKite(game,art) {
  const source=art.sourceField;
  let received=null,spent=0;
  if(source?.life>=.84&&game.zones.includes(source)&&looseFields.has(source.kind)){
    const landed=art.to;
    const radius=Math.min(art.radius*1.24,source.radius*.82+.27);
    const converted=source.kind==='fire'&&moistKiteLanding(game,landed,radius);
    const result=converted?'steam':source.kind;
    const merged=game.zones.some(zone=>zone.weaponAnchor==='windkite'&&zone.kind===result&&
      span(zone,landed)<Math.min(2,radius*.35));
    if(!merged){
      spent=Math.min(art.life+.28,source.life*.56,source.life-.31);
      received=game.addZone(result,{...landed,radius,life:spent,power:source.power,
        damageFactor:converted?undefined:source.damageFactor,weapon:art.weapon,weaponAnchor:'windkite'});
      if(received){
        source.life-=spent;
        received.life=received.maxLife=spent;
        if(converted){
          game.metrics.reactions++;
          game.metrics.steam++;
          game.emit('reaction',{name:'折风过雨 · 流火化汽',...landed});
        }
      }
    }
  }
  const converted=received?.kind==='steam'&&source.kind==='fire';
  game.emit('techniqueArtRelease',{kind:art.kind,id:art.id,...art.to,center:art.to,from:art.from,to:art.to,
    points:art.points,radius:received?.radius??art.radius,carrier:received?source.kind:undefined,result:received?.kind,
    converted,sourceId:received?source.id:undefined,
    destinationId:received?.id,spent:received?spent:0,vessel:Boolean(received),duration:converted?.74:.53});
  prepareKiteRain(game,art,received);
}

function updateKite(game,art,age) {
  if(art.downpour)return landKiteRain(game,art);
  if(age<art.pickupAt)return false;
  const front=Math.min(1,(age-art.pickupAt)/art.flight);
  const here=climbPath(art.points,front);
  if(front>=1&&game.stage===art.stage&&game.status==='playing')settleKite(game,art);
  const previous=art.previousPoint??art.from;
  art.previousPoint=here;
  for(const enemy of game.enemiesNear(here,art.radius+1)){
    if(art.hit.size>=3+art.tier)break;
    if(game.stage!==art.stage||game.status!=='playing')return true;
    if(enemy.hp<=0||art.hit.has(enemy.id)||span(enemy,here)>art.radius*.71+enemy.radius*.33)continue;
    art.hit.add(enemy.id);
    const actual=point(enemy);
    game.damage(enemy,art.damage,'windkite',previous);
    impact(game,art,enemy,previous,actual,{killed:enemy.hp<=0});
  }
  return front>=1&&!art.downpour;
}

const prismArcs=new Set(['lightning','spark','thunder','serpent']);
const FROST_PRISM_CHARGE_WINDOW=.42;

function arcGap(center,from,to) {
  const x=to.x-from.x,y=to.y-from.y,z=to.z-from.z;
  const projected=Math.max(0,Math.min(1,((center.x-from.x)*x+(center.y-from.y)*y+(center.z-from.z)*z)/
    Math.max(.001,x*x+y*y+z*z)));
  return Math.hypot(from.x+x*projected-center.x,from.y+y*projected-center.y,from.z+z*projected-center.z);
}

export function noteTechniqueArtEvent(game,type,event) {
  if(type!=='arc'&&type!=='hit'||!game.techniqueArts?.length||game.status!=='playing')return;
  const {source,from}=event;
  const relay=type==='arc' && source==='dragon-art-frost' && event.prismRelay;
  const bolt=prismArcs.has(source)||source==='dragon-art-beam'&&event.conductive===true||relay;
  const hit=type==='hit'&&event.amount>0;
  const tideStrike=hit&&source==='cascade-thunder';
  if(!(type==='arc'&&bolt)&&!(hit&&bolt)&&!tideStrike)return;
  let nearest=null,bestGap=Infinity;
  for(const art of game.techniqueArts) {
    if(art.kind!=='icekeel'||art.stage!==game.stage||game.time>art.expiryAt)continue;
    if(type==='arc'&&art.charge?.source===source&&art.charge.struckAt===game.time)return;
    if(hit&&art.charge&&art.charge.source===source&&Math.abs(game.time-art.charge.struckAt)<.04){
      art.charge.mainHits.add(event.targetId);
      continue;
    }
    if(art.charge||art.jump||!(tideStrike||type==='arc')||!from || relay?.prismId!=null&&relay.prismId!==art.id)continue;
    const to=type==='arc'?event.to:event;
    if(!to||!Number.isFinite(from.x+from.y+from.z+to.x+to.y+to.z))continue;
    const gap=arcGap(art.center,from,to);
    if(gap>art.radius*.88||gap>=bestGap)continue;
    nearest=art;
    bestGap=gap;
  }
  if(nearest)nearest.charge={from:point(from),to:point(type==='arc'?event.to:event),source,
    mainHits:new Set(hit||relay?[event.targetId]:[]), relay:relay ? {...relay, forkTargetId:event.targetId} : null,
    struckAt:game.time};
}

function frostAtPrism(game,prism) {
  const art=game.activeDragonArt;
  const frost=art?.kind==='frost'&&art.iceFork&&art.doctrine!=='reach'&&art.phase==='freeze';
  if(!frost || Math.abs(art.center.y-prism.center.y)>art.height+art.rank-1 ||
      planar(art.center,prism.center)>art.radius*1.18) return null;
  return art;
}

function prepareChargedPrism(game,prism) {
  const {charge,center}=prism;
  const cultivation=game.cultivation;
  const frost=frostAtPrism(game,prism);
  const pending=!game.activeDragonArt&&cultivation.dragonArt==='frost'&&cultivation.dragonArtRank>=2&&
    cultivation.dragonArtDoctrine!=='reach'&&game.dragonArtCharge>=95&&(game.nextDragonArtAt??0)<=game.time+.15;
  const expiresAt=Math.min(prism.expiryAt,charge.struckAt+FROST_PRISM_CHARGE_WINDOW);
  if ((!frost&&!pending) || expiresAt<=game.time+.04) return false;
  if (!charge.waiting) {
    charge.waiting=true;
    game.emit('dragonArtReaction',{...center,id:frost?.id,kind:'frost',stage:game.stage,reaction:'frost-prism-hold',prismId:prism.id,depth:2,
      from:charge.from,to:point(center),source:charge.source,anchorId:prism.anchorId,duration:expiresAt-game.time,expiresAt});
  }
  if (!frost || game.time-frost.startedAt<.10) return true;
  const shell=bestTarget(candidates(game,center,2.45),enemy=>enemy.wet>0&&!enemy.boss&&frost.locked.has(enemy.id)&&
    !frost.hitTargets.has(enemy.id)&&!frost.iceFork.reserved.has(enemy.id)&&prismPathClear(game,[enemy,center])
    ? span(enemy,center):Infinity);
  if (!shell) return true;
  const relay={dragonArtId:frost.id,forkLeg:frost.iceFork.nextLeg+1,lateral:true,sourceId:shell.id,
    conducted:true,chargedFrom:charge.source};
  const mainHits=new Set(charge.mainHits);
  for (const enemy of candidates(game,center,prism.refractionRange)) {
    if (enemy.id===shell.id||frost.hitTargets.has(enemy.id)||frost.iceFork.hits.has(enemy.id)||
        frost.iceFork.reserved.has(enemy.id)) mainHits.add(enemy.id);
  }
  const {target}=prismReceiver(game,prism,{...charge,relay,mainHits});
  if(!target)return true;
  frost.iceFork.nextLeg++;
  frost.iceFork.reserved.add(target.id);
  charge.relay={...relay,reservedTargetId:target.id};
  charge.mainHits=mainHits;
  charge.frostContact=point(shell);
  game.emit('dragonArtReaction',{...center,id:frost.id,kind:'frost',stage:game.stage,reaction:'frost-prism-fork',
    from:point(shell),to:point(center),targetId:target.id,anchorId:prism.anchorId,sourceId:shell.id,
    leg:relay.forkLeg,prismId:prism.id,chargedFrom:charge.source,duration:.10});
  return false;
}

function castPrism(game,origin,technique) {
  const wet=candidates(game,origin,technique.range).filter(enemy=>enemy.wet>0&&!enemy.boss);
  const anchors=game.techniqueArts.filter(art=>art.kind==='icekeel'&&!art.jump).map(art=>art.center);
  let made=0;
  for(let i=0;i<technique.prisms;i++) {
    const target=bestTarget(wet,enemy=>anchors.some(site=>span(site,enemy)<4.6)?Infinity:span(enemy,origin));
    if(!target)break;
    const art=baseArt(game,origin,target,technique,technique.life);
    Object.assign(art,{anchorId:target.id,refractionRange:technique.refractionRange,rise:technique.rise});
    const prior=techniqueSlowFactor(target,game.time);
    if(prior>.54) {
      target.frostSlowFactor=.54;
      target.frostSlowUntil=Math.max(target.frostSlowUntil??0,game.time+1.05);
    }
    game.techniqueArts.push(art);
    announce(game,art);
    anchors.push(art.center);
    made++;
  }
  return made>0;
}

function prismElbow(center,to,forward) {
  const angle=normal(to.x-center.x,to.z-center.z);
  const turn=forward.x*angle.z-forward.z*angle.x<0?-1:1;
  return {x:center.x+(to.x-center.x)*.40-angle.z*.56*turn,y:center.y+(to.y-center.y)*.46+.71,
    z:center.z+(to.z-center.z)*.40+angle.x*.56*turn};
}

function prismPathClear(game,points) {
  for (let i=1;i<points.length;i++) {
    const from=points[i-1], to=points[i], steps=Math.ceil(span(from,to)/.8);
    for (let k=1;k<=steps;k++) {
      const t=k/steps;
      const planned={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t};
      const actual={...planned};
      game.stayInWater(actual,.28,from);
      if (span(planned,actual)>.23) return false;
    }
  }
  return true;
}

function prismReceiver(game,art,charge) {
  const {center,refractionRange,rise,anchorId}=art;
  const forward=normal(charge.to.x-charge.from.x,charge.to.z-charge.from.z);
  const target=bestTarget(candidates(game,center,refractionRange),enemy=>{
    if(enemy.id===anchorId||enemy.boss||charge.mainHits.has(enemy.id)||
        charge.relay?.reservedTargetId!=null&&charge.relay.reservedTargetId!==enemy.id)return Infinity;
    const dx=enemy.x-center.x,dz=enemy.z-center.z,vertical=enemy.y-center.y;
    const distance=Math.hypot(dx,dz);
    if(distance<1.9||Math.abs(vertical)>rise)return Infinity;
    const alignment=(dx*forward.x+dz*forward.z)/distance;
    if(Math.abs(alignment)>.84&&Math.abs(vertical)<1.85)return Infinity;
    if(charge.relay){
      const crowdedCeiling=charge.relay.lateral&&game.stage===3&&flightBand(game.stage)[1]+1.1-center.y<2.7;
      if((vertical<1.35&&!(crowdedCeiling&&vertical>=-.5&&Math.abs(alignment)<.50)) || Math.abs(alignment)>.68 ||
          !prismPathClear(game,[center,prismElbow(center,enemy,forward),enemy]))return Infinity;
    }
    return distance*.36+Math.abs(alignment)*3.35-Math.abs(vertical)*.48;
  });
  return {target,forward};
}

export function frostPrismReceiver(game, art, from, prism, delay = 0, reservedTargetId) {
  if (prism.kind!=='icekeel' || prism.stage!==game.stage || prism.charge || prism.jump || prism.expiryAt<=game.time+delay ||
      !prismPathClear(game,[from,prism.center])) return null;
  const mainHits = new Set([from.id]);
  // Do not redirect into a target this frost front already reached.
  for (const enemy of game.enemiesNear(prism.center,prism.refractionRange+3)) {
    if (enemy.id!==reservedTargetId && (art.hitTargets.has(enemy.id) || art.iceFork.hits.has(enemy.id) ||
        art.iceFork.reserved.has(enemy.id))) mainHits.add(enemy.id);
  }
  const charge={from,to:prism.center,mainHits,relay:{lateral:true,reservedTargetId}};
  return prismReceiver(game,prism,charge).target;
}

function releasePrism(game,art) {
  const {center,charge,anchorId}=art;
  const {target,forward}=prismReceiver(game,art,charge);
  if(!target)return false;
  const to=point(target);
  const elbow=prismElbow(center,to,forward);
  const spanTime=.17+Math.min(.16,span(center,to)*.012);
  art.jump={target,to,elbow,at:game.time+spanTime};
  art.expiryAt=art.jump.at+.10;
  game.emit('techniqueArtRelease',{kind:art.kind,id:art.id,...center,center,from:charge.from,via:center,to,
    points:[center,elbow,to],targetId:target.id,anchorId,radius:art.radius,duration:spanTime,
    ...(charge.relay && {carrier:'frost-fork',frostContact:charge.frostContact,...charge.relay})});
  return true;
}

function updatePrism(game,art) {
  if(art.jump) {
    const {target,to,elbow,at}=art.jump;
    if(game.time<at)return false;
    // The intended receiver may evade the refracted bolt during its travel.
    const contacted = target.hp>0&&span(target,to)<Math.max(1.9,target.radius*1.6)&&
      (!art.charge.relay||prismPathClear(game,[elbow,target]));
    if(contacted) {
      target.charge=Math.max(target.charge,1.35);
      game.damage(target,art.damage*(target.wet>0?1.28:1),'icekeel',elbow);
      impact(game,art,target,elbow,point(target),{refraction:true,killed:target.hp<=0,
        ...(art.charge.relay && {carrier:'frost-fork',...art.charge.relay})});
    }
    releasePrismReservation(game,art,contacted);
    return true;
  }
  if(!art.charge||game.time<=art.charge.struckAt)return false;
  if (!art.charge.relay && prepareChargedPrism(game,art)) return false;
  if(releasePrism(game,art))return false;
  releasePrismReservation(game,art);
  return true;
}

function releasePrismReservation(game, prism, completed = false) {
  const relay = prism.charge?.relay;
  const art = game.activeDragonArt;
  if (relay?.reservedTargetId==null || art?.id!==relay.dragonArtId) return;
  art.iceFork.reserved.delete(relay.reservedTargetId);
  const target = art.locked.get(relay.reservedTargetId);
  if (!target) return;
  if (!completed && !art.shattered) return;
  art.locked.delete(target.id);
  art.contactFractures.delete(target.id);
  if (completed) art.hitTargets.add(target.id);
  delete target.dragonArtHeldAt;
  delete target.dragonArtHeldUntil;
  delete target.dragonArtMark;
}

export function castTechniqueArt(game, origin, technique) {
  game.techniqueArts ??= [];
  if (technique.kind === 'frostLine') return castFrost(game, origin, technique);
  if (technique.kind === 'fault') return castFault(game, origin, technique);
  if (technique.kind === 'spore') return castSpore(game, origin, technique);
  if (technique.kind === 'weir') return castWeir(game, origin, technique);
  if (technique.kind === 'kiteDraft') return castKite(game, origin, technique);
  if (technique.kind === 'prism') return castPrism(game, origin, technique);
  return technique.kind === 'wisps' && castWisps(game, origin, technique);
}

export function updateTechniqueArts(game) {
  const active = game.techniqueArts;
  if (!active?.length || game.status !== 'playing') return;
  let count = 0;
  for (const art of active) {
    if (game.status !== 'playing') break;
    if (art.stage !== game.stage || game.time > art.expiryAt) {
      if (art.kind==='icekeel') releasePrismReservation(game,art);
      continue;
    }
    const age = game.time - art.startsAt;
    if (art.kind === 'stonecrest') updateFault(game, art, age);
    else if (art.kind === 'emberwings') updateWisps(game, art, age);
    else if (art.kind === 'sporeseed' && updateSpore(game, art, age)) continue;
    else if (art.kind === 'bankweir' && updateWeir(game, art, age)) continue;
    else if (art.kind === 'windkite' && updateKite(game, art, age)) continue;
    else if (art.kind === 'icekeel' && updatePrism(game, art)) continue;
    if (art.stage === game.stage && game.status === 'playing') active[count++] = art;
  }
  active.length = count;
}
