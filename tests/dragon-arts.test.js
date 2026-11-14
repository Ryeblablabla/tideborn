import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from '../src/simulation.js';
import { beamRainPlacement, updateDragonArt } from '../src/dragon-arts.js';
import { techniqueStats } from '../src/cultivation-data.js';
import { castTechniqueArt, updateTechniqueArts } from '../src/technique-arts.js';
import { storeThawThunder, updateCascade } from '../src/cascades.js';

function encounter(kind, rank = 1, doctrine) {
  const game = new Game({seed: 1533, interactiveFinale: false, starter: 'bubble'});
  game.stage = 1;
  game.syncBody();
  game.cultivation.dragonArt = kind;
  game.cultivation.dragonArtRank = rank;
  game.cultivation.dragonArtDoctrine = doctrine;
  game.cultivation.weapons[0].tier = 3;
  game.spawnCD = game.hordeCD = game.foodCD = 999;
  game.updateWaveReward = () => {};
  game.p.invul = 999;
  const observed = [];
  const emit = game.emit.bind(game);
  game.emit = (type, event) => {
    if (type.startsWith('dragonArt')) observed.push({type, ...event});
    emit(type, event);
  };
  function prey(x, z, y = game.p.y) {
    const enemy = game.spawnEnemy(2, x, z, y);
    Object.assign(enemy, {hp: 850, maxHp: 850, speed: 0, shootCD: 999});
    return enemy;
  }
  function through(predicate, seconds = 17) {
    const end = game.time + seconds;
    while (!predicate() && game.time < end) game.step(1 / 60, {x: 0, z: 0});
    assert.ok(predicate(), 'encounter never reached the expected phase');
  }
  return {game, prey, observed, through};
}

test('the frost front outruns its normal boundary through wet enemies and releases any survivors', () => {
  const {game, prey, observed, through} = encounter('frost');
  for (const x of [-3, 0, 3]) prey(x, 6);
  const wet = prey(-9, 14.7);
  const dry = prey(9, 14.7);
  through(() => game.activeDragonArt?.phase === 'freeze');
  wet.wet = 5;
  through(() => observed.some(event => event.targetId === wet.id && event.impact === 'lock'), 1.2);
  assert.equal(wet.dragonArtMark, 'frost');
  assert.equal(dry.dragonArtMark, undefined);
  through(() => !game.activeDragonArt, 2.5);
  assert.ok(observed.some(event => event.targetId === wet.id && event.impact === 'crush'));
  assert.ok(!observed.some(event => event.targetId === dry.id));
  assert.equal(wet.dragonArtHeldUntil, undefined);
  assert.equal(wet.dragonArtMark, undefined);
});

test('a crowded frost sheet resolves its own held bodies exactly once', () => {
  const {game,prey,observed} = encounter('frost',2);
  game.stage=2;
  game.dragonArtCharge=100;
  const foes=Array.from({length:16},(_,i)=>prey(i%8-3.5,5+Math.floor(i/8)*2));
  const outlier=prey(29,0);
  for(let tick=0;tick<=115;tick++) {
    game.time=1+tick/60;
    updateDragonArt(game,1/60);
  }
  const opening=observed.find(event=>event.reaction==='frost-sheet');
  const closure=observed.find(event=>event.reaction==='frost-sheet-shatter');
  assert.ok(opening&&closure);
  assert.ok(opening.points.length>=5);
  assert.ok(closure.age>opening.age);
  const ids=foes.map(enemy=>enemy.id);
  assert.deepEqual(new Set(closure.receiverIds),new Set(ids));
  const hits=observed.filter(event=>event.impact==='frost-sheet-shatter');
  assert.equal(hits.length,ids.length);
  assert.deepEqual(new Set(hits.map(event=>event.targetId)),new Set(ids));
  assert.ok(foes.every(enemy=>enemy.dragonArtHeldUntil===undefined));
  assert.equal(outlier.hp,outlier.maxHp);
});

test('heat on separate wet shells sends a delayed front into a different live group', () => {
  for (const heated of [1, 2]) {
    const {game,prey,observed}=encounter('frost',2);
    game.stage=2;
    game.dragonArtCharge=100;
    const anchors=[prey(-1,13),prey(1,14)];
    const receivers=[prey(0,24),prey(1.5,25)];
    const far=prey(18,24);
    prey(0,6);
    anchors.forEach(enemy=>{enemy.wet=5;});
    for(let tick=0;tick<=120;tick++) {
      game.time=1+tick/60;
      updateDragonArt(game,1/60);
      if(tick===28) {
        assert.ok(anchors.every(enemy=>enemy.dragonArtMark==='frost'));
        for(const enemy of anchors.slice(0,heated))game.damage(enemy,3,'fire');
      }
    }
    const launch=observed.find(event=>event.reaction==='frost-temper-rush');
    const hits=observed.filter(event=>event.impact==='frost-temper-rush');
    const settled=observed.find(event=>event.reaction==='frost-temper-rush-hit');
    assert.equal(Boolean(launch),heated===2);
    assert.equal(far.hp,far.maxHp);
    if(!launch) {
      assert.equal(hits.length,0);
      assert.ok(receivers.every(enemy=>enemy.hp===enemy.maxHp));
      continue;
    }
    assert.deepEqual(new Set(launch.sourceIds),new Set(anchors.map(enemy=>enemy.id)));
    assert.deepEqual(new Set(settled.receiverIds),new Set(receivers.map(enemy=>enemy.id)));
    assert.equal(hits.length,receivers.length);
    assert.ok(hits.every(hit=>hit.amount>0&&hit.age>launch.age+launch.windup));
    assert.ok(receivers.every(enemy=>enemy.hp<enemy.maxHp&&enemy.wet>0));
  }
});

test('thaw sends one delayed steam stroke beyond a regular frost sheet and cancels an escaped group', () => {
  for (const variant of ['echo','thaw','escaped']) {
    const {game,prey,observed}=encounter('frost',3,variant==='echo'?'echo':'thaw');
    game.stage=2;
    game.dragonArtCharge=100;
    game.cultivation.weapons.push(game.cultivation.makeWeapon('ember',1));
    const anchors=[prey(-1,6),prey(1,6.5)];
    const near=Array.from({length:9},(_,i)=>prey(i-4,7+i%3));
    const wing=[prey(-1,30),prey(1,31),prey(2,33),prey(-2,32)];
    const distant=prey(-23,31);
    for (const enemy of [...anchors,...wing]) enemy.wet=5;
    let moved=false;
    for(let tick=0;tick<=150;tick++) {
      game.time=1+tick/60;
      updateDragonArt(game,1/60);
      if(tick===30)for(const enemy of anchors)game.damage(enemy,4,'fire');
      if(variant==='escaped'&&!moved&&observed.some(event=>event.formation==='thaw-flank')) {
        for(const enemy of wing){
          const {x,z}=enemy;
          enemy.x+=23;
          game.enemyGrid.relocate(game.enemies,enemy,x,z);
        }
        moved=true;
      }
    }
    const launch=observed.find(event=>event.formation==='thaw-flank');
    const settle=observed.find(event=>event.reaction==='frost-temper-rush-hit');
    const original=observed.find(event=>event.reaction==='frost-sheet-shatter');
    assert.ok(original&&near.every(enemy=>enemy.hp<enemy.maxHp));
    assert.equal(distant.hp,distant.maxHp);
    if(variant==='thaw') {
      assert.deepEqual(new Set(settle.receiverIds),new Set(wing.map(enemy=>enemy.id)));
      assert.ok(settle.age>original.age&&settle.age>=launch.age+launch.windup+launch.travel);
      assert.ok(wing.every(enemy=>enemy.hp<enemy.maxHp&&enemy.dragonArtMark===undefined));
    } else {
      assert.equal(Boolean(launch),variant==='escaped');
      assert.ok(wing.every(enemy=>enemy.hp===enemy.maxHp), `${variant}: ${wing.map(enemy=>[enemy.id,enemy.hp])}`);
      assert.equal(Boolean(observed.find(event=>event.reaction==='frost-temper-rush-cancel')),variant==='escaped');
    }
  }
});

test('stored thaw steam needs live wet electricity and pays for only one separate discharge', () => {
  for (const charge of ['lightning','fire','past-expiry']) {
    const {game,prey,observed}=encounter('frost',3,'thaw');
    game.stage=2;
    game.cultivation.cascade='thunder';
    game.cultivation.cascadeRank=2;
    game.nextCascadeAt=1;
    const conductor=prey(0,4);
    const wing=[prey(0,15),prey(2,15),prey(-2,16)];
    const spent=prey(1,15);
    const art={id:10000,hitTargets:new Set([spent.id]),locked:new Map(),iceFork:{hits:new Set()}};
    const targets=[{...prey(-2,1),killed:true},{...prey(1,1),killed:true}];
    game.time=1;
    storeThawThunder(game,art,targets);
    updateCascade(game,1/60);
    assert.ok(conductor.wet>0);
    if(charge==='past-expiry')game.time=6;
    game.damage(conductor,5,charge==='fire'?'fire':'lightning');
    for(let tick=0;tick<=60;tick++){
      updateCascade(game,1/60);
      game.time+=1/60;
    }
    const launch=observed.find(event=>event.reaction==='thaw-thunder-release');
    const receipts=game.events.filter(event=>event.detail==='thaw-thunder-hit');
    assert.equal(spent.hp,spent.maxHp);
    assert.equal(Boolean(launch),charge==='lightning');
    if(launch){
      assert.equal(launch.contactId,conductor.id);
      assert.deepEqual(new Set(receipts.map(event=>event.targetId)),new Set(wing.map(enemy=>enemy.id)));
      assert.equal(receipts.length,wing.length);
      assert.ok(game.nextCascadeAt>8);
    }else{
      assert.ok(wing.every(enemy=>enemy.hp===enemy.maxHp));
    }
  }
});

