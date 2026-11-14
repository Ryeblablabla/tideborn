import {
  DEFAULT_MODIFIERS, FAMILIES, STARTERS, TECHNIQUES, getWeapon, getTemper, techniqueStats,
} from './cultivation-data.js';

export { techniqueStats } from './cultivation-data.js';
export const SLOT_COUNT = 6;

const bounds = {
  damage: [.50, 2.4], cooldown: [.47, 1.8], guard: [.44, 1.66], regen: [0, 6.8],
  projectiles: [0, 3], chain: [0, 3], area: [.58, 1.9],
  mass: [.61, 1.9], physical: [.55, 2.6], breath: [.55, 2.6],
  water: [.55, 2.6], thunder: [.55, 2.6], fire: [.55, 2.6],
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Run-local techniques. Combat owns each weapon's cooldown clock. */
export class Cultivation {
  constructor(rng, {starter = 'bubble', unlocked = []} = {}) {
    this.random = typeof rng === 'function' ? rng : Math.random;
    this.unlocked = new Set(unlocked);
    this.wave = 1;
    this.cascade = null;
    this.cascadeRank = 0;
    this.cascadeDoctrine = null;
    this.dragonArt = null;
    this.dragonArtRank = 0;
    this.dragonArtDoctrine = null;
    this.nextUid = 1;
    this.cachedMods = null;
    this.cachedSets = null;

    const id = STARTERS.includes(starter) ? starter : 'bubble';
    this.weapons = [this.makeWeapon(id, 1)];
  }

  roll() {
    const sample = this.random();
    return Number.isFinite(sample) ? clamp(sample, 0, 1 - Number.EPSILON) : .5;
  }

  makeWeapon(id, tier) {
    return {uid: this.nextUid++, id, tier, cd: 0};
  }

  getWeapon(id) {
    return getWeapon(id);
  }

  eligibleTechniques(stage) {
    return TECHNIQUES.filter(def => def.minStage <= stage ||
      this.unlocked.has(def.id) || this.unlocked.has(def.unlock));
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
      for (const threshold of family.thresholds) {
        if (!threshold.active) continue;
        for (const [stat, amount] of Object.entries(threshold.effects)) mods[stat] += amount;
      }
    }
    for (const key of Object.keys(mods)) {
      const [lo, hi] = bounds[key] ?? [.50, 2.3];
      mods[key] = clamp(mods[key], lo, hi);
    }
    this.cachedMods = Object.freeze(mods);
    return this.cachedMods;
  }

  view() {
    const mods = this.modifiers();
    const slots = Array.from({length: SLOT_COUNT}, (_, index) => {
      const weapon = this.weapons[index];
      if (!weapon) return null;
      return {
        ...weapon, def: getWeapon(weapon.id), stats: techniqueStats(weapon, mods),
        temperName: getTemper(weapon)?.name ?? null,
      };
    });
    return {slots, sets: this.sets(), mods};
  }
}
