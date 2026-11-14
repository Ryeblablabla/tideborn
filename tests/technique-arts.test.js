import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from '../src/simulation.js';
import { techniqueSlowFactor } from '../src/technique-arts.js';

function encounter(id, stage, tier = 1, temper) {
  const game = new Game({seed: 6318, starter: 'bubble'});
  game.stage = stage;
  game.syncBody();
  const gear = game.cultivation.makeWeapon(id, tier);
  gear.temper = temper;
  game.cultivation.weapons = [gear];
  game.cultivation.invalidateModifiers();
  game.spawnCD = game.hordeCD = game.foodCD = 999;
  game.openingHunt = false;
  game.updateWaveReward = () => {};
  game.p.invul = 999;
  const events = [];
  function prey(x, z, wet = 0) {
    const enemy = game.spawnEnemy(2, x, z, game.p.y);
    Object.assign(enemy, {hp: 1200, maxHp: 1200, speed: 0, shootCD: 999, wet});
    return enemy;
  }
  function step(seconds) {
    for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
      game.step(1 / 60, {x: 0, z: 0});
      events.push(...game.events.splice(0));
    }
  }
  return {game, events, prey, step};
}

test('折霜 automatically uses a wet path even with a dry nearer target', () => {
  const {game, events, prey, step} = encounter('hoarfrost', 1);
  const dry = prey(0, 1.8);
  const wet = [prey(0, 3, 3), prey(0, 6.2, 3), prey(0, 9.4, 3)];
  step(.1);
  const hit = events.filter(event => event.type === 'techniqueArtImpact');
  assert.deepEqual(hit.map(event => event.targetId), wet.map(enemy => enemy.id));
  assert.ok(wet.every(enemy => techniqueSlowFactor(enemy, game.time) < .1));
  assert.equal(dry.hp, dry.maxHp);
});

test('stone crests erupt only at their preset sites and hit a changed formation', () => {
  const {events, prey, step} = encounter('stonecrest', 1);
  const departing = prey(0, 4);
  step(.1);
  const announced = events.filter(event => event.type === 'techniqueArtStart');
  assert.equal(announced.length, 1);
  assert.equal(departing.hp, departing.maxHp);
  departing.x = -5;
  const entering = prey(announced[0].x, announced[0].z);
  const another = prey(announced[0].x + 6, announced[0].z + 6);
  step(.6);
  assert.ok(entering.hp < entering.maxHp);
  assert.equal(departing.hp, departing.maxHp);
  assert.equal(another.hp, another.maxHp);
});

test('two ember wisps choose distinct sides and only burst after travelling', () => {
  const {events, prey, step} = encounter('emberwings', 2, 2, 'swift-wisps');
  const left = prey(-4, 4, 4);
  const right = prey(5, 4, 4);
  step(.32);
  assert.equal(events.filter(event => event.launch).length, 1);
  assert.equal(left.hp, left.maxHp);
  assert.equal(right.hp, right.maxHp);
  step(.55);
  const launches = events.filter(event => event.launch);
  assert.deepEqual(new Set(launches.map(event => event.targetId)), new Set([left.id, right.id]));
  assert.ok(left.hp < left.maxHp && right.hp < right.maxHp);
  assert.ok(events.some(event => event.type === 'reaction' && event.name.includes('双烬')));
});

test('spores follow living hosts, bloom on a fallen host, and feed a real wind field', () => {
  const {game, events, prey, step} = encounter('sporeseed', 2, 3);
  const first = prey(-4, 4);
  const second = prey(5, 6);
  step(.10);
  assert.equal(events.filter(event => event.type === 'techniqueArtStart').length, 2);
  assert.equal(game.zones.some(zone => zone.kind === 'poison'), false);
  assert.equal(first.hp, first.maxHp);
  first.x = -8;
  second.z = 10;
  const receiving = prey(-8.4, 5.8);
  const storm = game.addZone('storm', {x: -8.5, y: game.p.y, z: 5.8, radius: 2, life: 3});
  const missed = prey(-3.6, 2);
  game.damage(first, 1300, 'needle');
  step(.12);
  const early = events.find(event => event.type === 'techniqueArtBloom');
  assert.ok(early && early.hostId === first.id && early.x === -8 && early.moved >= 4 && !early.delayed);
  assert.ok(receiving.poison > 0 && storm.toxic > 0);
  assert.equal(missed.poison, 0);
  step(.94);
  const blooms = events.filter(event => event.type === 'techniqueArtBloom');
  assert.equal(blooms.length, 2);
  assert.ok(blooms[1].delayed && blooms[1].hostId === second.id && blooms[1].to.z > 9.5);
});