test('a black hole forms at the occupied allied vortex and really moves its enemies inward', () => {
  const {game, prey, observed, through} = encounter('abyss');
  for (const x of [-2, 0, 2]) prey(x, 6);
  through(() => game.dragonArtCharge >= 94);
  const storm = game.addZone('storm', {x: 4, y: game.p.y, z: 4, radius: 3, life: 3});
  const outer = prey(7, 11);
  const span = () => Math.hypot(outer.x - storm.x, outer.z - storm.z);
  const before = span();
  through(() => game.activeDragonArt?.phase === 'spiral', 2.0);
  assert.equal(game.activeDragonArt.inheritance, 'storm');
  assert.equal(game.activeDragonArt.x, storm.x);
  through(() => observed.some(event => event.targetId === outer.id && event.amount > 0), 2.0);
  assert.ok(span() < before - 2);
});

test('a dense abyss folds only the targets that actually reach its mouth', () => {
  const {game,prey,observed,through}=encounter('abyss',2);
  game.stage=2;
  game.dragonArtCharge=100;
  const group=Array.from({length:6},(_,i)=>prey(i*.23-.55,5.3));
  through(()=>observed.some(event=>event.reaction==='abyss-mouth-gather'),3);
  const gather=observed.find(event=>event.reaction==='abyss-mouth-gather');
  const blocked=group.find(enemy=>gather.receiverIds.includes(enemy.id));
  const stayInWater=game.stayInWater.bind(game);
  game.stayInWater=(entity,radius,previous)=>{
    if(entity===blocked)entity.x=previous.x+2;
    else stayInWater(entity,radius,previous);
  };
  through(()=>observed.some(event=>event.reaction==='abyss-mouth-fold'),1.1);
  const fold=observed.find(event=>event.reaction==='abyss-mouth-fold');
  assert.equal(fold.leg,gather.leg);
  assert.ok(fold.receiverIds.length>=3);
  assert.ok(!fold.receiverIds.includes(blocked.id));
  const arrivals=observed.filter(event=>event.type==='dragonArtImpact'&&event.mouthFold);
  assert.deepEqual(new Set(arrivals.map(event=>event.targetId)),new Set(fold.receiverIds));
  assert.ok(arrivals.every(event=>Math.hypot(event.x-fold.x,event.z-fold.z)<.68));
});

test('a real needle contact can open a directional second rift and close on the prey it actually pulled', () => {
  for (const mode of ['contact','no-contact','ridge','double']) {
    const {game,prey,observed,through} = encounter('rift',3,mode==='double'?'reach':'echo');
    game.stage=3;
    game.p.y=11;
    game.setTerrain(mode==='ridge'?(x=>x>5&&x<8?15:0):()=>0);
    for (const weapon of game.cultivation.weapons) weapon.cd=60;
    const near = [-2,-1,0,1,2].map(x=>prey(x,7,game.p.y));
    const far = [-.98,-.55,.7,1.36].map((offset,index)=>prey(15+offset,26+index*.52,game.p.y+.75));
    const opposite = prey(-20,23,game.p.y);
    const upper = prey(15,24,game.p.y+8.2);
    // Use sky targets with stable altitude rather than a water type that
    // returns to the prow's height during the first rift.
    upper.type=10;
    upper.wildRetreat={until:20,angle:0};
    for (const enemy of far) enemy.hp=enemy.maxHp=75;
    const initial=far.map(enemy=>({x:enemy.x,z:enemy.z,y:enemy.y}));
    game.dragonArtCharge=100;
    through(()=>Boolean(game.activeDragonArt),.2);
    const art=game.activeDragonArt;
    if (mode!=='no-contact') {
      const contact=near.at(-1);
      game.damage(contact,15,'needle',{x:contact.x-1.4,y:contact.y,z:contact.z-.7});
    }
    through(()=>observed.some(event=>event.type==='dragonArtEnd'),5);
    const events = observed.filter(event=>event.id===art.id);
    const launch = events.find(event=>event.reaction==='rift-seam');
    assert.equal(Boolean(launch),mode==='contact',mode);
    if (mode!=='contact') {
      assert.ok(!events.some(event=>event.impact==='rift-seam'));
      assert.ok(far.every(enemy=>enemy.dragonArtMark===undefined));
      if (mode==='double') assert.equal(art.portals.length,2);
      continue;
    }
    const close = events.find(event=>event.reaction==='rift-seam-close');
    const binds = events.filter(event=>event.reaction==='rift-seam-bind');
    const impacts = events.filter(event=>event.impact==='rift-seam');
    assert.equal(launch.carrier,'needle');
    assert.equal(launch.sourceId,near.at(-1).id);
    assert.deepEqual(binds.map(event=>event.targetId).sort((a,b)=>a-b),far.map(enemy=>enemy.id));
    assert.equal(close.receiverIds.length,far.length);
    assert.equal(impacts.length,far.length);
    assert.ok(impacts.every(event=>event.age>=close.age&&event.killed&&event.absorbed));
    assert.ok(far.filter((enemy,index)=>Math.hypot(enemy.x-initial[index].x,enemy.z-initial[index].z)>1.85).length>=3);
    for (const enemy of far) {
      assert.ok(Math.hypot(enemy.x-close.to.x,enemy.z-close.to.z)<.65);
      assert.equal(enemy.dragonArtMark,undefined);
      assert.equal(enemy.dragonArtCaptureProgress,undefined);
    }
    assert.ok(!events.some(event=>event.impact==='rift-seam'&&(event.targetId===opposite.id||event.targetId===upper.id)));
  }
});

test('paired rift mouths converge only after prey really reaches both sides', () => {
  for (const paired of [true,false]) {
    const {game,prey,observed,through} = encounter('rift',3,'reach');
    for (const weapon of game.cultivation.weapons) weapon.cd=60;
    for (const x of [-1,0,1]) prey(x,7);
    game.dragonArtCharge=100;
    through(()=>Boolean(game.activeDragonArt),.2);
    const art=game.activeDragonArt;
    const left=prey(art.portals[0].x,art.portals[0].z,art.portals[0].y);
    const right=paired ? prey(art.portals[1].x,art.portals[1].z,art.portals[1].y) : null;
    const center=[1.4,2.4,4.6].map(along=>prey(art.center.x+art.direction.x*along,art.center.z+art.direction.z*along,art.center.y));
    const initial=center.map(enemy=>({x:enemy.x,z:enemy.z}));
    const distant=prey(art.center.x+art.direction.x*30,art.center.z+art.direction.z*30,art.center.y);
    through(()=>observed.some(event=>event.type==='dragonArtEnd'),4);
    const launch=observed.find(event=>event.reaction==='rift-clash');
    const hits=observed.filter(event=>event.impact==='rift-clash');
    assert.equal(Boolean(launch),paired);
    assert.ok(observed.some(event=>event.impact==='crush'&&event.targetId===left.id));
    assert.equal(distant.hp,850);
    if (!paired) {
      assert.equal(hits.length,0);
      assert.ok(center.every(enemy=>enemy.hp<850));
      continue;
    }
    assert.deepEqual(launch.pairedIds,[left.id,right.id]);
    assert.ok(observed.some(event=>event.impact==='crush'&&event.targetId===right.id));
    assert.ok(hits.length>=center.length && hits.every(hit=>hit.age>=launch.age+launch.duration-1e-9));
    assert.ok(center.every((enemy,index)=>hits.some(hit=>hit.targetId===enemy.id) &&
      Math.hypot(initial[index].x-enemy.x,initial[index].z-enemy.z)>.5));
  }
});

test('a played needle angle redirects a paired clash into a separate rift recoil lane', () => {
  for (const mode of ['needle','no-needle','one-mouth','bank','wrong-angle']) {
    const {game,prey,observed,through}=encounter('rift',3,'reach');
    game.stage=3;
    game.p.y=game.p.altitude=11;
    game.setTerrain(()=>0);
    for (const weapon of game.cultivation.weapons) weapon.cd=60;
    for (const x of [-.3,0,.3]) prey(x,7.2,11);
    game.dragonArtCharge=100;
    through(()=>Boolean(game.activeDragonArt),.2);
    const art=game.activeDragonArt, {x,y,z}=art.center;
    game.enemies=[];
    game.enemyGrid.invalidate();
    game.cascadeShoalStage=game.stage;
    game.hordeCD=999;
    const course=(side,ahead,height=0)=>({x:x+side*art.direction.z+ahead*art.direction.x,
      y:y+height,z:z-side*art.direction.x+ahead*art.direction.z});
    const spawn=({x,y,z})=>prey(x,z,y);
    const left=spawn(art.portals[0]);
    const right=mode==='one-mouth' ? null : spawn(art.portals[1]);
    const center=[1.4,2.4,4.6].map(ahead=>spawn(course(0,ahead)));
    const receivers=[18.2,20.0,22.6].map((side,i)=>spawn(course(side,8.3+i*.5)));
    const witness=spawn(course(14,16.9));
    const opposite=spawn(course(-20.9,9));
    const upper=spawn(course(18.2,8,7.6));
    upper.wildRetreat={until:20,angle:0};
    for (const foe of receivers) foe.hp=foe.maxHp=75;
    if (mode==='bank') game.setTerrain((wx,wz)=>{
      const lateral=(wx-x)*art.direction.z-(wz-z)*art.direction.x;
      return lateral>9.8&&lateral<13.1?16:0;
    });
    through(()=>art.age>=.88,.95);
    if (mode!=='no-needle') {
      const source=center[0], before=mode==='wrong-angle'?course(-.05,-1.6):course(-2.8,.1);
      game.damage(source,1,'needle',before);
    }
    through(()=>observed.some(event=>event.type==='dragonArtEnd'),5);
    const launch=observed.find(event=>event.reaction==='rift-recoil');
    const hits=observed.filter(event=>event.impact==='rift-recoil');
    assert.equal(Boolean(launch),mode==='needle',mode);
    assert.equal(hits.length, mode==='needle'?receivers.length:0,mode);
    assert.equal(opposite.hp,opposite.maxHp,mode);
    assert.equal(witness.hp,witness.maxHp,mode);
    assert.equal(upper.hp,upper.maxHp,mode);
    if (!launch) continue;
    assert.deepEqual(launch.pairedIds,[left.id,right.id]);
    assert.equal(launch.sourceId,center[0].id);
    assert.ok(launch.points.length>16);
    assert.equal(launch.carrier,'needle');
    assert.ok(hits.every((event,index)=>event.killed&&event.targetId===receivers[index].id&&event.age>launch.age+launch.windup));
    assert.ok(hits[2].age-hits[0].age>.08);
  }
});

