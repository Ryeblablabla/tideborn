import assert from 'node:assert/strict';
import test from 'node:test';
import { Cultivation } from '../src/cultivation.js';
import { techniqueStats, temperingForms } from '../src/cultivation-data.js';
import { DRAGON_ART_DOCTRINES } from '../src/dragon-art-data.js';
import { applyMarketChoice, dragonArtPairing, marketChoices } from '../src/market-choices.js';

test('first reward offers three new techniques and later hands can mix all three types', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'bubble'});
  const first = marketChoices(cultivation, 0);
  assert.deepEqual(first.map(card => card.kind), ['learn', 'learn', 'learn']);
  assert.equal(new Set(first.map(card => card.tone)).size, 3);
  assert.ok(first.every(card => !Object.hasOwn(card, 'price')));
  assert.deepEqual(marketChoices(cultivation, 0), first);
  assert.equal(cultivation.weapons.length, 1);

  cultivation.wave++;
  const pick = marketChoices(cultivation, 0).find(card => card.kind === 'upgrade');
  assert.ok(applyMarketChoice(cultivation, pick));
  assert.equal(cultivation.weapons[0].tier, 2);
  assert.equal(applyMarketChoice(cultivation, pick), false);

  cultivation.wave++;
  const mixed = marketChoices(cultivation, 0);
  assert.deepEqual(new Set(mixed.map(card => card.kind)), new Set(['learn', 'upgrade', 'temper']));
  assert.ok(applyMarketChoice(cultivation, mixed.find(card => card.kind === 'learn')));
  assert.equal(cultivation.weapons.length, 2);
});

test('a free temper preserves tier and changes the actual technique once', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'bubble'});
  cultivation.weapons[0].tier = 2;
  cultivation.wave = 2;
  const before = cultivation.view().slots[0];
  const reward = marketChoices(cultivation, 0).find(card => card.kind === 'temper');

  assert.ok(applyMarketChoice(cultivation, reward));
  assert.equal(applyMarketChoice(cultivation, reward), false);
  const tempered = cultivation.view().slots[0];
  const form = temperingForms(before.id).find(item => item.id === reward.form);
  assert.equal(tempered.temperName, form.name);
  assert.equal(tempered.tier, before.tier);
  assert.notEqual(tempered.stats.power, before.stats.power);
  assert.ok(tempered.stats.cooldown > before.stats.cooldown);

  const upgrade = marketChoices(cultivation, 0).find(card => card.kind === 'upgrade');
  assert.ok(applyMarketChoice(cultivation, upgrade));
  assert.equal(cultivation.weapons[0].temper, form.id);
});

test('tempering changes the effective reach, targets, and field duration by technique', () => {
  const melee = {id: 'fang', tier: 2};
  const pulse = {id: 'tail', tier: 2};
  const arc = {id: 'spark', tier: 2};
  const field = {id: 'thundercloud', tier: 2};
  assert.ok(techniqueStats({...melee, temper: 'long-strike'}).range > techniqueStats(melee).range);
  assert.ok(techniqueStats({...pulse, temper: 'wide-pulse'}).radius > techniqueStats(pulse).radius);
  assert.equal(techniqueStats({...arc, temper: 'linked-arc'}).chain, techniqueStats(arc).chain + 1);
  assert.ok(techniqueStats({...field, temper: 'lasting-field'}).life > techniqueStats(field).life);
  assert.ok(techniqueStats({...field, temper: 'lasting-field'}).energy > techniqueStats(field).energy);
  assert.ok(techniqueStats({...field, temper: 'wide-field'}).life < techniqueStats(field).life);
});

test('a mastered loadout is still offered three distinct ways to change its tempering', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.wave = 12;
  cultivation.weapons = ['bubble', 'fang', 'tail', 'coil', 'spark', 'drop'].map(id => ({
    ...cultivation.makeWeapon(id, 4),
    temper: temperingForms(id)[0].id,
  }));
  const choices = marketChoices(cultivation, 0);
  assert.deepEqual(choices.map(card => card.kind), ['temper', 'temper', 'temper']);
  assert.equal(new Set(choices.map(card => `${card.uid}:${card.form}`)).size, 3);
  const weapon = cultivation.weapons.find(item => item.uid === choices[0].uid);
  assert.equal(weapon.temper, choices[0].previousForm);
  assert.ok(applyMarketChoice(cultivation, choices[0]));
  assert.equal(applyMarketChoice(cultivation, choices[0]), false);
  assert.equal(weapon.tier, 4);
  assert.equal(weapon.temper, choices[0].form);
  assert.equal(cultivation.weapons.length, 6);
});

test('the first lake hand offers the prepared element cascade and upgrades change actual coverage', () => {
  const cultivation = new Cultivation(() => .5, {starter:'bubble'});
  cultivation.weapons.push(cultivation.makeWeapon('spark', 1));
  cultivation.invalidateModifiers();
  cultivation.wave = 2;
  const hand = marketChoices(cultivation, 1);
  const cascade = hand.find(card => card.kind === 'cascade');
  assert.ok(cascade);
  assert.ok(applyMarketChoice(cultivation, cascade));
  assert.equal(cultivation.cascadeRank, 2);
  assert.equal(applyMarketChoice(cultivation, cascade), false);

  const beforeShots = techniqueStats({id:'bubble',tier:1});
  const afterShots = techniqueStats({id:'bubble',tier:2});
  assert.equal(afterShots.projectiles, beforeShots.projectiles + 1);
  assert.equal(techniqueStats({id:'spark',tier:2}).chain, techniqueStats({id:'spark',tier:1}).chain + 2);
  assert.ok(techniqueStats({id:'drop',tier:2}).radius > techniqueStats({id:'drop',tier:1}).radius);
});

