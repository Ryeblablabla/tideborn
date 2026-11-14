import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STAGES, validateSave } from '../src/model.js';
import { DENSITY, distance3 } from '../src/simulation.js';
import { ENEMY_CAPACITY } from '../src/enemy-grid.js';
import { MotionReader, sampleSpine, insidePolygon } from '../src/motion.js';
import { attackOrigin, fireTechnique, previewAttackIntent, updateWeaponCombat } from '../src/weapon-combat.js';
import { techniqueStats } from '../src/cultivation.js';
import { openCascadeFollowThrough, sendGaleSpore, updateCascade } from '../src/cascades.js';
import { WeaponStrokes } from '../src/ink/weapon-strokes.js';
import { Scene } from 'three';
const tick=(g,n,input={})=>{for(let i=0;i<n*60;i++){g.step(1/60,input);g.events=[];}};
test('an overlapping elemental clear saves one discharge for a separate living group',()=>{
  const game=new Game({seed:7,starter:'bubble'});
  game.stage=2;
  Object.assign(game.cultivation,{cascade:'poison',cascadeRank:2});
  game.activeDragonArt={id:101,kind:'abyss',stage:2,startedAt:0,radius:16,height:4,
    center:{x:0,y:.7,z:0},hitTargets:new Set()};
  const first=Array.from({length:5},(_,i)=>game.spawnEnemy(0,-6+i*.25,5,.7));
  const wing=Array.from({length:5},(_,i)=>game.spawnEnemy(0,15.0+i*.25,5,.7));
  game.time=.4;
  game.damage(first[0],10000,'poison',game.p);
  game.damage(first[1],10000,'poison',game.p);
  assert.equal(game.events.filter(e=>e.type==='cascadeReserve').length,1);
  const announced=game.events.find(e=>e.type==='cascadeHandoffAim');
  assert.equal(announced.stage,2);
  assert.deepEqual(new Set(announced.receiverIds),new Set(wing.map(enemy=>enemy.id)));
  assert.equal(announced.retargeted,false);
  assert.equal(game.activeCascade,undefined);
  game.time=1.3;
  updateCascade(game,0);
  assert.equal(game.activeCascade,undefined);
  for(const enemy of first)game.activeDragonArt.hitTargets.add(enemy.id);
  game.activeDragonArt=null;
  updateCascade(game,0);
  game.time=1.6;
  updateCascade(game,0);
  assert.deepEqual(new Set(game.activeCascade.handoff.receiverIds),new Set(wing.map(enemy=>enemy.id)));
  assert.equal(game.activeCascade.handoff.aimId,announced.id);
  assert.deepEqual(game.activeCascade.handoff.to,announced.to);
  assert.ok(game.activeCascade.handoff.firstPulseAt>=1.6+.36);
  assert.equal(game.events.filter(e=>e.type==='cascadeStart').length,1);
  game.time=2.2;
  updateCascade(game,0);
  assert.ok(game.events.filter(e=>e.type==='cascadeHit').some(e=>wing.some(enemy=>e.targetId===enemy.id)));
});
test('a lost handoff group is replaced explicitly before the new group receives poison',()=>{
  const game=new Game({seed:7,starter:'bubble'});
  game.stage=2;
  Object.assign(game.cultivation,{cascade:'poison',cascadeRank:2});
  const art=game.activeDragonArt={id:105,kind:'abyss',stage:2,startedAt:0,radius:12,height:4,
    center:{x:0,y:.7,z:0},hitTargets:new Set()};
  const formation=(x,z)=>Array.from({length:5},(_,i)=>game.spawnEnemy(0,x+i*.25,z,.7));
  const inner=formation(-6,5), first=formation(14,5);
  const behind=formation(1,-19);
  game.time=.4;
  game.damage(inner[0],10000,'poison',game.p);
  const initial=game.events.find(e=>e.type==='cascadeHandoffAim');
  assert.deepEqual(new Set(initial.receiverIds),new Set(first.map(enemy=>enemy.id)));
  assert.equal(game.activeCascade,undefined);
  first.forEach(enemy=>{enemy.hp=0;});
  const second=formation(-14,7);
  game.time=.6;
  game.enemyGrid.invalidate();
  updateCascade(game,0);
  game.time=.9;
  updateCascade(game,0);
  const cancellation=game.events.find(e=>e.type==='cascadeHandoffCancel');
  const replacement=game.events.filter(e=>e.type==='cascadeHandoffAim').at(-1);
  assert.equal(cancellation.reason,'group-lost');
  assert.equal(replacement.id,initial.id);
  assert.equal(replacement.revision,2);
  assert.equal(replacement.retargeted,true);
  assert.deepEqual(replacement.previousTo,initial.to);
  assert.deepEqual(new Set(replacement.receiverIds),new Set(second.map(enemy=>enemy.id)));
  for (const enemy of inner) art.hitTargets.add(enemy.id);
  game.activeDragonArt=null;
  game.time=1.2;
  updateCascade(game,0);
  assert.equal(game.activeCascade,undefined);
  game.time=1.5;
  updateCascade(game,0);
  const {handoff}=game.activeCascade;
  assert.equal(handoff.aimId,replacement.id);
  assert.equal(handoff.revision,replacement.revision);
  assert.deepEqual(handoff.to,replacement.to);
  game.time=handoff.firstPulseAt-.001;
  updateCascade(game,0);
  assert.ok(!game.events.some(e=>e.type==='cascadeHit'));
  game.time=handoff.firstPulseAt+.001;
  updateCascade(game,0);
  const hits=game.events.filter(e=>e.type==='cascadeHit');
  assert.ok(hits.length && hits.every(e=>second.some(enemy=>enemy.id===e.targetId)));
  assert.ok(behind.every(enemy=>enemy.hp===enemy.maxHp));
});
test('a strong dragon-art clear can advance one compatible discharge onto a separate live group',()=>{
  const game = new Game({seed:7,starter:'bubble'});
  game.stage = 2;
  Object.assign(game.cultivation,{cascade:'water',cascadeRank:2});
  game.time = 8;
  game.nextDragonArtAt = 13;
  game.nextCascadeAt = 12;
  game.lastCascadeStartedAt = 3;
  game.cascadeFollowed = false;
  const source = {x:0,y:.7,z:3};
  const art = {id:110,kind:'stone',rank:2,stage:2,killCount:12,lastBreak:source,hitTargets:new Set()};
  const group = Array.from({length:5},(_,index)=>game.spawnEnemy(0,2+index*.36,12,.7));
  const oldTarget = game.spawnEnemy(0,2.3,12,.7);
  oldTarget.hp = oldTarget.maxHp = 10000;
  art.hitTargets.add(oldTarget.id);
  const killWith = element=>game.damage(game.spawnEnemy(0,2.3,12,.7),1e4,element,game.p);
  openCascadeFollowThrough(game,art);
  killWith('bubble');
  const aim = game.events.find(event=>event.type==='cascadeHandoffAim'&&event.afterClear);
  assert.deepEqual(new Set(aim.receiverIds),new Set(group.map(enemy=>enemy.id)));
  assert.equal(aim.artId,art.id);
  assert.equal(game.activeCascade,undefined);
  updateCascade(game,0);
  game.time = 8.31;
  updateCascade(game,0);
  const {handoff} = game.activeCascade;
  assert.equal(handoff.afterClear,true);
  assert.equal(game.nextDragonArtAt,13);
  assert.equal(game.nextCascadeAt,12);
  assert.equal(game.cascadeAfterClear,null);
  game.time = handoff.firstPulseAt+.01;
  updateCascade(game,0);
  assert.ok(game.events.some(event=>event.type==='cascadeHit'&&event.killed&&handoff.receiverIds.includes(event.targetId)));
  assert.equal(oldTarget.hp,10000);
  game.time = 10.3;
  updateCascade(game,0);
  openCascadeFollowThrough(game,{...art,id:111});
  killWith('bubble');
  assert.equal(game.events.filter(event=>event.type==='cascadeReserve'&&event.afterClear).length,1);
});