test('the beam sweeps through targets in front, repeats at rank three, and leaves a rear horde alone', () => {
  const {prey, observed, through} = encounter('beam', 3, 'reach');
  const front = prey(2, 13);
  prey(0, 7);
  prey(-3, 5);
  const rear = prey(0, -10);
  through(() => observed.some(event => event.type === 'dragonArtEnd'));
  const hits = observed.filter(event => event.impact === 'hit' && event.targetId === front.id);
  assert.equal(hits.length, 2);
  assert.ok(hits.every(hit => hit.amount > 0));
  assert.ok(!observed.some(event => event.targetId === rear.id));
});

test('return beam commits to a live lateral crossing measured after first sweep, through open terrain only', () => {
  for(const variant of ['crossing','still','ridge','reach']) {
    const {game,prey,observed}=encounter('beam',3,variant==='reach'?'reach':'echo');
    game.stage=3;
    game.p.y=game.p.altitude=11.2;
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    game.setTerrain((x,z)=>variant==='ridge'&&z>9.5&&z<13.8?15:0);
    game.dragonArtCharge=100;
    for(const x of [-2,0,2])prey(x,10,11.2);
    const tick=()=>{
      game.time+=1/60;
      game.enemyGrid.invalidate();
      updateDragonArt(game,1/60);
    };
    for(let i=0;i<64;i++)tick();
    const group=[[-9.2,20.2],[-8.2,22.0],[-7.9,23.2]].map(([x,z])=>prey(x,z,11.4));
    for(const enemy of group)enemy.hp=enemy.maxHp=52;
    const decoy=prey(17,8,11.2);
    for(let i=0;i<65;i++){
      if(variant!=='still')for(const enemy of group)enemy.x-=.096;
      tick();
    }
    const launch=observed.find(event=>event.reaction==='beam-intercept');
    const hits=observed.filter(event=>event.impact==='beam-crosscut'&&event.interception);
    assert.equal(Boolean(launch),variant==='crossing',variant);
    assert.equal(hits.length,variant==='crossing'?group.length:0,variant);
    if(variant==='ridge')assert.ok(group.every(enemy=>enemy.hp>0));
    if(!launch)continue;
    assert.ok(!hits.some(hit=>hit.targetId===decoy.id));
    assert.ok(launch.targets.every(target=>target.forecast.x<target.x-1.1));
    assert.deepEqual(new Set(launch.receiverIds),new Set(group.map(enemy=>enemy.id)));
    assert.ok(hits.every(hit=>hit.age>=launch.age+launch.windup-1e-9&&hit.killed));
    assert.ok(hits.at(-1).age-hits[0].age>.016);
  }
});

test('a finished beam still burns late ground arrivals or yields its struck patch to a real low rain field', () => {
  for (const variant of ['rain','dry','high-rain']) {
    const {game, prey, observed} = encounter('beam',3,'reach');
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge=100;
    for (const x of [-2,0,2]) prey(x,10);
    const step=()=>{game.time+=1/60;game.enemyGrid.invalidate();updateDragonArt(game,1/60);};
    for(let tick=0;tick<220;tick++)step();
    const state=game.dragonScorch;
    const ended=observed.find(event=>event.type==='dragonArtEnd');
    assert.ok(ended&&state&&!game.activeDragonArt);
    const lane=state.lanes[Math.floor(state.lanes.length/2)];
    const site=lane.points[4];
    const target=prey(site.x+lane.direction.x*3.45,site.z+lane.direction.z*3.45,site.y+.65);
    const witness=prey(target.x+lane.direction.z*33,target.z-lane.direction.x*33,site.y+.65);
    const high=prey(target.x,target.z,site.y+6.2);
    const rain=variant!=='dry' && game.addZone('rain',{x:site.x,y:site.y+(variant==='rain'?0:5),z:site.z,radius:3,life:3});
    for(let tick=0;tick<68;tick++)step();
    const launch=observed.find(event=>event.reaction==='beam-quench');
    const hit=observed.find(event=>event.targetId===target.id&&(event.impact==='beam-quench'||event.impact==='beam-scorch'));
    if(variant==='rain') {
      assert.equal(launch.carrierId,rain.id);
      assert.ok(launch.age>ended.age && launch.to.y>launch.from.y+1.6);
      assert.ok(state.lanes.some(track=>track.doused.length>0));
      const steam=observed.find(event=>event.targetId===target.id&&event.impact==='beam-quench');
      assert.ok(steam?.age>launch.age+.13);
      assert.ok(target.wet>0 && target.burn===0);
    } else {
      assert.equal(launch,undefined);
      assert.equal(hit?.impact,'beam-scorch');
      assert.ok(hit.age>ended.age && target.burn>0);
    }
    assert.deepEqual(observed.filter(event=>[witness.id,high.id].includes(event.targetId)),[]);
    for(let tick=0;tick<180;tick++)step();
    assert.equal(game.dragonScorch,null);
  }
});

test('the visible reverse sweep stops dealing beam-line hits while its scorch remains', () => {
  const {game,prey,observed}=encounter('beam',3,'reach');
  game.cultivation.weapons=[];
  game.cultivation.invalidateModifiers();
  game.dragonArtCharge=100;
  for (const x of [-2,0,2]) prey(x,10);
  const advance=seconds=>{
    const until=game.time+seconds;
    while(game.time<until){
      game.time+=1/60;
      game.enemyGrid.invalidate();
      updateDragonArt(game,1/60);
    }
  };
  advance(2.25);
  const art=game.activeDragonArt;
  assert.equal(art.phase,'release');
  assert.equal(art.phaseAt,2.08);
  const late=prey(game.p.x+Math.sin(art.sweepAngle)*12,game.p.z+Math.cos(art.sweepAngle)*12,game.p.y+3.3);
  advance(.60);
  assert.ok(game.dragonScorch.lanes.length);
  assert.equal(late.hp,late.maxHp);
  assert.ok(!observed.some(event=>event.targetId===late.id&&event.impact==='hit'));
});

test('rain stores real steam until a safe low arrival, but expiry or lightning spends that opportunity', () => {
  for (const variant of ['arrival','expired','charged']) {
    const {game,prey,observed}=encounter('beam',3,'reach');
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge=100;
    for (const x of [-2,0,2]) prey(x,10);
    const advance=seconds=>{
      const until=game.time+seconds;
      while(game.time<until){
        game.time+=1/60;
        game.enemyGrid.invalidate();
        updateDragonArt(game,1/60);
      }
    };
    advance(3.68);
    const state=game.dragonScorch;
    const lane=state.lanes[Math.floor(state.lanes.length/2)];
    const site=lane.points[4];
    const rain=game.addZone('rain',{...site,radius:3,life:3});
    const high=prey(site.x+lane.direction.x*3.45,site.z+lane.direction.z*3.45,site.y+6.2);
    const drySide=prey(site.x+33,site.z,site.y+.65);
    advance(.65);
    const stored=observed.find(event=>event.reaction==='beam-quench-store');
    assert.equal(stored.carrierId,rain.id);
    assert.equal(state.reservoirs.length,1);
    const steam=game.zones.find(zone=>zone.id===stored.zoneId);
    assert.equal(steam.kind,'steam');
    assert.ok(!observed.some(event=>event.reaction==='beam-quench'));
    if (variant==='expired') advance(1.5);
    if (variant==='charged') steam.kind='thunder';
    const target=prey(site.x+lane.direction.x*3.45,site.z+lane.direction.z*3.45,site.y+.65);
    advance(.70);
    const release=observed.find(event=>event.reaction==='beam-quench');
    const hit=observed.find(event=>event.targetId===target.id&&event.impact==='beam-quench');
    if (variant==='arrival') {
      assert.equal(release.zoneId,steam.id);
      assert.equal(release.leg,stored.leg);
      assert.ok(release.stored&&release.heldFor>.60);
      assert.equal(hit.zoneId,steam.id);
      assert.ok(hit.amount>0&&target.wet>0);
    } else {
      assert.equal(release,undefined);
      assert.equal(hit,undefined);
    }
    assert.equal(state.reservoirs.length,0);
    assert.ok(!observed.some(event=>event.targetId===high.id||event.targetId===drySide.id));
  }
});

