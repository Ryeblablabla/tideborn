const technique = definition => Object.freeze({
  range: 8, radius: 0, life: 0, pierce: 1, projectiles: 1, chain: 1,
  minStage: 0, ...definition,
});

export const TECHNIQUES = Object.freeze([
  technique({
    id: 'bubble', name: '含珠吐息', icon: '○', family: 'breath', kind: 'projectile',
    element: 'water', attribute: 'breath', power: .81, cooldown: .62, range: 11,
    desc: '吐出一枚水珠，潮湿最近的敌人。',
  }),
  technique({
    id: 'fang', name: '破鳞爪', icon: '爪', family: 'body', kind: 'melee',
    element: 'physical', attribute: 'physical', power: 1.36, cooldown: .77, range: 4.0,
    desc: '近身扑撕，短程但力重。',
  }),
  technique({
    id: 'tail', name: '摆尾开汀', icon: '↻', family: 'body', kind: 'pulse',
    element: 'physical', attribute: 'physical', power: 1.06, cooldown: 1.28, range: 4.6, radius: 4.2,
    desc: '以尾扫过近处一圈，潮湿的杂兵会被推得更远。',
  }),
  technique({
    id: 'coil', name: '蟠身引涡', icon: '◎', family: 'body', kind: 'zone',
    element: 'physical', attribute: 'physical', field: 'storm', power: .61, cooldown: 2.8, range: 7,
    radius: 3.1, life: 2.4,
    desc: '借身势起一处风眼，聚拢近敌并搬动元素。',
  }),
  technique({
    id: 'windkite', name: '折风鸢', icon: '鸢', family: 'body', kind: 'kiteDraft',
    element: 'wind', attribute: 'physical', power: .54, cooldown: 4.25,
    range: 10.2, gustRange: 15.6, radius: 1.85, life: 1.36, minStage: 1,
    desc: '风鸢把已有毒瘴、水汽或火焰送往另一群敌人。挟火遇湿化为蒸汽。升至灵品后，残汽可在另一队上方凝雨落下。',
  }),
  technique({
    id: 'needle', name: '穿波针', icon: '→', family: 'breath', kind: 'projectile',
    element: 'neutral', attribute: 'breath', power: .73, cooldown: .78, range: 15,
    pierce: 3,
    desc: '吐息如细针，贯穿排成一线的敌人。',
  }),
  technique({
    id: 'mist', name: '碧雾散珠', icon: '⋮', family: 'breath', kind: 'projectile',
    element: 'poison', attribute: 'breath', power: .43, cooldown: 1.16, range: 11.6,
    projectiles: 3,
    desc: '扇面吐出三颗毒珠，散开照顾更宽的水域。',
  }),
  technique({
    id: 'breach', name: '赤锋长息', icon: '炎', family: 'breath', kind: 'projectile',
    element: 'fire', attribute: 'breath', power: 1.30, cooldown: 1.34, range: 13.5,
    pierce: 2, minStage: 1, unlock: 'red-breath',
    desc: '长而重的火息，适合沿敌群边缘打入。',
  }),
  technique({
    id: 'drop', name: '伏水惊珠', icon: '水', family: 'element', kind: 'pulse',
    element: 'water', attribute: 'water', power: .78, cooldown: 1.17, range: 6.1, radius: 4.3,
    desc: '掀起近水，漫过蟹甲，使周围敌人潮湿。',
  }),
  technique({
    id: 'torrent', name: '引雨汀阵', icon: '雨', family: 'element', kind: 'zone',
    element: 'water', attribute: 'water', field: 'rain', power: .56, cooldown: 2.72,
    range: 9.7, radius: 3.2, life: 2.7,
    desc: '在敌群处落雨，给雷链和水火相变留出条件。',
  }),
  technique({
    id: 'bankweir', name: '扣潮堰', icon: '堰', family: 'element', kind: 'weir',
    element: 'water', attribute: 'water', power: .88, cooldown: 4.15,
    range: 11.8, radius: 2.35, life: 2.45, delay: .34, flowLength: 8.4, minStage: 1,
    desc: '在敌人前路布下水堰。敌人穿过，或风雨碰到堰口，就泄出一道推敌的水流，沿路留湿。',
  }),
  technique({
    id: 'spark', name: '折雷', icon: '雷', family: 'element', kind: 'arc',
    element: 'thunder', attribute: 'thunder', power: 1.07, cooldown: 1.87, range: 10.1,
    chain: 3,
    desc: '雷沿几名近敌跳跃，遇湿更容易传开。',
  }),
  technique({
    id: 'ember', name: '回火', icon: '火', family: 'element', kind: 'zone',
    element: 'fire', attribute: 'fire', field: 'fire', power: .86, cooldown: 2.48,
    range: 9.2, radius: 2.6, life: 2.45,
    desc: '短时留一团炎场，遇水可生云汽。',
  }),
  technique({
    id: 'thundercloud', name: '雷云抱珠', icon: '雲', family: 'element', kind: 'zone',
    element: 'thunder', attribute: 'thunder', field: 'thunder', power: .91, cooldown: 3.42,
    range: 11.8, radius: 3.4, life: 3.1, energy: 8, minStage: 2, unlock: 'stored-thunder',
    desc: '以蓄电雷云覆盖一片水域，云中电量有限。',
  }),
  technique({
    id: 'venom', name: '青蘅毒沼', icon: '毒', family: 'element', kind: 'zone',
    element: 'poison', attribute: 'water', field: 'poison', power: .68, cooldown: 2.26,
    range: 8.1, radius: 2.65, life: 2.2,
    desc: '释放可被风眼带走的毒雾，擅长持续蚀伤。',
  }),
  technique({
    id: 'sporeseed', name: '寄瘴种', icon: '瘴', family: 'element', kind: 'spore',
    element: 'poison', attribute: 'water', power: .74, cooldown: 3.42,
    range: 11.1, radius: 2.7, life: 2.55, delay: .96, hosts: 1, minStage: 1,
    desc: '种子搭着游动的敌人穿阵，一息后或宿主倒下时，在它所在处散成毒瘴。玄品可寄给另一队。',
  }),
  technique({
    id: 'hoarfrost', name: '折霜', icon: '霜', family: 'element', kind: 'frostLine',
    element: 'water', attribute: 'water', power: .64, cooldown: 2.35, range: 10.8,
    chain: 3, radius: 3.8, life: .72, minStage: 1,
    desc: '先找湿敌，逐个折向附近湿敌并冻住。干敌只受首击，火敌化出蒸汽。',
  }),
  technique({
    id: 'icekeel', name: '冰浮棱', icon: '棱', family: 'element', kind: 'prism',
    element: 'water', attribute: 'thunder', power: .79, cooldown: 4.18, range: 11.2,
    radius: 1.12, life: 2.55, refractionRange: 9.4, minStage: 1,
    desc: '以湿敌为锚立起冰棱，下一道真正穿过冰棱的雷，会折向侧面或高处的另一名敌人。',
  }),
  technique({
    id: 'stonecrest', name: '起砾', icon: '石', family: 'body', kind: 'fault',
    element: 'physical', attribute: 'physical', power: 1.14, cooldown: 3.18, range: 11.4,
    radius: 2.8, height: 4.8, columns: 1, delay: .58, minStage: 1,
    desc: '预瞄一簇敌人经过的地方，稍后从水底或地表立起石刺。',
  }),
  technique({
    id: 'emberwings', name: '回环双烬', icon: '烬', family: 'element', kind: 'wisps',
    element: 'fire', attribute: 'fire', power: .68, cooldown: 3.10, range: 11.6,
    radius: 1.65, burst: 2, delay: .44, minStage: 2,
    desc: '两只火灵先环绕龙身，再分别追向两侧敌群，遇湿升起蒸汽。',
  }),
]);