function runDoctrine(route,doctrine,arrange) {
  const game=new Game({seed:7,starter:'bubble'});
  game.stage=3;
  Object.assign(game.p,{x:0,y:10,z:0,angle:0});
  Object.assign(game.cultivation,{cascade:route,cascadeRank:3,cascadeDoctrine:doctrine});
  const foe=(x,z,y=10,wet=true)=>{
    const enemy=game.spawnEnemy(10,x,z,y);
    enemy.y=y;
    enemy.wet=wet?4:0;
    return enemy;
  };
  const seed=foe(0,6);
  const formations=arrange(foe);
  const source={water:'bubble',thunder:'lightning',fire:'fire',poison:'mist',wind:'tail'}[route];
  game.damage(seed,10000,source,game.p);
  for(let i=1;i<=160;i++){
    game.time=i/60;
    formations.move?.(game.time);
    updateCascade(game,1/60);
  }
  const hits=game.events.filter(event=>event.type==='cascadeHit');
  const pulses=game.events.filter(event=>event.type==='cascadePulse');
  return {formations,hits,pulses};
}

test('water doctrine chooses a two-sided wet split or a longer narrow lane',()=>{
  const arrange=foe=>({near:[foe(0,3),foe(.6,4),foe(.2,5),foe(-.6,5)],
    wings:[foe(-9,12),foe(9,12)],far:[foe(0,23)]});
  const fan=runDoctrine('water','fan',arrange);
  const lane=runDoctrine('water','lane',arrange);
  const hasHit=({formations,hits},name)=>formations[name].every(foe=>hits.some(hit=>hit.targetId===foe.id));
  assert.deepEqual(fan.pulses.filter(event=>event.detail==='fan-crest'&&event.preparing).map(event=>event.leg),[-1,1]);
  assert.ok(hasHit(fan,'wings'));
  assert.ok(!hasHit(fan,'far'));
  assert.ok(hasHit(lane,'far'));
  assert.ok(!hasHit(lane,'wings'));
  assert.ok(lane.pulses.every(event=>event.detail==='lane-crest'));
});

test('thunder doctrine climbs to wet targets or sends two flat branches',()=>{
  const arrange=foe=>({near:[foe(0,6),foe(.7,6),foe(-.6,6),foe(0,7)],
    high:[foe(0,11,16.5)],wings:[foe(-9,12.8),foe(9,12.8)],dry:[foe(1,11,16.5,false)]});
  const rise=runDoctrine('thunder','rise',arrange);
  const fork=runDoctrine('thunder','fork',arrange);
  const contact=(run, detail, name)=>run.formations[name].every(foe=>run.hits.some(hit=>hit.detail===detail&&hit.targetId===foe.id));
  assert.ok(contact(rise,'rise-bolt','high'));
  assert.ok(!contact(rise,'rise-bolt','dry'));
  assert.ok(contact(fork,'fork-bolt','wings'));
  assert.ok(!contact(fork,'fork-bolt','high'));
  for(const run of [rise,fork]) {
    assert.equal(new Set(run.hits.map(hit=>hit.targetId)).size,run.hits.length);
    for(const contact of run.hits.filter(hit=>hit.leg)){
      assert.ok(run.pulses.some(event=>event.preparing&&event.leg===contact.leg&&event.receiverIds.includes(contact.targetId)));
    }
  }
});

test('a second fire transfer can only carry a kill from its first receiving group',()=>{
  const arrange=foe=>({kindling:[foe(-1,5),foe(1,5),foe(-2,6),foe(2,6)],
    first:[foe(0,18),foe(.45,18),foe(-.45,18)],
    second:[foe(0,27),foe(1,27),foe(-1,27)]});
  const relay=runDoctrine('fire','cinder',arrange);
  const rings=runDoctrine('fire','crown',arrange);
  const launches=relay.pulses.filter(event=>event.detail==='cinder-path'&&event.preparing);
  assert.equal(launches.length,2);
  const landing=relay.hits.filter(hit=>hit.detail==='cinder-path'&&hit.leg===1&&hit.killed);
  assert.ok(landing.some(hit=>hit.targetId===launches[1].sources[0].targetId));
  assert.ok(relay.formations.second.every(enemy=>relay.hits.some(hit=>hit.targetId===enemy.id&&hit.leg===2)));
  assert.deepEqual(rings.pulses.filter(event=>event.detail==='crown-ring'&&!event.preparing).map(event=>event.radius),[5.3,9.2,13.2]);
});