test('all five dragon arts can be learned and reach either third-rank doctrine at six slots', () => {
  const pairs = {
    stone: ['drop', 'tail'], rift: ['fang', 'needle'], abyss: ['coil', 'venom'],
    frost: ['bubble', 'spark'], beam: ['needle', 'breach'],
  };
  for (const [art, pair] of Object.entries(pairs)) {
    for (const doctrine of ['reach', 'echo']) {
      const cultivation = new Cultivation(() => .5);
      cultivation.weapons = [...pair, 'mist', 'mist', 'venom', 'venom']
        .map(id => cultivation.makeWeapon(id, 1));
      cultivation.wave = 3;
      assert.ok(!marketChoices(cultivation, 0).some(card => card.kind === 'dragonArt'));
      const findArt = (hand, variant) => hand.find(card => card.kind === 'dragonArt' &&
        card.art === art && card.doctrine === variant);
      const first = findArt(marketChoices(cultivation, 1));
      assert.ok(first, art);
      assert.match(first.detail, /自动施放/);
      assert.ok(applyMarketChoice(cultivation, first));
      assert.equal(applyMarketChoice(cultivation, first), false);
      cultivation.wave++;
      assert.ok(applyMarketChoice(cultivation, findArt(marketChoices(cultivation, 2))));
      cultivation.wave++;
      const finalHand = marketChoices(cultivation, 2);
      assert.equal(finalHand.length, 3);
      assert.deepEqual(new Set(finalHand.filter(card => card.kind === 'dragonArt').map(card => card.doctrine)),
        new Set(['reach', 'echo']));
      const path = DRAGON_ART_DOCTRINES[doctrine];
      assert.ok(findArt(finalHand, doctrine).title.endsWith(path.names?.[art] ?? path.name));
      assert.ok(applyMarketChoice(cultivation, findArt(finalHand, doctrine)));
      assert.ok(!applyMarketChoice(cultivation, findArt(finalHand, doctrine === 'reach' ? 'echo' : 'reach')));
      assert.equal(cultivation.dragonArtRank, 3);
      assert.equal(cultivation.dragonArtDoctrine, doctrine);
      assert.equal(cultivation.weapons.length, 6);
    }
  }
});

test('a six-slot build without a qualifying pair gets an upgrade toward an art', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'fang'});
  cultivation.wave = 5;
  cultivation.weapons.push(...['ember', 'ember', 'mist', 'mist', 'venom'].map(id => cultivation.makeWeapon(id, 1)));
  for (let tier = 1; tier < 3; tier++) {
    const upgrade = marketChoices(cultivation, 2).find(card => card.kind === 'upgrade' && card.uid === cultivation.weapons[0].uid);
    assert.ok(applyMarketChoice(cultivation, upgrade));
    cultivation.wave++;
  }
  const art = marketChoices(cultivation, 2).find(card => card.art === 'rift');
  assert.ok(art);
  assert.equal(art.rank, 0);
});

test('the first lake hand can prepare a second art when one is already ready', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'bubble'});
  cultivation.wave = 2;
  cultivation.weapons.push(cultivation.makeWeapon('spark', 1));
  const hand = marketChoices(cultivation, 1);
  assert.equal(hand.length, 3);
  assert.ok(hand.some(card => card.art === 'frost'));
  const preparation = hand.find(card => card.kind === 'learn' && card.preparesArts.includes('beam'));
  assert.ok(preparation);
  assert.match(preparation.detail, /贯日龙息/);
  assert.ok(applyMarketChoice(cultivation, preparation));
  cultivation.wave++;
  assert.ok(marketChoices(cultivation, 1).some(card => card.art === 'beam'));
});

test('a six-slot hand can replace one technique to prepare a previously unavailable dragon art', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.weapons = ['mist','venom','ember','mist','venom','ember']
    .map((id,slot) => cultivation.makeWeapon(id, slot<3 ? 3 : 1));
  cultivation.wave = 5;
  const before = cultivation.weapons.slice();
  assert.ok(!marketChoices(cultivation,0).some(card => card.kind === 'swap'));
  const hand = marketChoices(cultivation,2);
  const swaps = hand.filter(card => card.kind === 'swap');
  assert.equal(hand.length,3);
  assert.equal(swaps.length,1);
  assert.ok(hand.some(card => card.kind === 'upgrade' || card.kind === 'temper'));
  const pick = swaps[0];
  const slot = before.findIndex(weapon => weapon.uid===pick.uid);
  assert.equal(pick.title,
    `${cultivation.getWeapon(before[slot].id).name} → ${cultivation.getWeapon(pick.id).name}`);
  assert.match(pick.detail,/凡品/);
  assert.ok(pick.preparesArts.length);
  assert.ok(!hand.some(card => pick.preparesArts.includes(card.art)));
  assert.ok(applyMarketChoice(cultivation,pick));
  assert.equal(applyMarketChoice(cultivation,pick), false);
  assert.equal(cultivation.weapons.length,6);
  assert.equal(cultivation.weapons[slot].id,pick.id);
  assert.equal(cultivation.weapons[slot].tier,1);
  assert.ok(cultivation.weapons.every((weapon,i) => i===slot || weapon===before[i]));
  cultivation.wave++;
  assert.ok(marketChoices(cultivation,2).some(card => pick.preparesArts.includes(card.art)));
});

test('a late swap can supply the active cascade without replacing its core or dragon art', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.wave = 9;
  cultivation.weapons = ['spark','breach','needle','mist','venom','venom']
    .map((id,slot) => cultivation.makeWeapon(id, slot<3 ? 3 : 1));
  cultivation.cascade = 'thunder';
  cultivation.cascadeRank = 3;
  cultivation.dragonArt = 'beam';
  cultivation.dragonArtRank = 3;
  cultivation.dragonArtDoctrine = 'echo';
  const protectedSlots = cultivation.weapons.slice(0,3);
  const modifiers = cultivation.modifiers();
  const pick = marketChoices(cultivation,2).find(card => card.kind === 'swap');
  assert.deepEqual(pick.preparesCascades,['thunder']);
  assert.ok(['bubble','drop','torrent'].includes(pick.id));
  assert.ok(applyMarketChoice(cultivation,pick));
  assert.deepEqual(cultivation.weapons.slice(0,3),protectedSlots);
  assert.notEqual(cultivation.modifiers(),modifiers);
  assert.equal(cultivation.cascadeRank,3);
  assert.equal(cultivation.dragonArtDoctrine,'echo');
  assert.equal(cultivation.dragonArtRank,3);
});