test('a fixed weir waits for a real crossing, then drives water through the receiving lane', () => {
  const {game, events, prey, step} = encounter('bankweir', 1);
  const traveler = prey(-3, 6);
  traveler.speed = 2.2;
  traveler.crossing = {angle:Math.PI*.5,until:2};
  step(.31);
  const planted = events.find(event=>event.type==='techniqueArtStart');
  assert.equal(planted.kind,'bankweir');
  assert.equal(events.some(event=>event.type==='techniqueArtRelease'),false);
  assert.equal(game.zones.some(zone=>zone.weaponAnchor==='bankweir'),false);
  const downstream = prey(2.5,6.2);
  downstream.y=planted.center.y;
  const untouched = prey(2.9,1.8);
  step(1.05);
  const released = events.find(event=>event.type==='techniqueArtRelease');
  assert.equal(released.trigger,'crossing');
  assert.equal(released.targetId,traveler.id);
  assert.ok(released.to.x>released.from.x+7);
  assert.ok(downstream.wet>0 && downstream.hp<downstream.maxHp && downstream.x>2.6);
  assert.equal(untouched.hp,untouched.maxHp);
  assert.ok(game.zones.some(zone=>zone.kind==='rain'&&zone.weaponAnchor==='bankweir'));
});

test('a rain field can trip a weir aimed across it while a dry inactive one expires', () => {
  for (const rain of [false,true]) {
    const {game, events, prey, step} = encounter('bankweir', 1);
    const fixed = prey(0,6);
    step(.21);
    const planted = events.find(event=>event.type==='techniqueArtStart');
    if(rain)game.addZone('rain',{...planted.center,radius:1.5,life:3,power:1});
    step(2.8);
    const release = events.find(event=>event.type==='techniqueArtRelease');
    assert.equal(release?.trigger,rain?'rain':undefined);
    if (!rain) assert.equal(fixed.hp,fixed.maxHp);
  }
});

test('a wind kite sends the field to another formation and debits the source once', () => {
  for(const fieldKind of [null,'poison','steam']) {
    const {game,events,prey,step}=encounter('windkite',1,2);
    prey(-4,4);
    const separated=[prey(8,9),prey(8.5,9.5),prey(8,10.25)];
    const source=fieldKind&&game.addZone(fieldKind,{x:-4,y:.7,z:4,radius:2.5,life:3.5,power:1});
    step(.4);
    const launch=events.find(event=>event.type==='techniqueArtStart');
    assert.equal(launch.carrier,fieldKind??undefined);
    assert.ok(launch.points[1].y>launch.from.y+1);
    assert.ok(separated.every(enemy=>enemy.poison===0&&enemy.wet===0));
    step(.8);
    const landings=events.filter(event=>event.type==='techniqueArtRelease');
    assert.equal(landings.length,1);
    const [landed]=landings;
    assert.equal(landed.vessel,Boolean(fieldKind));
    if(!fieldKind){
      assert.equal(game.zones.length,0);
      assert.ok(separated.every(enemy=>enemy.hp===enemy.maxHp));
      continue;
    }
    const deposit=game.zones.find(zone=>zone.id===landed.destinationId);
    assert.equal(deposit.kind,fieldKind);
    assert.deepEqual([deposit.x,deposit.y,deposit.z],[landed.to.x,landed.to.y,landed.to.z]);
    assert.ok(Math.abs(source.life+landed.spent-(3.5-game.time))<.02);
    assert.ok(Math.abs(deposit.maxLife-landed.spent)<.01);
    assert.ok(separated.every(enemy=>fieldKind==='poison'?enemy.poison>0:enemy.wet>0));
  }
});

test('a carried flame retains the same paid budget as fire or turns to steam at contact', () => {
  for (const moisture of ['dry','enemy','rain']) {
    const {game,events,prey,step}=encounter('windkite',2,2);
    Object.assign(game.p,{y:.7,altitude:.7});
    prey(-4,4);
    const receiving=[prey(7.8,8.1),prey(8.3,8.9),prey(8.3,9.6)];
    if(moisture==='enemy')receiving[0].wet=5;
    if(moisture==='rain')game.addZone('rain',{x:7.8,y:2.1,z:8.1,radius:1,life:3,power:1});
    const source=game.addZone('fire',{x:-4,y:.7,z:4,radius:2.5,life:3.5,power:1});
    step(1.18);
    const [release]=events.filter(event=>event.type==='techniqueArtRelease');
    const converted=moisture!=='dry';
    assert.ok(release?.vessel);
    assert.equal(release.carrier,'fire');
    assert.equal(release.converted,converted);
    assert.equal(release.result,converted?'steam':'fire');
    const destination=game.zones.filter(zone=>zone.weaponAnchor==='windkite');
    assert.equal(destination.length,1);
    assert.equal(destination[0].kind,release.result);
    assert.ok(Math.abs(source.life+release.spent-(3.5-game.time))<.02);
    assert.equal(destination[0].maxLife,release.spent);
    assert.ok(receiving.every(enemy=>converted?enemy.burn===0&&enemy.wet>0:enemy.wet===0&&enemy.burn>0));
    assert.equal(events.filter(event=>event.name==='折风过雨 · 流火化汽').length,Number(converted));
  }
});

