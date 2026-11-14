import { canDisplaceEnemy } from './encounters.js';
import { clamp } from './rules.js';

export const OATHS = {
  mirror: {name:'返照玄镜', description:'破浪迎击敌弹，存下它的力量。下次破浪向前返射，贯穿并打湿敌群。'},
  tether: {name:'缚潮玉珏', description:'破浪卷走沿途敌群，将它们拖向终点或附近的元素阵眼，并打湿敌身。'},
};

const point = ({x,y,z}) => ({x,y,z});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const forward = (p, angle, d) => ({x:p.x+Math.sin(angle)*d,y:p.y,z:p.z+Math.cos(angle)*d});
const fieldKinds = new Set(['fire','poison','thunder','steam','rain','storm','ring']);

function clearApproach(game, p, angle, reach) {
  for (let d=1.25;d<=reach;d+=1.25) {
    const at=forward(p,angle,d);
    if(game.stage===3 ? (game.terrainHeight?.(at.x,at.z)??-Infinity)+.65>=p.y : game.onLand(at.x,at.z,.48))return false;
  }
  return true;
}

export function startOathTrial(game, site) {
  const {p} = game;
  site.endsAt = game.time + 17;
  site.angle = p.angle;
  site.nextPulse = game.time + .75;
  site.pulses = 0;
  site.pulseContact = false;
  site.emitter = null;
  site.beacons = [];
  if (site.relic === 'mirror') return;
  const localY = game.stage===3 ? p.y : .82;
  const entry = {...point(p),y:localY};
  for (const offset of [0,-.28,.28,-.58,.58]) {
    const direction = site.angle+offset;
    const stones = [1.7,3.45,5.2].map(d => ({...forward(entry,direction,d),radius:1.26,cleared:false}));
    if (stones.some(b => game.stage===3 ? (game.terrainHeight?.(b.x,b.z)??-Infinity)+1.1>b.y : game.onLand(b.x,b.z,.65))) continue;
    site.beacons = stones;
    site.angle = direction;
    return;
  }
  site.beacons = [{...point(site),y:localY,radius:1.8,cleared:false}];
}

export function oathTrialResult(game, site) {
  const {p} = game;
  if (game.time >= site.endsAt || distance(p,site)>28) return 'failed';
  if (site.relic === 'tether') {
    const activeDash = p.dash>0;
    const mark = site.beacons.find(b=>!b.cleared);
    if (mark && activeDash && distance(p,mark)<mark.radius && Math.abs(p.y-mark.y)<1.7) mark.cleared=true;
    site.progress = site.beacons.filter(b=>b.cleared).length/site.beacons.length;
    return site.progress>=1 ? 'complete' : null;
  }
  if (site.pulseContact) return 'complete';
  if (game.time < site.nextPulse) return null;
  site.nextPulse = game.time + 3.5;
  // Send a marked pulse along the player's approach. Later pulses switch
  // flank, so holding still after missing the first shot has a cost.
  const spread = [0,-.42,.48][site.pulses++%3];
  const angles = [spread,0,-.56,.56,-1.05,1.05].map(offset=>p.angle+offset);
  const openAngle = angles.find(heading=>clearApproach(game,p,heading,10.4));
  const shortAngle = openAngle===undefined?angles.find(heading=>clearApproach(game,p,heading,6.2)):undefined;
  const angle = openAngle ?? shortAngle ?? p.angle;
  const reach = openAngle===undefined?6.2:10.4;
  const origin = forward(p,angle,reach);
  const sky = game.stage===3;
  const damage = 18+game.stage*5;
  const radius = .60;
  const life = 2.75;
  const velocity = -reach/1.42;
  const pulse = {...origin,id:game.nextId++,vx:Math.sin(angle)*velocity,vy:0,vz:Math.cos(angle)*velocity,
    radius,damage,life,maxLife:life,attack:'mirror-trial',oathSite:site.id,surface:!sky};
  game.hazards.push(pulse);
  site.emitter = origin;
  site.beacons = [{...point(p),radius:.92,cleared:false}];
  site.progress = Math.min(.75,site.pulses*.23);
  game.emit('wonderArtifact',{kind:'mirror',action:'warning',...origin,from:origin,to:point(p),radius,duration:1.42});
  return null;
}