test('a finite quenched trail climbs a real slope into the high flank and stops at a cliff', () => {
  for (const variant of ['slope','rainfall','flat','cliff','dry']) {
    const {game,prey,observed}=encounter('beam',3,'reach');
    game.stage=3;
    game.p.y=game.p.altitude=11.2;
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge=100;
    game.setTerrain(()=>10);
    for (const x of [-2,0,2]) prey(x,9,11.2);
    const advance=seconds=>{
      const until=game.time+seconds;
      while(game.time<until){
        game.time+=1/60;
        game.enemyGrid.invalidate();
        updateDragonArt(game,1/60);
      }
    };
    advance(3.10);
    const heat=game.dragonScorch;
    const lane=heat.lanes[Math.floor(heat.lanes.length/2)];
    const site=lane.points[4];
    const dir=lane.direction;
    const end=(along,side,y)=>prey(site.x+dir.x*along+dir.z*side,site.z+dir.z*along-dir.x*side,y);
    game.setTerrain((x,z)=>{
      if (variant==='flat') return 10;
      const along=(x-site.x)*dir.x+(z-site.z)*dir.z;
      if (variant==='cliff' && along>=2.4 && along<4.7) return 14.5;
      return 10+Math.min(3.7,Math.max(0,(along-.45)*.48));
    });
    const high=[end(6.9,-.51,14.55),end(7.9,.52,14.8),end(8.9,.22,15.04)];
    for (const target of high) target.hp=target.maxHp=45;
    const offSide=end(7.9,7.8,15);
    const above=end(8.1,.2,19);
    const falling=variant==='rainfall';
    const rain=variant!=='dry'&&game.addZone('rain',{...site,y:site.y+(falling?3.65:0),radius:falling?3:1.15,life:2.1});
    advance(1.45);
    const rise=observed.find(event=>event.reaction==='beam-quench'&&event.climbing);
    const hits=observed.filter(event=>event.impact==='beam-quench'&&event.climbing);
    const climbs=variant==='slope'||falling;
    assert.equal(Boolean(rise),climbs,variant);
    assert.equal(hits.length,climbs?high.length:0,variant);
    assert.ok(!observed.some(event=>[offSide.id,above.id].includes(event.targetId)));
    if (!rise) {
      assert.ok(high.every(enemy=>enemy.hp>0),variant);
      continue;
    }
    assert.equal(rise.carrierId,rain.id);
    assert.equal(rise.rainfall,falling);
    assert.ok(rise.terrainRise>3.4);
    assert.ok(rise.points.every(p=>p.y>p.ground));
    assert.ok(hits.every((hit,i)=>hit.targetId===high[i].id&&hit.killed&&hit.age>rise.age+rise.windup));
    assert.equal(heat.quenched,1);
  }
});

test('rain runoff must physically reach a live hot trace before sending uphill steam',()=>{
  for(const variant of ['runoff','divider','expired','dry']) {
    const {game,prey,observed}=encounter('beam',3,'reach');
    game.stage=3;
    game.p.y=game.p.altitude=11.2;
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge=100;
    game.setTerrain(()=>10);
    for(const x of [-2,0,2])prey(x,9,11.2);
    const tick=n=>{for(let i=0;i<n;i++){
      game.time+=1/60;
      game.enemyGrid.invalidate();
      updateDragonArt(game,1/60);
    }};
    tick(186);
    const heat=game.dragonScorch;
    const lane=heat.lanes[Math.floor(heat.lanes.length/2)];
    const site=lane.points[4],dir=lane.direction;
    heat.lanes.splice(0,heat.lanes.length,lane);
    const point=(along,side,y)=>({x:site.x+dir.x*along+dir.z*side,y,z:site.z+dir.z*along-dir.x*side});
    game.setTerrain((x,z)=>{
      const dx=x-site.x,dz=z-site.z;
      const along=dx*dir.x+dz*dir.z, side=dx*dir.z-dz*dir.x;
      const divider=variant==='divider'&&side>2.3&&side<3.8 ? 3.5 : 0;
      return 10+Math.min(3.7,Math.max(0,(along-.45)*.48))+Math.min(3.2,Math.max(0,side*.46))+divider;
    });
    const group=[6.9,7.9,8.9].map((along,i)=>{
      const target=point(along,-.36,14.55+i*.23),enemy=prey(target.x,target.z,target.y);
      enemy.hp=enemy.maxHp=45;
      return enemy;
    });
    const anchor=point(0,7.8,14.2);
    const hypothetical={...anchor,hp:100};
    const wetBefore=game.zones.length;
    assert.equal(Number.isFinite(beamRainPlacement(game,hypothetical,2.8)),variant!=='divider',variant);
    assert.equal(game.zones.length,wetBefore);
    assert.equal(heat.runoff,undefined);
    if(variant!=='dry')game.addZone('rain',{...anchor,radius:2.8,life:2.0});
    let feed;
    for(let i=0;i<74;i++) {
      tick(1);
      feed=observed.find(e=>e.reaction==='beam-quench-runoff');
      if(!feed)continue;
      assert.ok(!heat.douses.length&&group.every(enemy=>enemy.hp===45));
      if(variant==='expired')game.zones.find(z=>z.id===feed.carrierId).life=0;
      break;
    }
    assert.equal(Boolean(feed),variant==='runoff'||variant==='expired',variant);
    tick(90);
    const release=observed.find(e=>e.reaction==='beam-quench'&&e.runoff);
    assert.equal(Boolean(release),variant==='runoff',variant);
    if(!release) {
      assert.ok(group.every(enemy=>enemy.hp===45),variant);
      continue;
    }
    assert.ok(feed.points.every((p,i,ps)=>!i||p.ground<=ps[i-1].ground+.32));
    assert.ok(release.age-feed.age>=feed.travel-1e-6);
    assert.equal(heat.quenched,1);
    const hits=observed.filter(e=>e.impact==='beam-quench'&&e.climbing);
    assert.deepEqual(hits.map(e=>e.targetId),group.map(e=>e.id));
    assert.ok(hits.every(hit=>hit.killed&&hit.age>release.age+release.windup));
  }
});

test('a horde shatter spreads hits across frames and still reaches every frozen target', () => {
  const {game, prey, observed, through} = encounter('stone');
  const horde = [];
  for (let i = 0; i < 142; i++) {
    const angle = i * 2.399963;
    const range = 4 + i / 70;
    horde.push(prey(Math.sin(angle) * range, Math.cos(angle) * range));
  }
  through(() => game.activeDragonArt?.phase === 'wave');
  assert.ok(horde.every(enemy => enemy.hp > 0));
  // Isolate the shatter after an actual cast, so pre-existing shots do not thin the fixture.
  game.enemies = horde.slice();
  game.enemyGrid.invalidate();
  game.shots.length = 0;
  for (const weapon of game.cultivation.weapons) weapon.cd = 60;
  for (const enemy of horde) enemy.hp = 45;
  let peak = 0;
  let timestamp = -1;
  let hits = 0;
  const shatterTargets = new Set();
  const emit = game.emit;
  game.emit = (type, event) => {
    if (type === 'hit' && event.source === 'dragon-art-stone') {
      shatterTargets.add(event.targetId);
      if (timestamp !== game.time) {
        timestamp = game.time;
        hits = 0;
      }
      peak = Math.max(peak, ++hits);
    }
    emit(type, event);
  };
  through(() => observed.some(event => event.type === 'dragonArtEnd'));
  assert.ok(horde.every(enemy => shatterTargets.has(enemy.id)));
  assert.ok(peak <= 30);
  const breaks = observed.filter(event => event.type === 'dragonArtBreak');
  assert.ok(breaks.length > 0, 'a shattering crowd emits a single grouped audiovisual hit');
  for (const [index, event] of breaks.entries()) {
    assert.ok(event.burstKills >= 5 && event.centers.length > 0 && event.centers.length <= 4);
    if (index) assert.ok(event.age - breaks[index - 1].age >= .44);
  }
});

test('stone spread locks the rim while stone relay jumps from that rim to the next formation', () => {
  for (const doctrine of ['reach','echo']) {
    const {game, prey, observed, through} = encounter('stone',3,doctrine);
    for (const x of [-3,0,3]) prey(x,6);
    through(() => game.activeDragonArt?.phase==='wave');
    const {x,z}=game.activeDragonArt.center;
    const rim=prey(x,z-17.4);
    const middle=prey(x,z-22.4);
    const outer=prey(x,z-28.1);
    through(() => observed.some(event=>event.type==='dragonArtEnd'),3);
    assert.ok(observed.some(event=>event.targetId===rim.id&&event.impact==='lock'));
    assert.equal(observed.some(event=>event.targetId===middle.id&&event.sourceId===rim.id
      &&event.impact==='stone-chain'),doctrine==='echo');
    assert.equal(observed.some(event=>event.targetId===outer.id&&event.sourceId===middle.id
      &&event.impact==='stone-chain'),doctrine==='echo');
    assert.equal(observed.some(event=>event.phase==='echo'),false);
  }
});

test('the outer stone breaks lead a moving front around the flank into a later shoal', () => {
  for (const mode of ['entering','closing','stationary','bank','single-break','single-entrant']) {
    const {game, prey, observed} = encounter('stone',3,'echo');
    game.stage=2;
    game.p.y=game.p.altitude=2;
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    if (mode==='bank') game.setShore(x=>x>5&&x<8?.9:0);
    const tick = count => {
      for (let i=0;i<count;i++) {
        game.time += 1/60;
        game.enemyGrid.invalidate();
        updateDragonArt(game,1/60);
      }
    };
    for (const x of [-2,0,2]) prey(x,3,2);
    const edge = prey(0,14,2);
    const support = mode==='single-break' ? null : prey(-3.1,12,2);
    game.dragonArtCharge=100;
    const group = x=>[-1.8,0,1.8].map(offset=>prey(x+offset,22.2,2));
    let incoming = mode==='stationary' ? group(12.5) : mode==='closing' ? group(16) : [];
    tick(121);
    if (mode==='single-entrant') incoming = [prey(12.5,22.2,2)];
    else if (mode==='closing') for (const enemy of incoming) enemy.x -= 3.5;
    else if (mode!=='stationary') incoming = group(12.5);
    for (const enemy of incoming) enemy.hp=enemy.maxHp=1;
    const opposite = prey(-12.5,22.2,2);
    const high = prey(12.5,22.2,8);
    tick(145);
    const launch = observed.find(event=>event.reaction==='stone-march');
    const impacts = observed.filter(event=>event.impact==='stone-march');
    const positive = mode==='entering' || mode==='closing';
    assert.equal(Boolean(launch),positive,mode);
    assert.equal(impacts.length,positive ? incoming.length : 0,mode);
    assert.ok(!observed.some(event=>event.targetId===opposite.id || event.targetId===high.id),mode);
    if (!positive) continue;
    assert.deepEqual(new Set(launch.sourceIds),new Set([edge.id,support.id]));
    assert.ok(launch.sourceIds.every(id=>observed.some(event=>event.targetId===id&&event.impact==='crush')));
    assert.ok(launch.points.length>10 && launch.to.along > Math.hypot(launch.to.x-launch.from.x,launch.to.z-launch.from.z));
    assert.ok(new Set(impacts.map(hit=>hit.targetId)).size===incoming.length);
    assert.ok(impacts.every(hit=>hit.killed&&hit.amount>0&&hit.age>launch.age+launch.windup+.20));
    assert.ok(incoming.every(enemy=>enemy.hp<=0));
  }
});