test('full slots offer a compound support swap beside both doctrines while keeping the trained routes', () => {
  const cases = [
    {art:'abyss', cascade:'fire', gear:['coil','ember','mist','fang','venom','windkite'],
      compound:'steamwake', id:'torrent', payoff:/燃敌.*湿区.*蒸汽/, core:'coil'},
    {art:'stone', cascade:'water', gear:['drop','tail','mist','fang','venom','needle'],
      compound:'quarry', id:'bankweir', payoff:/石壳.*一道石潮/, core:'drop'},
    {art:'rift', cascade:'wind', gear:['fang','tail','mist','coil','venom','torrent'],
      compound:'rift-seam', id:'needle', payoff:/三阶选横裁.*穿波针.*裂缝/, core:'fang'},
    {art:'frost', cascade:'thunder', gear:['drop','spark','torrent','fang','venom','mist'],
      compound:'frost-prism', id:'icekeel', payoff:/霜镜.*雷.*冰棱.*侧翼/, core:'drop'},
    {art:'frost', cascade:'water', gear:['drop','tail','mist','fang','venom','needle'],
      compound:'frost-fire', id:'ember', payoff:/两块相邻的湿冰.*外侧敌群/, core:'drop'},
    {art:'beam', cascade:'fire', gear:['breach','needle','bubble','fang','venom','mist'],
      compound:'beam-steam', id:'torrent', payoff:/焚径.*火痕.*雨或水浪.*汽锋/, core:'breach'},
  ];
  for (const {art, cascade, gear, compound, id, payoff, core} of cases) {
    const cultivation = new Cultivation(() => .5);
    cultivation.weapons = gear.map(weapon => cultivation.makeWeapon(weapon, weapon === core ? 3 : 1));
    Object.assign(cultivation, {wave:8, dragonArt:art, dragonArtRank:2, cascade, cascadeRank:2});
    const before = cultivation.weapons.slice();
    const hand = marketChoices(cultivation, 3);
    assert.equal(hand.length, 3);
    assert.deepEqual(new Set(hand.filter(card => card.art === art && card.kind === 'dragonArt').map(card => card.doctrine)),
      new Set(['reach', 'echo']));
    const card = hand.find(card => card.kind === 'swap');
    assert.equal(card.id, id);
    assert.equal(card.compound, compound);
    assert.match(card.pairing, payoff);
    const protectedWeapon = before.find(weapon => weapon.id === core);
    assert.equal(applyMarketChoice(cultivation, {...card, previousId:core, uid:protectedWeapon.uid, tier:3}), false);
    assert.ok(applyMarketChoice(cultivation, card));
    assert.equal(applyMarketChoice(cultivation, card), false);
    assert.equal(cultivation.dragonArtRank, 2);
    assert.equal(cultivation.cascadeRank, 2);
    const slot = before.findIndex(weapon => weapon.uid === card.uid);
    assert.equal(cultivation.weapons[slot].id, id);
    assert.equal(cultivation.weapons[slot].tier, 1);
    assert.ok(cultivation.weapons.every((weapon, index) => index === slot || weapon === before[index]));
  }
});

test('gale can learn or swap in a live-host spore relay without replacing its wind route', () => {
  const pairing = /行空卷动带种的活敌.*新位置爆开.*风锋没扫到的另一群/;
  const early = new Cultivation(() => .08);
  early.weapons.push(early.makeWeapon('fang', 1));
  Object.assign(early, {wave:6, cascade:'wind', cascadeRank:3, cascadeDoctrine:'gale'});
  const naturallyOffered = marketChoices(early, 3).find(card => card.kind === 'learn' && card.id === 'sporeseed');
  assert.match(naturallyOffered.pairing, pairing);

  const mature = new Cultivation(() => .5);
  mature.weapons = ['fang','coil','bubble','torrent','venom','spark'].map(id => mature.makeWeapon(id, id === 'fang' ? 3 : 1));
  Object.assign(mature, {wave:9, cascade:'wind', cascadeRank:3, cascadeDoctrine:'gale'});
  const before = mature.weapons.slice();
  const hand = marketChoices(mature, 3);
  assert.equal(hand.length, 3);
  assert.ok(hand.some(card => card.system === 'cascadeDoctrine' && card.doctrine === 'gyre'));
  const seed = hand.find(card => card.kind === 'swap' && card.compound === 'gale-spore');
  assert.equal(seed.id, 'sporeseed');
  assert.match(seed.description, /给「行空」换配招/);
  assert.match(seed.pairing, pairing);
  assert.equal(seed.previousId, 'spark');
  mature.cascadeDoctrine = 'gyre';
  assert.equal(applyMarketChoice(mature, seed), false);
  mature.cascadeDoctrine = 'gale';
  assert.ok(applyMarketChoice(mature, seed));
  assert.equal(mature.weapons.length, 6);
  assert.deepEqual(mature.weapons.slice(0, 5), before.slice(0, 5));
  assert.equal(mature.weapons[5].id, 'sporeseed');
  assert.equal(mature.weapons[5].tier, 1);
  assert.equal(mature.cascadeRank, 3);
  assert.equal(mature.cascadeDoctrine, 'gale');
});

