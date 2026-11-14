import { clamp, flightBand, TAU } from './rules.js';

const COUNT = 2500;
const DURATION = 45;
const GOAL = 1500;
const GOLD_GOAL = 1750;
const HEAL_WINDOW = .85;
const HEAL_REACH = 4;
const STRIKE_LEAD = 1.65;
const STRIKE_RADIUS = 3.2;
const GOLDEN_ANGLE = 2.399963229728653;
const REGROUP_DISTANCE = 48;
const REGROUP_INTERVAL = .72;
const REGROUP_LIMIT = 44;
const STORM_START_RADIUS = 45;
const STORM_END_RADIUS = 32;
const STORM_GRACE = 1.1;
const [SURFACE, CEILING] = flightBand(2);
const BEARINGS = [.62, -.62, 0, 1.24, -1.24, 1.88, -1.88, 2.51, -2.51, Math.PI];
const SHOALS = [
  {until:900,at:0,radius:0},
  {until:1500,at:11,radius:25},
  {until:2025,at:22,radius:30},
  {until:COUNT,at:33,radius:34},
];

export function beginSeaDrill(game, types) {
  game.evolve();
  game.evolve();
  game.events.length=0;
  game.gainMass(18*game.p.density);
  const cultivation=game.cultivation;
  cultivation.weapons=['bubble','coil','torrent','spark','ember','thundercloud'].map(id=>cultivation.makeWeapon(id,3));
  cultivation.cascade='thunder';
  cultivation.cascadeRank=3;
  cultivation.invalidateModifiers();
  game.wonders.relics.sword=2;
  const {p}=game;
  game.drill={count:COUNT,duration:DURATION,goal:GOAL,goldGoal:GOLD_GOAL,grade:null,
    nextRegroupAt:0,regrouped:0,surge:0,shoal:0,nextHealAt:0,nextStrikeAt:4.5,strike:null,
    storm:{x:p.x,z:p.z,radius:STORM_START_RADIUS,distance:0,outside:false,warning:false,expiresIn:0,
      outsideSince:null,nextHitAt:Infinity}};
  const roster=[types.eel,types.seaRay,types.polyp];
  let shoal=0;
  for(let i=0;i<COUNT;i++){
    if(i>=SHOALS[shoal].until)shoal++;
    const theta=i*GOLDEN_ANGLE;
    const radius=9+26*Math.sqrt(i/COUNT);
    const type=i%13===0?types.cloudRay:roster[i%roster.length];
    const enemy=game.spawnEnemy(type,p.x+Math.cos(theta)*radius,p.z+Math.sin(theta)*radius);
    enemy.hp=enemy.maxHp*=2.4;
    enemy.shootCD+=i%9*.25;
    enemy.drillShoal=shoal;
    enemy.drillRallyAt=shoal ? SHOALS[shoal].at+(i%17)*.13 : 0;
  }
}

/** Close kills give a little breathing room. Returning to a shed tail heals more. */
export function rewardSeaDrillKill(game, enemy) {
  const {p,drill} = game;
  if (game.time < drill.nextHealAt || p.mass >= game.stats().maxMass ||
      (p.x-enemy.x)**2+(p.y-enemy.y)**2+(p.z-enemy.z)**2 > HEAL_REACH**2) return;
  game.gainMass(p.density*.36);
  drill.nextHealAt = game.time + HEAL_WINDOW;
  game.showAutoMeal({id:enemy.id,x:enemy.x,y:enemy.y,z:enemy.z,rank:1,phase:enemy.phase,foodHeading:enemy.angle,battleLoot:true});
}

export function seaDrillDamage(game, amount) {
  return amount * (2.28 + .52 * game.drill.shoal / (SHOALS.length-1));
}

/** The outer shoals remain in play and attack after their wide pass. */
export function paceSeaDrillEnemy(game, enemy, dt, angle, distance) {
  if (game.time >= enemy.drillRallyAt) return false;
  const wave = Math.sin(enemy.phase);
  const desired = SHOALS[enemy.drillShoal].radius + wave*2.1;
  const correction = clamp((distance-desired)/7,-1,1);
  const side = wave<0 ? -1 : 1;
  const heading = angle + Math.atan2(side*.92,correction*1.65);
  const delta = Math.atan2(Math.sin(heading-enemy.angle),Math.cos(heading-enemy.angle));
  enemy.angle += delta * Math.min(1,dt*5);
  const speed = enemy.speed * (1.12+Math.abs(correction)*1.62);
  enemy.x += Math.sin(enemy.angle)*speed*dt;
  enemy.z += Math.cos(enemy.angle)*speed*dt;
  if (enemy.habitat === 'sky') {
    enemy.y += (clamp(game.p.y-.65+wave*.64,SURFACE,CEILING)-enemy.y)*Math.min(1,dt*1.45);
  }
  return true;
}

function regroupSite(game) {
  const {p,drill} = game;
  const {storm} = drill;
  const side = drill.surge%2===0 ? 1 : -1;
  for (const distance of [34,27]) for (const offset of BEARINGS) {
    const angle = p.angle + side*offset;
    const x = p.x + Math.sin(angle)*distance;
    const z = p.z + Math.cos(angle)*distance;
    if ((x-storm.x)**2+(z-storm.z)**2 < (storm.radius-3)**2 && !game.onLand(x,z,1.6)) return {x,z};
  }
  return null;
}