test('clustered stone shells send a terrain-aware moving front once to different enemies', () => {
  for (const caseName of ['fan','sweep','bank','too-few-sources']) {
    const {game,prey,observed} = encounter('stone',caseName==='sweep'?2:3,caseName==='sweep'?null:'reach');
    game.stage=2;
    game.p.y=game.p.altitude=2;
    game.cultivation.weapons=[];
    game.cultivation.invalidateModifiers();
    if (caseName==='bank') game.setShore(x=>Math.abs(x)>4&&Math.abs(x)<10?.95:0);
    const sources=Array.from({length:caseName==='too-few-sources'?5:8},(_,i)=>prey(i%4-1.5,13+Math.floor(i/4)*1.2,2));
    const distant=[-1,1].flatMap(side=>[-1.15,0,1.15].map(dz=>prey(side*12,20.8+dz,2)));
    const upper=prey(12,20.8,9);
    for (const enemy of [...sources,...distant,upper]) enemy.hp=enemy.maxHp=1;
    game.dragonArtCharge=100;
    for(let i=0;i<194;i++) {
      game.time+=1/60;
      game.enemyGrid.invalidate();
      updateDragonArt(game,1/60);
    }
    const hold=observed.find(e=>e.reaction==='stone-contour-hold');
    const routes=observed.filter(e=>e.reaction==='stone-contour');
    const impacts=observed.filter(e=>e.impact==='stone-contour');
    const expected=caseName==='fan'?2:caseName==='sweep'?1:0;
    assert.equal(routes.length,expected,caseName);
    assert.equal(Boolean(hold),caseName!=='too-few-sources',caseName);
    if(hold)assert.ok(hold.age<1.44&&hold.receiverIds.every(id=>sources.some(enemy=>enemy.id===id)),caseName);
    assert.equal(impacts.length,expected*3,caseName);
    assert.equal(new Set(impacts.map(hit=>hit.targetId)).size,impacts.length,caseName);
    assert.ok(impacts.every(hit=>hit.killed&&distant.some(enemy=>enemy.id===hit.targetId)),caseName);
    for(const route of routes) {
      assert.ok(route.sourceIds.length>=6&&route.sourceIds.every(id=>sources.some(enemy=>enemy.id===id)),caseName);
      assert.ok(route.sourceIds.every(id=>observed.some(hit=>hit.targetId===id&&hit.killed&&hit.age<=route.age)),caseName);
      assert.ok(impacts.filter(hit=>hit.leg===route.leg).every(hit=>hit.age>route.age+route.windup),caseName);
    }
  }
});

test('frost spread catches a dry high target while frost relay reaches outward through wet targets', () => {
  for(const doctrine of ['reach','echo']){
    const {game,prey,observed,through}=encounter('frost',3,doctrine);
    for(const x of [-3,0,3])prey(x,5);
    through(()=>game.activeDragonArt?.phase==='freeze');
    const {x,y,z}=game.activeDragonArt.center;
    const high=prey(x+4,z,y+8.3);
    const wet=prey(x,z-22.5);
    wet.wet=15;
    const beyond=prey(x,z-28.8);
    beyond.wet=15;
    through(()=>observed.some(event=>event.type==='dragonArtEnd'),3);
    assert.equal(observed.some(event=>event.targetId===high.id&&event.impact==='lock'),doctrine==='reach');
    assert.equal(observed.some(event=>event.targetId===beyond.id&&event.sourceId===wet.id
      &&event.impact==='frost-chain'),doctrine==='echo');
  }
});

test('lightning cracks a wet frozen target early and splinters hit a separate formation', () => {
  const {game,prey,observed,through}=encounter('frost',2,'reach');
  for(const x of [-2,0,2])prey(x,5);
  const relay=prey(0,16);
  const far=prey(0,20.6,game.p.y+.2);
  through(()=>game.activeDragonArt?.phase==='freeze');
  relay.wet=6;
  through(()=>relay.dragonArtMark==='frost',.8);
  game.damage(relay,1,'lightning');
  through(()=>observed.some(e=>e.targetId===far.id&&e.impact==='crush'),.27);
  const early=observed.find(e=>e.targetId===relay.id&&e.impact==='resonance');
  assert.ok(early&&early.phase==='freeze');
  assert.equal(relay.dragonArtMark,undefined);
  through(()=>observed.some(e=>e.type==='dragonArtEnd'));
  assert.equal(observed.find(e=>e.type==='dragonArtEnd').comboFractures,1);
});

test('real lightning on a wet ice shell splits rank III into delayed upper and lower paths', () => {
  for (const [rank, wet] of [[3,true], [2,true], [3,false]]) {
    const {game, prey, observed} = encounter('frost', rank, 'reach');
    game.stage = 3;
    game.p.y = game.p.altitude = 8;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    for (const x of [-3,0,3]) prey(x,8,8);
    const anchor = prey(0,rank===3 ? 23 : 20,8);
    const upper = prey(2.6,rank===3 ? 28.4 : 25.0,12.2);
    const lower = prey(-2.6,rank===3 ? 28.1 : 25.1,4.9);
    const secondUpper = prey(4.35,33.2,12.8);
    const secondLower = prey(-4.4,32.8,4.4);
    const dry = prey(0,29.0,8);
    const unreachable = prey(0,29.2,20);
    if (wet) anchor.wet=5;
    for (const enemy of [upper,lower,secondUpper,secondLower,unreachable]) enemy.wet=5;
    function tick() {
      game.time += 1/60;
      game.enemyGrid.invalidate();
      updateDragonArt(game,1/60);
    }
    for (let i=0;i<30;i++) tick();
    assert.equal(anchor.dragonArtMark==='frost',wet);
    game.lightning(anchor,1,'lightning',{x:anchor.x,y:anchor.y+4,z:anchor.z},{chain:1,damage:1});
    for (let i=0;i<145;i++) tick();
    const forks = observed.filter(event=>event.reaction==='frost-thunder-fork');
    const strikes = observed.filter(event=>event.impact==='frost-thunder-fork');
    assert.deepEqual(forks.filter(event=>event.depth===0).map(event=>event.branch),wet?(rank===3?['upper','lower']:['upper']):[]);
    assert.deepEqual(strikes.map(event=>event.targetId), wet ? rank===3 ? [upper.id,lower.id,secondUpper.id,secondLower.id] : [upper.id] : []);
    assert.ok(!strikes.some(event=>[dry.id,unreachable.id].includes(event.targetId)));
    if (rank===3 && wet) {
      assert.ok(strikes[1].age - strikes[0].age >= .10);
      assert.equal(forks.find(event=>event.targetId===secondUpper.id).sourceId,upper.id);
      assert.equal(forks.find(event=>event.targetId===secondLower.id).sourceId,lower.id);
    }
  }
});

function iceForkEncounter(doctrine, observeTechniques = false) {
  const {game, prey, observed} = encounter('frost', 3, doctrine);
  game.stage = 3;
  game.p.y = game.p.altitude = 8;
  game.cultivation.weapons = [];
  game.cultivation.invalidateModifiers();
  game.dragonArtCharge = 100;
  for (const x of [-3, 0, 3]) prey(x, 8, 8);
  const source = prey(0, 23, 8);
  source.wet = 5;
  if (observeTechniques) {
    const emit = game.emit;
    game.emit = (type, event) => {
      if (type.startsWith('techniqueArt')) observed.push({type,...event});
      emit(type,event);
    };
  }
  function tick(count) {
    for (let i=0;i<count;i++) {
      game.time += 1/60;
      game.enemyGrid.invalidate();
      if (observeTechniques) updateTechniqueArts(game);
      updateDragonArt(game,1/60);
    }
  }
  function start() {
    tick(30);
    assert.equal(source.dragonArtMark,'frost');
    game.lightning(source,1,'lightning',{x:source.x,y:source.y+4,z:source.z},{chain:1,damage:1});
    for(let i=0;i<14 && !observed.some(event=>event.reaction==='frost-thunder-fork');i++) tick(1);
  }
  return {game, prey, observed, tick, start, source};
}

test('the sealed-air frost fork actually holds then shatters wet enemies sharing each height shelf', () => {
  const {game, prey, observed, tick, start} = iceForkEncounter('reach');
  const upper = [prey(3,28,12),prey(4.5,28,12.4),prey(5,29,12)];
  const lower = [prey(-3,28,4.9),prey(-4.5,28,4.7),prey(-5,29,4.8)];
  const dry = prey(3,29,12);
  const above = prey(5,35,15.5);
  for (const enemy of [...upper,...lower,above]) enemy.wet = 5;
  for (const enemy of [...upper,...lower]) enemy.hp = 30;
  start();
  const formations = observed.filter(event=>event.reaction==='frost-thunder-fork');
  assert.deepEqual(formations.map(event=>[event.formation,event.branch]), [['shelf','upper'],['shelf','lower']]);
  assert.deepEqual(formations.map(event=>event.receivers.map(x=>x.id)), [upper.map(x=>x.id),lower.map(x=>x.id)]);
  for (const enemy of [...upper,...lower]) {
    assert.equal(enemy.dragonArtMark,'frost');
    assert.ok(enemy.dragonArtHeldUntil>game.time+.15);
    assert.equal(enemy.hp,30);
  }
  tick(35);
  const hits = observed.filter(event=>event.impact==='frost-thunder-fork' && event.formation==='shelf');
  assert.deepEqual(hits.map(event=>event.targetId), [...upper,...lower].map(x=>x.id));
  assert.ok(hits.every(event=>event.killed));
  assert.ok(hits[3].age - hits[0].age >= .10);
  assert.ok([...upper,...lower].every(enemy=>enemy.dragonArtHeldUntil===undefined));
  assert.equal(dry.hp,850);
  assert.equal(above.hp,850);
});