export function startOathDash(game) {
  const {p,wonders} = game;
  const oath = wonders.relics.oath;
  if (oath==='tether') {
    wonders.artifact.dashPath = [point(p)];
    return;
  }
  if (oath!=='mirror'||!wonders.artifact.charge) return;
  const {damage} = wonders.artifact.charge;
  wonders.artifact.charge = null;
  const sin=Math.sin(p.angle),cos=Math.cos(p.angle);
  let target=null,best=18**2;
  for(const enemy of game.enemiesNear(p,18,wonders.artifact.targets)){
    if(enemy.hp<=0)continue;
    const x=enemy.x-p.x,y=enemy.y-p.y,z=enemy.z-p.z;
    const range=x*x+y*y+z*z;
    const along=x*sin+z*cos;
    if(range>=best||along<Math.sqrt(range)*.829)continue;
    best=range;
    target=enemy;
  }
  const aim = target ? Math.atan2(target.x-p.x,target.z-p.z) : p.angle;
  const from = forward(p,aim,.75);
  const to = target ? point(target) : forward(from,aim,14);
  const range = Math.max(1,distance(from,to));
  const speed = 23.5;
  const life = .74;
  const velocity={x:Math.sin(aim)*speed,y:clamp((to.y-from.y)*speed/range,-10,10),z:Math.cos(aim)*speed};
  game.shots.push({id:game.nextId++,...from,vx:velocity.x,vy:velocity.y,
    vz:velocity.z,life,startLife:life,muzzleBlend:.06,damage:damage*1.65+game.stats().damage*.7,
    pierce:9,hitIds:new Set(),kind:'bubble',element:'water',tier:2});
  game.emit('wonderArtifact',{kind:'mirror',action:'counter',...from,from,to,radius:1.75,duration:.62,damage,velocity,speed,life});
}

export function catchOathProjectile(game, hazard, from) {
  const {p,wonders} = game;
  if (p.dash<=0||game.status!=='playing') return false;
  const site = wonders.active;
  const trial = site?.kind==='oath'&&site.relic==='mirror'&&hazard.oathSite===site.id;
  const mirror = wonders.relics.oath==='mirror'&&!wonders.artifact.charge;
  if (!trial&&!mirror) return false;
  if (trial) site.pulseContact = true;
  else wonders.artifact.charge={damage:hazard.damage??(11*(1+game.stage*.7))};
  game.emit('wonderArtifact',{kind:'mirror',action:'catch',...point(p),from:point(from),to:point(p),radius:1.4,duration:.5,trial});
  return true;
}

function pathDistanceSq(point, path) {
  let nearest=Infinity;
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i];
    const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
    const projection=clamp(((point.x-a.x)*x+(point.y-a.y)*y+(point.z-a.z)*z)/Math.max(.001,x*x+y*y+z*z),0,1);
    nearest=Math.min(nearest,(point.x-a.x-x*projection)**2+(point.y-a.y-y*projection)**2+(point.z-a.z-z*projection)**2);
  }
  return nearest;
}

export function updateOathDash(game) {
  const {p,wonders} = game;
  const path = wonders.artifact.dashPath;
  if (!path) return;
  if (distance(path.at(-1),p)>.47) path.push(point(p));
  if (p.dash>0) return;
  wonders.artifact.dashPath=null;
  if (path.length<2) return;
  const from=path[0];
  let to=point(p), best=6.6;
  for (const zone of game.zones) {
    if (!fieldKinds.has(zone.kind)||zone.life<=0) continue;
    const d=Math.hypot(zone.x-p.x,zone.y-p.y,zone.z-p.z);
    if(d>=best) continue;
    if(game.stage<3&&game.onLand(zone.x,zone.z,.55)) continue;
    best=d;
    to=point(zone);
  }
  const reach=distance(from,p)+5.1;
  const candidates=game.enemiesNear(p,reach,wonders.artifact.targets);
  const links=[];
  let count=0;
  for(const enemy of candidates) {
    if(count>=36)break;
    if(!canDisplaceEnemy(enemy,game.time)||pathDistanceSq(enemy,path)>4.4**2)continue;
    const x=to.x-enemy.x,z=to.z-enemy.z,d=Math.hypot(x,z);
    if(d<.38)continue;
    const duration=.42;
    // Regular displacement, including bank/terrain checks, owns the motion.
    const speed=Math.min(d*.82,7.6)*2/duration;
    enemy.weaponPush={x:x/d*speed,z:z/d*speed,remaining:duration,duration};
    enemy.wet=Math.max(enemy.wet,5);
    count++;
    if(links.length<10)links.push({from:point(enemy),to});
  }
  game.emit('wonderArtifact',{kind:'tether',action:'tether',...to,from,to,points:path,links,count,radius:4.4,duration:.68});
}