test('a poison knot moves with a surviving host and bursts at the new live group',()=>{
  const arrange=foe=>{
    const carriers=Array.from({length:4},(_,index)=>foe(-.6+index*.36,6));
    const others=Array.from({length:3},(_,index)=>foe(-.4+index*.36,19));
    return {carriers,others,move:time=>{
      if(time>.46)for(const carrier of carriers)carrier.z=6+Math.min(9,(time-.46)*18);
    }};
  };
  const {formations,pulses,hits}=runDoctrine('poison','host',arrange);
  const carry=pulses.find(event=>event.detail==='host-knot'&&!event.preparing&&event.receiverIds.length>=2);
  assert.ok(carry);
  assert.ok(carry.to.z-carry.from.z>5);
  assert.ok(formations.carriers.some(enemy=>enemy.id===carry.carrierId));
  assert.ok(formations.others.every(enemy=>hits.some(hit=>hit.targetId===enemy.id&&hit.detail==='host-knot'&&hit.killed)));
});

test('wind can implode around a stationary eye or take a moving cut through a separate cohort',()=>{
  const arrange=foe=>({near:[foe(0,3),foe(.6,4),foe(-.6,4),foe(0,7)],
    far:[foe(0,19),foe(.8,20),foe(-.6,20)],outer:[foe(2,33),foe(1,34),foe(3,34)]});
  const gyre=runDoctrine('wind','gyre',arrange);
  const gale=runDoctrine('wind','gale',arrange);
  const gathering=gyre.pulses.filter(event=>event.detail==='gyre-core');
  assert.equal(gathering.length,2);
  assert.ok(gathering[0].preparing&&gathering[1].receiverIds.length>=4);
  assert.deepEqual(gathering.map(event=>[event.x,event.y,event.z]),[[0,10,6],[0,10,6]]);
  const storm=gale.pulses.filter(event=>event.detail==='gale-run'&&!event.preparing);
  assert.equal(storm.length,2);
  assert.deepEqual(storm[1].from,storm[0].to);
  assert.ok(storm[1].to.z>30);
  assert.ok(gale.formations.outer.every(enemy=>gale.hits.some(hit=>hit.targetId===enemy.id&&hit.leg===2)));
  assert.ok(gyre.formations.outer.every(enemy=>gyre.hits.every(hit=>hit.targetId!==enemy.id)));
});

test('a physically carried poison seed can sweep both free flanks when upgraded',()=>{
  for(const tier of [1,2]) {
    const game=new Game({seed:7,starter:'bubble'});
    game.stage=2;
    Object.assign(game.cultivation,{cascade:'wind',cascadeRank:3,cascadeDoctrine:'gale'});
    const wing=side=>[-1,0,1].map((offset)=>game.spawnEnemy(0,side*(11+offset),8,.7));
    const left=wing(-1), right=wing(1), host=game.spawnEnemy(0,0,7,.7);
    const windHit=game.spawnEnemy(0,12,8,.7);
    const center={x:0,y:.7,z:5};
    const cascade={id:999,kind:'wind',rank:3,doctrine:'gale',stage:2,center,direction:{x:0,z:1},started:0,
      duration:1.6,targets:new Set([windHit.id]),hitLimit:40,hits:0,kills:0,pending:[],power:1,clearedRadius:0,
      windGather:{carried:new Set([host.id])}};
    const seed={id:1000,host,tier,radius:3,galeCarry:{cascade,from:center,travel:2,path:[center],pulledAt:.5,direction:{x:0,z:1}}};
    game.time=.5;
    game.activeCascade=cascade;
    sendGaleSpore(game,seed,{id:1001});
    const starts=game.events.filter(event=>event.detail==='gale-spore-front'&&event.preparing);
    assert.equal(starts.length,tier);
    assert.ok([...left,...right].every(enemy=>enemy.poison===0));
    game.time=1.5;
    updateCascade(game,1/60);
    const hits=game.events.filter(event=>event.detail==='gale-spore-hit');
    assert.equal(hits.length,tier*3);
    assert.equal(new Set(hits.map(event=>event.targetId)).size,hits.length);
    assert.ok(hits.every(hit=>starts.some(start=>start.leg===hit.leg&&start.receiverIds.includes(hit.targetId))));
    assert.equal(windHit.poison,0);
  }
});

