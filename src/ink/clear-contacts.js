const MAX_GROUPS = 12;
const MAX_POINTS = 8;
const MAX_VISIBLE = 2;
const JOIN_TIME = .19;
const HOLD_TIME = .17;
const FADE_TIME = .49;

const distance = (a,b) => Math.hypot(a.x-b.x,(a.y-b.y)*1.55,a.z-b.z);

export class ClearContacts {
  constructor() {
    this.groups = [];
    this.visible = [];
  }

  reset() {
    this.groups.length = 0;
    this.visible.length = 0;
  }

  event(event, time, stage) {
    if(event.type==='dragonArtMajorClear'&&stage===event.stage&&event.targets?.length>=12) {
      if(this.groups.length===MAX_GROUPS)this.groups.shift();
      this.groups.push({id:event.id,kind:event.kind,sourceType:event.type,stage,x:event.x,y:event.y,z:event.z,
        first:time,at:time,hits:event.targets.length,points:event.targets.slice(0,MAX_POINTS),
        ids:new Set(event.targets.map(target=>target.id)),radius:8.2,gain:0,major:true});
      return;
    }
    if (stage < 2 || stage > 3 || event.stage !== undefined && stage !== event.stage ||
      (event.type !== 'cascadeHit' && event.type !== 'dragonArtImpact') || !event.killed || event.boss ||
      !Number.isFinite(event.x+event.y+event.z)) return;
    const {id,kind,type:sourceType,detail,targetId} = event;
    const split=detail==='gale-spore-hit'&&event.sporeSplit;
    const leg = detail==='fan-crest'||detail==='gale-spore-hit' ? event.leg : undefined;
    const center = event.absorbed ? event.from : event;
    if (!center || !Number.isFinite(center.x+center.y+center.z)) return;
    let group = this.groups.find(candidate => candidate.id===id && candidate.stage===stage &&
      candidate.sourceType===sourceType && candidate.detail===detail && candidate.leg===leg &&
      time-candidate.first<=JOIN_TIME && distance(candidate,center)<=6.8);
    if (!group) {
      if (this.groups.length===MAX_GROUPS) this.groups.shift();
      group={id,kind,sourceType,detail,leg,stage,split,x:center.x,y:center.y,z:center.z,
        first:time,at:time,hits:0,points:[],ids:new Set(),radius:3.4,gain:0};
      this.groups.push(group);
    }
    if (group.ids.has(targetId)) return;
    group.ids.add(targetId);
    group.at = time;
    const weight = 1 / ++group.hits;
    group.x += (center.x-group.x)*weight;
    group.y += (center.y-group.y)*weight;
    group.z += (center.z-group.z)*weight;
    if (group.points.length<MAX_POINTS && (!event.absorbed || !group.points.length)) {
      group.points.push({x:center.x,y:center.y,z:center.z,id:targetId,radius:event.targetRadius??.75});
    }
    group.radius = Math.min(8.2, Math.max(group.radius, distance(group,center)+2.75));
  }

  update(time, stage, active, reducedMotion) {
    this.visible.length = 0;
    for(let index=this.groups.length-1;index>=0;index--) {
      const group=this.groups[index];
      if(group.stage!==stage||time-group.at>=FADE_TIME)this.groups.splice(index,1);
    }
    if (!active) return this.visible;
    for (const group of this.groups) {
      const relay = group.detail === 'thaw-thunder-hit' || group.detail==='gale-spore-hit';
      const minimum = relay || group.detail === 'rise-bolt' || group.detail === 'fork-bolt' ? 2 :
        group.detail === 'fan-crest' ? 3 : 5;
      if(group.hits<minimum)continue;
      const t=Math.max(0,(time-group.at-HOLD_TIME)/(FADE_TIME-HOLD_TIME));
      const strength=group.major ? 1 : group.split ? .90 : relay ? .77 : group.detail ? .60 : .54;
      group.gain=(1-t*t*(3-2*t))*Math.min(1,strength+.043*group.hits)*(reducedMotion?.68:1);
      this.visible.push(group);
    }
    this.visible.sort((a,b)=>(b.gain + Math.min(10,b.hits)*.028 + Boolean(b.detail)*.17 + (b.major?.55:b.split?.28:0)) -
      (a.gain + Math.min(10,a.hits)*.028 + Boolean(a.detail)*.17 + (a.major?.55:a.split?.28:0)));
    if(this.visible.length>MAX_VISIBLE)this.visible.length=MAX_VISIBLE;
    return this.visible;
  }
}