test('gale reserves a periodic spore upgrade beside existing route decisions', () => {
  for (const gear of [['bubble','coil','sporeseed'], ['fang','coil','bubble','torrent','venom','sporeseed']]) {
    const cultivation = new Cultivation(() => .5);
    cultivation.weapons = gear.map(id => cultivation.makeWeapon(id, id === 'fang' ? 3 : 1));
    Object.assign(cultivation, {wave:6, cascade:'wind', cascadeRank:3, cascadeDoctrine:'gale',
      ...(gear.length === 6 ? {dragonArt:'rift', dragonArtRank:3, dragonArtDoctrine:'echo'} : {})});
    const reserved = card => card.kind === 'upgrade' && card.id === 'sporeseed' && card.tier === 1;
    const hand = marketChoices(cultivation, 3);
    const seed = hand.find(reserved);
    assert.equal(hand.length, 3);
    assert.ok(hand.some(card => ['dragonArt','reorient'].includes(card.kind)));
    assert.match(seed.pairing, /另一翼.*未扫到的活敌及时靠近.*再分一路/);

    cultivation.wave = 7;
    assert.ok(!marketChoices(cultivation, 3).some(reserved));
    cultivation.wave = 8;
    assert.ok(marketChoices(cultivation, 3).some(reserved));
    cultivation.cascadeDoctrine = 'gyre';
    assert.ok(!marketChoices(cultivation, 3).some(reserved));
    cultivation.cascadeDoctrine = 'gale';
    const slots = cultivation.weapons.map(weapon => weapon.uid);
    assert.ok(applyMarketChoice(cultivation, seed));
    assert.equal(cultivation.weapons.find(weapon => weapon.id === 'sporeseed').tier, 2);
    assert.deepEqual(cultivation.weapons.map(weapon => weapon.uid), slots);
    assert.equal(cultivation.cascadeRank, 3);
    assert.equal(cultivation.cascadeDoctrine, 'gale');
  }
});

test('a beam build can prepare a rain field or keep either third-rank doctrine in the same hand', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.weapons = ['needle','bubble','spark'].map(id => cultivation.makeWeapon(id, 1));
  Object.assign(cultivation, {wave:5, dragonArt:'beam', dragonArtRank:2, cascade:'thunder', cascadeRank:2});
  const hand = marketChoices(cultivation, 2);
  assert.equal(hand.length, 3);
  const rain = hand.find(card => card.kind === 'learn' && card.id === 'torrent');
  const reach = hand.find(card => card.kind === 'dragonArt' && card.doctrine === 'reach');
  const echo = hand.find(card => card.kind === 'dragonArt' && card.doctrine === 'echo');
  assert.match(rain.pairing, /三阶选焚径.*火痕.*雨或水浪.*汽锋/);
  assert.match(reach.pairing, /干火痕.*蒸汽/);
  assert.match(echo.description, /首扫.*追斩/);
  assert.match(echo.pairing, /潮雷走电.*外侧湿敌/);
  assert.ok(applyMarketChoice(cultivation, rain));
  assert.equal(cultivation.dragonArtRank, 2);
  const prepared = marketChoices(cultivation, 2);
  assert.equal(prepared.length, 3);
  const ember = prepared.find(card => card.kind === 'learn' && card.id === 'ember');
  assert.match(ember.pairing, /万点飞焰.*火痕烧倒敌人/);
  assert.match(prepared.find(card => card.doctrine === 'reach').pairing, /引雨.*火痕.*汽锋.*缓坡/);
  assert.ok(applyMarketChoice(cultivation, echo));
  assert.ok(!marketChoices(cultivation, 2).some(card => card.pairing?.includes('火痕烧倒敌人')));
});

test('a prepared water crest offers a moving alternative to rain without changing beam rank', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.weapons = ['needle', 'bubble', 'spark'].map(id => cultivation.makeWeapon(id, 1));
  Object.assign(cultivation, {wave:5, dragonArt:'beam', dragonArtRank:2});
  const rainHand = marketChoices(cultivation, 2);
  assert.equal(rainHand.length, 3);
  assert.ok(rainHand.some(card => card.kind === 'learn' && card.id === 'torrent'));
  assert.ok(applyMarketChoice(cultivation, rainHand.find(card => card.doctrine === 'reach')));
  cultivation.wave++;
  const crestHand = marketChoices(cultivation, 2);
  assert.equal(crestHand.length, 3);
  assert.equal(crestHand.filter(card => card.route === 'water').length, 1);
  const crest = crestHand.find(card => card.route === 'water');
  assert.match(crest.pairing, /潮头经过火痕.*沿水浪方向/);
  assert.ok(applyMarketChoice(cultivation, crest));
  assert.equal(cultivation.cascadeRank, 2);
  assert.equal(cultivation.dragonArtRank, 3);
  assert.equal(cultivation.weapons.length, 3);
  assert.match(marketChoices(cultivation, 2).find(card => card.route === 'water').pairing, /横江叠浪.*汽/);
});

test('a claw build can select either third-rank rift path or prepare its needle continuation', () => {
  const cultivation = new Cultivation(() => .5, {starter:'fang'});
  cultivation.weapons.push(cultivation.makeWeapon('tail',1));
  cultivation.wave = 2;
  const firstLake = marketChoices(cultivation,1);
  assert.equal(firstLake.length,3);
  const needle = firstLake.find(card => card.kind==='learn' && card.id==='needle');
  assert.ok(needle);
  assert.match(needle.pairing,/三阶选横裁.*穿波针.*侧翼/);
  assert.ok(firstLake.some(card => card.kind==='dragonArt' && card.art==='rift'));

  Object.assign(cultivation,{wave:4,dragonArt:'rift',dragonArtRank:2,cascade:'wind',cascadeRank:2});
  const rankTwo = marketChoices(cultivation,2);
  assert.equal(rankTwo.length,3);
  const rankTwoNeedle = rankTwo.find(card => card.kind==='learn' && card.id==='needle');
  assert.ok(rankTwoNeedle);
  assert.match(rankTwo.find(card => card.doctrine==='reach').description,/左右两翼/);
  const echo = rankTwo.find(card => card.doctrine==='echo');
  assert.match(echo.description,/爪击.*续裂/);
  assert.match(echo.pairing,/卷墨天风.*续开裂缝/);
  assert.ok(applyMarketChoice(cultivation,rankTwoNeedle));
  assert.equal(cultivation.dragonArtRank,2);
  assert.equal(cultivation.cascadeRank,2);
  const next = marketChoices(cultivation,2).find(card => card.doctrine==='echo');
  assert.match(next.pairing,/穿波针.*侧翼/);
  assert.ok(applyMarketChoice(cultivation,next));
  assert.equal(cultivation.dragonArtDoctrine,'echo');
});

