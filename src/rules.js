export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function random(seed = 1) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const STAGES = [
  { name: '小蛇', en: 'A LITTLE BEGINNING', realm: '苇汀初醒', skill: '泡泡吐息', need: 48, color: '#536b58', subtitle: '小小一尾，也有乘风的梦。', boss: '巨钳蟹王', bossHp: 260 },
  { name: '蟒', en: 'THE EMERALD AWAKENS', realm: '烟波大湖', skill: '碧毒吐息', need: 115, color: '#4d7568', subtitle: '鳞片渐深，水流为你让路。', boss: '幽灯水母', bossHp: 850 },
  { name: '蛟龙', en: 'KEEPER OF THE TIDES', realm: '沧溟行雨', skill: '唤潮旋风', need: 225, color: '#526f78', subtitle: '四足踏浪，风雨自此有了名字。', boss: '玄甲龙龟', bossHp: 2100 },
  { name: '虬龙', en: 'THUNDER IN THE DEEP', realm: '青绿千山', skill: '九霄雷劫', need: 1800, color: '#586f70', subtitle: '双角初生，雷光照亮归途。', boss: '噬星古鲲', bossHp: 4200 },
  { name: '应龙', en: 'FINALLY, THE SKY', realm: '九重天阙', skill: '万象归一', need: 0, color: '#9c7655', subtitle: '你曾是一尾小蛇。现在，整片天空都是你的海。' },
];
// The sea permits short leaps; sustained altitude belongs to the mountain chapter.
export const flightBand = stage => stage===2?[.7,4.2]:stage>=3?[3.5,20]:[.7,.7];
export const waveDuration = (stage,wave) => wave===1 ? 8.5 : 16+stage*4;
export const FOOD = [
  { name: '小银鱼', color: '#f2f7d9', xp: 1 },
  { name: '青虾', color: '#a5ed88', xp: 3 },
  { name: '灵鲤', color: '#7cdaff', xp: 8 },
  { name: '云鳞灵质', color: '#d8a3ff', xp: 19 },
  { name: '金色龙髓', color: '#ffdb75', xp: 42 },
];
export const UPGRADES = [
  { id: 'power', icon: '✦', name: '锋芒初露', tag: '吐息强化', desc: '基础攻击伤害 +22%', color: 'mint' },
  { id: 'haste', icon: '»', name: '连珠吐息', tag: '攻击速度', desc: '自动吐息间隔缩短 14%', color: 'blue' },
  { id: 'magnet', icon: '◎', name: '鲸吞万物', tag: '吞食范围', desc: '基础吸食范围 +26%，食物更快靠近', color: 'gold' },
  { id: 'vitality', icon: '♡', name: '温润鳞甲', tag: '生存成长', desc: '生长容量 +3 节，补充最多 5 节龙躯', color: 'mint' },
  { id: 'multi', icon: '⋮', name: '分流吐息', tag: '更多弹道', desc: '每次吐息额外发射一枚弹丸', color: 'blue' },
  { id: 'lightning', icon: 'ϟ', name: '电闪雷鸣', tag: '元素 · 雷', desc: '周期落雷，连锁打击附近敌人', color: 'purple' },
  { id: 'fire', icon: '♨', name: '炎舞漩涡', tag: '元素 · 火', desc: '召唤游走的火焰旋涡，灼烧群敌', color: 'gold' },
  { id: 'storm', icon: '≋', name: '呼风唤雨', tag: '元素 · 风', desc: '旋风聚拢敌群，携带火焰、毒雾和水汽', color: 'blue' },
  { id: 'regen', icon: '✚', name: '春水回生', tag: '生命恢复', desc: '持续恢复龙躯灵质，可修复受伤损失的长度', color: 'mint' },
  { id: 'coil', icon: '↻', name: '盘龙心法', tag: '姿态 · 聚阵', desc: '成阵更快，旋风和收阵爆发增强 20%', color: 'blue' },
  { id: 'growth', icon: '∞', name: '生生不息', tag: '龙躯 · 生长', desc: '吞食长躯 +20%，断尾灵质回收增加', color: 'mint' },
  { id: 'rain', icon: '☷', name: '行云布雨', tag: '环境 · 潮湿', desc: '旋风携带雨幕，潮湿敌群与火焰形成云汽', color: 'blue' },
  { id: 'poison', icon: '❋', name: '万毒归流', tag: '环境 · 毒蚀', desc: '毒囊强化；旋风聚拢敌群并传播毒雾', color: 'purple' },
];
export const META = [
  { id: 'heart', icon: '♡', name: '不屈之鳞', desc: '每级 +12 初始生命', base: 8 },
  { id: 'fang', icon: '✦', name: '灵息之种', desc: '每级 +8% 初始伤害', base: 10 },
  { id: 'tide', icon: '◎', name: '引潮之心', desc: '每级 +12% 吞食范围', base: 8 },
  { id: 'coil', icon: '↻', name: '盘龙血脉', desc: '首级解锁收阵回响；继续提升蓄势与强度', base: 12 },
  { id: 'conduit', icon: 'ϟ', name: '雷鳞回路', desc: '首级解锁导电残云；增加导电范围与能量', base: 14 },
  { id: 'alchemy', icon: '☷', name: '云炁相变', desc: '首级解锁云汽回生；延长元素环境持续时间', base: 12 },
];
export const freshSave = () => ({ version: 2, jade: 0, bestStage: 0, runs: 0, victories: 0, meta: Object.fromEntries(META.map(m=>[m.id,0])), sound: true });
export function validateSave(raw) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of ['jade', 'bestStage', 'runs', 'victories']) s[k] = clamp(Math.floor(Number(raw[k]) || 0), 0, k === 'bestStage' ? 4 : 1000000);
  for (const {id:k} of META) s.meta[k] = clamp(Math.floor(Number(raw.meta?.[k]) || 0), 0, 10);
  s.sound = raw.sound !== false;
  return s;
}
export const metaCost = (item, level) => Math.ceil(item.base * (1 + level * .75));