export const TECHNIQUE_BY_ID = Object.freeze(Object.fromEntries(TECHNIQUES.map(def => [def.id, def])));
export const TIER_NAMES = Object.freeze(['凡品', '灵品', '玄品', '天品']);
export const STARTERS = Object.freeze(['bubble', 'fang', 'drop']);

export const FAMILIES = Object.freeze([
  {
    id: 'body', name: '肉身', icon: '身', desc: '近战越多，护身和破甲越强。',
    thresholds: [
      {at: 2, effects: {physical: .12, guard: -.07}, desc: '肉身 +12% · 受伤 −7%'},
      {at: 4, effects: {guard: -.06, mass: .14}, desc: '受伤再 −6% · 躯体容量 +14%'},
      {at: 6, effects: {physical: .22, speed: -.055, magnet: -.035}, desc: '肉身再 +22% · 游速 −5.5% · 吸附范围 −3.5%'},
    ],
  },
  {
    id: 'breath', name: '吐息', icon: '息', desc: '成排吐息更远更快，过度专精会牺牲躯体容量。',
    thresholds: [
      {at: 2, effects: {breath: .13, range: .08}, desc: '吐息 +13% · 射程 +8%'},
      {at: 4, effects: {cooldown: -.11}, desc: '招式间隔 −11%'},
      {at: 6, effects: {breath: .15, projectiles: 1, mass: -.11}, desc: '吐息再 +15% · 每息多一枚 · 容量 −11%'},
    ],
  },
  {
    id: 'element', name: '水雷火', icon: '行', desc: '叠起元素相变，积聚云炁，减少纯粹躯体成长。',
    thresholds: [
      {at: 2, effects: {water: .08, thunder: .08, fire: .08}, desc: '水、雷、火各 +8%'},
      {at: 4, effects: {cooldown: -.09, qi: .14}, desc: '招式间隔 −9% · 云炁恢复 +14%'},
      {at: 6, effects: {water: .12, thunder: .16, fire: .16, area: .14, growth: -.10}, desc: '水再 +12% · 雷火再 +16% · 场域 +14% · 长躯 −10%'},
    ],
  },
]);