function lateBuild(last = 'venom') {
  const cultivation = new Cultivation(() => .5);
  Object.assign(cultivation, {
    weapons: ['spark', 'breach', 'needle', 'mist', 'venom', last]
      .map((id, slot) => cultivation.makeWeapon(id, slot < 3 ? 3 : 1)),
    cascade: 'thunder', cascadeRank: 3,
    dragonArt: 'beam', dragonArtRank: 3, dragonArtDoctrine: 'echo',
  });
  return cultivation;
}

test('a fully developed build can change dragon art doctrine in one pick and keep rank III', () => {
  const cultivation = lateBuild();
  cultivation.wave = 6;
  const before = cultivation.weapons.slice();
  assert.ok(!marketChoices(cultivation, 0).some(card => card.kind === 'reorient'));
  const hand = marketChoices(cultivation, 2);
  const choice = hand.find(card => card.system === 'doctrine');
  assert.equal(hand.length, 3);
  assert.ok(hand.some(card => card.kind === 'upgrade'));
  assert.ok(hand.some(card => card.kind === 'temper'));
  assert.match(choice.detail, /回锋→焚径.*保留三阶/);
  assert.ok(applyMarketChoice(cultivation, choice));
  assert.equal(applyMarketChoice(cultivation, choice), false);
  assert.deepEqual(cultivation.weapons, before);
  assert.equal(cultivation.dragonArt, 'beam');
  assert.equal(cultivation.dragonArtDoctrine, 'reach');
  assert.equal(cultivation.dragonArtRank, 3);
  assert.equal(cultivation.cascadeRank, 3);
});

test('a mature route can redirect and still offer its existing mastery', () => {
  for (const system of ['dragonArt', 'cascade']) {
    const isArt = system === 'dragonArt';
    const other = isArt ? 'cascade' : 'dragonArt';
    const cultivation = lateBuild('bubble');
    cultivation[`${system}Rank`] = 2;
    cultivation[other] = null;
    cultivation[`${other}Rank`] = 0;
    cultivation.dragonArtDoctrine = null;
    cultivation.wave = isArt ? 7 : 8;

    const hand = marketChoices(cultivation, 2);
    assert.equal(hand.length, 3);
    assert.equal(hand.filter(card => card.kind === 'reorient').length, 1);
    assert.ok(hand.some(card => card.kind === system && card.rank === 2));
    const change = hand.find(card => card.system === system);
    assert.match(change.detail, /保留.*二阶/);

    const removed = cultivation.weapons.splice(isArt ? 5 : 4);
    assert.ok(!marketChoices(cultivation, 2).some(card => card.kind === 'reorient'));
    assert.equal(applyMarketChoice(cultivation, change), false);
    cultivation.weapons.push(...removed);
    assert.ok(applyMarketChoice(cultivation, change));
    assert.equal(cultivation[`${system}Rank`], 2);
    assert.equal(cultivation[`${other}Rank`], 0);
  }
});

test('five slots can switch a complete elemental route while continuing the old route or filling a slot', () => {
  const cultivation = lateBuild('bubble');
  cultivation.weapons.splice(4, 1);
  Object.assign(cultivation, {cascadeRank: 2, dragonArt: null, dragonArtRank: 0, dragonArtDoctrine: null, wave: 8});
  const hand = marketChoices(cultivation, 2);
  const choice = hand.find(card => card.system === 'cascade');
  const original = cultivation.weapons.slice();
  assert.equal(hand.length, 3);
  assert.equal(choice.route, 'water');
  assert.equal(choice.swap, undefined);
  assert.ok(hand.some(card => card.kind === 'cascade' && card.rank === 2));
  const support = cultivation.weapons.splice(2, 1, cultivation.makeWeapon('mist', 1))[0];
  assert.ok(!marketChoices(cultivation, 2).some(card => card.kind === 'reorient' && card.route === 'water'));
  assert.equal(applyMarketChoice(cultivation, choice), false);
  cultivation.weapons.splice(2, 1, support);
  assert.ok(applyMarketChoice(cultivation, choice));
  assert.equal(cultivation.cascadeRank, 2);
  assert.ok(cultivation.weapons.every((weapon,index) => weapon === original[index]));
});

test('an equipped complement can add a missing primary and its cascade in a single lake pick', () => {
  const cultivation = new Cultivation(() => .5, {starter:'bubble'});
  cultivation.wave = 2;
  const before = cultivation.weapons[0];
  assert.ok(!marketChoices(cultivation, 0).some(card => card.opensCascade));
  const hand = marketChoices(cultivation, 1);
  assert.equal(hand.length, 3);
  const bond = hand.find(card => card.opensCascade);
  assert.equal(bond.opensCascade, 'thunder');
  assert.equal(bond.id, 'spark');
  assert.match(bond.detail, /凡品新招 · 一阶连携/);
  assert.match(bond.pairing, /含珠吐息.*雷潮/);
  cultivation.weapons[0] = cultivation.makeWeapon('fang', 1);
  assert.equal(applyMarketChoice(cultivation, bond), false);
  assert.equal(cultivation.weapons.length, 1);
  assert.equal(cultivation.cascade, null);
  cultivation.weapons[0] = before;
  assert.ok(applyMarketChoice(cultivation, bond));
  assert.equal(cultivation.weapons.length, 2);
  assert.equal(cultivation.weapons[1].id, 'spark');
  assert.equal(cultivation.cascadeRank, 1);
  assert.equal(cultivation.cascade, 'thunder');
  assert.equal(applyMarketChoice(cultivation, bond), false);
  assert.ok(!marketChoices(cultivation, 1).some(card => card.opensCascade));
});