test('relay frost separates lateral lanes and visibly reacquires a living wet target when the lead dies', () => {
  const {game, prey, observed, tick, start} = iceForkEncounter('echo');
  const lead = prey(-4,27.4,8);
  const other = prey(4.2,27.7,8.1);
  const relief = prey(-4.6,29.2,8.1);
  const continuation = prey(7.9,31.4,8.1);
  const dry = prey(-3.9,28.4,8);
  for (const enemy of [lead, other, relief, continuation]) enemy.wet = 5;
  start();
  const routes = observed.filter(event=>event.reaction==='frost-thunder-fork');
  assert.equal(routes.length,2);
  assert.deepEqual(new Set(routes.map(event=>event.lane)), new Set(['left','right']));
  assert.ok(routes.every(event=>event.formation==='relay'&&event.branch==='surface'&&event.receivers.length===1));
  assert.equal(lead.dragonArtHeldUntil,undefined);
  assert.ok(lead.frostSlowUntil>game.time);
  game.damage(lead,1000,'needle');
  tick(40);
  const updated = observed.find(event=>event.reaction==='frost-thunder-fork'&&event.redirected);
  assert.equal(updated?.leg,routes.find(event=>event.targetId===lead.id)?.leg);
  assert.equal(updated?.targetId,relief.id);
  const hits = observed.filter(event=>event.impact==='frost-thunder-fork');
  assert.ok(hits.some(event=>event.targetId===relief.id&&event.leg===updated.leg&&event.redirected));
  assert.ok(hits.some(event=>event.targetId===continuation.id&&event.sourceId===other.id&&event.depth===1));
  assert.ok(!hits.some(event=>event.targetId===lead.id));
  assert.equal(dry.hp,850);
});

test('a real relay frost strike bends through an equipped prism toward a clear high flank', () => {
  for (const mode of ['relay','rank-two','no-prism','miss','ridge','shelf']) {
    const {game, prey, observed, tick, start, source} = iceForkEncounter(mode==='shelf'?'reach':'echo',true);
    if (mode==='rank-two') {
      game.cultivation.dragonArtRank=2;
      source.z=21;
    }
    const anchor = mode==='miss' ? prey(-4.1,22.4,8) : prey(-2,25.2,8);
    anchor.wet = 5;
    const left = prey(-4,27.4,8), right = prey(4.2,27.7,8.1);
    left.wet = right.wet = 5;
    const flank = prey(2.4,28.6,11.1);
    const sameLayer = prey(-4.8,31.4,8.1);
    const farSide = prey(-10.5,25.2,12.2);
    if (mode==='ridge') game.setTerrain((x,z)=>x>.4&&x<1.7&&z>26.5&&z<28.3?15.2:0);
    if (mode!=='no-prism') {
      const weapon = game.cultivation.makeWeapon('icekeel',1);
      game.cultivation.weapons.push(weapon);
      const prism = techniqueStats(weapon);
      assert.ok(castTechniqueArt(game,anchor,prism));
    }
    start();
    tick(55);
    const forks = observed.filter(event=>event.impact==='frost-thunder-fork');
    const bend = observed.find(event=>event.type==='techniqueArtRelease'&&event.carrier==='frost-fork');
    const hit = observed.find(event=>event.type==='techniqueArtImpact'&&event.carrier==='frost-fork');
    assert.ok(forks.length>0,mode);
    const expected = mode==='relay' || mode==='rank-two';
    assert.equal(Boolean(bend),expected,mode);
    assert.equal(Boolean(hit),expected,mode);
    assert.equal(sameLayer.hp,sameLayer.maxHp,mode);
    assert.equal(farSide.hp,farSide.maxHp,mode);
    if (!bend) {
      assert.equal(flank.hp,flank.maxHp,mode);
      continue;
    }
    assert.equal(bend.anchorId,anchor.id);
    assert.equal(bend.targetId,flank.id);
    assert.equal(hit.forkLeg,bend.forkLeg);
    assert.equal(hit.targetId,flank.id);
    assert.ok(forks.some(fork=>fork.id===bend.dragonArtId&&fork.leg===bend.forkLeg&&fork.targetId===bend.forkTargetId));
    assert.ok(flank.hp<flank.maxHp && flank.charge>0);
  }
});

test('a spent wet shell can send a real late bolt to a prism when no wet creature remains in reach', () => {
  for (const mode of ['surface','dry-shell','rock','sealed-air']) {
    const {game, prey, observed, tick, source} = iceForkEncounter(mode==='sealed-air'?'reach':null,true);
    game.cultivation.dragonArtRank=mode==='sealed-air'?3:2;
    source.z=20.4;
    source.wet=mode==='dry-shell'?0:5;
    const anchor=prey(5.6,22.7,8);
    anchor.wet=5;
    const flank=prey(6.1,30.0,10.6);
    const opposite=prey(-3.1,30,10.6);
    flank.hp=flank.maxHp=1;
    if (mode==='rock') game.setTerrain((x,z)=>x>1.5&&x<4&&z>20.4&&z<22.8?14:0);
    const prism=game.cultivation.makeWeapon('icekeel',1);
    game.cultivation.weapons.push(prism);
    assert.ok(castTechniqueArt(game,anchor,techniqueStats(prism)));
    tick(48);
    // A prism is physical and persists after its wet anchor is defeated.
    game.damage(anchor,1000,'needle');
    tick(8);
    if (mode==='dry-shell') source.wet=0;
    game.lightning(source,1,'lightning',{x:source.x,y:source.y+3.8,z:source.z},{chain:1,damage:2000});
    tick(82);
    const open=observed.find(e=>e.reaction==='frost-prism-fork');
    const bend=observed.find(e=>e.type==='techniqueArtImpact'&&e.carrier==='frost-fork');
    const positive=mode==='surface';
    assert.equal(Boolean(open),positive,mode);
    assert.equal(Boolean(bend),positive,mode);
    assert.equal(flank.hp<=0,positive,mode);
    assert.equal(opposite.hp,opposite.maxHp,mode);
    if (!positive) continue;
    assert.equal(open.sourceId,source.id);
    assert.equal(open.anchorId,anchor.id);
    assert.equal(open.targetId,flank.id);
    assert.equal(bend.sourceId,source.id);
    assert.equal(bend.targetId,flank.id);
    assert.ok(bend.killed);
    assert.equal(flank.dragonArtMark,undefined);
  }
});

test('icekeel spends one held external charge on a real neighboring frost shell or its normal route', () => {
  for (const mode of ['linked','no-shell','no-charge','sealed-air']) {
    const {game, prey, observed, tick} = iceForkEncounter(mode==='sealed-air'?'reach':null,true);
    game.cultivation.dragonArtRank=mode==='sealed-air'?3:2;
    const anchor=prey(0,8,8);
    anchor.wet=5;
    const shell=prey(1.35,8.5,8);
    shell.wet=mode==='no-shell'?0:5;
    const high=prey(5.7,8.4,10.5);
    const prism=game.cultivation.makeWeapon('icekeel',1);
    game.cultivation.weapons.push(prism);
    assert.ok(castTechniqueArt(game,anchor,techniqueStats(prism)));
    if (mode!=='no-charge') game.lightning(anchor,1,'lightning',{x:0,y:8,z:4},{chain:1,damage:2000});
    tick(42);
    const hold=observed.filter(e=>e.reaction==='frost-prism-hold');
    const releases=observed.filter(e=>e.type==='techniqueArtRelease'&&e.kind==='icekeel');
    const hits=observed.filter(e=>e.type==='techniqueArtImpact'&&e.kind==='icekeel');
    assert.equal(hold.length,Number(mode==='linked'||mode==='no-shell'),mode);
    assert.equal(releases.length,Number(mode!=='no-charge'),mode);
    assert.equal(hits.length,Number(mode!=='no-charge'),mode);
    if(mode==='no-charge') continue;
    assert.equal(Boolean(releases[0].conducted),mode==='linked',mode);
    if(mode==='linked') {
      assert.equal(hits[0].targetId,high.id);
      assert.equal(releases[0].carrier,'frost-fork');
      assert.equal(releases[0].sourceId,shell.id);
      assert.equal(releases[0].chargedFrom,'lightning');
      assert.deepEqual(releases[0].frostContact,{x:shell.x,y:shell.y,z:shell.z});
      assert.ok(high.hp<high.maxHp);
      assert.equal(high.dragonArtMark,undefined);
    }
  }
});

