import assert from 'node:assert/strict';
import test from 'node:test';
import { Cultivation } from '../src/cultivation.js';
import { applyMarketChoice, marketChoices } from '../src/market-choices.js';

function build(route, slots = 6) {
  const cultivation = new Cultivation(() => .5, {starter:'drop'});
  const core = route === 'fire' ? 'ember' : route === 'poison' ? 'mist' : 'needle';
  const reserve = route === 'poison' ? 'needle' : 'mist';
  cultivation.weapons = ['drop','spark',core,'tail','fang',reserve].slice(0,slots)
    .map(id => cultivation.makeWeapon(id,2));
  Object.assign(cultivation,{wave:6,dragonArt:'stone',dragonArtRank:3,dragonArtDoctrine:'echo',cascade:route,cascadeRank:2});
  return cultivation;
}

test('third-rank elemental routes offer two spatial choices while keeping the other system in the hand', () => {
  const builds = [['water',['fan','lane']],['thunder',['rise','fork']],['fire',['cinder','crown']],['poison',['host','basin']],['wind',['gyre','gale']]];
  for (const [route,doctrines] of builds) {
    const cultivation = build(route);
    const weapons = cultivation.weapons.slice();
    const hand = marketChoices(cultivation,3);
    const branches = hand.filter(card => card.kind === 'cascade');
    assert.equal(hand.length,3);
    assert.deepEqual(new Set(branches.map(card => card.doctrine)),new Set(doctrines));
    assert.ok(hand.some(card => card.system === 'doctrine'));
    const first = branches[0];
    assert.equal(applyMarketChoice(cultivation,{...first,doctrine:route === 'water' ? 'rise' : 'fan'}),false);
    assert.ok(applyMarketChoice(cultivation,first));
    assert.equal(applyMarketChoice(cultivation,branches[1]),false);
    assert.equal(cultivation.cascadeRank,3);
    assert.equal(cultivation.cascadeDoctrine,first.doctrine);
    assert.equal(cultivation.dragonArtDoctrine,'echo');
    assert.deepEqual(cultivation.weapons,weapons);

    cultivation.wave = 9;
    const swap = marketChoices(cultivation,3).find(card => card.system === 'cascadeDoctrine');
    assert.ok(swap);
    assert.equal(swap.doctrine,branches[1].doctrine);
    assert.ok(applyMarketChoice(cultivation,swap));
    assert.equal(cultivation.cascadeDoctrine,swap.doctrine);
    assert.equal(cultivation.cascadeRank,3);
    assert.deepEqual(cultivation.weapons,weapons);
  }
});

test('a mature unbranched route can choose a shape, swap shapes at rank III, and clear it on changing element', () => {
  const cultivation = build('water',5);
  const weapons = cultivation.weapons.slice();
  const legacy = marketChoices(cultivation,1).find(card => card.kind === 'cascade');
  assert.equal(legacy.doctrine,undefined);
  assert.ok(applyMarketChoice(cultivation,legacy));
  assert.equal(cultivation.cascadeDoctrine,null);
  cultivation.wave = 9;
  const both = marketChoices(cultivation,3).filter(card => card.system === 'cascadeDoctrine');
  assert.deepEqual(new Set(both.map(card => card.doctrine)),new Set(['fan','lane']));
  assert.ok(applyMarketChoice(cultivation,both[0]));
  assert.equal(applyMarketChoice(cultivation,both[1]),false);

  cultivation.wave += 5;
  const other = marketChoices(cultivation,3).find(card => card.system === 'cascadeDoctrine');
  assert.equal(other.doctrine,both[1].doctrine);
  assert.ok(applyMarketChoice(cultivation,other));
  assert.equal(cultivation.cascadeRank,3);
  assert.deepEqual(cultivation.weapons,weapons);

  cultivation.wave = 18;
  const switchElement = marketChoices(cultivation,3).find(card => card.system === 'cascade');
  assert.equal(switchElement.route,'thunder');
  assert.ok(applyMarketChoice(cultivation,switchElement));
  assert.equal(cultivation.cascadeRank,2);
  assert.equal(cultivation.cascadeDoctrine,null);
  assert.deepEqual(cultivation.weapons,weapons);
});