test('two owned distinct elemental partners start a ready cascade at rank II', () => {
  const cultivation = new Cultivation(() => .5, {starter:'bubble'});
  cultivation.wave = 3;
  const partner = cultivation.makeWeapon('spark', 1);
  cultivation.weapons.push(partner);
  const offers = marketChoices(cultivation, 1);
  const thunder = offers.find(card => card.kind === 'cascade' && card.route === 'thunder');
  assert.equal(offers.length, 3);
  assert.equal(thunder.nextRank, 2);
  assert.match(thunder.detail, /直接习得二阶/);
  const starter = cultivation.weapons[0];
  cultivation.weapons[0] = cultivation.makeWeapon('spark', 1);
  assert.equal(applyMarketChoice(cultivation, thunder), false);
  cultivation.weapons[0] = starter;
  assert.ok(applyMarketChoice(cultivation, thunder));
  assert.equal(cultivation.cascadeRank, 2);
  assert.deepEqual(cultivation.weapons, [starter, partner]);
});

test('compound offers name real equipped partners and state when a tactic unlocks', () => {
  const opening = marketChoices(new Cultivation(() => .5, {starter:'bubble'}), 0);
  assert.match(opening.find(card => card.id === 'spark').pairing, /含珠吐息.*雷击传得更远/);

  const cultivation = new Cultivation(() => .5);
  cultivation.weapons = ['drop','spark','breach','needle','ember','coil'].map(id => cultivation.makeWeapon(id, 3));
  Object.assign(cultivation, {wave:8, cascade:'thunder', cascadeRank:2});
  const hand = marketChoices(cultivation, 3);
  assert.equal(hand.length, 3);
  assert.match(hand.find(card => card.art === 'frost').pairing, /潮雷走电.*冻住的湿敌/);
  assert.match(hand.find(card => card.art === 'frost').detail, /借潮雷走电之势.*直入二阶/);
  assert.match(hand.find(card => card.system === 'cascade').pairing, /蟠身引涡.*火团顺风/);
  assert.match(dragonArtPairing(cultivation, 'beam', 2), /伏水惊珠.*潮雷走电.*外侧湿敌/);
});

test('prepared frost offers icekeel alongside both doctrines with open slots', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'drop'});
  cultivation.weapons.push(cultivation.makeWeapon('spark', 1));
  Object.assign(cultivation, {dragonArt: 'frost', dragonArtRank: 2, wave: 5});
  const hand = marketChoices(cultivation, 1);
  const prism = hand.find(card => card.kind === 'learn' && card.id === 'icekeel');
  const reach = hand.find(card => card.kind === 'dragonArt' && card.doctrine === 'reach');
  const echo = hand.find(card => card.kind === 'dragonArt' && card.doctrine === 'echo');
  assert.equal(hand.length, 3);
  assert.match(prism.pairing, /先打湿.*折雷经过冰棱.*侧翼/);
  assert.match(reach.pairing, /折雷.*冻住的湿敌.*高低两处/);
  assert.match(echo.pairing, /折雷.*冻住的湿敌.*湿敌再传一跳/);
  assert.ok(applyMarketChoice(cultivation, prism));
  assert.equal(cultivation.dragonArtRank, 2);
  const nextHand = marketChoices(cultivation, 1);
  assert.equal(nextHand.length, 3);
  const rain = nextHand.find(card => card.kind === 'learn' && card.id === 'torrent');
  assert.match(rain.pairing, /打湿.*雷打碎湿冰.*活着的湿敌/);
});

test('prepared fire adds Opening Skies to the three frost mastery choices', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'drop'});
  cultivation.weapons.push(cultivation.makeWeapon('spark', 1), cultivation.makeWeapon('ember', 1));
  Object.assign(cultivation, {dragonArt: 'frost', dragonArtRank: 2, wave: 5});
  const hand = marketChoices(cultivation, 1);
  assert.equal(hand.length, 3);
  assert.ok(hand.every(card => card.kind === 'dragonArt' && card.art === 'frost'));
  assert.deepEqual(new Set(hand.map(card => card.doctrine)), new Set(['reach', 'echo', 'thaw']));
  const thaw = hand.find(card => card.doctrine === 'thaw');
  assert.match(thaw.title, /霜镜碎界 · 开霁/);
  assert.match(thaw.description, /沧溟.*两处相邻湿冰.*冰面外.*主冰面先碎.*横扫外群/);
  assert.match(thaw.pairing, /回火.*能通行的路线/);

  cultivation.weapons.pop();
  assert.ok(!marketChoices(cultivation, 1).some(card => card.doctrine === 'thaw'));
  assert.equal(applyMarketChoice(cultivation, thaw), false);
  Object.assign(cultivation, {cascade: 'fire', cascadeRank: 2});
  const cascadeThaw = marketChoices(cultivation, 2).find(card => card.doctrine === 'thaw');
  assert.match(cascadeThaw.pairing, /万点飞焰供火/);
  assert.ok(applyMarketChoice(cultivation, cascadeThaw));
  assert.equal(cultivation.dragonArtRank, 3);
  assert.equal(cultivation.dragonArtDoctrine, 'thaw');
});

test('full frost builds can change into and out of Opening Skies at rank III', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.weapons = ['drop', 'spark', 'emberwings', 'torrent', 'mist', 'venom']
    .map(id => cultivation.makeWeapon(id, 1));
  Object.assign(cultivation, {dragonArt: 'frost', dragonArtRank: 3, dragonArtDoctrine: 'reach', wave: 6});
  const gear = cultivation.weapons.slice();
  const hand = marketChoices(cultivation, 3);
  assert.equal(hand.length, 3);
  assert.deepEqual(new Set(hand.filter(card => card.system === 'doctrine').map(card => card.doctrine)), new Set(['echo', 'thaw']));
  const thaw = hand.find(card => card.system === 'doctrine' && card.doctrine === 'thaw');
  assert.match(thaw.detail, /封空→开霁.*保留三阶/);
  assert.ok(applyMarketChoice(cultivation, thaw));
  assert.equal(applyMarketChoice(cultivation, thaw), false);
  assert.equal(cultivation.dragonArtRank, 3);
  assert.deepEqual(cultivation.weapons, gear);

  cultivation.wave = 11;
  const echo = marketChoices(cultivation, 3).find(card => card.system === 'doctrine' && card.doctrine === 'echo');
  assert.match(echo.detail, /开霁→传霜.*保留三阶/);
  assert.ok(applyMarketChoice(cultivation, echo));
  assert.equal(cultivation.dragonArtRank, 3);
  assert.deepEqual(cultivation.weapons, gear);
});