test('a developed wind kite spends vapor to wet and strike a third formation after a real delay', () => {
  for (const [mode,tier] of [['dry',2],['wet',1],['wet',2],['evades',2]]) {
    const {game,events,prey,step}=encounter('windkite',2,tier);
    Object.assign(game.p,{y:.7,altitude:.7});
    const group = [prey(6,8),prey(6.3,8.2),prey(6.1,8.8),prey(6.7,8.6)];
    if (mode!=='dry') group[0].wet=4;
    const second = [prey(11,12.5),prey(12,12)];
    const outside = prey(12,-4);
    const fire=game.addZone('fire',{x:-4,y:.7,z:3.4,radius:2.5,life:3.8,power:1});
    step(1.19);
    const first=events.find(event=>event.type==='techniqueArtRelease'&&!event.secondary);
    const rain=events.find(event=>event.type==='techniqueArtRelease'&&event.secondary==='kite-downpour');
    const expected = tier>=2 && mode!=='dry';
    assert.equal(first.result,mode==='dry'?'fire':'steam');
    assert.equal(Boolean(rain),expected);
    if (rain) {
      const vapor=game.zones.find(zone=>zone.id===rain.sourceId);
      assert.equal(rain.sourceId,first.destinationId);
      assert.equal(vapor.kind,'steam');
      assert.ok(vapor.maxLife-vapor.life>=rain.spent);
      assert.ok(Math.abs(fire.life+first.spent-(3.8-game.time))<.03);
      assert.ok(rain.via.y-rain.to.y>2.25);
      assert.ok(second.every(enemy=>enemy.hp===enemy.maxHp&&enemy.wet===0));
    }
    if(mode==='evades')second.forEach(enemy=>enemy.x+=8);
    step(.9);
    const bloom=events.find(event=>event.type==='techniqueArtBloom'&&event.secondary==='kite-downpour');
    const hits=events.filter(event=>event.type==='techniqueArtImpact'&&event.secondary==='kite-downpour');
    assert.equal(Boolean(bloom),expected);
    if (expected) {
      assert.equal(game.zones.find(zone=>zone.id===bloom.destinationId)?.kind,'rain');
      assert.equal(bloom.sourceId,first.destinationId);
      assert.deepEqual(hits.map(e=>e.targetId).sort(),mode==='evades'?[]:second.map(enemy=>enemy.id).sort());
    }
    assert.ok(second.every(enemy=>mode==='wet'&&tier===2?enemy.hp<enemy.maxHp&&enemy.wet>0:enemy.hp===enemy.maxHp&&enemy.wet===0));
    assert.equal(outside.hp,outside.maxHp);
  }
});

test('a wet ice prism refracts one actual lightning cast into an untouched high flank', () => {
  for(const mode of ['dry','uncharged','refraction']) {
    const {game,events,prey,step}=encounter('icekeel',1,2);
    Object.assign(game.p,{y:.7,altitude:.7});
    const anchor=prey(0,5,mode==='dry'?0:4);
    const flank=prey(6.5,5);
    flank.y=3.4;
    const decoy=prey(0,13);
    step(.18);
    const placed=events.find(event=>event.type==='techniqueArtStart');
    assert.equal(placed?.anchorId,mode==='dry'?undefined:anchor.id);
    if(mode!=='uncharged')game.lightning(anchor,1,'lightning',{x:0,y:3.8,z:0},{chain:1,damage:30});
    step(.51);
    const releases=events.filter(event=>event.type==='techniqueArtRelease');
    assert.equal(releases.length,Number(mode==='refraction'));
    if(mode==='refraction') {
      assert.equal(releases[0].targetId,flank.id);
      assert.equal(releases[0].via.z,5);
      assert.ok(releases[0].to.y-releases[0].via.y>2);
      assert.ok(flank.hp<flank.maxHp&&flank.charge>0);
      assert.ok(events.some(event=>event.type==='techniqueArtImpact'&&event.refraction&&event.targetId===flank.id));
      game.lightning(anchor,1,'lightning',{x:0,y:3.8,z:0},{chain:1,damage:30});
      step(.40);
      assert.equal(events.filter(event=>event.type==='techniqueArtRelease').length,1);
    }else assert.equal(flank.hp,flank.maxHp);
    assert.equal(decoy.hp,decoy.maxHp);
  }
});