export const DEFAULT_MODIFIERS = Object.freeze({
  damage: 1, cooldown: 1, speed: 1, mass: 1, magnet: 1, range: 1,
  growth: 1, qi: 1, guard: 1, physical: 1, breath: 1,
  water: 1, thunder: 1, fire: 1, regen: 0, area: 1, projectiles: 0, chain: 0,
});

const TIER_POWER = [1, 1.38, 1.98, 2.76];
const TIER_SPEED = [1, .92, .82, .72];
const TIER_RANGE = [1, 1.11, 1.26, 1.44];
const TIER_RADIUS = [1, 1.24, 1.55, 1.90];
const TIER_LIFE = [1, 1.15, 1.32, 1.52];

export function getWeapon(id) {
  return Object.hasOwn(TECHNIQUE_BY_ID,id) ? TECHNIQUE_BY_ID[id] : null;
}

const temper = (id, name, desc, effects) =>
  Object.freeze({id, name, desc, effects: Object.freeze(effects)});

const TEMPERING_FORMS = Object.freeze({
  melee: Object.freeze([
    temper('close-strike', '沉锋', '威力 +32%，射程 −15%，间隔 +12%；从侧后击中会短暂破甲', {power: 1.32, range: .85, cooldown: 1.12, sideBreak:true}),
    temper('long-strike', '探锋', '射程 +28%，威力 −14%', {range: 1.28, power: .86}),
  ]),
  pulse: Object.freeze([
    temper('heavy-pulse', '沉劲', '威力 +30%，范围 −16%，间隔 +10%', {power: 1.30, radius: .84, cooldown: 1.10}),
    temper('wide-pulse', '散劲', '范围 +25%，威力 −17%', {radius: 1.25, power: .83, wetSweep:true}),
  ]),
  projectile: Object.freeze([
    temper('piercing-shot', '贯锋', '贯穿 +1，威力 +15%，间隔 +18%', {pierce: 1, power: 1.15, cooldown: 1.18}),
    temper('split-shot', '分流', '每发多一枚，单枚威力 −22%，间隔 +14%', {projectiles: 1, power: .78, cooldown: 1.14}),
  ]),
  arc: Object.freeze([
    temper('linked-arc', '导流', '多传一处，湿敌可分出一道半威力支雷，威力 −15%', {chain: 1, power: .85, wetBranch: true}),
    temper('heavy-arc', '重雷', '威力 +31%，间隔 +20%', {power: 1.31, cooldown: 1.20}),
  ]),
  zone: Object.freeze([
    temper('lasting-field', '留阵', '持续 +48%，间隔 +22%', {life: 1.48, cooldown: 1.22, energy: 1.25}),
    temper('wide-field', '展阵', '范围 +25%，持续 −20%', {radius: 1.25, life: .80}),
  ]),
  frostLine: Object.freeze([
    temper('long-frost', '漫霜', '可多传两处，霜线更宽，单次伤害降低。', {chain: 2, radius: 1.19, power: .79}),
    temper('hard-frost', '凝魄', '冻结时间更长，霜线更短。', {life: 1.55, radius: .85}),
  ]),
  fault: Object.freeze([
    temper('early-fault', '先崩', '石刺提早出地，单根范围缩小。', {delay: .63, radius: .81}),
    temper('split-fault', '交脉', '多开一处石脉，每处石刺威力降低。', {columns: 1, power: .76}),
  ]),
  wisps: Object.freeze([
    temper('swift-wisps', '烈返', '火灵更快飞出，单次溅射范围缩小。', {delay: .63, radius: .76}),
    temper('wide-wisps', '流萤', '火灵分得更开并留下更宽火圈，每朵威力降低。', {radius: 1.31, orbit: 1.32, power: .79}),
  ]),
  spore: Object.freeze([
    temper('quick-spore', '早发', '提前散开，毒瘴更宽，持续时间缩短。', {delay: .65, radius: 1.20, life: .80}),
    temper('riding-spore', '借游', '让宿主多带一段，落下的毒瘴也留得更久。', {delay: 1.49, life: 1.38}),
  ]),
  weir: Object.freeze([
    temper('long-weir', '分河', '把水束收窄，泄向更远处。', {radius:.73, flowLength:1.46}),
    temper('wide-weir', '铺滩', '水堰和泄流都铺宽，水流走得更短。', {radius:1.36, flowLength:.78}),
  ]),
  kiteDraft: Object.freeze([
    temper('high-kite', '凌岫', '可把云瘴送得更远、更高，落点范围收窄。', {gustRange:1.34, climb:1.56, radius:.82}),
    temper('wide-kite', '满罅', '落点范围变宽，能搬的距离缩短。', {gustRange:.82, radius:1.33}),
  ]),
  prism: Object.freeze([
    temper('tall-prism', '挑天', '可把雷折到更高、更远处，冰棱较快消融。', {refractionRange:1.27, rise:1.41, life:.81}),
    temper('bank-prism', '守汀', '冰棱维持更久，折射集中到近一些的侧翼。', {refractionRange:.85, life:1.42}),
  ]),
});