test('a developed windkite can choose fire delivery or poison delivery without adding a pick', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'bubble'});
  cultivation.weapons.push(cultivation.makeWeapon('windkite', 1));
  cultivation.dragonArt = 'frost';
  cultivation.dragonArtRank = 1;
  for (const [wave, ids, payoff] of [[4, ['ember'], /落到湿敌或雨场.*蒸汽/],
    [5, ['venom', 'sporeseed'], /送往另一群|送到另一群/]]) {
    cultivation.wave = wave;
    const hand = marketChoices(cultivation, 1);
    const catalyst = hand.find(card => ids.includes(card.id) && card.kind === 'learn');
    assert.equal(hand.length, 3);
    assert.ok(hand.some(card => card.kind === 'dragonArt'));
    assert.match(catalyst.pairing, payoff);
    assert.equal(cultivation.weapons.length, 2);
  }
});

test('fire and wind can choose a rain field or material courier before filling all six slots', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.weapons = ['bubble', 'mist', 'coil', 'ember'].map(id => cultivation.makeWeapon(id, 1));
  cultivation.wave = 4;
  const hand = marketChoices(cultivation, 2);
  const rain = hand.find(card => card.id === 'torrent');
  const kite = hand.find(card => card.id === 'windkite');
  assert.equal(hand.length, 3);
  assert.ok(hand.some(card => card.kind === 'dragonArt' && card.art === 'abyss'));
  assert.match(rain.pairing, /燃敌或火场.*湿区.*蒸汽/);
  assert.match(kite.pairing, /部分火.*落到湿敌或雨场/);
  assert.ok(applyMarketChoice(cultivation, kite));
  assert.equal(cultivation.weapons.length, 5);
  assert.ok(!cultivation.weapons.some(weapon => weapon.id === 'torrent'));

  Object.assign(cultivation, {wave:5, dragonArt:'abyss', dragonArtRank:2, cascade:'fire', cascadeRank:2});
  const deeper = marketChoices(cultivation, 2);
  assert.deepEqual(new Set(deeper.map(card => card.doctrine ?? card.id)), new Set(['reach', 'echo', 'windkite']));
  const upgrade = deeper.find(card => card.id === 'windkite');
  assert.match(upgrade.pairing, /蒸汽.*上方凝雨.*打湿并冲击/);
  assert.ok(applyMarketChoice(cultivation, upgrade));
  assert.equal(cultivation.weapons.find(weapon => weapon.id === 'windkite').tier, 2);
  assert.equal(cultivation.dragonArtRank, 2);
  assert.equal(cultivation.cascadeRank, 2);
});

test('wind and poison projectiles can opt into a borrowable field before windkite', () => {
  const cultivation = new Cultivation(() => .5);
  cultivation.weapons.push(...['coil','mist'].map(id => cultivation.makeWeapon(id, 1)));
  cultivation.dragonArt = 'abyss';
  cultivation.dragonArtRank = 1;
  cultivation.wave = 5;
  const hand = marketChoices(cultivation, 1);
  const field = hand.find(card => card.kind === 'learn' && ['venom','sporeseed'].includes(card.id));
  assert.equal(hand.length, 3);
  assert.ok(field);
  assert.match(field.pairing, /风眼.*毒雾/);
  assert.ok(applyMarketChoice(cultivation, field));
  cultivation.wave++;
  const next = marketChoices(cultivation, 1);
  assert.equal(next.length, 3);
  assert.match(next.find(card => card.id === 'windkite').pairing, /毒雾.*另一群/);
});

test('invested paired techniques unlock rank II immediately and either third-rank doctrine remains selectable', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'drop'});
  cultivation.wave = 2;
  const [main] = cultivation.weapons;
  const partner = cultivation.makeWeapon('tail', 1);
  cultivation.weapons.push(partner);
  const stone = () => marketChoices(cultivation, 1).find(card => card.art === 'stone');
  assert.equal(stone().nextRank, 1);
  partner.tier = 2;
  const awakened = stone();
  assert.equal(awakened.nextRank, 2);
  assert.match(awakened.detail, /伏水惊珠＋摆尾开汀（含灵品）.*直入二阶/);
  partner.tier = 1;
  assert.equal(applyMarketChoice(cultivation, awakened), false);
  main.tier = 3;
  cultivation.weapons.pop();
  assert.equal(stone().nextRank, 1);
  assert.equal(applyMarketChoice(cultivation, awakened), false);
  cultivation.weapons.push(partner);
  assert.ok(applyMarketChoice(cultivation, stone()));
  assert.equal(cultivation.dragonArtRank, 2);
  cultivation.wave++;
  const ranked = marketChoices(cultivation, 1);
  assert.equal(ranked.length, 3);
  assert.deepEqual(new Set(ranked.filter(card => card.art === 'stone').map(card => card.doctrine)), new Set(['reach', 'echo']));
});

test('a matching rank-II cascade awakens its art without advancing an unrelated art or outrunning card budget', () => {
  const cultivation = new Cultivation(() => .5, {starter: 'drop'});
  cultivation.wave = 2;
  cultivation.weapons.push(...['tail','coil','venom','spark'].map(id => cultivation.makeWeapon(id, 1)));
  Object.assign(cultivation, {cascade: 'water', cascadeRank: 2});
  const hand = marketChoices(cultivation, 1);
  const stone = hand.find(card => card.art === 'stone');
  assert.equal(hand.length, 3);
  assert.equal(stone.nextRank, 2);
  assert.match(stone.detail, /借横江叠浪之势.*直入二阶/);
  assert.match(stone.pairing, /多座石像.*向外的石潮/);
  cultivation.cascadeRank = 1;
  assert.equal(applyMarketChoice(cultivation, stone), false);
  cultivation.cascadeRank = 2;
  assert.ok(applyMarketChoice(cultivation, stone));
});

