const technique = definition => Object.freeze({
  range: 8, radius: 0, life: 0, pierce: 1, projectiles: 1, chain: 1,
  minStage: 0, ...definition,
});

export const TECHNIQUES = Object.freeze([
  technique({
    id: 'bubble', name: '含珠吐息', icon: '○', family: 'breath', kind: 'projectile',
    element: 'water', attribute: 'breath', power: .81, cooldown: .62, range: 11, cost: 5,
    desc: '吐出一枚水珠，潮湿最近的敌人。',
  }),
  technique({
    id: 'fang', name: '破鳞爪', icon: '爪', family: 'body', kind: 'melee',
    element: 'physical', attribute: 'physical', power: 1.36, cooldown: .77, range: 4.0, cost: 6,
    desc: '近身扑撕，短程但力重。',
  }),
  technique({
    id: 'tail', name: '摆尾开汀', icon: '↻', family: 'body', kind: 'pulse',
    element: 'physical', attribute: 'physical', power: 1.06, cooldown: 1.28, range: 4.6, radius: 4.2, cost: 7,
    desc: '以尾扫过近处一圈，潮湿的杂兵会被推得更远。',
  }),
  technique({
    id: 'coil', name: '蟠身引涡', icon: '◎', family: 'body', kind: 'zone',
    element: 'physical', attribute: 'physical', field: 'storm', power: .61, cooldown: 2.8, range: 7,
    radius: 3.1, life: 2.4, cost: 9,
    desc: '借身势起一处风眼，聚拢近敌并搬动元素。',
  }),
  technique({
    id: 'needle', name: '穿波针', icon: '→', family: 'breath', kind: 'projectile',
    element: 'neutral', attribute: 'breath', power: .73, cooldown: .78, range: 15,
    pierce: 3, cost: 6,
    desc: '吐息如细针，贯穿排成一线的敌人。',
  }),
  technique({
    id: 'mist', name: '碧雾散珠', icon: '⋮', family: 'breath', kind: 'projectile',
    element: 'poison', attribute: 'breath', power: .43, cooldown: 1.16, range: 11.6,
    projectiles: 3, cost: 8,
    desc: '扇面吐出三颗毒珠，散开照顾更宽的水域。',
  }),
  technique({
    id: 'breach', name: '赤锋长息', icon: '炎', family: 'breath', kind: 'projectile',
    element: 'fire', attribute: 'breath', power: 1.30, cooldown: 1.34, range: 13.5,
    pierce: 2, cost: 10, minStage: 1, unlock: 'red-breath',
    desc: '长而重的火息，适合沿敌群边缘打入。',
  }),
  technique({
    id: 'drop', name: '伏水惊珠', icon: '水', family: 'element', kind: 'pulse',
    element: 'water', attribute: 'water', power: .78, cooldown: 1.17, range: 6.1, radius: 4.3, cost: 6,
    desc: '掀起近水，漫过蟹甲，使周围敌人潮湿。',
  }),
  technique({
    id: 'torrent', name: '引雨汀阵', icon: '雨', family: 'element', kind: 'zone',
    element: 'water', attribute: 'water', field: 'rain', power: .56, cooldown: 2.72,
    range: 9.7, radius: 3.2, life: 2.7, cost: 8,
    desc: '在敌群处落雨，给雷链和水火相变留出条件。',
  }),
  technique({
    id: 'spark', name: '折雷', icon: '雷', family: 'element', kind: 'arc',
    element: 'thunder', attribute: 'thunder', power: 1.07, cooldown: 1.87, range: 10.1,
    chain: 3, cost: 8,
    desc: '雷沿几名近敌跳跃，遇湿更容易传开。',
  }),
  technique({
    id: 'ember', name: '回火', icon: '火', family: 'element', kind: 'zone',
    element: 'fire', attribute: 'fire', field: 'fire', power: .86, cooldown: 2.48,
    range: 9.2, radius: 2.6, life: 2.45, cost: 9,
    desc: '短时留一团炎场，遇水可生云汽。',
  }),
  technique({
    id: 'thundercloud', name: '雷云抱珠', icon: '雲', family: 'element', kind: 'zone',
    element: 'thunder', attribute: 'thunder', field: 'thunder', power: .91, cooldown: 3.42,
    range: 11.8, radius: 3.4, life: 3.1, energy: 8, cost: 11, minStage: 2, unlock: 'stored-thunder',
    desc: '以蓄电雷云覆盖一片水域，云中电量有限。',
  }),
  technique({
    id: 'venom', name: '青蘅毒沼', icon: '毒', family: 'element', kind: 'zone',
    element: 'poison', attribute: 'water', field: 'poison', power: .68, cooldown: 2.26,
    range: 8.1, radius: 2.65, life: 2.2, cost: 8,
    desc: '释放可被风眼带走的毒雾，擅长持续蚀伤。',
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
      {at: 6, effects: {physical: .22, speed: -.055, magnet: -.035}, desc: '肉身再 +22% · 游速 −5.5% · 吸食 −3.5%'},
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

const talent = (id, name, icon, family, desc, effects) =>
  Object.freeze({id, name, icon, family, desc, effects: Object.freeze(effects), maxStacks: 3});

export const TALENTS = Object.freeze([
  talent('heavy-scales','厚鳞沉躯','鳞','body','躯体容量 +16%，受伤 −10%，游速 −7%',{mass:.16,guard:-.10,speed:-.07}),
  talent('iron-fang','铁骨破甲','牙','body','肉身 +21%，射程 −11%',{physical:.21,range:-.11}),
  talent('tide-tail','强尾藏炁','尾','body','肉身 +17%，云炁恢复 +16%，吸食 −11%',{physical:.17,qi:.16,magnet:-.11}),
  talent('swim-fin','轻鳍游风','风','body','游速 +14%，受伤 +9%',{speed:.14,guard:.09}),
  talent('long-breath','百步长息','息','breath','射程 +18%，吐息 +13%，躯体容量 −8%',{range:.18,breath:.13,mass:-.08}),
  talent('quick-breath','急息连珠','珠','breath','招式间隔 −11%，吐息 +9%，通用伤害 −7%',{cooldown:-.11,breath:.09,damage:-.07}),
  talent('split-meridian','分络成岔','分','breath','每息多一枚，单枚吐息 −18%，受伤 +7%',{projectiles:1,breath:-.18,guard:.07}),
  talent('deeper-magnet','鲸纳百川','◎','breath','吸食 +23%，游速 −6%',{magnet:.23,speed:-.06}),
  talent('water-sac','藏潮之囊','水','element','水 +23%，火 −12%',{water:.23,fire:-.12}),
  talent('thunder-scale','带雷之鳞','雷','element','雷 +25%，水 −9%，躯体容量 −7%',{thunder:.25,water:-.09,mass:-.07}),
  talent('fire-core','燃髓之心','炎','element','火 +27%，受伤 +10%',{fire:.27,guard:.10}),
  talent('walking-rain','游水行雨','雨','element','水 +18%，云炁恢复 +16%，肉身 −10%',{water:.18,qi:.16,physical:-.10}),
  talent('soft-moult','软鳞蜕生','长','body','长躯 +17%，受伤 +10%',{growth:.17,guard:.10}),
  talent('returning-blood','春流返息','生','body','每秒回复 1.8 生命，结算灵材 −10%',{regen:1.8,harvest:-.10}),
  talent('harvest','拾遗取材','材','general','结算灵材 +24%，通用伤害 −9%',{harvest:.24,damage:-.09}),
  talent('threefold-current','三行并流','行','element','水 +13%，雷 +15%，火 +13%，招式间隔 +10%',{water:.13,thunder:.15,fire:.13,cooldown:.10}),
  talent('broad-water','广泽回汐','汐','element','场域 +24%，游速 −8%',{area:.24,speed:-.08}),
  talent('conductive-vapor','云路引雷','電','element','雷法多传一处，招式间隔 +9%',{chain:1,cooldown:.09}),
]);

export const TALENT_BY_ID = Object.freeze(Object.fromEntries(TALENTS.map(def => [def.id, def])));

export const DEFAULT_MODIFIERS = Object.freeze({
  damage: 1, cooldown: 1, speed: 1, mass: 1, magnet: 1, range: 1,
  growth: 1, qi: 1, harvest: 1, guard: 1, physical: 1, breath: 1,
  water: 1, thunder: 1, fire: 1, regen: 0, area: 1, projectiles: 0, chain: 0,
});

const TIER_POWER = [1, 1.33, 1.79, 2.43];
const TIER_SPEED = [1, .94, .87, .80];

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
  const range = def.range * (1 + .044 * level) * (mods.range ?? 1) * (form?.range ?? 1);
  const radius = def.radius * (1 + .07 * level) * mods.area * (form?.radius ?? 1);
  return {
    id: def.id, name: def.name, family: def.family, kind: def.kind, element: def.element,
    field: def.field, tier,
    power: def.power * TIER_POWER[level] * primary * secondary * (form?.power ?? 1),
    cooldown: def.cooldown * TIER_SPEED[level] * (mods.cooldown ?? 1) * (form?.cooldown ?? 1),
    range: form?.tailVortex ? Math.min(range,radius+1.4) : range,
    radius,
    life: def.life * (1 + .09 * level) * (form?.life ?? 1),
    pierce: def.pierce + (def.kind === 'projectile' ? Math.floor(level / 2) : 0) + (form?.pierce ?? 0),
    projectiles: def.projectiles + (def.kind === 'projectile' ? mods.projectiles + Number(tier===4 && def.id==='mist') : 0) + (form?.projectiles ?? 0),
    chain: def.chain + (def.kind === 'arc' ? Math.floor(level / 2) + mods.chain : 0) + (form?.chain ?? 0),
    wetBranch: form?.wetBranch ?? false,
    sideBreak: form?.sideBreak ?? false,
    wetSweep: def.id==='drop'&&Boolean(form?.wetSweep),
    tailVortex: Boolean(form?.tailVortex),
    energy: def.energy ? Math.min(12, def.energy * (1 + .12 * level) * (form?.energy ?? 1)) : undefined,
  };
}