test('a surviving wet shell can carry real thunder for a short interval after the ordinary shatter', () => {
  for (const late of [false,true]) {
    const {game, prey, observed} = encounter('frost', 2, 'reach');
    game.stage = 3;
    game.p.y = game.p.altitude = 8;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    for (const x of [-2,0,2]) prey(x,6,8);
    const anchor = prey(0,20,8);
    const receiver = prey(2.8,25.4,8.1);
    anchor.wet = receiver.wet = 5;
    function tick() {
      game.time += 1/60;
      game.enemyGrid.invalidate();
      updateDragonArt(game,1/60);
    }
    for (let frame=0;frame<78;frame++) tick();
    assert.ok(observed.some(event=>event.impact==='crush' && event.targetId===anchor.id));
    assert.equal(anchor.dragonArtMark,undefined);
    if (late) for (let frame=0;frame<27;frame++) tick();
    game.lightning(anchor,1,'lightning',{x:anchor.x,y:anchor.y+4,z:anchor.z},{chain:1,damage:1});
    for (let frame=0;frame<55;frame++) tick();
    const launch = observed.find(event=>event.reaction==='frost-thunder-fork' && event.targetId===receiver.id);
    assert.equal(Boolean(launch),!late);
    if (launch) {
      assert.equal(launch.grounded,true);
      assert.ok(receiver.frostSlowUntil > 0);
    }
  }
});

test('rift and abyss give point-blank prey a readable approach, then mix a real field at the mouth', () => {
  for (const [kind, status, reaction, field] of [
    ['rift', 'wet', 'steam-bloom', 'steam'], ['abyss', 'poison', 'fire-bloom', 'fire'],
  ]) {
    const {game, prey, observed, through} = encounter(kind, 2);
    for (const x of [-4, 0, 4]) prey(x, 10);
    through(() => game.activeDragonArt?.phase === (kind === 'rift' ? 'suction' : 'spiral'));
    const mouth = game.activeDragonArt.center;
    const burning = prey(mouth.x, mouth.z, mouth.y);
    const reagent = prey(mouth.x + .24, mouth.z, mouth.y);
    Object.assign(burning, {hp: 1, burn: 4, dotCD: 10});
    Object.assign(reagent, {hp: 1, [status]: 4, dotCD: 10});
    through(() => burning.dragonArtCaptureProgress === 0, .15);
    const enteredAt = game.time;
    through(() => burning.dragonArtCaptureProgress > .28, .16);
    assert.ok(burning.hp > 0);
    assert.ok(Math.hypot(burning.x - mouth.x, burning.z - mouth.z) > .3);
    through(() => burning.hp <= 0, .30);
    assert.ok(game.time - enteredAt >= .20 && game.time - enteredAt <= .31);
    assert.ok(observed.some(event => event.targetId === burning.id && event.absorbed));
    through(() => observed.some(event => event.reaction === reaction), .24);
    const zone = game.zones.find(zone => zone.kind === field && zone.x === mouth.x && zone.z === mouth.z);
    assert.ok(zone);
    if (field === 'fire') assert.ok(zone.toxic > 0);
  }
});

test('a crest breaks a stone shell towards the flank while a normal kill leaves its shell until shatter', () => {
  const {game, prey, observed, through} = encounter('stone', 2);
  for (const x of [-3, 0, 3]) prey(x, 6);
  through(() => game.activeDragonArt?.phase === 'wave');
  const {x, z} = game.activeDragonArt.center;
  const breaker = prey(x, z - 8);
  const survivor = prey(x + 3, z - 8);
  through(() => breaker.dragonArtMark === 'stone' && survivor.dragonArtMark === 'stone');
  const forward = prey(breaker.x, breaker.z - 6.3);
  const lateral = prey(breaker.x + 6.3, breaker.z);
  game.activeCascade = {kind:'water', direction:{x:0,z:-1}};
  game.damage(breaker, breaker.hp + 1, 'cascade-water');
  game.activeCascade = null;
  game.damage(survivor, survivor.hp + 1, 'bubble');
  assert.ok(game.activeDragonArt.shells.has(breaker.id));
  assert.ok(game.activeDragonArt.shells.has(survivor.id));
  through(() => observed.some(event => event.targetId === forward.id && event.impact === 'stone-surge'), .35);
  assert.ok(!observed.some(event => event.targetId === lateral.id && event.impact === 'stone-surge'));
  assert.ok(observed.some(event => event.targetId === breaker.id && event.shell && !event.killed));
  assert.ok(game.activeDragonArt.shells.has(survivor.id));
  through(() => observed.some(event => event.targetId === survivor.id && event.shell && event.phase === 'shatter'));
  assert.ok(!game.activeDragonArt.shells.has(survivor.id));
});

test('aligned water crests gather neighboring stone shells into a delayed front that carries into a new shoal', () => {
  for (const aligned of [true, false]) {
    const {game, prey, observed, through} = encounter('stone', 2);
    game.dragonArtCharge = 100;
    for (const x of [-3, 0, 3]) prey(x, 6);
    const a = prey(-1.7, -10);
    const b = prey(1.7, -10.5);
    const first = prey(0, -19.3);
    const last = prey(0, -23.9);
    const aside = prey(8.3, -21.0);
    through(() => a.dragonArtMark === 'stone' && b.dragonArtMark === 'stone', 1);
    game.activeCascade = {kind:'water',id:31,direction:{x:0,z:-1}};
    game.damage(a, a.hp + 1, 'cascade-water');
    game.activeCascade.id++;
    if (!aligned) game.activeCascade.direction = {x:0,z:1};
    game.damage(b, b.hp + 1, 'cascade-water');
    game.activeCascade = null;
    through(() => !game.activeDragonArt, 3);
    const wave = observed.find(event => event.reaction === 'stone-quarry');
    const hits = observed.filter(event => event.impact === 'stone-quarry');
    assert.equal(Boolean(wave), aligned);
    assert.deepEqual(hits.map(event => event.targetId), aligned ? [first.id,last.id] : []);
    if (aligned) {
      assert.equal(wave.targets.length, 2);
      assert.ok(hits[0].age-wave.age >= .32);
      assert.ok(hits[1].age-hits[0].age >= .15);
      assert.ok(first.z < -19.3 && !hits.some(hit => hit.targetId === aside.id));
    }
  }
});

test('a real tail blow on wet stone creates directional rubble whereas the repeated dry blow does not', () => {
  for (const wet of [true, false]) {
    const {game, prey, observed, through} = encounter('stone', 2);
    game.dragonArtCharge = 100;
    for (const x of [-3, 0, 3]) prey(x, 6);
    const a = prey(-1.5, -10);
    const b = prey(1.5, -10.5);
    const distant = prey(0, -23);
    through(() => a.dragonArtMark === 'stone' && b.dragonArtMark === 'stone', 1);
    if (wet) a.wet = b.wet = 5;
    game.damage(a, a.hp + 1, 'tail', {x:0,y:a.y,z:-7});
    game.damage(b, b.hp + 1, 'tail', {x:0,y:b.y,z:-7});
    through(() => !game.activeDragonArt, 3);
    assert.equal(observed.some(event => event.reaction === 'stone-quarry'), wet);
    assert.equal(observed.some(event => event.impact === 'stone-quarry' && event.targetId === distant.id), wet);
  }
});

test('absorbed poison can ride the actual rain outlet to untouched enemies only with an intake and a feed', () => {
  for (const [poison, rain] of [[true,true], [false,true], [true,false]]) {
    const {game, prey, observed} = encounter('abyss', 2);
    game.stage = 2;
    game.p.y = game.p.altitude = 2;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    game.addZone('storm',{x:0,y:2,z:5,radius:3.2,life:4});
    for (const x of [-.8, -.3, 0, .4, .8, 1]) {
      const target = prey(x, 5.1, 2);
      Object.assign(target, {hp:1, poison:poison ? 4 : 0, dotCD:9});
    }
    const first = prey(14, 22.0, 2);
    const second = prey(15.8, 25.7, 2);
    const aside = prey(25, 23, 2);
    const outlet = rain && game.addZone('rain',{x:14,y:2,z:23,radius:3.8,life:4});
    for (let tick = 0; tick < 225; tick++) {
      game.time += 1 / 60;
      game.enemyGrid.invalidate();
      updateDragonArt(game, 1 / 60);
    }
    const wave = observed.find(event => event.reaction === 'abyss-undertow');
    const hits = observed.filter(event => event.impact === 'abyss-undertow');
    assert.equal(Boolean(wave), poison && rain);
    assert.deepEqual(hits.map(event => event.targetId), poison && rain ? [first.id,second.id] : []);
    assert.equal(first.poison > 0, poison && rain);
    assert.equal(aside.poison, 0);
    if (wave) {
      assert.equal(wave.zoneId, outlet.id);
      const swallowed = observed.filter(event => event.impact && event.absorbed);
      assert.ok(swallowed.length >= 3 && wave.age - swallowed.at(-1).age > .30);
      const beat = observed.find(event => event.type === 'dragonArtBreak' && event.absorbed);
      assert.ok(beat.targets.every(target => target.mouth && swallowed.some(hit => hit.targetId === target.id)));
      assert.ok(game.zones.some(zone => zone.kind === 'poison' && zone.weaponAnchor === 'abyss-undertow'));
    }
  }
});