test('a mature gale seed can wait for a genuinely later opposite group once',()=>{
  for(const arrives of [true,false]) {
    const game=new Game({seed:7,starter:'bubble'});
    game.stage=2;
    Object.assign(game.cultivation,{cascade:'wind',cascadeRank:3,cascadeDoctrine:'gale'});
    const wing=side=>[-1,0,1].map(offset=>game.spawnEnemy(0,side*(11+offset),8,.7));
    const first=wing(-1),host=game.spawnEnemy(0,0,7,.7);
    const center={x:0,y:.7,z:5};
    const cascade={id:999,kind:'wind',rank:3,doctrine:'gale',stage:2,center,direction:{x:0,z:1},started:0,duration:1.6,
      targets:new Set(),hitLimit:40,hits:0,kills:0,pending:[],power:1,clearedRadius:0,windGather:{carried:new Set([host.id])}};
    const seed={id:1000,host,tier:2,radius:3,galeCarry:{cascade,from:center,travel:2,path:[center],pulledAt:.5,direction:{x:0,z:1}}};
    game.time=.5;
    game.activeCascade=cascade;
    sendGaleSpore(game,seed,{id:1001});
    assert.ok(game.galeSporeHold);
    assert.equal(game.events.filter(event=>event.detail==='gale-spore-front'&&event.preparing).length,1);
    game.time=1.35;
    updateCascade(game,1/60);
    const second=arrives?wing(1):[];
    game.time=1.70;
    updateCascade(game,1/60);
    game.time=2.65;
    updateCascade(game,1/60);
    const hits=game.events.filter(event=>event.detail==='gale-spore-hit');
    assert.deepEqual(hits.filter(event=>event.leg===3).map(hit=>hit.targetId).sort(),first.map(enemy=>enemy.id).sort());
    assert.deepEqual(hits.filter(event=>event.leg===4).map(hit=>hit.targetId).sort(),second.map(enemy=>enemy.id).sort());
    assert.equal(game.galeSporeHold,null);
  }
});
test('damage physically shortens the body and recovered tissue does not grant essence',()=>{
 const g=new Game({seed:3}),before=g.p.body,hp=g.p.hp;g.hurt(40);assert.ok(g.p.body<before);assert.ok(g.p.hp<hp);const shed=g.food.filter(f=>f.shed);assert.ok(shed.length);const remaining=g.p.mass,essence=g.essence;for(const f of shed)g.eat(f);assert.ok(g.p.mass>remaining);assert.ok(g.p.mass<12.5);assert.equal(g.essence,essence);assert.equal(g.eaten,0);
});
test('condensation shortens a grown body and retains organs and damage strength',()=>{
 const g=new Game();g.gainMass(20);g.buffs.fire=3;const n=g.p.body,hp=g.p.hp,damage=g.stats().damage;
 g.evolve();assert.equal(g.form,2);assert.ok(g.p.body<n);assert.ok(g.p.density>1);assert.ok(g.p.hp>hp);assert.equal(g.buffs.fire,3);assert.ok(g.stats().damage>damage);assert.equal(g.metrics.condensed,1);
});
test('overflow growth does not increase body mass or damage beyond the cap',()=>{
  const g=new Game();
  g.gainMass(100);
  assert.equal(g.p.mass,g.stats().maxMass);
  const damage=g.stats().damage;
  g.gainMass(100);
  assert.equal(g.p.mass,g.stats().maxMass);
  assert.equal(g.stats().damage,damage);
});
test('staying still and tiny input jitter never casts a pose',()=>{const g=new Game();g.food=[];g.foodCD=100;g.spawnCD=100;for(let i=0;i<400;i++)g.step(1/60,{x:i%2?.02:-.02});assert.equal(g.metrics.wind+g.metrics.serpent+g.metrics.rings,0);});
test('continuous circular movement generates wind and a real body loop',()=>{
 const g=new Game();g.gainMass(20);g.spawnCD=100;g.food=[];g.foodCD=100;
 for(let i=0;i<900;i++){const a=i/60*1.8;g.step(1/60,{x:Math.cos(a),z:-Math.sin(a)});g.events=[];}
 assert.ok(g.metrics.wind>0,'circling should generate wind');assert.ok(g.metrics.rings>0,'the actual long body must enclose space');assert.ok(g.metrics.bursts>0,'leaving or tightening a loop releases it');
});
test('alternating broad S bends trigger a serpent discharge',()=>{
 const motion=new MotionReader();let n=0;for(let i=0;i<600;i++){const z=i*.045,x=Math.sin(z*1.2)*2.2,p={x,z,y:.7};const pose=motion.update(p,i/60,[]);if(pose.sTrigger)n++;}assert.ok(n>=1);
});
test('a head trajectory cannot close a ring without enough physical body',()=>{
 const motion=new MotionReader();let loops=0;for(let i=0;i<400;i++){const a=i*.025,p={x:5*Math.cos(a),z:5*Math.sin(a),y:.7};if(motion.update(p,i/60,[p,{x:p.x-1,z:p.z,y:.7}]).loop)loops++;}assert.equal(loops,0);
});
test('ring release damages contained enemies, not enemies outside the polygon',()=>{
 const g=new Game();const inside=g.spawnEnemy(0,0,0),outside=g.spawnEnemy(0,8,0);inside.hp=outside.hp=10000;g.ring=g.addZone('ring',{x:0,y:.7,z:0,polygon:[{x:-3,z:-3},{x:3,z:-3},{x:3,z:3},{x:-3,z:3}],radius:3,charge:3});g.releaseRing();assert.ok(inside.hp<10000);assert.equal(outside.hp,10000);
});
test('a wind field pulls crowds and picks up poison and fire',()=>{
 const g=new Game();const e=g.spawnEnemy(0,3,0);const wind=g.addZone('storm',{x:0,y:.7,z:0,radius:5,power:2});g.addZone('poison',{x:0,y:.7,z:0,radius:2});g.addZone('fire',{x:0,y:.7,z:0,radius:2});const before=e.x;g.updateFields(.05);assert.ok(e.x<before);assert.ok(wind.toxic>0);assert.ok(wind.flame>0);assert.ok(e.poison>0);assert.ok(e.burn>0);
});
test('fire and water produce steam, which lightning turns into an energetic thunder cloud',()=>{
 const g=new Game();g.addZone('rain',{x:0,y:.7,z:0,radius:3});g.addZone('fire',{x:0,y:.7,z:0,radius:3});g.updateFields(.05);const cloud=g.zones.find(z=>z.kind==='steam');assert.ok(cloud);const e=g.spawnEnemy(0,1,0);e.hp=10000;e.wet=5;g.lightning(e,2);assert.equal(cloud.kind,'thunder');assert.ok(cloud.energy>0);assert.ok(g.metrics.reactions>=2);
});
test('element fields and enemies stay bounded during chain reactions',()=>{
 const g=new Game();
 for(let i=0;i<400;i++)g.addZone(i%2?'fire':'steam',{x:i%30*2,y:.7,z:Math.floor(i/30)*2,radius:2});
 for(let i=0;i<ENEMY_CAPACITY+1;i++)g.spawnEnemy(0,i%15,Math.floor(i/15));
 assert.ok(g.zones.length<=28);
 assert.equal(g.enemies.length,ENEMY_CAPACITY);
 for(let i=0;i<100;i++)g.updateFields(.05);
 assert.ok(g.zones.length<=28);
});
test('airborne altitude changes physics, targeting and projectile collision',()=>{
 const g=new Game();g.stage=3;g.p.mass=20*DENSITY[3];g.syncBody();g.p.y=8;g.p.altitude=8;g.spawnCD=100;g.food=[];g.foodCD=100;const high=g.spawnEnemy(0,0,4,18);g.attackCD=0;g.shoot();assert.ok(g.shots[0].vy>0);const hp=g.p.hp;g.hazards.push({id:999,x:g.p.x,y:18,z:g.p.z,vx:0,vy:0,vz:0,life:1});g.step(.05);assert.equal(g.p.hp,hp);const y=g.p.y;tick(g,1,{lift:1});assert.ok(g.p.y>y);assert.ok(distance3(g.p,high)>0);
});
test('legacy saves retain currency and blessings while gaining bloodline research',()=>{const s=validateSave({version:1,jade:77,meta:{heart:2,fang:3,tide:1}});assert.equal(s.version,2);assert.equal(s.jade,77);assert.equal(s.meta.heart,2);assert.equal(s.meta.coil,0);assert.equal(s.meta.conduit,0);});
test('thunder clouds consume finite charge and cannot recharge themselves',()=>{const g=new Game();const cloud=g.addZone('thunder',{x:0,y:.7,z:0,radius:4,life:10});cloud.energy=2;const e=g.spawnEnemy(0,1,0);e.hp=1e6;for(let i=0;i<30;i++)g.updateFields(.1);assert.ok(cloud.energy<=0);});
test('field strength, radius and lifetime are capped for any caller',()=>{const g=new Game();const z=g.addZone('fire',{x:0,z:0,power:10000,radius:10000,life:10000});assert.ok(z.power<=8);assert.ok(z.radius<=10);assert.ok(z.life<=12);});
test('research unlocks echo formations and conductive remnants',()=>{
 const g=new Game({meta:{coil:1,conduit:1}});g.ring=g.addZone('ring',{x:0,y:.7,z:0,radius:3,charge:2,polygon:[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2}]});g.releaseRing();assert.equal(g.echoes.length,1);
 const e=g.spawnEnemy(0,1,0);e.hp=1;e.wet=4;g.lightning(e,2);assert.ok(g.zones.some(z=>z.kind==='thunder'&&z.energy>0));
});
test('the sea takeoff stays low and the mountain still spawns airborne food',()=>{const g=new Game();g.evolve();g.evolve();assert.equal(g.stage,2);tick(g,3);assert.ok(g.p.y<4.3);g.evolve();assert.ok(g.food.length>0&&g.food.every(f=>f.y>=7));tick(g,3);assert.ok(g.p.y>7);});
test('water chapters absorb kills once, even beyond pickup range',()=>{
  const game=new Game({seed:21});
  game.spawnCD=game.hordeCD=Infinity;
  for(let stage=0;stage<3;stage++){
    game.setShore(()=>-.3);
    game.refillFood();
    assert.equal(game.spawnFood(),null);
    game.step(.32);
    assert.equal(game.food.length,0);
    const enemy=game.spawnEnemy(0,game.p.x+12,game.p.z,game.p.y);
    const mass=game.p.mass,eaten=game.eaten;
    game.damage(enemy,enemy.hp/2);
    assert.equal(game.eaten,eaten);
    game.damage(enemy,enemy.hp);
    game.damage(enemy,1);
    assert.equal(game.eaten,eaten+1);
    assert.equal(game.food.length,0);
    assert.ok(game.p.mass>mass&&game.essence>0);
    const feedback=game.events.filter(event=>event.type==='absorb'&&event.stage===stage);
    assert.equal(feedback.length,1);
    assert.equal(feedback[0].essence,game.essence);
    assert.ok(feedback[0].growth>0);
    game.evolve();
  }
  assert.ok(game.food.some(item=>item.ambient));
});
test('ordinary kills alone can summon the mountain boss',()=>{
  const game=new Game({seed:21});
  game.stage=3;
  game.syncBody();
  game.spawnCD=game.hordeCD=game.foodCD=Infinity;
  for(let i=0;i<240&&game.essence<STAGES[3].need;i++){
    const enemy=game.spawnEnemy(10,12,11,10);
    game.damage(enemy,enemy.hp+1);
    game.enemies.pop();
  }
  assert.equal(game.food.length,0);
  assert.equal(game.essence,STAGES[3].need);
  game.step(1/60);
  assert.equal(game.choose(0),true);
  game.step(1/60);
  assert.equal(game.boss?.type,8);
});
test('training remains safe and never awards permanent currency or interrupts with upgrades',()=>{const g=new Game();g.practice=true;g.waveTime=60;g.time=60;g.kills=30;tick(g,2);assert.equal(g.status,'playing');assert.equal(g.reward(),0);const hp=g.p.hp;g.hurt(100);assert.equal(g.p.hp,hp);});
test('an airborne body settles into the cloud plane instead of hanging to the sea',()=>{const g=new Game();g.evolve();g.evolve();g.food=[];g.foodCD=100;g.spawnCD=100;tick(g,10);assert.ok(g.bodyPath.every(p=>Math.abs(p.y-g.p.y)<1));});
test('bosses expose distinct charge, pulse, armour and meteor mechanics',()=>{
  for(let stage=0;stage<4;stage++){
    const g=new Game({seed:11});
    g.stage=stage;
    g.summonBoss();
    g.boss.attack=0;
    g.attackCD=100;
    g.step(.05);
    if(stage===0){
      assert.ok(g.boss.lungeWindup>0);
      const lane=g.events.find(event=>event.type==='bossCharge');
      assert.ok(lane&&lane.width>0&&lane.to&&lane.duration>0);
    }
    if(stage===1){
      assert.equal(g.hazards.some(hazard=>hazard.wave),false);
      for(let i=0;i<24;i++)g.step(.05);
      const pulse=g.events.find(event=>event.type==='bossWave');
      const wave=g.hazards.find(hazard=>hazard.wave);
      assert.ok(pulse&&wave);
      assert.equal(pulse.gapWidth,wave.gapWidth);
      assert.equal(pulse.radius,wave.radius);
    }
    if(stage===2){
      assert.equal(g.boss.shield,true);
      const hp=g.boss.hp;
      g.damage(g.boss,100,'bubble');
      assert.ok(g.boss.hp>hp-100);
    }
    if(stage===3){
      const drops=g.hazards.filter(hazard=>hazard.warning);
      assert.equal(drops.length,3);
      assert.ok(drops[0].resolveAt<drops[1].resolveAt&&drops[1].resolveAt<drops[2].resolveAt);
    }
  }
});
test('mountain squads use native air roles even if requested through a legacy river type',()=>{
  const g=new Game({seed:23});
  g.stage=3;
  g.p.y=12;
  const cast=Array.from({length:28},()=>g.spawnEnemy());
  assert.deepEqual([...new Set(cast.map(enemy=>enemy.type))].sort((a,b)=>a-b),[3,10]);
  assert.ok(cast.every(enemy=>enemy.habitat==='sky'&&enemy.y>8&&enemy.y<20));
  const remapped=g.spawnEnemy(1,2,3,14);
  assert.equal(remapped.type,10);
  assert.equal(remapped.role,'escort');
});
test('overlapping or vertical bodies never show a completed ring without enclosed area',()=>{const r=new MotionReader(),p={x:0,y:8,z:0},spine=Array.from({length:15},(_,i)=>({x:0,y:8-i*.08,z:0}));const pose=r.update(p,1,spine);assert.equal(pose.loop,null);assert.ok(pose.ring<1);});

