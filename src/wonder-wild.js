import { ENEMY_TYPES } from './encounters.js';
import { clamp, flightBand } from './rules.js';

export const WILD_RELICS = {
  undertow: {title:'吞潮印',tone:'element',description:'贴低破浪，终点留下潮池。漩涡持续卷聚湿敌，可接火、雷和毒法。',detail:'低位聚敌 · 推动元素连锁'},
  breakwater: {title:'截浪符',tone:'body',description:'破浪后留下截潮屏，替你截下最多六枚敌弹。每次截弹会扫击屏内敌群。',detail:'截弹反击 · 护住撤离路线'},
};

const FRONTS = [36,40,44,44];
const MAX_ALIVE = 150;
const TARGET = 64;
const point = ({x,y,z}) => ({x,y,z});
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const forward = (p, angle, d) => ({x:p.x+Math.sin(angle)*d,y:p.y,z:p.z+Math.cos(angle)*d});

export function wildAvailable(game,site) {
  return game.exploring&&game.stage===2&&game.status==='playing'&&site?.kind==='wild'&&site.phase==='ready'&&
    !game.boss&&!game.wonders.active&&!game.activeCascade&&!game.activeDragonArt&&!game.wonders.market&&game.time>=site.retryAt&&
    distance(game.p,site)<=site.triggerRadius&&game.p.y<=2.25;
}

export function beginWildAssault(game,site) {
  const bearing = game.p.angle;
  site.waveIndex=0;
  site.waveTotal=FRONTS.length;
  site.defeated=0;
  site.spawned=0;
  site.leash=site.radius;
  site.outside=0;
  site.endsAt=game.time+30;
  site.attemptId=game.nextId++;
  const route=site.passageLandmark?.heading;
  const angles = route===undefined ? [bearing, bearing+Math.PI, bearing-.66, bearing+Math.PI+.76]
    : [route,route+Math.PI,route-.17,route+Math.PI+.17];
  site.fronts=FRONTS.map((count,index)=>{
    const angle=angles[index];
    const spawnAt=game.time+1.55+index*1.93;
    const from=forward(site,angle,12.5);
    return {...from,angle,id:`${site.attemptId}:${index}`,width:12.5,startsAt:spawnAt-1.15,spawnAt,
      endsAt:spawnAt+.95,phase:'warning',count,spawned:0};
  });
}

function reinforce(game,site,front,amount) {
  const {eel,polyp,seaRay} = ENEMY_TYPES;
  const start=front.spawned;
  for(let i=start;i<start+amount;i++){
    const side = (i%11-5)*1.08;
    const depth = Math.floor(i/11)*1.5;
    const ahead = forward(front,front.angle,depth);
    const trial = forward(ahead,front.angle+Math.PI*.5,side);
    const clear = game.onLand(trial.x,trial.z,.55) ? forward(ahead,front.angle+Math.PI*.5,side*.33) : trial;
    const type = i%11===0 ? polyp : i%5===0 ? seaRay : eel;
    const enemy = game.spawnEnemy(type,clear.x,clear.z,.8+(i%4)*.11);
    if(!enemy)break;
    enemy.hp=enemy.maxHp*=i%11===0?1.18:.87;
    enemy.speed*=i%11===0?1.08:1.25;
    enemy.wonderHaste=1.23;
    enemy.shootCD=Math.min(enemy.shootCD,1.65+(i%7)*.33);
    enemy.wildAssault=site.attemptId;
    front.spawned++;
    site.spawned++;
  }
}

export function updateWildAssault(game,site,dt) {
  const range=distance(game.p,site);
  const inside=range<site.leash+.8&&game.p.y<3.05;
  site.outside=inside?Math.max(0,site.outside-dt*2):site.outside+dt;
  if(site.outside>3.8||game.time>=site.endsAt)return 'failed';
  let alive=site.spawned-site.defeated;
  for(let i=0;i<site.fronts.length;i++){
    const front=site.fronts[i];
    if(game.time<front.spawnAt)continue;
    if(front.phase==='warning'){
      site.waveIndex=i+1;
      front.phase='impact';
      game.emit('wonder',{kind:'wild',action:'impact',title:'镇潮四阵',...point(front),count:front.count,radius:6.5});
    }
    const before=front.spawned;
    if(alive<MAX_ALIVE&&front.spawned<front.count)reinforce(game,site,front,Math.min(MAX_ALIVE-alive,front.count-front.spawned));
    alive+=front.spawned-before;
    if(game.time>=front.endsAt)front.phase='spent';
  }
  const enemyProgress=clamp(site.defeated/TARGET,0,1);
  site.progress=Math.min(enemyProgress,site.waveIndex/site.waveTotal);
  return site.waveIndex===site.waveTotal&&site.defeated>=TARGET&&inside?'complete':null;
}

export function wildAssaultHint(game,site) {
  if(site.outside>.22)return '回到水阵内并贴低 · 离阵太久会散阵';
  return `守住水阵 · 第 ${site.waveIndex}/${site.waveTotal} 阵 · 破敌 ${Math.min(TARGET,site.defeated)}/${TARGET}`;
}