test('late paired weirs offer one of two geometry tempers beside both mastery choices', () => {
  const cultivation = new Cultivation(() => .5, {starter:'drop'});
  const weir = cultivation.makeWeapon('bankweir', 2);
  cultivation.weapons.push(weir);
  Object.assign(cultivation, {dragonArt: 'stone', dragonArtRank: 2, wave: 7});
  const before = techniqueStats(weir);
  for (const [wave, form, lengthens] of [[7, 'long-weir', true], [8, 'wide-weir', false]]) {
    cultivation.wave = wave;
    const hand = marketChoices(cultivation, 2);
    const forms = hand.filter(card => card.kind === 'temper' && card.uid === weir.uid);
    assert.equal(hand.length, 3);
    assert.equal(forms.length, 1);
    assert.equal(forms[0].form, form);
    assert.match(forms[0].pairing, /泄流.*石壳/);
    assert.deepEqual(new Set(hand.filter(card => card.kind === 'dragonArt').map(card => card.doctrine)), new Set(['reach','echo']));
    assert.ok(applyMarketChoice(cultivation, forms[0]));
    const tempered = techniqueStats(weir);
    assert.equal(tempered.flowLength > before.flowLength, lengthens);
    assert.equal(tempered.radius < before.radius, lengthens);
    assert.equal(cultivation.dragonArtRank, 2);
    delete weir.temper;
  }
  assert.ok(!marketChoices(cultivation, 1).some(card => card.kind === 'temper' && card.pairing?.includes('石壳')));
  cultivation.dragonArt = null;
  cultivation.dragonArtRank = 0;
  assert.ok(!marketChoices(cultivation, 2).some(card => card.kind === 'temper' && card.pairing));
});

test('mature stone can compare both weir shapes for one existing slot', () => {
  const cultivation = new Cultivation(() => .5,{starter:'drop'});
  cultivation.weapons=['drop','tail','bankweir','spark','mist','needle'].map(id=>
    cultivation.makeWeapon(id,id==='bankweir'?2:1));
  Object.assign(cultivation,{wave:8,dragonArt:'stone',dragonArtRank:3,dragonArtDoctrine:'echo'});
  const hand=marketChoices(cultivation,3);
  const pair=hand.filter(card=>card.kind==='temper'&&card.id==='bankweir');
  assert.equal(hand.length,3);
  assert.deepEqual(new Set(pair.map(card=>card.form)),new Set(['long-weir','wide-weir']));
  assert.equal(pair[0].uid,pair[1].uid);
  const uid=pair[0].uid;
  assert.ok(applyMarketChoice(cultivation,pair[0]));
  assert.equal(cultivation.weapons.length,6);
  assert.equal(cultivation.weapons.find(weapon=>weapon.uid===uid).temper,pair[0].form);
  assert.equal(applyMarketChoice(cultivation,pair[1]),false);
});

test('a prepared route can take over at rank II and regain III in the next hand', () => {
  for (const system of ['dragonArt', 'cascade']) {
    const isArt = system === 'dragonArt';
    const cultivation = lateBuild('bubble');
    const before = cultivation.weapons.slice();
    const target = isArt ? 'frost' : 'water';
    const other = isArt ? 'cascade' : 'dragonArt';
    const previousOther = cultivation[other];
    cultivation.wave = isArt ? 7 : 8;
    const choice = marketChoices(cultivation, 2).find(card => card.system === system);
    assert.equal(choice.art ?? choice.route, target);
    assert.equal(choice.swap, undefined);
    assert.match(choice.detail, /取代.*(?:龙术|连携)三阶→二阶/);
    assert.ok(applyMarketChoice(cultivation, choice));
    assert.equal(cultivation[system], target);
    assert.equal(cultivation[`${system}Rank`], 2);
    assert.equal(cultivation[other], previousOther);
    assert.equal(cultivation[`${other}Rank`], 3);
    assert.equal(cultivation.dragonArtDoctrine, isArt ? null : 'echo');
    assert.ok(cultivation.weapons.every((weapon, index) => weapon === before[index]));

    cultivation.wave++;
    const mastery = marketChoices(cultivation, 2).find(card => card.kind === system);
    assert.ok(applyMarketChoice(cultivation, mastery));
    assert.equal(cultivation[`${system}Rank`], 3);
  }
});

test('an atomic reorientation opens a locked route while preserving the other route and five slot identities', () => {
  const cultivation = lateBuild();
  cultivation.wave = 10;
  const [, core, partner] = cultivation.weapons;
  core.tier = partner.tier = 2;
  const before = cultivation.weapons.slice();
  const hand = marketChoices(cultivation, 2);
  const choice = hand.find(card => card.kind === 'reorient' && card.swap);
  const slot = before.findIndex(weapon => weapon.uid === choice.swap.uid);
  assert.equal(hand.length, 3);
  assert.equal(choice.system, 'cascade');
  assert.equal(choice.route, 'water');
  assert.equal(choice.swap.id, 'drop');
  assert.match(choice.detail, /青蘅毒沼→伏水惊珠（凡品）/);

  const unsafe = {...choice, swap: {...choice.swap, uid: core.uid, previousId: core.id, tier: core.tier}};
  assert.equal(applyMarketChoice(cultivation, unsafe), false);
  assert.equal(cultivation.cascade, 'thunder');
  assert.deepEqual(cultivation.weapons, before);

  const modifiers = cultivation.modifiers();
  assert.ok(applyMarketChoice(cultivation, choice));
  assert.notEqual(cultivation.modifiers(), modifiers);
  assert.equal(cultivation.cascade, 'water');
  assert.equal(cultivation.cascadeRank, 2);
  assert.equal(cultivation.dragonArt, 'beam');
  assert.equal(cultivation.dragonArtRank, 3);
  assert.equal(cultivation.dragonArtDoctrine, 'echo');
  assert.equal(cultivation.weapons[slot].id, 'drop');
  assert.equal(cultivation.weapons[slot].tier, 1);
  assert.ok(cultivation.weapons.every((weapon, index) => index === slot || weapon === before[index]));
});