const NO_TEMPERING_FORMS = Object.freeze([]);
const COIL_TEMPERING_FORMS = Object.freeze([
  ...TEMPERING_FORMS.zone,
  temper('tail-vortex', '牵汐', '在尾段布下风眼，把近敌卷进摆尾范围。感应较短。',
    {range: .69, tailVortex: true}),
]);

export function temperingForms(id) {
  if (id === 'coil') return COIL_TEMPERING_FORMS;
  return TEMPERING_FORMS[getWeapon(id)?.kind] ?? NO_TEMPERING_FORMS;
}

export function getTemper(weapon) {
  if (!(weapon?.tier >= 2) || !weapon.temper) return undefined;
  return temperingForms(weapon.id).find(form => form.id === weapon.temper);
}

export function techniqueStats(weapon, mods = DEFAULT_MODIFIERS) {
  const def = getWeapon(weapon?.id);
  if (!def) return null;
  const tier = Math.max(1, Math.min(4, Math.floor(weapon.tier) || 1));
  const level = tier - 1;
  const primary = mods[def.attribute] ?? 1;
  const secondary = def.attribute === def.element ? 1 : Math.sqrt(mods[def.element] ?? 1);
  const form = getTemper(weapon)?.effects;
  const range = def.range * TIER_RANGE[level] * (mods.range ?? 1) * (form?.range ?? 1);
  const radius = def.radius * TIER_RADIUS[level] * mods.area * (form?.radius ?? 1);
  const extraShots = def.kind === 'projectile' && ['bubble', 'mist', 'breach'].includes(def.id) ? level : 0;
  const extraPierce = def.kind === 'projectile' ? (def.id === 'needle' ? level * 2 : Math.floor(level / 2)) : 0;
  return {
    id: def.id, name: def.name, family: def.family, kind: def.kind, element: def.element,
    field: def.field, tier,
    power: def.power * TIER_POWER[level] * primary * secondary * (form?.power ?? 1),
    cooldown: def.cooldown * TIER_SPEED[level] * (mods.cooldown ?? 1) * (form?.cooldown ?? 1),
    range: form?.tailVortex ? Math.min(range,radius+1.4) : range,
    radius,
    life: def.life * TIER_LIFE[level] * (form?.life ?? 1),
    pierce: def.pierce + extraPierce + (form?.pierce ?? 0),
    projectiles: def.projectiles + extraShots + (def.kind === 'projectile' ? mods.projectiles : 0) + (form?.projectiles ?? 0),
    chain: def.chain + (def.kind === 'arc' ? level * 2 + mods.chain : def.kind === 'frostLine' ? level + mods.chain : 0)
      + (form?.chain ?? 0),
    jumpReach: def.kind === 'arc' ? TIER_RANGE[level] : 1,
    wetBranch: form?.wetBranch ?? false,
    sideBreak: form?.sideBreak ?? false,
    wetSweep: def.id==='drop'&&Boolean(form?.wetSweep),
    tailVortex: Boolean(form?.tailVortex),
    energy: def.energy ? Math.min(12, def.energy * (1 + .12 * level) * (form?.energy ?? 1)) : undefined,
    ...(def.kind === 'fault' ? {columns: def.columns + Math.floor(level / 2) + (form?.columns ?? 0),
      height: def.height + level * .85, delay: def.delay * (form?.delay ?? 1)} : {}),
    ...(def.kind === 'wisps' ? {burst: def.burst + Math.floor(level / 2), orbit: (1.75 + level * .36) * (form?.orbit ?? 1),
      delay: def.delay * (form?.delay ?? 1)} : {}),
    ...(def.kind === 'spore' ? {hosts: def.hosts + Math.floor(level / 2), delay: def.delay * (form?.delay ?? 1)} : {}),
    ...(def.kind === 'weir' ? {gates:1 + Math.floor(level / 2), delay:def.delay,
      flowLength:def.flowLength * TIER_RANGE[level] * (form?.flowLength ?? 1)} : {}),
    ...(def.kind === 'kiteDraft' ? {gustRange:def.gustRange*TIER_RANGE[level]*(form?.gustRange??1),
      climb:(4.3+level*.60)*(form?.climb??1)} : {}),
    ...(def.kind === 'prism' ? {prisms:1+Math.floor(level/2),
      refractionRange:def.refractionRange*TIER_RANGE[level]*(form?.refractionRange??1),
      rise:(3.4+level*.55)*(form?.rise??1)} : {}),
  };
}