test('a tail sweep pushes a soaked enemy farther without adding a second hit',()=>{
  const strikes=wet=>{
    const game=new Game({seed:21});
    game.food=[];game.foodCD=game.spawnCD=game.hordeCD=Infinity;
    game.p.invul=10;
    game.cultivation.weapons=[{id:'tail',tier:1,uid:1,cd:0}];
    game.cultivation.invalidateModifiers();
    const origin=attackOrigin(game,'tail');
    const enemy=game.spawnEnemy(0,origin.x+2,origin.z,origin.y);
    enemy.speed=0;enemy.hp=200;enemy.maxHp=200;enemy.wet=wet?5:0;
    const x=enemy.x;
    tick(game,.9,{x:0,z:0});
    return {moved:enemy.x-x,hp:enemy.hp};
  };
  const dry=strikes(false),wet=strikes(true);
  assert.ok(dry.moved>.6&&wet.moved>dry.moved+.4);
  assert.equal(dry.hp,wet.hp);
  assert.ok(wet.hp<200);
});

test('a tail vortex trades remote reach for drawing extra enemies into the next sweep',()=>{
  function run(form, rear) {
    const game=new Game({seed:31,starter:'fang'});
    game.stage=2;
    game.food=[];
    game.foodCD=game.spawnCD=game.hordeCD=Infinity;
    Object.assign(game.p,{mass:120,peakMass:120,y:.8,altitude:.8,invul:10,manualHeightUntil:10});
    game.syncBody();
    game.trail=Array.from({length:130},(_,i)=>({x:0,y:.8,z:-i*.28,t:-i/60}));
    game.updatePose(0);
    const coil=game.cultivation.makeWeapon('coil',3);
    const tail=game.cultivation.makeWeapon('tail',2);
    tail.cd=.70;
    coil.temper=form;
    game.cultivation.weapons=[coil,tail];
    game.cultivation.invalidateModifiers();
    const origin=attackOrigin(game,'tail');
    const sweepEdge=techniqueStats(tail,game.cultivation.modifiers()).radius+.6;
    const positions=rear?[[sweepEdge-.35,origin.z],[sweepEdge+.33,origin.z],[0,origin.z-sweepEdge-.38]]:[[0,6.2],[.94,7.1],[-.84,5.8]];
    for(const [x,z] of positions)Object.assign(game.spawnEnemy(4,x,z,.8),{hp:300,maxHp:300,speed:0,shootCD:Infinity});
    for(let frame=0;frame<78;frame++)game.step(1/60,{x:0,z:0});
    return {origin,game,casts:game.events.filter(e=>e.type==='weaponCast'),
      hits:game.events.filter(e=>e.type==='hit'&&e.source==='tail')};
  }

  const remote=run('lasting-field',true);
  const close=run('tail-vortex',true);
  assert.equal(remote.casts.length,0);
  assert.equal(remote.hits.length,1);
  assert.equal(close.casts.length,1);
  assert.equal(close.casts[0].anchor,'tail');
  assert.deepEqual(close.casts[0].to,close.origin);
  assert.equal(close.hits.length,3);
  assert.ok(close.hits.every(hit=>hit.amount===remote.hits[0].amount));
  assert.equal(run('lasting-field',false).casts.length,1);
  assert.equal(run('tail-vortex',false).casts.length,0);

  const {game,origin}=close;
  const vortex=game.zones.find(zone=>zone.weaponAnchor==='tail');
  assert.ok(vortex);
  const ordinary=game.addZone('storm',origin);
  assert.notEqual(vortex,ordinary);
  game.addZone('rain',origin);
  game.updateFields(.016);
  assert.equal(vortex.rainfed,true);
});

