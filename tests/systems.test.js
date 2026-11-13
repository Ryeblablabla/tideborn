import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, validateSave } from '../src/model.js';
import { DENSITY, distance3 } from '../src/simulation.js';
import { MotionReader, sampleSpine, insidePolygon } from '../src/motion.js';
import { attackOrigin, fireTechnique, updateWeaponCombat } from '../src/weapon-combat.js';
import { WeaponStrokes } from '../src/ink/weapon-strokes.js';
import { Scene } from 'three';
import { createMarketTrial } from '../src/market-trial.js';
const tick=(g,n,input={})=>{for(let i=0;i<n*60;i++){if(g.status==='upgrade')g.choose(0);g.step(1/60,input);g.events=[];}};
test('damage physically shortens the body and recovered tissue cannot farm XP',()=>{
 const g=new Game({seed:3}),before=g.p.body,hp=g.p.hp;g.hurt(40);assert.ok(g.p.body<before);assert.ok(g.p.hp<hp);const shed=g.food.filter(f=>f.shed);assert.ok(shed.length);const remaining=g.p.mass,xp=g.xp;for(const f of shed)g.eat(f);assert.ok(g.p.mass>remaining);assert.ok(g.p.mass<12.5);assert.equal(g.xp,xp);assert.equal(g.eaten,0);
});
test('condensation shortens a grown body and retains organs and damage strength',()=>{
 const g=new Game();g.gainMass(20);g.buffs.fire=3;const n=g.p.body,hp=g.p.hp,damage=g.stats().damage;g.evolve();assert.ok(g.p.body<n);assert.ok(g.p.density>1);assert.ok(g.p.hp>hp);assert.equal(g.buffs.fire,3);assert.ok(g.stats().damage>damage);assert.ok(g.metrics.condensed);
});
test('overflow growth yields bounded material for the market without automatic damage growth',()=>{
  const g=new Game(), before=g.cultivation.materials;
  g.gainMass(100);
  assert.ok(g.reserve>0);assert.equal(g.p.mass,g.stats().maxMass);
  const damage=g.stats().damage;
  g.gainMass(100);
  assert.equal(g.cultivation.materials,before+6);
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
 const g=new Game();for(let i=0;i<400;i++){g.addZone(i%2?'fire':'steam',{x:i%30*2,y:.7,z:Math.floor(i/30)*2,radius:2});g.spawnEnemy(0,i%15,Math.floor(i/15));}assert.ok(g.zones.length<=28);assert.ok(g.enemies.length<=200);for(let i=0;i<100;i++)g.updateFields(.05);assert.ok(g.zones.length<=28);
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
test('water chapters only create collectible food from a kill',()=>{
  const game=new Game({seed:21});
  game.spawnCD=game.hordeCD=Infinity;
  for(let stage=0;stage<3;stage++){
    game.setShore(()=>-.3);
    game.refillFood();
    assert.equal(game.spawnFood(),null);
    game.step(.32);
    assert.equal(game.food.length,0);
    const enemy=game.spawnEnemy(0,game.p.x+1,game.p.z,game.p.y);
    game.damage(enemy,enemy.hp/2);
    assert.equal(game.food.length,0);
    game.damage(enemy,enemy.hp);
    game.damage(enemy,1);
    assert.equal(game.food.length,1);
    const [drop]=game.food;
    assert.ok(drop.battleLoot&&!drop.ambient&&drop.life<=38);
    assert.deepEqual([drop.x,drop.y,drop.z],[enemy.x,enemy.y,enemy.z]);
    const mass=game.p.mass;
    const eaten=game.eaten;
    for(let i=0;i<20&&game.eaten===eaten;i++)game.step(1/60);
    assert.equal(game.eaten,eaten+1);
    assert.ok(game.p.mass>mass&&game.food.length===0);
    game.evolve();
  }
  assert.ok(game.food.some(item=>item.ambient));
});
test('water battle drops expire without bringing back ambient food',()=>{
  const game=new Game({seed:21});
  game.evolve();game.evolve();
  const enemy=game.spawnEnemy(9,6,11,1);
  game.damage(enemy,enemy.hp+1);
  game.refillFood();
  assert.equal(game.food.length,1);
  const expired=game.food[0];
  expired.life=.02;
  game.step(.05);
  assert.ok(!game.food.includes(expired));
});
test('training remains safe and never awards permanent currency or interrupts with upgrades',()=>{const g=new Game();g.practice=true;g.pendingLevels=3;g.time=60;g.kills=30;tick(g,2);assert.equal(g.status,'playing');assert.equal(g.reward(),0);const hp=g.p.hp;g.hurt(100);assert.equal(g.p.hp,hp);});
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
    tick(game,.9);
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
    game.foodCD=game.spawnCD=game.hordeCD=game.marketAt=Infinity;
    Object.assign(game.p,{mass:120,peakMass:120,y:.8,altitude:.8,invul:10,manualHeightUntil:10});
    game.syncBody();
    game.trail=Array.from({length:130},(_,i)=>({x:0,y:.8,z:-i*.28,t:-i/60}));
    game.updatePose(0);
    const coil=game.cultivation.makeWeapon('coil',2,18);
    const tail=game.cultivation.makeWeapon('tail',2,15);
    tail.cd=.70;
    coil.temper=form;
    game.cultivation.weapons=[coil,tail];
    game.cultivation.invalidateModifiers();
    const origin=attackOrigin(game,'tail');
    const positions=rear?[[4.94,origin.z],[5.22,origin.z+.75],[0,origin.z-5.24]]:[[0,6.2],[.94,7.1],[-.84,5.8]];
    for(const [x,z] of positions)Object.assign(game.spawnEnemy(4,x,z,.8),{hp:300,maxHp:300,speed:0,shootCD:Infinity});
    for(let frame=0;frame<78;frame++)game.step(1/60,{autoHeight:false});
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
    game.step(1/60,{autoHeight:false});
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
    const weapon=game.cultivation.makeWeapon('spark',2,10);
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
    game.stage=3;
    game.p.y=13;
    const target=game.spawnEnemy(3,0,2,13);
    const other=game.spawnEnemy(3,0,8,13);
    target.hp=other.hp=200;
    const strokes=new WeaponStrokes(new Scene());
    assert.ok(fireTechnique(game,game.cultivation.weapons[0]));
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
    game.step(.02,{autoHeight:false});
    assert.equal(game.boss.bossPlan.definition.name,'sky-cross');
    assert.deepEqual(game.hazards.map(mark=>[mark.layer,mark.y,mark.radius]),[['low',9.65,1.86],['high',14.35,1.86]]);
    Object.assign(game.p,{y,altitude:y});
    for(let i=0;i<105;i++)game.step(.02,{autoHeight:false});
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
    const weapon=game.cultivation.makeWeapon('fang',2,12);
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

test('trial receipts follow the offered weapon through pulse, projectile, and persistent field damage',()=>{
  for(const id of ['drop','needle','ember']){
    const live=new Game({seed:2});
    live.cultivation.materials=30;
    live.cultivation.open(0);
    live.cultivation.offers[0]={id,tier:1,price:7,locked:false};
    const preview=live.cultivation.previewTrade('buy',0);
    const trial=createMarketTrial(live,preview,id);
    const equipped=trial.cultivation.weapons.find(item=>item.uid===preview.weapon.uid);
    trial.cultivation.weapons=[equipped];
    trial.cultivation.invalidateModifiers();
    for(let i=0;i<39;i++)trial.step(1/60,{});
    assert.ok(trial.marketTrial.result?.targets>0,id);
    assert.ok(trial.marketTrial.result.strongest>0,id);
    if(id==='drop'||id==='needle')assert.ok(trial.marketTrial.result.targets>=2,id);
    assert.equal(live.cultivation.materials,30);
    assert.equal(live.cultivation.weapons.length,1);
  }
});

test('wide water pulse displaces an already wet enemy only in its outer half',()=>{
  for(const temper of ['heavy-pulse','wide-pulse']){
    const game=new Game({seed:18});
    game.stage=2;
    const weapon=game.cultivation.makeWeapon('drop',2,12);
    weapon.temper=temper;
    weapon.cd=3;
    game.cultivation.weapons=[weapon];
    game.cultivation.invalidateModifiers();
    const enemies=[[0,2,true],[-.5,3.2,true],[1.05,3.35,false]].map(([x,z,wet])=>{
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