test('burning swallows divert a rain outlet into wetting steam, and toxic swallows find connected wet prey without a zone', () => {
  for (const [payload, receiver, expect] of [
    ['burn', 'rain', 'abyss-steamwake'], ['burn', 'dry', null],
    ['poison', 'wet-shoal', 'abyss-undertow'], ['poison', 'single-wet', null],
  ]) {
    const {game, prey, observed} = encounter('abyss', 2);
    game.stage = 2;
    game.p.y = game.p.altitude = 2;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    game.addZone('storm',{x:0,y:2,z:5,radius:3.2,life:4});
    for (const x of [-.8, -.3, 0, .4, .8, 1]) {
      const target = prey(x, 5.1, 2);
      Object.assign(target, {hp:1, [payload]:4, dotCD:9});
    }
    const first = prey(14, 22.0, 2);
    const second = prey(15.8, 25.7, 2);
    const late = prey(24, 23, 2);
    if (receiver === 'rain') {
      first.burn = 3;
      game.addZone('rain',{x:14,y:2,z:23,radius:3.8,life:4,weaponAnchor:'windkite'});
    } else if (receiver.includes('wet')) {
      first.wet = 4;
      if (receiver === 'wet-shoal') second.wet = 4;
    }
    for (let tick = 0; tick < 225; tick++) {
      game.time += 1 / 60;
      game.enemyGrid.invalidate();
      updateDragonArt(game, 1 / 60);
    }
    const launch = observed.find(event => ['abyss-steamwake','abyss-undertow'].includes(event.reaction));
    assert.equal(launch?.reaction ?? null, expect);
    if (!expect) continue;
    assert.deepEqual(launch.receiverIds, [first.id, second.id]);
    assert.equal(launch.carrier, receiver === 'rain' ? 'windkite' : receiver);
    const hit = observed.find(event => event.impact === expect && event.targetId === first.id);
    assert.ok(hit && hit.age-launch.age > .40);
    if (expect === 'abyss-steamwake') {
      assert.equal(first.poison, 0);
      assert.equal(first.burn, 0);
      assert.ok(first.wet > 0);
      const cloud = game.zones.find(zone => zone.kind === 'steam' && zone.weaponAnchor === expect);
      assert.ok(cloud);
      Object.assign(late,{x:cloud.x,z:cloud.z});
      game.enemyGrid.invalidate();
      game.updateFields(1/60);
      assert.ok(late.wet > 0);
    } else assert.ok(first.poison > 0);
  }
});

test('a hot eye sends pressure through a real rain boundary and up to a different wing of enemies', () => {
  for (const setup of ['hot-rain','dry','cold','rain-expires']) {
    const {game, prey, observed} = encounter('abyss', 3);
    game.stage = 3;
    game.p.y = game.p.altitude = 8;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    game.addZone('storm',{x:0,y:8,z:5,radius:3.2,life:4});
    const fire = setup !== 'cold' && game.addZone('fire',{x:0,y:8,z:5,radius:2.5,life:4});
    for (const x of [-.8, -.3, 0, .4, .8, 1]) Object.assign(prey(x,5.1,8), {hp:1, dotCD:9});
    const rain = setup !== 'dry' && game.addZone('rain',{x:0,y:10.4,z:18,radius:3.1,life:4});
    const lower = prey(-.3,16.3,8.7);
    const higher = [prey(2.7,22.3,15),prey(4.0,25.5,15)];
    const aside = prey(-8.8,25.5,13.5);
    for (const target of [lower,...higher,aside]) target.burn = 3;
    for (let tick = 0; tick < 225; tick++) {
      game.time += 1 / 60;
      game.enemyGrid.invalidate();
      updateDragonArt(game, 1 / 60);
      if (setup === 'rain-expires' && observed.some(event => event.reaction === 'abyss-steamwake')) rain.life = 0;
    }
    const launch = observed.find(event => event.reaction === 'abyss-steamwake');
    const condensed = observed.find(event => event.reaction === 'abyss-condense');
    const hits = observed.filter(event => event.impact === 'abyss-steamwake');
    assert.equal(Boolean(launch), setup === 'hot-rain' || setup === 'rain-expires');
    assert.equal(Boolean(condensed), setup === 'hot-rain');
    assert.equal(aside.wet, 0);
    assert.equal(aside.hp, 850);
    if (setup !== 'hot-rain') {
      assert.equal(hits.length, 0);
      continue;
    }
    assert.equal(launch.sourceZoneId,fire.id);
    assert.equal(condensed.zoneId,rain.id);
    assert.ok(launch.transition.y > launch.from.y+1);
    assert.ok(launch.points.at(-1).y > launch.transition.y+3);
    assert.ok(condensed.age+1e-8 >= launch.age+launch.condenseAt);
    for (const enemy of higher) {
      const hit = hits.find(event => event.targetId===enemy.id);
      assert.ok(hit?.age>condensed.age);
      assert.equal(enemy.burn,0);
      assert.ok(enemy.wet>0);
    }
  }
});

test('fire can turn a wet ice shell into a cloud that wets enemies outside the frost front', () => {
  const {game, prey, observed, through} = encounter('frost', 2);
  for (const x of [-2, 0, 2]) prey(x, 6);
  const anchor = prey(0, 19.0);
  const beyond = prey(0, 22.9);
  through(() => game.activeDragonArt?.phase === 'freeze');
  anchor.wet = 6;
  through(() => anchor.dragonArtMark === 'frost', .8);
  game.damage(anchor, anchor.hp + 1, 'cascade-fire');
  through(() => observed.some(event => event.reaction === 'steam-bloom'), .35);
  through(() => beyond.wet > 0, .25);
  assert.ok(game.zones.some(zone => zone.kind === 'steam' && zone.z === anchor.z));
});

test('a real lightning hit in the beam lets a delayed front reach a separate wet shoal', () => {
  for (const wet of [true, false]) {
    const {game, prey, observed, through} = encounter('beam', 3);
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    prey(-2, 13);
    prey(2, 13);
    const anchor = prey(0, 28);
    const lateral = prey(6.5, 33);
    const further = prey(12.1, 37.3);
    const far = prey(17, 40.9);
    const dry = prey(12.5, 34.5);
    if (wet) {
      for (const {x, z} of [anchor, lateral, further, far]) {
        game.addZone('rain', {x, y: game.p.y, z, radius: 1.75, life: 3});
      }
    }
    through(() => game.activeDragonArt?.phase === 'sweep' && game.activeDragonArt.age >= .80, 1.0);
    game.lightning(anchor, 1, 'lightning', {x: anchor.x, y: anchor.y + 4, z: anchor.z}, {chain: 1, damage: 1});
    through(() => !game.activeDragonArt, 4);
    const branches = observed.filter(event => event.reaction === 'conductive-front');
    const strikes = observed.filter(event => event.impact === 'beam-conduit');
    assert.deepEqual(branches.map(event => event.targetId), wet ? [lateral.id, further.id, far.id] : []);
    assert.deepEqual(strikes.map(event => event.targetId), wet ? [lateral.id, further.id, far.id] : []);
    assert.ok(!strikes.some(event => event.targetId === dry.id));
    if (wet) {
      const end = strikes.at(-1);
      assert.ok(end.age - branches.at(-1).age >= .14);
      assert.ok(!observed.some(event => event.targetId === far.id && event.impact === 'hit'));
    }
  }
});

test('a spent lightning strike relays through live footprints to targets above the beam', () => {
  for (const [steam, lightning] of [[true, true], [false, true], [true, false]]) {
    const {game, prey, observed} = encounter('beam', 3);
    game.stage = 3;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    game.p.y = game.p.altitude = 7;
    prey(-2, 12, 7);
    prey(0, 11, 7);
    prey(2, 12, 7);
    const anchor = prey(0, 17, 7);
    const high = prey(8, 17, 15.5);
    const dry = prey(8, 21.8, 15.5);
    game.addZone('rain', {x: 0, y: 7, z: 17, radius: 4.0, life: 3});
    const relay = steam && game.addZone('steam', {x: 5.5, y: 12.2, z: 17, radius: 5.8, life: 3});
    if (lightning) {
      anchor.hp = 1;
      game.lightning(anchor, 1, 'lightning', {x: 0, y: 10, z: 17}, {chain: 1, damage: 20});
      assert.ok(anchor.hp <= 0);
    }
    for (let ticks = 0; ticks < 240; ticks++) {
      game.time += 1 / 60;
      game.enemyGrid.invalidate();
      game.updateFields(1 / 60);
      updateDragonArt(game, 1 / 60);
      if (!game.activeDragonArt && game.time > 1) break;
    }
    const transition = observed.find(event => event.reaction === 'conductive-front' && event.zoneId === relay?.id);
    const highStrike = observed.find(event => event.impact === 'beam-conduit' && event.targetId === high.id);
    assert.equal(Boolean(transition && highStrike), steam && lightning);
    assert.ok(!observed.some(event => event.impact === 'beam-conduit' && event.targetId === dry.id));
    if (steam && lightning) {
      assert.equal(transition.carrier, 'thunder');
      assert.ok(transition.to.y - transition.from.y > 4);
      assert.ok(highStrike.age - transition.age >= .20);
      assert.ok(!observed.some(event => event.impact === 'hit' && event.targetId === high.id));
    } else assert.ok(!highStrike);
  }
});

test('a high beam dips into an occupied charged rain patch and carries a visible downhill route', () => {
  for (const lightning of [true, false]) {
    const {game, prey, observed} = encounter('beam', 3);
    game.stage = 2;
    game.p.y = game.p.altitude = 7.9;
    game.cultivation.weapons = [];
    game.cultivation.invalidateModifiers();
    game.dragonArtCharge = 100;
    for (const x of [-2, 0, 2]) prey(x, 11, 7.9);
    const carrier = prey(0, 16, 1.4);
    const wetSchool = prey(5.2, 19.4, 1.4);
    const dryWitness = prey(-10, -4, 1.4);
    game.addZone('rain', {x: 0, y: 1.4, z: 16, radius: 3.2, life: 3});
    game.addZone('rain', {x: 5.2, y: 1.4, z: 19.4, radius: 3.4, life: 3});
    if (lightning) game.lightning(carrier, 1, 'lightning', {x: 0, y: 4.0, z: 16}, {chain: 1, damage: 1});
    for (let tick = 0; tick < 160; tick++) {
      game.time += 1 / 60;
      game.enemyGrid.invalidate();
      game.updateFields(1 / 60);
      updateDragonArt(game, 1 / 60);
    }
    const swept = observed.find(event => event.impact === 'hit' && event.targetId === carrier.id);
    const routed = observed.find(event => event.impact === 'beam-conduit' && event.targetId === wetSchool.id);
    assert.equal(Boolean(swept && routed), lightning);
    assert.ok(!observed.some(event => event.targetId === dryWitness.id));
    if (lightning) assert.ok(swept.beamPitch < -.30);
    else assert.ok(observed.every(event => !event.beamPitch));
  }
});