test('a crowd of ready kites staggers its dives',()=>{
  const game=new Game({seed:41});
  game.stage=3;game.p.y=12;game.p.altitude=12;game.p.invul=10;
  game.food=[];game.foodCD=game.spawnCD=game.hordeCD=Infinity;
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    const enemy=game.spawnEnemy(3,6*Math.sin(angle),6*Math.cos(angle),14);
    enemy.shootCD=0;
  }
  const starts=[];
  for(let frame=0;frame<390;frame++){
    game.events=[];
    game.step(1/60,{x:0,z:0});
    for(const event of game.events)if(event.attack==='kite-dive')starts.push({time:game.time,id:event.enemyId});
    if(frame===0)assert.equal(starts.length,1);
  }
  assert.equal(new Set(starts.map(event=>event.id)).size,8);
  assert.ok(starts.slice(1).every((event,i)=>event.time-starts[i].time>.66));
});

test('wind pulls ordinary enemies without displacing a locked flight path',()=>{
  const game=new Game({seed:13});
  game.stage=3;game.p.y=13;game.p.altitude=13;
  const diver=game.spawnEnemy(3,3,4,13);
  diver.dive={from:{x:3,y:13,z:4},to:{x:0,y:13,z:0},releaseAt:1,duration:.48};
  const ordinary=game.spawnEnemy(10,-3,4,13);
  game.addZone('storm',{x:0,y:13,z:4,radius:4,power:1,life:2});
  game.updateFields(.05);
  assert.equal(diver.x,3);
  assert.ok(ordinary.x>-3);
});

