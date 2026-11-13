import {
  DEFAULT_MODIFIERS, FAMILIES, STARTERS, TALENTS, TALENT_BY_ID, TECHNIQUES, getWeapon,
  getTemper, techniqueStats, temperingForms,
} from './cultivation-data.js';

export {
  DEFAULT_MODIFIERS, FAMILIES, STARTERS, TALENTS, TALENT_BY_ID, TECHNIQUES, TECHNIQUE_BY_ID,
  TIER_NAMES, getWeapon, techniqueStats,
} from './cultivation-data.js';

const SLOT_COUNT = 6;
const OFFER_COUNT = 4;
const PRICE_BY_TIER = [1, 2.1, 3.55, 5.35];
const ERROR_MESSAGES = {
  closed: '在两波间的集市中操作。',
  unavailable: '这件物品已不在货架上。',
  funds: '灵材不足。',
  full: '六个兵器槽已满，可以回收或融合。',
  missing: '找不到这件已装备的兵器。',
  mismatch: '需要两件同招、同品的兵器。',
  temperMismatch: '两件法门的淬炼路数不同。',
  temperUnavailable: '灵品以上的法门可以择一淬炼。',
  tempered: '这件法门已经淬炼。',
  maximum: '天品已经达到最高品阶。',
  locked: '所有铺位已保留，先解开一个。',
  settled: '本波已经结算，请继续修炼。',
  talent: '这条词条不在本次三选中。',
};
const bounds = {
  damage: [.50, 2.4], cooldown: [.47, 1.8], guard: [.44, 1.66], regen: [0, 6.8],
  projectiles: [0, 3], chain: [0, 3], area: [.58, 1.9],
  mass: [.61, 1.9], physical: [.55, 2.6], breath: [.55, 2.6],
  water: [.55, 2.6], thunder: [.55, 2.6], fire: [.55, 2.6],
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const nonnegative = n => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
const rejected = reason => ({ok: false, reason, message: ERROR_MESSAGES[reason]});
const accepted = details => ({ok: true, ...details});
const compatibleTempers = (first, second) =>
  !first.temper || !second.temper || first.temper === second.temper;

function shuffled(values, roll) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function addEffects(mods, effects, stacks = 1) {
  for (const [stat, amount] of Object.entries(effects)) mods[stat] += amount * stacks;
}

/** Run-local equipment and market. Physics owns each weapon's cooldown clock. */
export class Cultivation {
  constructor(rng, {starter = 'bubble', unlocked = []} = {}) {
    this.random = typeof rng === 'function' ? rng : Math.random;
    this.unlocked = new Set(unlocked);
    this.weapons = [];
    this.materials = 8;
    this.wave = 1;
    this.stage = 0;
    this.shopOpen = false;
    this.offers = Array(OFFER_COUNT).fill(null);
    this.learned = new Map();
    this.reward = null;

    this.nextUid = 1;
    this.paid = new Map();
    this.rolls = 0;
    this.choices = [];
    this.cachedMods = null;
    this.cachedSets = null;

    const id = STARTERS.includes(starter) ? starter : 'bubble';
    this.weapons.push(this.makeWeapon(id, 1, getWeapon(id).cost));
  }

  roll() {
    const sample = this.random();
    return Number.isFinite(sample) ? clamp(sample, 0, 1 - Number.EPSILON) : .5;
  }

  makeWeapon(id, tier, paid) {
    const weapon = {uid: this.nextUid++, id, tier, cd: 0};
    this.paid.set(weapon.uid, paid);
    return weapon;
  }

  getWeapon(id) {
    return getWeapon(id);
  }

  invalidateModifiers() {
    this.cachedMods = null;
    this.cachedSets = null;
  }

  sets() {
    if (this.cachedSets) return this.cachedSets;
    const counts = new Map(FAMILIES.map(family => [family.id, 0]));
    for (const weapon of this.weapons) {
      const family = getWeapon(weapon.id)?.family;
      if (family) counts.set(family, counts.get(family) + 1);
    }
    this.cachedSets = FAMILIES.map(family => {
      const count = counts.get(family.id);
      const thresholds = family.thresholds.map(threshold => ({...threshold, active: count >= threshold.at}));
      return {...family, count, thresholds, next: thresholds.find(threshold => !threshold.active) ?? null};
    });
    return this.cachedSets;
  }

  modifiers() {
    if (this.cachedMods) return this.cachedMods;
    const mods = {...DEFAULT_MODIFIERS};
    for (const family of this.sets()) {
      for (const threshold of family.thresholds) if (threshold.active) addEffects(mods, threshold.effects);
    }
    for (const [id, stacks] of this.learned) addEffects(mods, TALENT_BY_ID[id].effects, stacks);
    for (const key of Object.keys(mods)) {
      const [lo, hi] = bounds[key] ?? [.50, 2.3];
      mods[key] = clamp(mods[key], lo, hi);
    }
    this.cachedMods = Object.freeze(mods);
    return this.cachedMods;
  }

  earn(amount) {
    const earned = nonnegative(amount);
    this.materials += earned;
    return earned;
  }

  settleWave({kills = 0, eaten = 0} = {}) {
    if (this.shopOpen) return rejected('settled');
    const base = 7 + Math.floor((this.wave - 1) * 1.35);
    const bonus = Math.min(10, Math.floor(nonnegative(kills) * .52 + nonnegative(eaten) * .33));
    const materials = Math.max(1, Math.round((base + bonus) * this.modifiers().harvest));
    const reward = {wave: this.wave, base, bonus, materials};
    this.materials += materials;
    this.wave++;
    this.reward = reward;
    return accepted({...reward, totalMaterials: this.materials, nextWave: this.wave});
  }

  eligibleTechniques() {
    return TECHNIQUES.filter(def => def.minStage <= this.stage ||
      this.unlocked.has(def.id) || this.unlocked.has(def.unlock));
  }

  priceFor(id, tier) {
    const def = getWeapon(id);
    return Math.ceil(def.cost * PRICE_BY_TIER[tier - 1] + (this.wave - 1) * .46);
  }

  offerTier(id) {
    if (this.wave < 3) return 1;
    const usable = this.weapons.filter(weapon => weapon.id === id && weapon.tier < 4);
    const matchingTierChance=this.weapons.length>=SLOT_COUNT ? .62 : .36;
    if (usable.length && this.roll() < matchingTierChance) return usable[Math.floor(this.roll() * usable.length)].tier;
    const roll = this.roll();
    if (this.wave >= 10 && roll < .035) return 4;
    if (this.wave >= 6 && roll < .12) return 3;
    if (roll < Math.min(.43, .13 + this.wave * .025)) return 2;
    return 1;
  }

  chooseTechnique(pool) {
    // A little familiarity makes pairs buildable. Unowned entries still
    // occupy most of the draw unless the player already fields a full family.
    const owned = new Set(this.weapons.map(weapon => weapon.id));
    const total = pool.reduce((weight, def) => weight + (owned.has(def.id) ? 1.72 : 1), 0);
    let cursor = this.roll() * total;
    for (const def of pool) {
      cursor -= owned.has(def.id) ? 1.72 : 1;
      if (cursor < 0) return def;
    }
    return pool.at(-1);
  }

  flexOffer(pool, offers) {
    if (this.weapons.length >= SLOT_COUNT) {
      if (offers.some(offer => offer && this.meldCandidate(offer))) return null;
      const matches = this.weapons.filter(weapon => weapon.tier < 4 && pool.some(def => def.id === weapon.id));
      if (!matches.length) return null;
      const match = matches[Math.floor(this.roll() * matches.length)];
      return {id: match.id, tier: match.tier};
    }

    const owned = new Set(this.weapons.map(weapon => weapon.id));
    const techniques = this.weapons.map(weapon => getWeapon(weapon.id));
    const complement = pool.filter(def => {
      if (owned.has(def.id)) return false;
      return techniques.some(current => {
        if (current.element === 'water' && ['fire', 'thunder'].includes(def.element)) return true;
        if (def.element === 'water' && ['fire', 'thunder'].includes(current.element)) return true;
        return current.family === def.family && (current.kind !== def.kind || current.kind === 'projectile' &&
          (current.pierce !== def.pierce || current.projectiles !== def.projectiles));
      });
    });
    if (!complement.length) return null;
    const def = this.chooseTechnique(complement);
    return {id: def.id, tier: this.offerTier(def.id)};
  }

  refillOffers() {
    const next = this.offers.map(offer => offer?.locked ? offer : null);
    const openSlots = next.flatMap((offer, index) => offer ? [] : [index]);
    const known = new Set(next.filter(Boolean).map(offer => offer.id));
    const represented = new Set(next.filter(Boolean).map(offer => getWeapon(offer.id).family));
    const missing = shuffled(FAMILIES.map(family => family.id).filter(id => !represented.has(id)), () => this.roll());
    const eligible = this.eligibleTechniques();
    for (const [position, slot] of openSlots.entries()) {
      const family = missing[position];
      let pool = eligible.filter(def => !known.has(def.id) && (!family || def.family === family));
      if (!pool.length) pool = eligible.filter(def => !known.has(def.id));
      if (!pool.length) pool = eligible;
      const flex = !family ? this.flexOffer(pool, next) : null;
      const id = flex?.id ?? this.chooseTechnique(pool).id;
      const tier = flex?.tier ?? this.offerTier(id);
      next[slot] = {id, tier, price: this.priceFor(id, tier), locked: false};
      known.add(id);
    }
    this.offers = next;
  }

  open(stage = this.stage) {
    this.stage = clamp(nonnegative(stage), 0, 4);
    if (!this.shopOpen) {
      this.rolls = 0;
      this.refillOffers();
      this.shopOpen = true;
    }
    return this.view();
  }

  close() {
    this.shopOpen = false;
    this.offers = this.offers.map(offer => offer?.locked ? offer : null);
    return this.view();
  }

  get rerollCost() {
    return 2 + Math.floor((this.wave - 1) / 4) + this.rolls;
  }

  reroll() {
    if (!this.shopOpen) return rejected('closed');
    if (this.offers.every(offer => offer?.locked)) return rejected('locked');
    const price = this.rerollCost;
    if (this.materials < price) return rejected('funds');
    this.materials -= price;
    this.rolls++;
    this.refillOffers();
    return accepted({price, materials: this.materials});
  }

  lock(index) {
    if (!this.shopOpen) return rejected('closed');
    if (!Number.isInteger(index) || !this.offers[index]) return rejected('unavailable');
    const offer = this.offers[index];
    offer.locked = !offer.locked;
    return accepted({index, locked: offer.locked});
  }

  meldCandidate(offer) {
    return offer.tier < 4
      ? this.weapons.find(weapon => weapon.id === offer.id && weapon.tier === offer.tier)
      : undefined;
  }

  buy(index) {
    if (!this.shopOpen) return rejected('closed');
    if (!Number.isInteger(index) || !this.offers[index]) return rejected('unavailable');
    const offer = this.offers[index];
    const existing = this.weapons.length >= SLOT_COUNT ? this.meldCandidate(offer) : null;
    if (!existing && this.weapons.length >= SLOT_COUNT) return rejected('full');
    if (this.materials < offer.price) return rejected('funds');
    this.materials -= offer.price;
    this.offers[index] = null;
    let weapon;
    if (existing) {
      existing.tier++;
      this.paid.set(existing.uid, this.paid.get(existing.uid) + offer.price);
      weapon = existing;
    } else {
      weapon = this.makeWeapon(offer.id, offer.tier, offer.price);
      this.weapons.push(weapon);
    }
    this.invalidateModifiers();
    return accepted({weapon: {...weapon}, price: offer.price, fused: Boolean(existing), materials: this.materials});
  }

  sellPrice(weapon) {
    const def = getWeapon(weapon.id);
    const value = this.paid.get(weapon.uid) ?? def.cost;
    return Math.max(1, Math.floor(value * .43));
  }

  sell(uid) {
    if (!this.shopOpen) return rejected('closed');
    const position = this.weapons.findIndex(weapon => weapon.uid === uid);
    if (position < 0) return rejected('missing');
    const weapon = this.weapons[position];
    const price = this.sellPrice(weapon);
    this.weapons.splice(position, 1);
    this.paid.delete(uid);
    this.materials += price;
    this.invalidateModifiers();
    return accepted({weapon: {...weapon}, price, materials: this.materials});
  }

  temperPrice(weapon) {
    return Math.ceil(getWeapon(weapon.id).cost * .65) + 4 + (weapon.tier - 2) * 2;
  }

  tempering(weapon, mods) {
    if (!this.shopOpen || weapon.tier < 2 || weapon.temper) return [];
    const price = this.temperPrice(weapon);
    const affordable = this.materials >= price;
    return temperingForms(weapon.id).map(({id, name, desc}) => ({
      id, name, desc, price, affordable,
      stats: techniqueStats({...weapon, temper: id}, mods),
    }));
  }

  temper(selection) {
    if (!this.shopOpen) return rejected('closed');
    const {uid, form} = selection ?? {};
    const weapon = this.weapons.find(item => item.uid === uid);
    if (!weapon) return rejected('missing');
    if (weapon.temper) return rejected('tempered');
    if (weapon.tier < 2 || !temperingForms(weapon.id).some(choice => choice.id === form)) {
      return rejected('temperUnavailable');
    }
    const price = this.temperPrice(weapon);
    if (this.materials < price) return rejected('funds');
    const paid = this.paid.get(uid) ?? getWeapon(weapon.id).cost;
    this.materials -= price;
    this.paid.set(uid, paid + price);
    weapon.temper = form;
    return accepted({weapon: {...weapon}, price, materials: this.materials});
  }

  merge(uidA, uidB) {
    if (!this.shopOpen) return rejected('closed');
    if (uidA === uidB) return rejected('mismatch');
    const first = this.weapons.find(weapon => weapon.uid === uidA);
    const secondIndex = this.weapons.findIndex(weapon => weapon.uid === uidB);
    const second = this.weapons[secondIndex];
    if (!first || !second) return rejected('missing');
    if (first.id !== second.id || first.tier !== second.tier) return rejected('mismatch');
    if (first.tier >= 4) return rejected('maximum');
    if (!compatibleTempers(first, second)) return rejected('temperMismatch');
    first.tier++;
    first.cd = Math.max(first.cd, second.cd);
    if (second.temper && !first.temper) first.temper = second.temper;
    this.weapons.splice(secondIndex, 1);
    this.paid.set(first.uid, this.paid.get(first.uid) + this.paid.get(second.uid));
    this.paid.delete(second.uid);
    this.invalidateModifiers();
    return accepted({weapon: {...first}, consumed: uidB, materials: this.materials});
  }

  mergePartner(weapon) {
    return weapon?.tier < 4
      ? this.weapons.find(other => other.uid !== weapon.uid && other.id === weapon.id &&
          other.tier === weapon.tier && compatibleTempers(weapon, other))
      : undefined;
  }

  trade(operation, value) {
    switch (operation) {
      case 'buy': return this.buy(value);
      case 'sell': return this.sell(value);
      case 'temper': return this.temper(value);
      case 'lock': return this.lock(value);
      case 'reroll': return this.reroll();
      case 'merge': {
        const weapon = this.weapons.find(item => item.uid === value);
        return this.merge(value, this.mergePartner(weapon)?.uid);
      }
      default: return rejected('unavailable');
    }
  }

  previewTrade(operation, value) {
    if (!['buy', 'sell', 'merge', 'temper'].includes(operation)) return rejected('unavailable');
    // These equipment transactions touch only this snapshot and never roll the market.
    const draft = Object.assign(Object.create(Cultivation.prototype), this, {
      weapons: this.weapons.map(weapon => ({...weapon})),
      offers: this.offers.slice(),
      paid: new Map(this.paid),
    });
    const result = draft.trade(operation, value);
    return result.ok ? {...result, view: draft.view()} : result;
  }

  talentOffers() {
    if (this.choices.length) return this.choices;
    const available = TALENTS.filter(def => (this.learned.get(def.id) ?? 0) < def.maxStacks);
    const families = shuffled(FAMILIES.map(family => family.id), () => this.roll());
    if (this.roll() < .24) families[Math.floor(this.roll() * families.length)] = 'general';
    const picks = [];
    for (const family of families) {
      const pool = available.filter(def => def.family === family && !picks.includes(def));
      const alternatives = pool.length ? pool : available.filter(def => !picks.includes(def));
      if (alternatives.length) picks.push(alternatives[Math.floor(this.roll() * alternatives.length)]);
    }
    this.choices = picks.map(def => ({...def, stacks: this.learned.get(def.id) ?? 0}));
    return this.choices;
  }

  applyTalent(indexOrId) {
    const def = Number.isInteger(indexOrId) ? this.choices[indexOrId]
      : this.choices.find(choice => choice.id === indexOrId);
    if (!def) return rejected('talent');
    const stacks = this.learned.get(def.id) ?? 0;
    if (stacks >= def.maxStacks) return rejected('maximum');
    this.learned.set(def.id, stacks + 1);
    this.choices = [];
    this.invalidateModifiers();
    return accepted({talent: {...def, stacks: stacks + 1}, mods: this.modifiers()});
  }

  view() {
    const mods = this.modifiers();
    const slots = Array.from({length: SLOT_COUNT}, (_, index) => {
      const weapon = this.weapons[index];
      if (!weapon) return null;
      const partner = this.mergePartner(weapon);
      return {
        ...weapon, def: getWeapon(weapon.id), stats: techniqueStats(weapon, mods),
        sellPrice: this.sellPrice(weapon), mergeUid: partner?.uid ?? null,
        temperName: getTemper(weapon)?.name ?? null, tempering: this.tempering(weapon, mods),
      };
    });
    const offers = this.offers.map(offer => {
      if (!offer) return null;
      const affordable = offer.price <= this.materials;
      const fusionUid = this.weapons.length >= SLOT_COUNT ? this.meldCandidate(offer)?.uid ?? null : null;
      const canBuy = this.shopOpen && affordable && (this.weapons.length < SLOT_COUNT || fusionUid !== null);
      return {...offer, def: getWeapon(offer.id), stats: techniqueStats(offer, mods), affordable, canBuy, fusionUid};
    });
    return {
      materials: this.materials, wave: this.wave, shopOpen: this.shopOpen, slots, offers,
      rerollCost: this.rerollCost, reward: this.reward, sets: this.sets(), mods,
      talents: this.choices,
      learned: Array.from(this.learned, ([id, stacks]) => ({...TALENT_BY_ID[id], stacks})),
    };
  }
}