function updateStorm(game) {
  const {p,time,drill:{storm}} = game;
  const shrink = clamp((time-7)/(DURATION-7),0,1);
  storm.radius = STORM_START_RADIUS-(STORM_START_RADIUS-STORM_END_RADIUS)*shrink;
  storm.distance = Math.hypot(p.x-storm.x,p.z-storm.z);
  const excess = storm.distance-storm.radius;
  storm.outside = excess>0;
  storm.warning = excess>-5;
  if (!storm.outside) {
    storm.outsideSince = null;
    storm.nextHitAt = Infinity;
    storm.expiresIn = 0;
    return;
  }
  if (storm.outsideSince === null) {
    storm.outsideSince = time;
    storm.nextHitAt = time+STORM_GRACE;
  }
  storm.expiresIn = Math.max(0,storm.nextHitAt-time);
  if (time+1e-6<storm.nextHitAt || p.invul>0) return;
  const damage = 21 + Math.min(42,excess*1.25 + (time-storm.outsideSince)*4);
  storm.nextHitAt = time+.95;
  game.hurt(damage,p);
}

function updateTideLightning(game, dt) {
  const {p,drill} = game;
  const strike = drill.strike;
  if (strike && game.time + 1e-6 >= strike.resolveAt) {
    drill.strike = null;
    const inside = (p.x-strike.x)**2+(p.z-strike.z)**2 < strike.radius**2;
    const hit = inside && p.invul<=0;
    const to = {x:strike.x,y:.7,z:strike.z};
    game.emit('arc',{from:{...to,y:16},to,power:4,source:'tide-lightning',conductive:true});
    game.emit('hazardImpact',{...to,id:strike.id,stage:game.stage,attack:strike.attack,
      radius:strike.radius,hit,inside,surface:true});
    if (hit) game.hurt(68,p);
  }
  const from = drill.lastPose;
  drill.lastPose = {x:p.x,z:p.z,angle:p.angle};
  if (!from || drill.strike || game.time + 1e-6 < drill.nextStrikeAt ||
      game.time + STRIKE_LEAD > drill.duration) return;

  const distance = Math.min(Math.hypot(p.x-from.x,p.z-from.z)/dt,game.stats().speed) * STRIKE_LEAD;
  const yaw = (p.angle-from.angle) * STRIKE_LEAD / dt;
  const chord = Math.abs(yaw)<.001 ? distance : distance*2*Math.sin(yaw*.5)/yaw;
  const angle = p.angle+yaw*.5;
  const x = p.x+Math.sin(angle)*chord;
  const z = p.z+Math.cos(angle)*chord;
  const id = game.nextId++;
  const mark = {id,x,y:p.y,z,radius:STRIKE_RADIUS,life:STRIKE_LEAD,maxLife:STRIKE_LEAD,
    resolveAt:game.time+STRIKE_LEAD,warning:true,previewOnly:true,surface:true,attack:'tide-lightning'};
  drill.strike = mark;
  drill.nextStrikeAt = game.time + 4.9 - drill.shoal*.47;
  game.hazards.push(mark);
  game.emit('warning',{...mark,duration:STRIKE_LEAD});
}

/** Herd existing distant survivors back into the fight without creating new kills. */
export function updateSeaDrill(game, dt) {
  const {drill,p} = game;
  updateStorm(game);
  if (game.status!=='playing') return;
  updateTideLightning(game, dt);
  if (game.status!=='playing') return;
  const next = SHOALS[drill.shoal+1];
  if (next && game.time >= next.at) {
    const shoal = ++drill.shoal;
    let nearest = null, distance = Infinity, count = 0;
    for (const enemy of game.enemies) {
      if (enemy.hp <= 0 || enemy.drillShoal !== shoal) continue;
      const separation = (enemy.x-p.x)**2+(enemy.z-p.z)**2;
      if (separation < distance) {
        distance = separation;
        nearest = enemy;
      }
      count++;
    }
    if (nearest) game.emit('drillSurge',{x:nearest.x,y:nearest.y,z:nearest.z,count,shoal});
  }
  if (game.time < drill.nextRegroupAt) return;
  drill.nextRegroupAt = game.time + REGROUP_INTERVAL;

  const site = regroupSite(game);
  if (!site) return;
  let count = 0, slot = 0;
  for (const enemy of game.enemies) {
    if (enemy.hp<=0 || (enemy.x-p.x)**2+(enemy.z-p.z)**2 < REGROUP_DISTANCE**2) continue;
    const angle = slot*GOLDEN_ANGLE + drill.surge*.82;
    const radius = Math.sqrt((slot++ % REGROUP_LIMIT)/REGROUP_LIMIT)*5.4;
    const x = site.x + Math.cos(angle)*radius;
    const z = site.z + Math.sin(angle)*radius;
    const storm = drill.storm;
    if ((x-storm.x)**2+(z-storm.z)**2 >= storm.radius**2 || game.onLand(x,z,.68)) continue;
    const oldX = enemy.x, oldZ = enemy.z;
    Object.assign(enemy,{x,z,angle:Math.atan2(p.x-x,p.z-z),weaponPush:null});
    enemy.shootCD = Math.max(enemy.shootCD,1.25+enemy.phase/TAU*2);
    game.enemyGrid.relocate(game.enemies,enemy,oldX,oldZ);
    if (++count === REGROUP_LIMIT) break;
  }
  if (!count) return;
  drill.regrouped += count;
  drill.surge++;
  game.emit('drillSurge',{...site,y:1,count});
}

export function finishSeaDrill(game) {
  if(game.status!=='playing'||game.time+1e-6<game.drill.duration)return false;
  game.status='won';
  const {drill,kills} = game;
  drill.grade = kills >= drill.goldGoal ? 'gold' : kills >= drill.goal ? 'silver' : 'bronze';
  game.emit('end',{win:true,drill:true,grade:drill.grade});
  return true;
}