test('a piercing shot chooses a row and actually hits through it',()=>{
  const game=new Game({seed:35});
  game.food=[];game.foodCD=game.spawnCD=game.hordeCD=Infinity;
  game.cultivation.weapons=[{id:'needle',tier:1,uid:1,cd:0}];
  game.cultivation.invalidateModifiers();
  const enemies=[[3,1],[0,5],[0,8]].map(([x,z])=>game.spawnEnemy(0,x,z,.7));
  for(const enemy of enemies){enemy.speed=0;enemy.hp=enemy.maxHp=200;}
  tick(game,.55);
  assert.equal(enemies[0].hp,200);
  assert.ok(enemies[1].hp<200&&enemies[2].hp<200);
});

test('tempered lightning branches only from a wet relay and hits one extra target',()=>{
  for(const [temper,wet,expected] of [['linked-arc',true,true],['linked-arc',false,false],['heavy-arc',true,false]]){
    const game=new Game({seed:57});
    const enemies=[[0,4],[0,7],[0,10],[0,13],[4,4],[5,4]].map(([x,z])=>game.spawnEnemy(0,x,z,.7));
    for(const enemy of enemies)enemy.hp=enemy.maxHp=200;
    enemies[0].wet=wet?5:0;
    const weapon=game.cultivation.makeWeapon('spark',2);
    weapon.temper=temper;
    assert.ok(fireTechnique(game,weapon));
    const arcs=game.events.filter(event=>event.type==='arc');
    const branch=arcs.filter(event=>event.branch);
    assert.equal(branch.length,Number(expected));
    assert.equal(enemies[4].hp<200,expected);
    assert.equal(enemies[5].hp,200);
    if(expected){
      assert.deepEqual(branch[0].from,{x:0,y:.7,z:4});
      assert.deepEqual(branch[0].to,{x:4,y:.7,z:4});
      assert.ok(Math.abs((200-enemies[4].hp)*2-(200-enemies[1].hp))<1e-9);
    }
  }
});

test('close strike ink follows the same release, miss, cancellation and actual target',()=>{
  for(const outcome of ['hit','miss','cancel','replace']){
    const game=new Game({seed:3,starter:'fang'});
    game.stage=outcome==='hit'?1:3;
    const height=game.stage===1?.82:13;
    game.p.y=height;
    const target=game.spawnEnemy(0,0,2,height);
    const other=game.spawnEnemy(0,0,8,height);
    target.hp=other.hp=200;
    const strokes=new WeaponStrokes(new Scene());
    const [weapon]=game.cultivation.weapons;
    weapon.cd=.08;
    assert.equal(previewAttackIntent(game).claw,true);
    assert.ok(fireTechnique(game,weapon));
    const start=game.events.find(event=>event.type==='clawStart');
    strokes.event(start,0);
    assert.equal(strokes.entries.length,1);
    game.events=[];
    if(outcome==='cancel')game.hurt(8);
    else{
      if(outcome!=='hit')target.z=20;
      if(outcome==='replace')other.z=2;
      game.time=.20;
      updateWeaponCombat(game,.02);
    }
    const release=game.events.find(event=>event.type==='clawRelease');
    assert.equal(release.strikeId,start.strikeId);
    for(const event of game.events)strokes.event(event,game.time);
    assert.ok(!strokes.entries.some(entry=>entry.event.type==='clawStart'&&entry.event.strikeId===start.strikeId));
    const actual=outcome==='replace'?other:outcome==='hit'?target:null;
    assert.equal(release.targetId,actual?.id??null);
    assert.equal(strokes.impacts.length,Number(Boolean(actual)));
    if(actual)assert.equal(strokes.impacts[0].event.targetId,actual.id);
    else assert.equal(target.hp,200);
  }
});

test('reed-shoal lead locks a fair lane and can be dodged sideways',()=>{
  for(const dodge of [false,true]){
    const game=new Game({seed:18});
    game.food=[];
    game.spawnCD=game.foodCD=Infinity;
    game.hordeCD=0;
    game.cultivation.weapons=[];
    game.step(1/60,{});
    const lead=game.enemies.find(enemy=>enemy.dartRushReadyAt!=null);
    assert.ok(lead,'the actual first reed shoal has a lead fish');
    assert.equal(game.enemies.filter(enemy=>enemy.dartRushReadyAt!=null).length,1);
    game.enemies=[lead];
    Object.assign(lead,{x:0,y:.7,z:3.8,crossing:null,dartRushReadyAt:0});
    game.events=[];
    game.step(1/60,{});
    const rush=lead.dartRush;
    assert.equal(rush.phase,'windup');
    const target={...rush.to};
    for(let i=0;i<42;i++)game.step(1/60,dodge?{x:1,z:0}:{});
    for(let i=0;i<14;i++)game.step(1/60,{});
    assert.deepEqual(rush.to,target);
    assert.deepEqual(game.events.filter(event=>event.type==='dartRushPhase').map(event=>event.phase),['windup','active','recovery']);
    assert.equal(rush.hit,!dodge);
    assert.equal(game.events.filter(event=>event.type==='hurt').reduce((sum,event)=>sum+event.amount,0),dodge?0:13);
  }
});

