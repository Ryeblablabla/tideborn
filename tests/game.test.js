import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FOOD, STAGES, UPGRADES, validateSave, freshSave, metaCost, META } from '../src/model.js';

const tick=(g,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds*60);i++){if(g.status==='upgrade')g.choose(0);g.step(1/60,input);}};

test('seeded worlds are reproducible',()=>{
  const population=seed=>{
    const game=new Game({seed});
    tick(game,1);
    assert.ok(game.enemies.length>0);
    return game.enemies;
  };
  assert.deepEqual(population(123),population(123));
  assert.notDeepEqual(population(123),population(124));
});
test('island shores keep swimmers and opening enemies in the water',()=>{
  const g=new Game({seed:13});g.setObstacles([{x:3,z:0,rx:2,rz:2}]);
  const p={x:2,z:0};g.stayInWater(p,.5);assert.ok(p.x<=.5);g.p.x=.4;g.p.z=0;tick(g,.5,{x:1});assert.ok(g.p.x<=.501);
  tick(g,.2);
  assert.ok(g.enemies.length>0&&g.enemies.every(enemy=>!g.onLand(enemy.x,enemy.z)));
});
test('painted banks keep opening enemies off land and allow swimming along the shore',()=>{
  const g=new Game({seed:13});
  g.setShore((x,z)=>x>2&&Math.abs(z)<12?.5:-.24);
  g.p.x=1.40;
  tick(g,.65,{x:1,z:1});
  assert.ok(g.p.x<=1.45 && g.p.z>2,'the blocked component should slide along the bank');
  assert.ok(g.enemies.length>0&&g.enemies.every(enemy=>!g.onLand(enemy.x,enemy.z)));
});
test('all five food qualities increase growth; gold awakens an element',()=>{
  const g=new Game({seed:9});let xp=0;
  for(let rank=0;rank<5;rank++){const body=g.p.body;g.eat({x:0,z:0,rank});xp+=FOOD[rank].xp;assert.ok(g.p.body>body);}
  assert.equal(g.essence,Math.min(STAGES[0].need,xp));assert.equal(g.eaten,5);assert.equal(g.gold,1);assert.equal(g.buffs.fire+g.buffs.lightning+g.buffs.storm,1);assert.ok(g.pendingLevels>0);
});
test('collecting enough essence summons a boss without bypassing its gate',()=>{
  const g=new Game({seed:1});g.essence=STAGES[0].need;g.step(1/60);
  assert.equal(g.status,'market');assert.equal(g.boss,null);
  assert.equal(g.leaveMarket(),true);g.step(1/60);
  assert.equal(g.stage,0);assert.ok(g.boss);assert.equal(g.boss.hp,STAGES[0].bossHp);
  const boss=g.boss;g.damage(boss,9999);assert.equal(g.stage,1);assert.equal(g.boss,null);assert.equal(g.essence,0);assert.ok(Math.abs(g.p.hp-g.stats().hp)<1);assert.equal(g.bossKills,1);
});
test('four distinct boss gates lead to winged ascension and a terminal victory',()=>{
  const g=new Game({seed:1});
  for(let stage=0;stage<4;stage++){assert.equal(g.stage,stage);g.summonBoss();assert.equal(g.boss.type,5+stage);g.damage(g.boss,1e6);}
  assert.equal(g.stage,4);assert.equal(g.status,'ascending');assert.equal(g.bossKills,4);tick(g,7.1);assert.equal(g.status,'ascending');tick(g,13);assert.equal(g.status,'won');assert.ok(Math.hypot(g.p.x-g.ascentTarget.x,g.p.z-g.ascentTarget.z)<4);assert.ok(g.p.y>24);assert.ok(g.reward()>=46);
});
test('arrival in the mountain chapter rebases the flight and body together',()=>{
  const arrival={x:0,y:11.6,z:-2.8,angle:0};
  const game=new Game({seed:1,chapterArrivals:{3:arrival}});
  game.evolve();game.evolve();
  game.p.x=45;game.p.z=-25;game.p.angle=Math.PI/2;
  game.trail=Array.from({length:100},(_,i)=>({x:45-i*.2,y:game.p.y,z:-25,t:0}));
  game.evolve();
  assert.deepEqual(game.bodyPath[0],{x:arrival.x,y:arrival.y,z:arrival.z});
  assert.ok(Math.abs(game.bodyPath[1].x)<1e-8 && game.bodyPath[1].z<arrival.z);
  assert.equal(game.p.angle,0);
  assert.equal(game.p.altitude,arrival.y);
});
test('pending blessings wait for the market and apply once',()=>{
  const g=new Game({seed:5});g.pendingLevels=1;g.step(1/60);assert.equal(g.status,'playing');
  g.waveTime=8.5;g.step(1/60);assert.equal(g.status,'market');assert.equal(new Set(g.choices.map(u=>u.id)).size,3);
  const before=g.time;g.step(.05,{x:1});assert.equal(g.time,before);const id=g.choices[1].id;
  assert.equal(g.leaveMarket(),true);assert.equal(g.pendingLevels,1);
  g.waveTime=16;g.step(1/60);assert.equal(g.status,'market');assert.equal(g.choices[1].id,id);
  assert.equal(g.choose(1),true);assert.equal(g.buffs[id],1);assert.equal(g.choose(1),false);
  assert.equal(g.status,'market');assert.equal(g.leaveMarket(),true);assert.equal(g.status,'playing');
});
test('automatic projectiles kill enemies and create edible drops',()=>{
  const g=new Game({seed:14});g.food=[];const e=g.spawnEnemy(0,0,5);g.attackCD=0;tick(g,2.2);assert.ok(e.hp<=0);assert.ok(g.kills>=1);assert.ok(g.food.some(f=>Math.hypot(f.x-e.x,f.z-e.z)<2));
});
test('dash grants temporary immunity and respects its cooldown',()=>{
  const g=new Game({seed:5});assert.equal(g.dash(),true);const hp=g.p.hp;g.hurt(30);assert.equal(g.p.hp,hp);assert.equal(g.dash(),false);tick(g,.9);g.hurt(30);assert.ok(g.p.hp<hp);tick(g,3);assert.equal(g.dash(),true);
});
test('fire, storm and lightning damage crowds, without requiring manual aim',()=>{
  for(const kind of ['fire','storm','lightning']){const g=new Game({seed:5});g.buffs[kind]=2;g.spawnCD=100;for(let i=0;i<6;i++)g.spawnEnemy(0,3+i*.2,0);g.element(kind);tick(g,3);assert.ok(g.kills>=2,`${kind} should defeat a cluster`);}
});
test('pause and death stop simulation, including spawning and growth',()=>{
  for(const status of ['paused','dead','upgrade']){const g=new Game({seed:5});g.status=status;const before=JSON.stringify({p:g.p,time:g.time,food:g.food,enemies:g.enemies});g.step(.05,{x:1});assert.equal(JSON.stringify({p:g.p,time:g.time,food:g.food,enemies:g.enemies}),before);}
});
test('boss warnings resolve after a readable delay; damage is avoidable',()=>{
  const g=new Game({seed:8});g.spawnCD=g.hordeCD=Infinity;g.summonBoss();g.boss.attack=0;g.boss.attackIndex=1;g.step(1/60);const warning=g.hazards.find(h=>h.warning);assert.ok(warning);assert.equal(warning.attack,'claw-stamp');assert.ok(warning.life>1.5);const hp=g.p.hp;g.enemies=[];g.boss=null;tick(g,1.7,{x:1});assert.equal(g.p.hp,hp);
  const impact=g.events.filter(event=>event.type==='hazardImpact');
  assert.equal(impact.length,1);
  assert.equal(impact[0].id,warning.id);
  assert.equal(impact[0].hit,false);
  assert.deepEqual([impact[0].x,impact[0].y,impact[0].z,impact[0].radius],[warning.x,warning.y,warning.z,warning.radius]);
});
test('permanent blessings affect the next run and malformed saves are bounded',()=>{
  const g=new Game({meta:{heart:3,fang:2,tide:1}});assert.equal(g.p.hp,136);assert.ok(g.stats().damage>new Game().stats().damage);assert.ok(g.stats().magnet>1.8);
  assert.deepEqual(validateSave(null),freshSave());const s=validateSave({jade:-99,bestStage:999,meta:{heart:1e9,fang:'invalid'}});assert.equal(s.jade,0);assert.equal(s.bestStage,4);assert.equal(s.meta.heart,10);assert.equal(s.meta.fang,0);assert.ok(metaCost(META[0],3)>metaCost(META[0],0));
});
test('an empty restart cannot farm permanent currency',()=>{
  const g=new Game();assert.equal(g.reward(),0);g.time=20;assert.equal(g.reward(),2);g.kills=30;assert.equal(g.reward(),4);
});