export function creditWildKill(game,enemy) {
  const active=game.wonders.active;
  if(active?.kind==='wild'&&enemy.wildAssault===active.attemptId)active.defeated++;
}

export function finishWildAssault(game,site,success) {
  // The surviving shoals break formation and visibly flee out of the
  // current. They remain targetable during the retreat and unload normally.
  for(const enemy of game.enemies){
    if(enemy.wildAssault!==site.attemptId||enemy.hp<=0)continue;
    const angle=Math.atan2(enemy.x-site.x,enemy.z-site.z);
    enemy.wildAssault=null;
    enemy.wildRetreat={angle,until:game.time+9};
    enemy.speed*=1.46;
    enemy.shootCD=Math.max(enemy.shootCD,5.4);
    enemy.wonderHaste=1;
  }
  if(!success)return;
  game.choices=Object.entries(WILD_RELICS).map(([id,data])=>({id,kind:'wild',...data}));
  game.wonders.normalRewardAt=game.time+2.4;
  game.wonders.bossReadyAt=game.time+5;
  game.status='upgrade';
  game.emit('upgrade',{source:'wild'});
}

export function claimWildRelic(game,choice) {
  if(choice.kind!=='wild'||!Object.hasOwn(WILD_RELICS,choice.id))return false;
  game.wonders.relics.wild=choice.id;
  game.wonders.wildDash=null;
  game.wonders.breakwater=null;
  game.p.dashCD=0;
  game.p.invul=Math.max(game.p.invul,1.05);
  game.p.qi=Math.min(100,game.p.qi+25);
  game.gainMass(game.p.density*1.8);
  game.wonders.metrics.relics++;
  game.emit('wonder',{kind:'wild',action:'relic',...point(game.p),title:choice.title,effect:choice.detail,relic:choice.id});
  return true;
}

export function startWildDash(game) {
  if(!game.wonders.relics.wild)return;
  game.wonders.wildDash={from:point(game.p)};
}

function lowFlight(game) {
  if(game.stage<3)return game.p.y<=1.9;
  const {x,z}=game.p;
  const floor=Math.max(flightBand(3)[0],(game.terrainHeight?.(x,z)??-Infinity)+.8);
  return game.p.y<=floor+4.8;
}

export function updateWildDash(game) {
  const {p,wonders}=game;
  if(wonders.breakwater&&game.time>=wonders.breakwater.until)wonders.breakwater=null;
  if(!wonders.wildDash||p.dash>0)return;
  const {from}=wonders.wildDash;
  wonders.wildDash=null;
  const to=point(p);
  if(wonders.relics.wild==='undertow'&&lowFlight(game)){
    game.addZone('rain',{...to,radius:7.2,power:2,life:3.5,weapon:'undertow'});
    game.addZone('storm',{...to,radius:6.5,power:3,life:3.5,weapon:'undertow'});
    game.emit('wonderArtifact',{kind:'tether',action:'undertow',...to,from,to,points:[from,to],links:[],radius:6.5,duration:.82});
  }else if(wonders.relics.wild==='breakwater'){
    const barrier={...to,radius:4.7,until:game.time+2.55,charges:6};
    wonders.breakwater=barrier;
    game.emit('wonderArtifact',{kind:'mirror',action:'breakwater',...to,from,to,radius:barrier.radius,duration:2.55});
  }
}

export function absorbBreakwater(game,from,projectile) {
  const wall=game.wonders.breakwater;
  if(!wall||wall.charges<=0||game.time>=wall.until||projectile.life<=0||projectile.oathSite)return false;
  const x=projectile.x-from.x,y=projectile.y-from.y,z=projectile.z-from.z;
  const s=clamp(((wall.x-from.x)*x+(wall.y-from.y)*y+(wall.z-from.z)*z)/Math.max(.001,x*x+y*y+z*z),0,1);
  const hit={x:from.x+s*x,y:from.y+s*y,z:from.z+s*z};
  if(Math.abs(hit.y-wall.y)>1.9||distance(hit,wall)>wall.radius)return false;
  wall.charges--;
  const stage=game.stage;
  const damage=(projectile.damage??11)*.75+game.stats().damage*.45;
  let count=0;
  for(const enemy of game.enemiesNear(wall,wall.radius+.75)){
    if(count>=11)break;
    if(enemy.hp<=0||Math.abs(enemy.y-wall.y)>2.35||distance(enemy,wall)>wall.radius+enemy.radius)continue;
    enemy.wet=Math.max(enemy.wet,4);
    game.damage(enemy,damage,'water',wall);
    count++;
    if(game.stage!==stage||game.status!=='playing')break;
  }
  game.emit('wonderArtifact',{kind:'mirror',action:'intercept',...hit,from:point(from),to:point(wall),radius:wall.radius,duration:.42,count});
  return true;
}
