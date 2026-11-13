import assert from 'node:assert/strict';
import test from 'node:test';
import { Cultivation, techniqueStats } from '../src/cultivation.js';

function marketFor(...ids) {
  const market = new Cultivation(() => .5);
  market.weapons = ids.map(id => market.makeWeapon(id, 2, 20));
  market.earn(100);
  market.open(2);
  return market;
}

test('tempering previews the real trade without spending or changing global modifiers', () => {
  const market = marketFor('bubble');
  const before = market.view();
  const slot = before.slots[0];
  const split = slot.tempering.find(form => form.id === 'split-shot');
  const request = {uid: slot.uid, form: split.id};

  assert.equal(slot.tempering.length, 2);
  assert.equal(split.stats.projectiles, slot.stats.projectiles + 1);
  assert.ok(split.stats.power < slot.stats.power);
  const preview = market.previewTrade('temper', request);
  assert.ok(preview.ok);
  assert.deepEqual(market.view(), before);
  assert.deepEqual(preview.view.slots[0].stats, split.stats);
  assert.equal(preview.view.slots[0].temperName, split.name);
  assert.equal(preview.price, split.price);

  const actual = market.trade('temper', request);
  assert.ok(actual.ok);
  assert.deepEqual(actual.weapon, preview.weapon);
  assert.deepEqual(market.view(), preview.view);
  assert.equal(market.materials, before.materials - split.price);
  assert.equal(market.modifiers(), before.mods);
  assert.deepEqual(market.view().slots[0].tempering, []);
  assert.equal(market.trade('temper', request).reason, 'tempered');
});

test('tempering changes the effective reach, targets, and field duration by technique', () => {
  const market = marketFor('fang', 'tail', 'spark', 'thundercloud');
  const [melee, pulse, arc, field] = market.view().slots;

  assert.ok(melee.tempering[1].stats.range > melee.stats.range);
  assert.ok(pulse.tempering[1].stats.radius > pulse.stats.radius);
  assert.equal(arc.tempering[0].stats.chain, arc.stats.chain + 1);
  assert.ok(field.tempering[0].stats.life > field.stats.life);
  assert.ok(field.tempering[0].stats.energy > field.stats.energy);
  assert.ok(field.tempering[1].stats.life < field.stats.life);

  market.materials = 0;
  assert.equal(market.view().slots[0].tempering[0].affordable, false);
  assert.equal(market.trade('temper', {uid: melee.uid, form: melee.tempering[0].id}).reason, 'funds');
  market.weapons[0].tier = 1;
  assert.deepEqual(market.view().slots[0].tempering, []);
  assert.equal(market.trade('temper', {uid: melee.uid, form: melee.tempering[0].id}).reason, 'temperUnavailable');
});

test('fusing retains one temper and rejects incompatible branches', () => {
  const market = marketFor('bubble', 'bubble', 'bubble');
  const [plain, pierced, split] = market.weapons;
  assert.ok(market.trade('temper', {uid: pierced.uid, form: 'piercing-shot'}).ok);
  assert.ok(market.trade('temper', {uid: split.uid, form: 'split-shot'}).ok);
  assert.equal(market.merge(pierced.uid, split.uid).reason, 'temperMismatch');
  assert.equal(market.mergePartner(pierced)?.uid, plain.uid);
  assert.equal(market.trade('merge', plain.uid).weapon.temper, 'piercing-shot');

  for (const id of ['fang', 'tail', 'spark', 'drop']) {
    market.weapons.push(market.makeWeapon(id, 1, 10));
  }
  market.offers[0] = {id: 'bubble', tier: 3, price: 20, locked: false};
  const upgrade = market.trade('buy', 0);
  assert.ok(upgrade.ok);
  assert.equal(upgrade.weapon.uid, plain.uid);
  assert.equal(upgrade.weapon.tier, 4);
  assert.equal(upgrade.weapon.temper, 'piercing-shot');
  assert.equal(techniqueStats(upgrade.weapon).pierce, techniqueStats({...upgrade.weapon, temper: undefined}).pierce + 1);
});
