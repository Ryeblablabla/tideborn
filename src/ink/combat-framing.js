import { MathUtils } from 'three';

const { clamp, lerp, smoothstep } = MathUtils;
const followThrough = new Set(['stone-march','stone-contour','abyss-transfer','abyss-undertow','abyss-steamwake',
  'beam-quench','rift-recoil','beam-intercept','rift-wind-seam','frost-sheet','frost-temper-rush','thaw-thunder-release']);
const movingContacts = new Set(['stone-chain', 'stone-surge', 'stone-quarry', 'frost-chain']);
const shapedCascades = new Set(['fan-crest','rise-bolt','fork-bolt','cinder-path','basin-flow','gale-run','gale-spore-front']);
const isPoint = p => Number.isFinite(p?.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

function pathCrest(path, progress) {
  const index = progress * (path.length - 1);
  const from = path[Math.floor(index)], to = path[Math.ceil(index)];
  const t = index % 1;
  return {x:lerp(from.x,to.x,t),y:lerp(from.y,to.y,t),z:lerp(from.z,to.z,t)};
}

function receiverCenter(points) {
  const center = {x:0,y:0,z:0};
  let mass = 0;
  for (const p of points) {
    const weight = p.killed ? 2 : 1;
    center.x += p.x * weight;
    center.y += p.y * weight;
    center.z += p.z * weight;
    mass += weight;
  }
  return {x:center.x/mass,y:center.y/mass,z:center.z/mass};
}

function fanView(front, time, game) {
  if (front.wings?.size !== 2) return null;
  const wings = [];
  for (const [leg, wing] of front.wings) {
    const hits = front.hits.filter(hit => hit.leg === leg && time - hit.at < .42);
    const receivers = hits.length ? hits : wing.landed ? [] : game.enemiesNear(wing.end, 11)
      .filter(enemy => enemy.hp > 0 && wing.receivers.has(enemy.id)).slice(0, 8);
    if (receivers.length < 2) return null;
    wings.push({center:receiverCenter(receivers), points:receivers});
  }
  const points = wings.flatMap(wing=>wing.points);
  if (points.length < 6) return null;
  return {points, center:receiverCenter(wings.map(wing=>wing.center)),
    bounds:wings.flatMap(wing=>wing.points.reduce((edges,point)=>{
      if (Math.hypot(point.x-wing.center.x,point.z-wing.center.z) >
          Math.hypot(edges[1].x-wing.center.x,edges[1].z-wing.center.z)) edges[1]=point;
      return edges;
    },[wing.center,wing.center]))};
}

function gyreView(front, hits, game) {
  if (front.route!=='gyre-core'&&front.route!=='frost-sheet') return null;
  const targets=front.released ? hits : game.enemiesNear(front.end,front.radius)
    .filter(enemy=>enemy.hp>0&&front.receivers.has(enemy.id)).slice(0,24);
  if(targets.length<9)return null;
  const center=receiverCenter(targets);
  const edges=[center];
  for(const axis of ['x','z']) {
    let lowest=targets[0],highest=targets[0];
    for (const target of targets) {
      if(target[axis]<lowest[axis])lowest=target;
      if(target[axis]>highest[axis])highest=target;
    }
    edges.push(lowest,highest);
  }
  return {points:targets,center,bounds:edges};
}

export class CombatFraming {
  constructor() {
    this.reset();
  }

  reset() {
    this.front = null;
    this.aim = null;
    this.contact = null;
    this.sporeCarrier = null;
    this.major = null;
  }

  event(event, at, stage) {
    if (stage < 2 || stage > 3 || event.stage !== undefined && event.stage !== stage) return;
    const frostRelay = event.kind === 'icekeel' && event.carrier === 'frost-fork';
    if(event.type==='dragonArtMajorClear'&&event.targets?.length>=12&&isPoint(event)) {
      this.major={id:event.id,stage,at,center:event,targets:event.targets.filter(isPoint)};
      return;
    }
    if(event.type==='cascadePulse'&&event.detail==='gale-spore-carry'&&isPoint(event.to)) {
      const previous=this.sporeCarrier;
      this.sporeCarrier={id:event.id,stage,seedId:event.seedId,at:previous?.seedId===event.seedId?previous.at:at,
        until:at+.28,from:event.from,to:event.to};
      return;
    }
    if(event.type==='techniqueArtBloom'&&event.kind==='sporeseed'&&this.sporeCarrier?.seedId===event.id) {
      this.sporeCarrier.until=Math.min(at+.06,this.sporeCarrier.until);
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='abyss-mouth-gather'&&event.leg===3&&isPoint(event)) {
      const previous=this.front;
      const source=previous?.id===event.id&&previous.route==='abyss-transfer'?previous.source:event;
      this.front={id:event.id,stage,route:'abyss-transfer',at,travel:event.travel,until:at+event.travel+.44,
        source,end:event,receivers:new Set(event.receiverIds),preyCenter:event,path:[event,event],hits:[],mouthFold:true};
      return;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='abyss-mouth-cancel'&&event.leg===3) {
      if(this.front?.id===event.id&&this.front.mouthFold)this.front.until=Math.min(at,this.front.until);
      return;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='rift-wind-seam-cancel') {
      if(this.front?.id===event.id&&this.front.route==='rift-wind-seam')this.front.until=Math.min(at,this.front.until);
      return;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='frost-temper-rush-cancel') {
      if(this.front?.id===event.id&&this.front.route==='frost-temper-rush')this.front.until=Math.min(at,this.front.until);
      return;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='thaw-thunder-cancel') {
      if(this.front?.id===event.id&&this.front.route==='thaw-thunder-release')this.front.until=Math.min(at,this.front.until);
      return;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='beam-quench-runoff-cancel'){
      if(this.front?.id===event.id && this.front.route==='beam-quench-runoff')this.front.until=Math.min(at,this.front.until);
      return;
    }
    if(event.type==='cascadeHandoffCancel'){
      if(this.aim?.id===event.id)this.aim=null;
      return;
    }
    if(event.type==='cascadeHandoffAim'){
      if(!isPoint(event.from)||!isPoint(event.to))return;
      this.aim={id:event.id,stage,route:'cascade-aim',at,travel:0,until:at+event.duration,afterClear:event.afterClear,
        source:event.from,end:event.to,preyCenter:event.to,receivers:new Set(event.receiverIds),path:[event.from,event.to],hits:[]};
      return;
    }
    if(event.type==='cascadeStart'&&event.handoff){
      const {from,to,receiverIds,travel}=event.handoff;
      this.aim=null;
      this.front={id:event.id,stage,route:'cascade-handoff',at,travel,until:at+travel+.55,
        source:from,end:to,preyCenter:to,afterClear:event.handoff.afterClear,receivers:new Set(receiverIds),path:[from,to],hits:[]};
    }
    if(event.type==='cascadePulse'&&event.preparing&&shapedCascades.has(event.detail)&&event.receiverIds?.length){
      const spore=event.detail==='gale-spore-front';
      const source=spore?event.from:(event.carrierFrom??event.from);
      const end=event;
      if(!isPoint(source)||!isPoint(end))return;
      const front=this.front;
      if(front?.route==='gale-spore-front'&&event.detail==='gale-run'&&front.id===event.id&&at<front.until)return;
      if (front?.id===event.id&&front.route===event.detail) {
        for(const id of event.receiverIds)front.receivers.add(id);
        front.until=Math.max(front.until,at+event.travelTime+.44);
        if(spore)front.sporeLegs.set(event.leg,{at,travel:event.travelTime,end,path:event.points??[source,end],
          receivers:new Set(event.receiverIds),hits:[]});
      } else if (!front || at>=front.until-.06 || front.id===event.id) {
        this.front={id:event.id,stage,route:event.detail,at,travel:event.travelTime,until:at+event.travelTime+.44,
          source,end,preyCenter:end,receivers:new Set(event.receiverIds),path:event.points??[source,end],hits:[],
          carrier:spore?event.carrierFrom:null,sporeLegs:spore?new Map([[event.leg,{at,travel:event.travelTime,end,
            path:event.points??[source,end],receivers:new Set(event.receiverIds),hits:[]}]]) : null};
      }
    }
    if(event.type==='cascadePulse'&&event.detail==='gyre-core'&&event.preparing&&event.receiverIds?.length>=9&&isPoint(event)) {
      const front=this.front;
      if(!front||front.id===event.id||at>=front.until-.06) {
        this.front={id:event.id,stage,route:event.detail,at,travel:event.travelTime,until:at+event.travelTime+.55,
          source:event,end:event,preyCenter:event,radius:event.radius,receivers:new Set(event.receiverIds),path:[event,event],hits:[]};
      }
    }
    if(event.type==='cascadePulse'&&event.detail==='gyre-burst'&&this.front?.id===event.id&&this.front.route==='gyre-core') {
      this.front.released=true;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='frost-sheet-shatter'&&this.front?.id===event.id&&this.front.route==='frost-sheet') {
      this.front.released=true;
    }
    if(event.type==='cascadePulse' && event.detail==='fan-crest' && event.leg !== undefined &&
       this.front?.id===event.id && this.front.route==='fan-crest'){
      const wings = this.front.wings ??= new Map();
      if (event.preparing && event.receiverIds?.length) {
        wings.set(event.leg,{end:event,receivers:new Set(event.receiverIds),landed:false});
      } else if(wings.has(event.leg)) wings.get(event.leg).landed=true;
    }
    if(event.type==='dragonArtReaction'&&event.reaction==='beam-quench-runoff'&&
      event.points?.length>1&&isPoint(event.from)&&isPoint(event.to)){
      const destination = event.steamTo ?? event.to;
      this.front={id:event.id,stage,route:'beam-quench-runoff',at,travel:event.travel,
        source:event.from,end:destination,receivers:new Set(event.receiverIds??[]),
        path:event.points,hits:[],until:at+event.travel+.13};
      return;
    }
    if (event.type === 'techniqueArtRelease' && frostRelay && isPoint(event.from) && isPoint(event.to)) {
      this.front = {id:event.id, stage, route:'frost-prism', at, travel:event.duration,
        until:at+event.duration+.19, source:event.from, end:event.to, receivers:new Set([event.targetId]),
        path:[event.from,...event.points], hits:[]};
    }
    if (event.type === 'dragonArtReaction' && followThrough.has(event.reaction) &&
        event.receiverIds?.length >= (event.climbing || event.reaction === 'abyss-transfer' ? 1 : 2) &&
        isPoint(event.from) && isPoint(event.to)) {
      const previous = this.front;
      if((event.reaction==='frost-sheet'||event.reaction==='stone-contour')&&previous?.id===event.id&&previous.route===event.reaction) {
        for(const id of event.receiverIds)previous.receivers.add(id);
        previous.until=Math.max(previous.until,at+event.duration);
        return;
      }
      if (previous?.route === 'stone-march' && event.reaction !== 'stone-march' &&
          at < previous.until) return;
      if (previous?.route === 'frost-temper-rush' && event.reaction === 'frost-sheet' &&
          previous.id === event.id && at < previous.until) return;
      const travel = event.travel ?? event.duration ?? .6;
      const receivers = new Set(event.receiverIds);
      const planned = (event.receiverTargets ?? event.targets ?? []).filter(target => receivers.has(target.id) && isPoint(target.forecast ?? target))
        .map(target => target.forecast ?? target);
      this.front = {
        id: event.id, stage, route: event.reaction, at, travel, leg:event.leg, climbing:event.climbing, windup:event.windup??0,
        until: at + (event.windup ?? 0) + travel + (event.settle ?? event.hold ?? 0),
        source: event.from, end: event.to, receivers,radius:event.reaction==='frost-sheet'?24:13,formation:event.formation,
        cloud: event.reaction==='thaw-thunder-release'&&isPoint(event.cloudFrom)?event.cloudFrom:null,
        preyCenter: planned.length ? receiverCenter(planned) : event.to,
        path: event.points?.length > 2 ? event.points : [event.from, event.to], hits: [],
      };
    }
    if(event.type==='dragonArtImpact'&&event.killed&&!event.boss&&movingContacts.has(event.impact)&&isPoint(event)&&isPoint(event.from)){
      const last=this.contact;
      if(!last || last.id!==event.id || at>last.until || Math.hypot(event.x-last.end.x,event.y-last.end.y,event.z-last.end.z)>9){
        this.contact={id:event.id,stage,route:event.impact,at,travel:.15,until:at+.30,
          source:event.from,end:event,path:[event.from,event],hits:[]};
      }
      this.contact.hits.push({x:event.x,y:event.y,z:event.z,at,killed:true});
      if(this.contact.hits.length>8)this.contact.hits.shift();
      this.contact.end=event;
      this.contact.until=at+.30;
    }
    const front = this.front;
    const currentId=event.detail==='thaw-thunder-hit'?event.artId:event.id;
    if (!front||currentId!==front.id||!isPoint(event)) return;
    const landed = front.route==='beam-intercept' ? event.type==='dragonArtImpact'&&event.interception :
      front.route==='frost-sheet' ? event.type==='dragonArtImpact'&&event.impact==='frost-sheet-shatter' :
      front.route==='stone-contour' ? event.type==='dragonArtImpact'&&event.impact==='stone-contour' :
      front.route==='cascade-handoff' ? event.type==='cascadeHit'&&(front.receivers.has(event.targetId)||event.killed) :
      front.route==='gyre-core' ? event.type==='cascadeHit'&&event.detail==='gyre-burst' :
      front.route==='gale-spore-front' ? event.type==='cascadeHit'&&event.detail==='gale-spore-hit' :
      shapedCascades.has(front.route) ? event.type==='cascadeHit'&&event.detail===front.route :
      front.route==='frost-prism' ? frostRelay&&event.type==='techniqueArtImpact' :
      front.route==='thaw-thunder-release' ? event.type==='cascadeHit'&&event.detail==='thaw-thunder-hit' :
      event.type==='dragonArtImpact'&&event.impact===front.route&&(front.leg===undefined||event.leg===front.leg);
    if (!landed) return;
    if (front.hits.length === (front.route==='gyre-core'||front.route==='frost-sheet' ? 24 : front.wings ? 16 : 8)) front.hits.shift();
    const hit={x:event.x,y:event.y,z:event.z,at,killed:event.killed,leg:event.leg};
    front.hits.push(hit);
    front.sporeLegs?.get(event.leg)?.hits.push(hit);
    const hold = front.route==='thaw-thunder-release'||front.route==='gale-spore-front' ? .44 : .26;
    front.until = Math.max(front.until, at + (event.killed ? hold : .10));
  }

  view(time, stage, game) {
    const major=this.major;
    if(major?.stage===stage&&major.targets.length>=12&&time-major.at<.68) {
      const strength=smoothstep(time-major.at,0,.085)*(1-smoothstep(time-major.at,.46,.68));
      return {id:major.id,route:'major-clear',strength,points:major.targets,receiverPoints:major.targets,
        receiverFocus:major.center,contact:true};
    }
    const shown = this.front?.stage===stage && time<this.front.until+.32 ? this.front : null;
    const aiming = this.aim?.stage===stage && time<this.aim.until ? this.aim : null;
    const contact = this.contact?.stage===stage && time<this.contact.until && this.contact.hits.length>=2 ? this.contact : null;
    const carrier = this.sporeCarrier;
    if(carrier?.stage===stage&&time<carrier.until&&(!shown||shown.route==='gale-run'&&shown.id===carrier.id)) {
      const strength=smoothstep(time-carrier.at,0,.075)*(1-smoothstep(time,carrier.until-.11,carrier.until));
      return {id:carrier.id,route:'gale-spore-carry',points:[carrier.to,carrier.from],strength,destination:carrier.to,
        receiverFocus:carrier.to,receiverPoints:[carrier.to],contact:false};
    }
    const front = aiming?.afterClear && (!shown || time>shown.until-.14) ? aiming : shown ?? aiming ?? contact;
    if (!front) return null;
    const {id, route, path, end, source, at, until, hits} = front;
    const relocated = route === 'abyss-transfer';
    const prism = route === 'frost-prism';
    const held = route === 'cascade-aim';
    const runoff = route === 'beam-quench-runoff';
    const relay = route === 'thaw-thunder-release';
    const spore = route==='gale-spore-front';
    if(spore&&front.sporeLegs.size>1) {
      const legs=[...front.sporeLegs.values()];
      const strikes=legs.flatMap(leg=>leg.hits);
      const regions=legs.map(leg=>{
        if(leg.hits.length)return leg.hits;
        const alive=game.enemiesNear(leg.end,12).filter(enemy=>enemy.hp>0&&leg.receivers.has(enemy.id)).slice(0,7);
        return alive.length?alive:[leg.end];
      });
      const targets=regions.flat();
      const center=receiverCenter(regions.map(receiverCenter));
      const tips=legs.map(leg=>pathCrest(leg.path,clamp((time-leg.at)/Math.max(.10,leg.travel),0,1)));
      const strength=smoothstep(time-at,0,.11)*(1-smoothstep(time,until+.14,until+.55));
      const newest=strikes.at(-1);
      return {id,route,points:[source,...tips,...targets],destination:end,strength,receiverFocus:center,
        receiverPoints:targets,contact:strikes.some(hit=>time-hit.at<.58),splitSpore:true,
        settleFocus:newest?1-smoothstep(time-newest.at,.29,.57):0};
    }
    const steam = route === 'frost-temper-rush'||relay||spore;
    const receivers = front.receivers ? game.enemiesNear(front.preyCenter ?? end, front.formation==='thaw-flank'?19:13)
      .filter(enemy => enemy.hp > 0 && front.receivers.has(enemy.id)).slice(0, 8) : [];
    const progress = clamp((time - at - (front.windup ?? 0)) / Math.max(.10, front.travel), 0, 1);
    const crest = pathCrest(path, progress);
    const last = hits.at(-1);
    const nearbyContacts = hits.filter(hit => time - hit.at < (spore?.58:.39) &&
      Math.hypot(hit.x-last.x,(hit.y-last.y)*1.4,hit.z-last.z)<8.5);
    const fan = fanView(front,time,game);
    const gyre = gyreView(front,hits,game);
    const region = fan?.points ?? gyre?.points ?? (nearbyContacts.length ? nearbyContacts : receivers);
    const receiverFocus = fan?.center ?? gyre?.center ?? (region.length ? receiverCenter(region) : null);
    const earlier = relay?front.cloud:spore?front.carrier:null;
    const fromPoints = earlier && progress < .32 ? [earlier,source] : [source];
    const showSource = prism || runoff || progress < (relay ? .66 : steam ? .8 : .58);
    const points = receiverFocus ? [crest, ...(showSource ? fromPoints : []), ...region] :
      [crest, ...(showSource || progress < .63 ? fromPoints : []), end];
    const strength = smoothstep(time - at, 0, steam ? .10 : fan ? .12 : held ? .24 : relocated ? .14 : .18) *
      (1 - smoothstep(time, until + .14, until + .55));
    return {id, route, points, strength, destination:end, climbing:front.climbing,
      receiverFocus, receiverPoints:region, contact:nearbyContacts.length>0, afterClear:front.afterClear,
      sourceBias:spore?1-smoothstep(progress,.10,.46):0,
      contactOnly:front===contact, fanBounds:fan?.bounds, gyreBounds:gyre?.bounds, mouthFold:front.mouthFold};
  }
}