test('the Kun brackets the locked flight altitude and leaves a safe middle',()=>{
  for(const [layer,y] of [['low',9.65],['middle',12],['high',14.35]]){
    const game=new Game({seed:18});
    game.stage=3;
    Object.assign(game.p,{y:12,altitude:12,manualHeightUntil:999});
    game.food=[];
    game.spawnCD=game.foodCD=game.hordeCD=Infinity;
    game.cultivation.weapons=[];
    game.summonBoss();
    Object.assign(game.boss,{x:0,z:7,y:12,hp:game.boss.maxHp*.49,attack:0,speed:0});
    game.step(.02,{x:0,z:0});
    assert.equal(game.boss.bossPlan.definition.name,'sky-cross');
    assert.deepEqual(game.hazards.map(mark=>[mark.layer,mark.y,mark.radius]),[['low',9.65,1.86],['high',14.35,1.86]]);
    Object.assign(game.p,{y,altitude:y});
    for(let i=0;i<105;i++)game.step(.02,{x:0,z:0});
    const impacts=game.events.filter(event=>event.type==='hazardImpact');
    assert.deepEqual(impacts.map(impact=>[impact.layer,impact.hit]),[['low',layer==='low'],['high',layer==='high']]);
    assert.deepEqual(game.events.filter(event=>event.type==='hurt').map(event=>event.amount),layer==='middle'?[]:[43]);
  }
});

test('overlapping rain makes a surface vortex pull wet enemies faster',()=>{
  const draw=(rain,y,wet)=>{
    const game=new Game({seed:18});
    game.stage=2;
    const enemy=game.spawnEnemy(4,3,0,y);
    enemy.wet=wet?5:0;
    const vortex=game.addZone('storm',{x:0,y,z:0,radius:4});
    if(rain)game.addZone('rain',{x:.4,y,z:0,radius:3});
    game.updateFields(.05);
    return {pull:3-enemy.x,rainfed:vortex.rainfed,reactions:game.metrics.reactions};
  };
  const base=draw(false,.7,true);
  const fed=draw(true,.7,true);
  assert.equal(fed.rainfed,true);
  assert.equal(fed.reactions,1);
  assert.ok(Math.abs(fed.pull/base.pull-1.55)<1e-9);
  assert.equal(draw(true,.7,false).pull,base.pull);
  assert.equal(draw(true,3,true).rainfed,false);
});

test('the crab king skirts a blocked shore instead of stamping from across it',()=>{
  const game=new Game({seed:18});
  game.setShore((x,z)=>Math.abs(x)<1.4&&Math.abs(z)<3.8?1:-1);
  Object.assign(game.p,{x:7,y:.7,z:0});
  game.food=[];
  game.spawnCD=game.foodCD=game.hordeCD=Infinity;
  game.cultivation.weapons=[];
  game.summonBoss();
  Object.assign(game.boss,{x:-3,y:.7,z:0,attack:.4});
  let greatestBend=0;
  for(let i=0;i<420;i++){
    game.step(.02,{});
    assert.ok(!game.onLand(game.boss.x,game.boss.z,1));
    greatestBend=Math.max(greatestBend,Math.abs(game.boss.z));
  }
  assert.ok(greatestBend>2.5);
  assert.ok(game.boss.x>-2.75||greatestBend>4);
});

test('tempered claw opens a real side window against a guarded turtle',()=>{
  for(const [temper,angle,breaks] of [['close-strike',Math.PI/2,true],['close-strike',Math.PI,false],['long-strike',Math.PI/2,false]]){
    const game=new Game({seed:18});
    game.stage=2;
    Object.assign(game.p,{x:0,y:.8,z:0,angle:0});
    game.summonBoss();
    const boss=game.boss;
    Object.assign(boss,{x:0,y:.8,z:3,angle,shield:true});
    const weapon=game.cultivation.makeWeapon('fang',2);
    weapon.temper=temper;
    weapon.cd=3;
    game.cultivation.weapons=[weapon];
    game.cultivation.invalidateModifiers();
    assert.ok(fireTechnique(game,weapon));
    game.time=.20;
    updateWeaponCombat(game,.02);
    assert.equal(game.events.filter(event=>event.type==='armorBreak').length,Number(breaks));
    const before=boss.hp;
    game.damage(boss,20,'bubble',game.p);
    assert.equal(before-boss.hp,breaks?20:9);
    game.time=1.6;
    const later=boss.hp;
    game.damage(boss,20,'bubble',game.p);
    assert.equal(later-boss.hp,9);
  }
});

test('wide water pulse displaces an already wet enemy only in its outer half',()=>{
  for(const temper of ['heavy-pulse','wide-pulse']){
    const game=new Game({seed:18});
    game.stage=2;
    const weapon=game.cultivation.makeWeapon('drop',2);
    weapon.temper=temper;
    weapon.cd=3;
    game.cultivation.weapons=[weapon];
    game.cultivation.invalidateModifiers();
    const wideRadius=techniqueStats({...weapon,temper:'wide-pulse'},game.cultivation.modifiers()).radius;
    const enemies=[[0,wideRadius*.32,true],[-.5,wideRadius*.65,true],[1.05,wideRadius*.66,false]].map(([x,z,wet])=>{
      const enemy=game.spawnEnemy(4,x,z,.7);
      enemy.hp=300;
      enemy.wet=wet?5:0;
      return enemy;
    });
    assert.ok(fireTechnique(game,weapon));
    game.time=.25;
    updateWeaponCombat(game,.02);
    assert.deepEqual(enemies.map(enemy=>Boolean(enemy.weaponPush)),[false,temper==='wide-pulse',false]);
    assert.ok(enemies.every(enemy=>enemy.wet>0));
  }
});
