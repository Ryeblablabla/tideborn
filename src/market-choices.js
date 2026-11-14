import { SLOT_COUNT } from './cultivation.js';
import { TIER_NAMES, getTemper, temperingForms, techniqueStats } from './cultivation-data.js';
import { DRAGON_ARTS, DRAGON_ART_DOCTRINES, dragonArtActivation, dragonArtPreparation, practicedDragonArtPair } from './dragon-art-data.js';

export const CASCADE_CARDS = Object.freeze({
  wind: {name:'卷墨天风', tone:'body', primary:['coil','tail','fang','stonecrest','windkite'], complement:['torrent','venom'],
    desc:'体术或风攻破敌后起风眼，卷聚四周，再横扫前方。', growth:'风眼吸得更远，横扫卷过更多敌人。'},
  fire: {name:'万点飞焰', tone:'element', primary:['ember','breach','emberwings'], complement:['coil','mist'],
    desc:'火攻破敌或击倒燃敌时，火焰从死敌处蔓延。', growth:'火团炸得更宽，火势可传过更多敌人。',
    mastery:'火势可从刚倒下的敌人处跃向隔开的另一队。'},
  thunder: {name:'潮雷走电', tone:'element', primary:['spark','thundercloud'], complement:['bubble','drop','torrent','bankweir'],
    desc:'雷击破敌或击倒湿敌后引雷，沿湿敌分叉传向远处。', growth:'雷链每次跳得更远，可以分出更多支雷。'},
  water: {name:'横江叠浪', tone:'breath', primary:['drop','bubble','torrent','hoarfrost','bankweir'], complement:['tail','needle'],
    desc:'水击或击倒湿敌后掀起连排潮头，沿着破口一层层往前推。', growth:'潮头变宽、推进更远，能推过成排鱼群。'},
  poison: {name:'迭瘴生烟', tone:'body', primary:['venom','mist','sporeseed'], complement:['coil','torrent'],
    desc:'毒法击杀或染毒者倒下后，毒瘴向相邻敌群扩散。', growth:'毒瘴铺得更广，叠合后能扩散到更多敌人。',
    mastery:'毒瘴可从两个击杀点跨过高低落差，分别侵染远队。'},
});

export const CASCADE_DOCTRINES = Object.freeze({
  wind: Object.freeze({
    gyre: Object.freeze({name:'回岫', description:'风眼留在原处，将近敌卷到一起，收紧后向四周爆开。'}),
    gale: Object.freeze({name:'行空', description:'风眼朝远处的敌群推进，沿路卷起敌人。若前方还有一队，横扫可继续追过去。'}),
  }),
  fire: Object.freeze({
    cinder: Object.freeze({name:'接炬', description:'借刚倒下的燃敌传火，火线追到另一群活敌身前再爆开。'}),
    crown: Object.freeze({name:'燎阵', description:'聚起多处倒下的燃敌余火，从原阵向外一圈圈引爆。'}),
  }),
  water: Object.freeze({
    fan: Object.freeze({name:'分澜', description:'首道潮头撞上湿敌时，可向两翼分出短浪。'}),
    lane: Object.freeze({name:'赶潮', description:'潮头收窄，相继沿同一水路加速推进，能追到更远的敌人。'}),
  }),
  thunder: Object.freeze({
    rise: Object.freeze({name:'升霆', description:'潮雷借湿敌向更高一层分传，触及原本够不到的飞群。'}),
    fork: Object.freeze({name:'裂霆', description:'潮雷沿同一高度的湿敌向两侧分传，击中分开的侧翼。'}),
  }),
  poison: Object.freeze({
    host: Object.freeze({name:'寄瘴', description:'瘴团由染毒活敌带走，宿主倒下或靠近另一群敌人时爆开。'}),
    basin: Object.freeze({name:'合瘴', description:'两处毒敌倒下后，各起一股毒瘴，汇入另一群敌人时一同爆开。'}),
  }),
});

const MAX_CASCADE_RANK = 3;
const MAX_ART_RANK = 3;
const OPENING_PAIR = {bubble:'spark', fang:'tail', drop:'spark'};

const MAX_TIER = TIER_NAMES.length;
const HAND_SIZE = 3;
const LATE_CHOICES = ['doctrine', 'dragonArt', 'cascade', 'support', 'swap'];

const choiceDescriptions = {
  bubble: '吐出水珠，打湿近处敌人。',
  fang: '靠近时用爪重击敌人。',
  tail: '用尾巴横扫，推开身边的敌人。',
  coil: '卷起旋风，把散开的敌人聚到一起。',
  windkite: '风刃把部分火、毒瘴或水汽送往另一群敌人，原处场域也会更早散去。',
  needle: '吐出细针，穿过一整排敌人。',
  mist: '向前扇形吐出三颗毒珠，适合打分散的敌人。',
  breach: '吐出长火息，能穿过前排敌人。',
  drop: '掀水打湿一圈敌人，水浪能绕过蟹王正面的硬甲。',
  torrent: '在敌群中落雨，持续打湿整片区域。',
  spark: '一道雷在多个敌人之间跳跃。',
  ember: '留下一团火，持续灼烧敌人。',
  thundercloud: '放出雷云，持续电击附近敌人，直到电量耗尽。',
  venom: '留下毒雾，持续侵蚀敌群。',
  sporeseed: '将毒种寄在敌身上。毒种随敌移动，成熟或宿主倒下时化作毒雾。',
  bankweir: '在敌群前架起水堰，敌人经过或风雨触堰时，泄流打湿沿途敌群。',
  icekeel: '在湿敌身旁凝出冰棱。雷击经过冰棱时，可折向另一只敌人。',
};

const WATER_TECHNIQUES = ['bubble', 'drop', 'torrent', 'bankweir'];
const THUNDER_TECHNIQUES = ['spark', 'thundercloud'];
const FIRE_TECHNIQUES = ['ember', 'breach', 'emberwings'];
const FROST_FIRE_PAIRING = '沧溟起，火击破两块相邻的湿冰，蒸汽会涌向外侧敌群。';
const POISON_TECHNIQUES = ['venom', 'mist', 'sporeseed'];
const WET_FIELD_TECHNIQUES = ['torrent', 'bankweir'];
const POISON_FIELDS = ['venom', 'sporeseed'];
const GALE_SPORE_PAIRING = '行空卷动带种的活敌后，毒种在新位置爆开。瘴流可沿通路追向风锋没扫到的另一群。';
const GALE_SPORE_FORK_PAIRING = '行空带活敌爆种后，毒瘴先扫一翼。另一翼若有风锋未扫到的活敌及时靠近，余瘴可再分一路。';
const STEAMWAKE_PAIRING = '风眼卷入燃敌或火场后，墨眼蓄热，遇远处湿区会凝出蒸汽推向另一队。';
const KITE_RAIN_PAIRING = '折风鸢送出的蒸汽可在另一群敌人上方凝雨，雨幕落下时打湿并冲击敌群。';
const RIFT_NEEDLE_PAIRING = '穿波针击中主裂口附近的敌人时，横裁可沿针锋撕向侧翼，把敌人拖进裂缝。';
const FROST_PRISM_PAIRING = '霜镜的雷能借尚未放电的冰棱折向侧翼，优先找更高处。';
const SCORCH_STEAM_PAIRING = '引雨可改落在接得上火痕的敌人附近。雨或水浪碰到余火后，汽锋能沿千山缓坡打向高处。';
const SCORCH_CREST_PAIRING = '横江叠浪的潮头经过火痕时，能沿水浪方向化出蒸汽，扑向接近的敌群。';

const KITE_PAYOFFS = {
  ember: '鸢把部分火送往另一群，落到湿敌或雨场时化出蒸汽。',
  venom: '鸢把部分毒雾送往另一群，原处的毒雾更早散去。',
  sporeseed: '鸢接走毒种爆出的部分毒雾，送到另一群敌人附近。',
};

function kitePairing(cultivation, incoming, weapons) {
  const owns = id => weapons.some(weapon => weapon.id === id);
  const field = incoming === 'windkite' ? Object.keys(KITE_PAYOFFS).find(owns) : incoming;
  if (!KITE_PAYOFFS[field] || (incoming !== 'windkite' && !owns('windkite'))) return '';
  const ingredient = incoming === 'windkite' ? cultivation.getWeapon(field).name : '折风鸢';
  return `与${ingredient}同用，${KITE_PAYOFFS[field]}`;
}

function prioritizeKiteCatalyst(learns, cultivation, stage) {
  if (stage < 1 || stage >= 4 || cultivation.wave < 2) return;
  const weapons = cultivation.weapons;
  const offered = learns.filter(card => !card.copies && kitePairing(cultivation, card.id, weapons));

  // A poison cloud is materially different from a projectile that only marks
  // its target. Give a wind/poison build a path to an actual borrowable field.
  if (!offered.length && weapons.some(weapon => weapon.id === 'coil') && weapons.some(weapon => weapon.id === 'mist')) {
    const materials = cultivation.wave % 2 === 0 ? ['ember'] : ['venom', 'sporeseed'];
    const source = learns.find(card => !card.copies && materials.includes(card.id));
    if (source) offered.push(source);
  }
  if (!offered.length) return;

  // A mixed field route is an optional alternative to establishing another art.
  // Alternate the preferred material when both fire and a poison field fit.
  const preferFire = cultivation.wave % 2 === 0;
  const fire = offered.find(card => card.id === 'ember');
  const poison = offered.find(card => card.id !== 'ember');
  const catalyst = preferFire ? fire ?? poison : poison ?? fire;
  learns.splice(learns.indexOf(catalyst), 1);
  learns.unshift(catalyst);
  return catalyst;
}

function windMaterialChoices(cultivation, stage, learns, upgrades) {
  if (stage < 1 || stage >= 4 || cultivation.wave < 3) return [];
  const {weapons, dragonArt, cascade} = cultivation;
  const has = ids => weapons.some(weapon => ids.includes(weapon.id));
  const kite = weapons.find(weapon => weapon.id === 'windkite');
  const fire = cascade === 'fire' || has(FIRE_TECHNIQUES);
  const intake = has(['coil']) || cascade === 'wind';
  if (!fire || (!kite && !intake)) return [];
  if (!kite && dragonArt && dragonArt !== 'abyss') return [];
  const wet = has(WET_FIELD_TECHNIQUES);
  const learn = id => learns.find(card => card.id === id && !card.copies);
  const rain = !wet && learn('torrent');
  const courier = !kite && (wet || cascade === 'fire' || has(['ember'])) && learn('windkite');
  const deepenKite = kite?.tier === 1 && has(WATER_TECHNIQUES) && upgrades.find(card => card.uid === kite.uid);
  return [deepenKite, rain, courier].filter(Boolean);
}

function riftMaterialChoice(cultivation, stage, learns) {
  if (stage < 1 || stage >= 4 || cultivation.wave < 2) return null;
  const {weapons, dragonArt, dragonArtDoctrine} = cultivation;
  if (dragonArt && dragonArt !== 'rift' || dragonArtDoctrine === 'reach') return null;
  if (!weapons.some(weapon => weapon.id === 'fang')) return null;
  return learns.find(card => card.id === 'needle' && !card.copies) ?? null;
}

function beamMaterial(cultivation, id) {
  const {weapons, dragonArt, dragonArtRank, dragonArtDoctrine, cascade} = cultivation;
  if (dragonArt !== 'beam' || dragonArtRank < 1) return null;
  const has = ids => weapons.some(weapon => ids.includes(weapon.id));
  if(dragonArtDoctrine==='echo')return id==='coil'&&!has(['coil'])&&!(cascade==='thunder'&&!has(WATER_TECHNIQUES)) ? {
    id:'beam-crossflow',pairing:'风眼能改变敌人的来路。另一群斜穿过光路时，回锋会抢先扫向交会处。',
  } : null;
  const prepare = dragonArtRank < 3 ? '三阶选焚径后，' : '';
  if (id === 'torrent' && cascade !== 'water' && !has(['torrent'])) {
    return {id:'beam-steam', pairing:prepare + SCORCH_STEAM_PAIRING};
  }
  if (id === 'ember' && !has(FIRE_TECHNIQUES)) {
    return {id:'beam-fire', pairing:`回火为万点飞焰备火。${prepare}火痕烧倒敌人时，可引出已习得的飞焰。`};
  }
  return null;
}

function beamMaterialOrder(cultivation) {
  if(cultivation.dragonArtDoctrine==='echo')return ['coil'];
  return cultivation.dragonArtRank === 3 && cultivation.wave % 2 === 0 ? ['ember','torrent'] : ['torrent','ember'];
}

function beamMaterialChoices(cultivation, stage, learns) {
  if (stage < 2 || stage >= 4) return [];
  return beamMaterialOrder(cultivation).flatMap(id => {
    const card = learns.find(card => card.id === id && !card.copies);
    return card && beamMaterial(cultivation, id) ? [card] : [];
  });
}

function beamHasPreparedCrest(cultivation, stage) {
  if (stage < 2 || stage >= 4 || cultivation.cascade || cultivation.cascadeRank ||
      cultivation.dragonArt !== 'beam' || cultivation.dragonArtDoctrine !== 'reach') return false;
  const {core, supports} = cascadeParts(cultivation.weapons, CASCADE_CARDS.water);
  return Boolean(core && supports.length);
}

function prioritizeFrostRelay(learns, cultivation, stage) {
  if (stage < 1 || stage >= 4 || cultivation.wave < 3 || cultivation.dragonArt !== 'frost') return null;
  const weapons = cultivation.weapons;
  if (!frostHasLightning(cultivation, weapons)) return null;
  const hasRain = weapons.some(weapon => WET_FIELD_TECHNIQUES.includes(weapon.id));
  const prismReady = cultivation.dragonArtRank >= 2 && cultivation.dragonArtDoctrine !== 'reach' &&
    weapons.some(weapon=>WATER_TECHNIQUES.includes(weapon.id));
  const ids = hasRain || prismReady ? ['icekeel', ...WET_FIELD_TECHNIQUES] : WET_FIELD_TECHNIQUES;
  const relay = ids.map(id => learns.find(card => card.id === id && !card.copies)).find(Boolean);
  if (!relay) return null;
  learns.splice(learns.indexOf(relay), 1);
  learns.unshift(relay);
  return relay;
}

function frostHasLightning(cultivation, weapons) {
  return cultivation.cascade === 'thunder' || weapons.some(weapon => THUNDER_TECHNIQUES.includes(weapon.id));
}

function hasGaleDoctrine(cultivation) {
  return cultivation.cascade === 'wind' && cultivation.cascadeRank === MAX_CASCADE_RANK &&
    cultivation.cascadeDoctrine === 'gale';
}

function canChooseDragonArtDoctrine(cultivation, art, doctrine) {
  if (!Object.hasOwn(DRAGON_ART_DOCTRINES, doctrine) ||
      !Object.hasOwn(DRAGON_ART_DOCTRINES[doctrine].detail, art)) return false;
  return doctrine !== 'thaw' || cultivation.cascade === 'fire' ||
    cultivation.weapons.some(weapon => FIRE_TECHNIQUES.includes(weapon.id));
}

const techniquePairs = [
  [WATER_TECHNIQUES, THUNDER_TECHNIQUES, '浸湿敌群，雷击传得更远。'],
  [['coil'], ['venom'], '风眼卷起毒雾，聚怪时一路带毒。'],
  [['coil'], ['sporeseed'], '风眼遇到毒种留下的毒雾，会一边聚敌一边带毒。'],
  [['coil'], ['ember'], '风眼卷起火场，聚怪时持续灼烧。'],
  [WATER_TECHNIQUES, FIRE_TECHNIQUES, '火碰到湿敌，升起蒸汽。'],
  [WATER_TECHNIQUES, ['hoarfrost'], '折霜沿湿敌跳传并冻结。'],
  [WATER_TECHNIQUES, ['tail'], '被打湿的敌人会被尾扫推得更远。'],
];

const cascadePairs = {
  wind: {venom: '让风扫带毒。', torrent: '让风扫打湿敌群，湿敌也更容易被吸入风眼。'},
  fire: {mist: '让火团对染毒敌人打得更重。', coil: '让火团顺风向前蔓延。'},
  thunder: {bubble: '打湿敌群，让雷潮跳得更远。', drop: '打湿敌群，让雷潮跳得更远。', torrent: '在敌群里落雨，让雷潮跳得更远。',
    bankweir: '开堰打湿沿途敌群，让雷潮跳得更远。'},
  water: {tail: '让潮头横扫得更宽。', needle: '让后续潮头推进得更远。'},
  poison: {coil: '让毒瘴顺风向前蔓延。', torrent: '湿敌能把毒瘴继续传给附近敌人。'},
};

function weirPairing(cultivation) {
  if (cultivation.dragonArt === 'stone' && cultivation.dragonArtRank >= 2) {
    return '泄流碰到石壳，碎石可沿水路打向外侧。';
  }
  if (cultivation.cascade === 'thunder' || cultivation.weapons.some(weapon => THUNDER_TECHNIQUES.includes(weapon.id))) {
    return '泄流先打湿敌群，后续雷击沿湿敌传开。';
  }
  const driver = ['torrent', 'coil'].find(id => cultivation.weapons.some(weapon => weapon.id === id));
  return driver ? `${cultivation.getWeapon(driver).name}的风雨碰到堰口即可泄流。` : '';
}

function combinesWithCascade(art, route, weapons) {
  const wets = weapons.some(weapon => WATER_TECHNIQUES.includes(weapon.id));
  if (art === 'stone') return route === 'water' || route === 'wind';
  if (art === 'frost') return wets && (route === 'thunder' || route === 'fire');
  if (art === 'beam') return wets && route === 'thunder';
  if (art === 'abyss' || art === 'rift') {
    return route === 'wind' || (route === 'poison' && weapons.some(weapon => FIRE_TECHNIQUES.includes(weapon.id)));
  }
  return false;
}

export function dragonArtFoundation(cultivation, id) {
  const art = DRAGON_ARTS[id];
  const {weapons, cascade, cascadeRank} = cultivation;
  const sources = dragonArtPreparation(weapons, art);
  if (!sources) return null;
  if (sources.length === 2 && cascadeRank >= 2 && combinesWithCascade(id, cascade, weapons)) {
    return {sources, rank: 2, cascade};
  }
  const practiced = practicedDragonArtPair(weapons, art);
  if (practiced) return {sources: practiced.map(weapon => weapon.id), rank: 2, practiced};
  return {sources, rank: 1};
}

export function dragonArtPairing(cultivation, art, rank, cascade = cultivation.cascade, weapons = cultivation.weapons,
  doctrine = cultivation.dragonArtDoctrine) {
  const owned = ids => ids.find(id => weapons.some(weapon => weapon.id === id));
  const name = id => cultivation.getWeapon(id).name;
  const water = owned(WATER_TECHNIQUES);
  const thunder = owned(THUNDER_TECHNIQUES);
  const fire = owned(FIRE_TECHNIQUES);
  const poison = owned(POISON_TECHNIQUES);
  const cascadeName = CASCADE_CARDS[cascade]?.name;
  const prefix = rank < 2 ? '二阶起，' : '';
  if (art === 'stone') {
    const breaker = owned(['tail', 'stonecrest']);
    if (cascade === 'water' || cascade === 'wind') return `${prefix}${cascadeName}撞碎多座石像时，碎石可汇成一道向外的石潮。`;
    if (owned(['bankweir'])) return `${prefix}${name('bankweir')}的泄流撞碎多座石像时，碎石可沿水路汇成石潮。`;
    if (water && breaker) return `${prefix}${name(water)}先打湿敌人，${name(breaker)}同向打碎多座石像时可汇成石潮。`;
    return `${prefix}${breaker ? name(breaker) : '摆尾或起砾'}能提前打碎石像，碎石再伤近敌。`;
  }
  if (art === 'frost') {
    if (rank === 3 && doctrine === 'thaw') {
      const flame = cascade === 'fire' ? cascadeName : fire && name(fire);
      if(flame&&cascade==='thunder')return `${flame}供火。二阶潮雷可借湿敌受雷时的残汽，击向另一群。`;
      return flame ? `${flame}供火。汽浪沿能通行的路线追击冰面之外的活敌。` : '配一门火招或万点飞焰，可为开霁供火。';
    }
    const steam = flame => `${prefix}${flame}击中冻住的湿敌可提前碎冰。${FROST_FIRE_PAIRING}`;
    const shatter = lightning => {
      const payoff = rank === 3 && doctrine === 'reach' ? '引出的雷霜可分向高低两处湿敌，各自结冰再碎裂。'
        : rank === 3 && doctrine === 'echo' ? '雷霜可分向左右两队，沿各自的湿敌再传一跳。'
          : '雷霜沿近处的其他湿敌传开。';
      return `${prefix}${lightning}击中冻住的湿敌，${payoff}`;
    };
    if (cascade === 'fire') return steam(cascadeName);
    if (cascade === 'thunder') return shatter(cascadeName);
    if (fire) return steam(name(fire));
    if (thunder) return shatter(name(thunder));
    return water ? `${name(water)}先打湿敌群，霜镜能冻到更外圈。` : `${prefix}雷击打碎湿敌的冰壳，碎冰再伤近敌。`;
  }
  if (art === 'rift') {
    if (cascade === 'wind' && cultivation.cascadeDoctrine === 'gale') {
      const unlock = rank < 2 ? '裂空升二阶后，' : '';
      return `${unlock}沧溟起，行空卷动敌群后，裂空可借风转向另一队。`;
    }
    if (rank === 3 && doctrine === 'reach') {
      const recoil = owned(['needle']) ? name('needle') : cascade === 'wind' ? cascadeName : null;
      return recoil ? `双阙夹击中阵后，${recoil}从斜侧实际命中时，可把裂劲引向另一队。`
        : '左右裂口各自牵引，两口合拢后夹击中阵。';
    }
    const follow = owned(['needle']) ? RIFT_NEEDLE_PAIRING : cascade === 'wind'
      ? `${cascadeName}从侧方撞上裂口附近的敌群时，横裁可顺风续开裂缝。`
      : '爪击在主裂口附近命中时，横裁可顺势把裂缝撕向旁侧敌群。';
    return rank === 3 ? follow : `三阶选横裁后，${follow}`;
  }
  if (art === 'abyss') {
    const rain = owned(['torrent', 'bankweir']);
    if (owned(['coil'])) {
      if (fire && rain) return `墨眼蓄下卷入的火，沿${name(rain)}的湿路把上涌蒸汽送往远处敌群。`;
      if (fire && water && owned(['windkite'])) return '墨眼借风卷入燃敌后，可沿折风鸢在湿处送出的云汽，把蒸汽推往远处敌群。';
      if (owned(['venom', 'sporeseed']) && owned(['windkite'])) return '墨眼借风卷入毒敌后，可沿折风鸢送出的毒雾把毒流推往远处敌群。';
    }
    if (cascade === 'poison' && fire) {
      return `卷入${name(fire)}烧过的敌人，与${cascadeName}留下的毒会合，可燃起毒雾。`;
    }
    if (cascade === 'fire' || fire) {
      const flame = cascade === 'fire' ? cascadeName : name(fire);
      if (poison) return `卷入${flame}烧过的敌人，遇${name(poison)}的毒可燃起毒雾。`;
      if (water) return `卷入${flame}烧过的敌人，遇${name(water)}打湿的敌人可生蒸汽。`;
    }
    if (cascade === 'wind') return `可借${cascadeName}聚过敌的风眼，在原处卷入敌群。`;
    if (owned(['coil'])) return `可借${name('coil')}聚过敌的风眼，在原处卷入敌群。`;
    return '卷入燃敌后遇水可生蒸汽，遇毒可引燃毒雾。';
  }
  if (art === 'beam') {
    const rain = owned(['torrent']);
    if (rank === 3 && doctrine === 'reach') {
      if (cascade === 'water') return SCORCH_CREST_PAIRING;
      return rain ? SCORCH_STEAM_PAIRING : '干火痕会继续灼烧后来踏入的敌人。雨或水浪能将接触的那一段化成蒸汽。';
    }
    const lightning = cascade === 'thunder' ? cascadeName : thunder && name(thunder);
    const moisture = rain ? `${name(rain)}铺雨` : water ? `${name(water)}打湿敌群` : '光束扫过湿敌或雨场';
    return `${moisture}，随后${lightning || '雷击'}可沿光束路径传向外侧湿敌。`;
  }
  return '';
}

function equippedTechniquePairing(cultivation, incoming, weapons) {
  for (const [first, second, text] of techniquePairs) {
    const partners = first.includes(incoming) ? second : second.includes(incoming) ? first : [];
    const partner = partners.find(id => weapons.some(weapon => weapon.id === id));
    if (partner) return `与${cultivation.getWeapon(partner).name}同用，${text}`;
  }
  return '';
}

function choicePairing(cultivation, card, stage) {
  const {kind, system, art, route} = card;
  const replaced = kind === 'swap' ? card : card.swap;
  const weapons = replaced ? cultivation.weapons.map(weapon =>
    weapon.uid === replaced.uid ? {id: replaced.id, tier: 1} : weapon) : cultivation.weapons;
  if (kind === 'dragonArt' || (kind === 'reorient' && (system === 'dragonArt' || system === 'doctrine'))) {
    return dragonArtPairing(cultivation, art, kind === 'dragonArt' ? card.nextRank : system === 'doctrine' ? 3 : 2,
      cultivation.cascade, weapons, card.doctrine);
  }
  if (kind === 'cascade' || (kind === 'reorient' && (system === 'cascade' || system === 'cascadeDoctrine'))) {
    const currentArt = cultivation.dragonArt;
    if(route==='thunder'&&(card.nextRank??cultivation.cascadeRank)>=2&&currentArt==='frost'&&
        cultivation.dragonArtDoctrine==='thaw')return '开霁扫倒敌群后会在落点留汽。雷击湿敌时若能接上残汽，潮雷可转打另一群。';
    if(stage>=2&&stage<4&&route==='wind'&&card.doctrine==='gale') {
      if(weapons.some(weapon=>weapon.id==='sporeseed'&&weapon.tier>=2))return GALE_SPORE_FORK_PAIRING;
      if(weapons.some(weapon=>weapon.id==='sporeseed'))return GALE_SPORE_PAIRING;
    }
    if(stage>=2&&stage<4&&route==='wind'&&card.doctrine==='gale'&&currentArt==='rift'&&cultivation.dragonArtRank>=2) {
      return '行空实际卷动敌群后，双爪裂空可借风势向另一队续裂。';
    }
    if (stage >= 2 && stage < 4 && route === 'water' && currentArt === 'beam' && cultivation.dragonArtDoctrine !== 'echo') {
      return (cultivation.dragonArtRank < 3 ? '三阶选焚径后，' : '') + SCORCH_CREST_PAIRING;
    }
    const {supports} = cascadeParts(weapons, CASCADE_CARDS[route]);
    const support = supports[0];
    const combinesWithArt = stage >= 1 && combinesWithCascade(currentArt, route, weapons);
    if (combinesWithArt && (route !== cultivation.cascade || !support)) {
      return dragonArtPairing(cultivation, currentArt, cultivation.dragonArtRank, route, weapons);
    }
    return support ? `${cultivation.getWeapon(support).name}${cascadePairs[route][support]}` : '';
  }
  if (kind !== 'learn' && kind !== 'swap') return '';
  if(stage>=2&&stage<4&&card.id==='sporeseed'&&hasGaleDoctrine(cultivation))return GALE_SPORE_PAIRING;
  const beam = stage >= 2 && beamMaterial(cultivation, card.id);
  if (beam) return beam.pairing;
  if (card.id === 'needle' && riftMaterialChoice(cultivation, stage, [card])) {
    return cultivation.dragonArtDoctrine === 'echo' ? RIFT_NEEDLE_PAIRING : `三阶选横裁后，${RIFT_NEEDLE_PAIRING}`;
  }
  const fire = cultivation.cascade === 'fire' || weapons.some(weapon => FIRE_TECHNIQUES.includes(weapon.id));
  const wind = cultivation.cascade === 'wind' || weapons.some(weapon => weapon.id === 'coil');
  const kiteRank = weapons.find(weapon => weapon.id === 'windkite')?.tier ?? 0;
  if (fire && WET_FIELD_TECHNIQUES.includes(card.id)) {
    if ((!cultivation.dragonArt || cultivation.dragonArt === 'abyss') && wind) {
      return (cultivation.dragonArtRank < 2 ? '墨眼二阶起，' : '') + STEAMWAKE_PAIRING;
    }
    if (kiteRank) return `送出的火遇湿化汽。${kiteRank >= 2 ? '' : '折风鸢升至灵品后，'}${KITE_RAIN_PAIRING}`;
  }
  if (card.id === 'icekeel') {
    const wet = WATER_TECHNIQUES.find(id => weapons.some(weapon => weapon.id === id));
    const bolt = THUNDER_TECHNIQUES.find(id => weapons.some(weapon => weapon.id === id));
    const lightning = cultivation.cascade === 'thunder' ? CASCADE_CARDS.thunder.name : bolt && cultivation.getWeapon(bolt).name;
    if (wet && lightning) {
      const reflex = `${cultivation.getWeapon(wet).name}先打湿敌人。${lightning}经过冰棱时，雷会折向侧翼。`;
      if (cultivation.dragonArt !== 'frost' || cultivation.dragonArtDoctrine === 'reach') return reflex;
      return `${reflex}${cultivation.dragonArtRank<2 ? '霜镜升到二阶后，' : ''}${FROST_PRISM_PAIRING}`;
    }
  }
  if (cultivation.dragonArt === 'frost' && WET_FIELD_TECHNIQUES.includes(card.id) &&
    frostHasLightning(cultivation, weapons)) {
    const onset = cultivation.dragonArtRank < 2 ? '霜镜升到二阶后，' : '';
    return `先打湿一片敌人。${onset}雷打碎湿冰时，雷霜可传给还活着的湿敌。`;
  }
  const kite = kitePairing(cultivation, card.id, weapons);
  if (kite) return kite;
  if (cultivation.dragonArt === 'frost' && FIRE_TECHNIQUES.includes(card.id)) {
    const opensThaw = cultivation.dragonArtDoctrine !== 'thaw' && !canChooseDragonArtDoctrine(cultivation, 'frost', 'thaw');
    return (cultivation.dragonArtRank < 2 ? '霜镜升至二阶后，' : '') + FROST_FIRE_PAIRING +
      (opensThaw ? '备火后可选三阶开霁。' : '');
  }
  if (card.opensCascade) {
    const support = cascadeParts(weapons, CASCADE_CARDS[card.opensCascade]).supports[0];
    return `${cultivation.getWeapon(support).name}${cascadePairs[card.opensCascade][support]}`;
  }
  if (card.id === 'bankweir') {
    const pairing = weirPairing(cultivation);
    if (pairing) return pairing;
  }
  if (stage === 0 && card.id === 'tail' && weapons.some(weapon => weapon.id === 'fang')) {
    return `与${cultivation.getWeapon('fang').name}同用，近身打前方，甩尾扫身后。`;
  }
  const combo = equippedTechniquePairing(cultivation, card.id, weapons);
  if (combo) return combo;
  const cascade = cultivation.cascade;
  const cascadePair = cascadePairs[cascade]?.[card.id];
  if (cascadePair) return `与${CASCADE_CARDS[cascade].name}同用，${cascadePair}`;
  const preparedArt = card.preparesArts?.[0];
  if (preparedArt) {
    const prepared = replaced ? weapons : [...weapons, {id: card.id, tier: 1}];
    const example = dragonArtPairing(cultivation, preparedArt, 1, cultivation.cascade, prepared);
    return example.startsWith('二阶起，') ? `${DRAGON_ARTS[preparedArt].name}${example}` :
      `悟得${DRAGON_ARTS[preparedArt].name}后，${example}`;
  }
  return '';
}

const techniqueCoverage = {
  frostLine: [['连霜', 'chain'], ['传递', 'radius', '丈'], ['冻结', 'life', '秒']],
  fault: [['石脉', 'columns'], ['半径', 'radius', '丈'], ['高度', 'height', '丈']],
  wisps: [['火灵', 'burst'], ['半径', 'radius', '丈'], ['射程', 'range', '丈']],
  spore: [['宿主', 'hosts'], ['半径', 'radius', '丈'], ['持续', 'life', '秒']],
  weir: [['水路', 'flowLength', '丈'], ['幅宽', 'radius', '丈'], ['堰数', 'gates']],
  kiteDraft: [['送风', 'gustRange', '丈'], ['幅宽', 'radius', '丈'], ['持续', 'life', '秒']],
  prism: [['折射', 'refractionRange', '丈'], ['持续', 'life', '秒'], ['冰棱', 'prisms']],
};

function shuffle(items, roll) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(roll() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function techniqueCard(def) {
  return {
    title: def.name,
    tone: def.family,
    description: choiceDescriptions[def.id] ?? def.desc,
  };
}

function learnCards(cultivation, eligible, stage) {
  if (cultivation.weapons.length >= SLOT_COUNT) return [];
  const counts = new Map();
  for (const weapon of cultivation.weapons) counts.set(weapon.id, (counts.get(weapon.id) ?? 0) + 1);
  const unseenFamilies = new Set(eligible.filter(def => !counts.has(def.id)).map(def => def.family));
  const sets = cultivation.sets();
  const route = CASCADE_CARDS[cultivation.cascade];

  return eligible.flatMap(def => {
    const copies = counts.get(def.id) ?? 0;
    // Keep six-piece sets reachable even for families with fewer techniques.
    if (copies > 1 || (copies === 1 && unseenFamilies.has(def.family))) return [];
    const set = sets.find(family => family.id === def.family);
    const bonus = set.next?.at === set.count + 1 ? set.next.desc : '';
    const build = route?.complement.includes(def.id) && !copies ? `强化${route.name}` : '';
    const hints = stage >= 1 && !cultivation.dragonArt && !copies
      ? Object.entries(DRAGON_ARTS).filter(([, art]) => !dragonArtPreparation(cultivation.weapons, art) &&
        dragonArtPreparation([...cultivation.weapons, { id: def.id, tier: 1 }], art)) : [];
    const art = hints[0]?.[1];
    const detail = [copies ? '再添一件，独立出招' : '', art ? `悟得${art.name}的配招` : '', build, bonus].filter(Boolean).join(' · ');
    return [{...techniqueCard(def), kind: 'learn', detail, id: def.id, copies, preparesArts: hints.map(([id]) => id)}];
  });
}

function improveCards(cultivation, stage) {
  const upgrades = [];
  const tempers = [];
  const alternateTempers = [];
  const seen = new Set();
  for (const weapon of cultivation.weapons) {
    const {uid, id, tier, temper} = weapon;
    const key = `${id}:${tier}:${temper ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const def = cultivation.getWeapon(id);
    const card = techniqueCard(def);
    const from = TIER_NAMES[tier - 1];
    const currentForm = getTemper(weapon);
    if (tier < MAX_TIER) {
      const stats = techniqueStats(weapon, cultivation.modifiers());
      const next = techniqueStats({...weapon, tier:tier + 1}, cultivation.modifiers());
      const close = stats.kind === 'melee';
      const measures = techniqueCoverage[stats.kind] ?? (stats.kind === 'projectile' ? [
        ['弹数', 'projectiles'], ['贯穿', 'pierce'], ['射程', 'range', '丈'],
      ] : stats.kind === 'arc' ? [
        ['雷链', 'chain'], ['射程', 'range', '丈'],
      ] : [
        [close ? '触及' : '半径', close ? 'range' : 'radius', '丈'], ['持续', 'life', '秒'],
      ]);
      const coverage = measures.filter(([,field]) => stats[field] !== next[field]).map(([label, field, unit]) => {
        const value = n => unit ? Number(n.toFixed(1)) : n;
        return `${label} ${value(stats[field])}→${value(next[field])}${unit ?? ''}`;
      }).join(' · ');
      const power = Math.round((next.power / stats.power - 1) * 100);
      const speed = Math.round((1 - next.cooldown / stats.cooldown) * 100);
      const art = stage >= 1 && !cultivation.dragonArt && tier < 3 && Object.values(DRAGON_ARTS).find(art =>
        art.primary.includes(id) && !dragonArtPreparation(cultivation.weapons, art));
      const spatial = stage >= 2 && stage < 4 && tier === 1 && id === 'bankweir' && weirPairing(cultivation);
      const foldingRain = stage >= 1 && stage < 4 && tier === 1 && id === 'windkite' &&
        (cultivation.cascade === 'fire' || cultivation.weapons.some(weapon => FIRE_TECHNIQUES.includes(weapon.id))) &&
        cultivation.weapons.some(weapon => WATER_TECHNIQUES.includes(weapon.id));
      const forkedSpore = stage >= 2 && stage < 4 && tier === 1 && id === 'sporeseed' && hasGaleDoctrine(cultivation);
      upgrades.push({
        ...card, kind: 'upgrade', id, uid, tier, artHint: art?.name,
        title: currentForm ? `${def.name} · ${currentForm.name}` : def.name,
        description: coverage,
        detail: `${from}→${TIER_NAMES[tier]} · 威力 +${power}% · 间隔 −${speed}%${tier === 2 && art ? ` · 悟得${art.name}的根基` : ''}`,
        ...(spatial ? {pairing: '升至灵品后，波末可选窄而远或宽而近的泄流。'}
          : foldingRain ? {pairing: KITE_RAIN_PAIRING} : forkedSpore ? {pairing: GALE_SPORE_FORK_PAIRING} : {}),
      });
    }
    if (tier < 2 || (currentForm && tier < MAX_TIER)) continue;
    const pool = currentForm ? alternateTempers : tempers;
    for (const form of temperingForms(id)) {
      if (form === currentForm) continue;
      pool.push({
        ...card, kind: 'temper', id, uid, tier, form: form.id, previousForm: currentForm?.id,
        title: `${def.name} · ${form.name}`, description: form.desc,
        detail: currentForm ? `${currentForm.name} → ${form.name} · 原淬炼失效` : '',
      });
    }
  }
  return {upgrades, tempers, alternateTempers};
}

function weirTemper(cultivation, stage, candidates) {
  if (stage < 2 || stage >= 4) return null;
  const pairing = weirPairing(cultivation);
  if (!pairing) return null;
  const forms = candidates.filter(card => card.id === 'bankweir');
  if (!forms.length) return null;
  const picked = forms.find(card => card.form === (cultivation.wave % 2 ? 'long-weir' : 'wide-weir')) ?? forms[0];
  return {...picked, pairing};
}

function spatialTemperPair(cultivation, stage, tempers) {
  if (stage < 2 || stage >= 4 || cultivation.weapons.length < SLOT_COUNT-1 ||
      cultivation.dragonArtRank < 2 || cultivation.dragonArtRank===2&&cultivation.wave%2!==0) return [];
  const route = cultivation.dragonArt;
  const weapons = route === 'stone' && weirPairing(cultivation) ? ['bankweir'] :
    route === 'frost' && frostHasLightning(cultivation,cultivation.weapons) ? ['icekeel'] :
    route === 'abyss' ? ['sporeseed',...(cultivation.weapons.some(weapon=>[...FIRE_TECHNIQUES,...POISON_FIELDS].includes(weapon.id))
      ? ['windkite'] : [])] : [];
  for (const id of weapons) {
    const candidate = tempers.find(card=>card.id===id);
    if(!candidate)continue;
    const same = tempers.filter(card=>card.uid===candidate.uid);
    if(same.length<2)continue;
    const pairing = id==='bankweir' ? weirPairing(cultivation) :
      id==='icekeel' ? '更远、更高的折射，或较近、留得更久的冰棱。' :
      id==='windkite' ? '把现有场域搬得更高更远，或覆盖更宽的落点。' :
      '毒种早些落地，或由活敌带到另一队后再散开。';
    return same.slice(0,2).map(card=>({...card,pairing}));
  }
  return [];
}

function cascadeCards(cultivation, stage, roll) {
  if (stage < 1) return [];
  const rank = cultivation.cascadeRank ?? 0;
  if (rank >= MAX_CASCADE_RANK) return [];
  return shuffle(Object.entries(CASCADE_CARDS), roll).flatMap(([route, rule]) => {
    if (rank && cultivation.cascade !== route) return [];
    const parts = cascadeParts(cultivation.weapons, rule);
    if (!parts.core) return [];
    const nextRank = rank ? rank + 1 : parts.supports.length ? 2 : 1;
    const names = [parts.core, parts.supports[0]].filter(Boolean).map(id => cultivation.getWeapon(id).name).join('＋');
    const follow = nextRank === 2 && cultivation.dragonArtRank >= 2 ? ' · 沧溟起，龙术清群后可提前接力' : '';
    return [{kind:'cascade', route, rank, nextRank, tone:rule.tone, title:rule.name,
      description:rank === 2 && rule.mastery ? rule.mastery : rank ? rule.growth : rule.desc,
      detail:`${names} · ${rank ? `连携 ${rank}→${nextRank}` : nextRank === 2 ? '配招齐备 · 直接习得二阶' : '习得一阶连携'}${follow}`}];
  }).sort((left, right) => right.nextRank - left.nextRank);
}

function cascadeDoctrineCards(cultivation, stage, hand) {
  const {cascade:route, cascadeRank:rank, wave, weapons} = cultivation;
  const doctrines = CASCADE_DOCTRINES[route];
  if (!doctrines || stage < 2 || stage > 3 || !cascadeParts(weapons, CASCADE_CARDS[route]).core) return hand;
  const spec = CASCADE_CARDS[route];
  const describe = (doctrine, {name,description}) => ({
    route, doctrine, title: `${spec.name} · ${name}`, tone: spec.tone, description,
  });
  const options = Object.entries(doctrines).map(([doctrine,path]) => describe(doctrine,path));

  const mastery = hand.find(card => card.kind === 'cascade' && card.rank === MAX_CASCADE_RANK - 1);
  if (mastery) {
    const branches = options.map(option => ({...mastery, ...option, detail: '连携 二阶→三阶 · 自动施放'}));
    const other = hand.filter(card => card !== mastery);
    const strategic = card => card.kind === 'reorient' || card.compound || card.kind === 'dragonArt' && !card.rank;
    const protectedChoices = other.filter(strategic);
    const parallelMastery = other.length === 2 && other.every(card => card.kind === 'dragonArt' && card.doctrine);
    if (protectedChoices.length === 2 || parallelMastery && wave % 2 === 1) {
      return hand.map(card => card === mastery ? branches[wave % branches.length] : card);
    }
    const third = protectedChoices[0] ?? other.find(card => card.kind === 'dragonArt' &&
      (!parallelMastery || card.doctrine === (wave % 4 === 0 ? 'echo' : 'reach'))) ?? other[0];
    return third ? [...branches,third] : branches;
  }

  const previous = cultivation.cascadeDoctrine ?? null;
  if (rank !== MAX_CASCADE_RANK || weapons.length < SLOT_COUNT - 1 || wave % LATE_CHOICES.length !== LATE_CHOICES.length - 1) return hand;
  const changes = options.filter(option => option.doctrine !== previous).map(option => ({
    ...option, kind:'reorient', system:'cascadeDoctrine', previous, previousRank:rank,
    detail: previous ? `${doctrines[previous]?.name ?? spec.name}→${doctrines[option.doctrine].name} · 保留三阶` : '选定分支 · 保留三阶',
  }));
  return [...changes,...hand.slice(0,HAND_SIZE - changes.length)];
}

function cascadeLearnCard(cultivation, stage, learns) {
  if (stage < 1 || stage >= 4 || cultivation.wave < 2 || cultivation.cascadeRank) return null;
  const rules = Object.entries(CASCADE_CARDS);
  // A prepared support should point at a different route from the ordinary
  // offers. Rotate between them when one equipped technique supports several.
  const offset = (cultivation.wave - 2) % rules.length;
  for (const [id, rule] of [...rules.slice(offset), ...rules.slice(0, offset)]) {
    const {core, supports} = cascadeParts(cultivation.weapons, rule);
    if (core || !supports.length) continue;
    const learn = learns.find(card => !card.copies && rule.primary.includes(card.id));
    if (!learn) continue;
    return {
      ...learn, opensCascade: id,
      title: `${learn.title} · ${rule.name}`,
      detail: `凡品新招 · 一阶连携。${rule.desc}`,
    };
  }
  return null;
}

function dragonArtCards(cultivation, stage) {
  if (stage < 1 || stage >= 4 || cultivation.wave < 2) return [];
  const rank = cultivation.dragonArtRank ?? 0;
  if (rank === MAX_ART_RANK) return [];
  if (!rank) {
    const ready = Object.entries(DRAGON_ARTS).flatMap(([id, art]) => {
      const foundation = dragonArtFoundation(cultivation, id);
      if (!foundation) return [];
      const {sources, rank: nextRank, cascade, practiced} = foundation;
      const names = sources.map(source => cultivation.getWeapon(source).name).join('＋');
      const practicedWeapon = practiced?.find(weapon => weapon.tier >= 2);
      const grade = practicedWeapon ? TIER_NAMES[practicedWeapon.tier - 1] : '';
      const basis = cascade ? `借${CASCADE_CARDS[cascade].name}之势` : grade ? `${names}（含${grade}）` : names;
      const acquisition = nextRank === 2 ? '直入二阶' : '习得一阶';
      return [{kind: 'dragonArt', art: id, rank, nextRank, tone: art.tone, title: art.name,
        description: art.first, detail: `${basis} · ${acquisition} · ${dragonArtActivation(art, stage)}`}];
    });
    if (ready.length < 3) return ready.sort((left, right) => right.nextRank - left.nextRank);
    const offset = (cultivation.wave - 2) % ready.length;
    const options = [...ready.slice(offset), ...ready.slice(0, offset)];
    return options.sort((left, right) => right.nextRank - left.nextRank);
  }

  const id = cultivation.dragonArt;
  const art = DRAGON_ARTS[id];
  const card = {kind: 'dragonArt', art: id, rank, nextRank: rank + 1, tone: art.tone};
  if (rank === 1) {
    const follow = cultivation.cascadeRank >= 2 ? ' · 沧溟起，清群后可接连携' : '';
    return [{...card, title: art.name, description: art.second,
      detail: `一阶 → 二阶 · ${dragonArtActivation(art, stage)}${follow}`}];
  }
  return Object.entries(DRAGON_ART_DOCTRINES)
    .filter(([doctrine]) => canChooseDragonArtDoctrine(cultivation, id, doctrine))
    .map(([doctrine, path]) => ({
      ...card, doctrine, title: `${art.name} · ${path.names?.[id] ?? path.name}`, description: path.detail[id],
      detail: doctrine === 'thaw' ? '三阶 · 自动施放' : `三阶 · ${art.third}`,
    }));
}

function cascadeParts(weapons, route) {
  const known = new Set(weapons.map(weapon => weapon.id));
  return {
    core: route.primary.find(id => known.has(id)),
    supports: route.complement.filter(id => known.has(id)),
  };
}

function connections(cultivation, weapons) {
  const arts = new Set(Object.entries(DRAGON_ARTS).filter(([, art]) =>
    dragonArtPreparation(weapons, art)).map(([id]) => id));
  const cascades = new Map(Object.entries(CASCADE_CARDS).filter(([id]) =>
    !cultivation.cascade || cultivation.cascade === id).map(([id, route]) => [id, cascadeParts(weapons, route)]));
  return {arts, cascades};
}

function swapConnections(cultivation, before, after) {
  const relevantArts = cultivation.dragonArt ? [cultivation.dragonArt] : [...before.arts];
  if (relevantArts.some(id => before.arts.has(id) && !after.arts.has(id))) return null;
  const arts = cultivation.dragonArt ? [] : [...after.arts].filter(id => !before.arts.has(id));
  const cascades = [];
  for (const [id, previous] of before.cascades) {
    const next = after.cascades.get(id);
    if (previous.core && !next.core) return null;
    if (cultivation.cascade && previous.supports.some(weapon => !next.supports.includes(weapon))) return null;
    const newRoute = !previous.core && next.core && next.supports.length > 0;
    const support = cultivation.cascade && next.core && next.supports.length > previous.supports.length;
    if (newRoute || support) cascades.push(id);
  }
  return arts.length || cascades.length ? {arts, cascades} : null;
}

function compoundSupport(cultivation, incoming, weapons) {
  if (incoming === 'sporeseed' && hasGaleDoctrine(cultivation) && cascadeParts(weapons, CASCADE_CARDS.wind).core) {
    const needsFire = cultivation.dragonArtDoctrine === 'thaw' && canChooseDragonArtDoctrine(cultivation, 'frost', 'thaw');
    if (!needsFire || weapons.some(weapon => FIRE_TECHNIQUES.includes(weapon.id))) {
      return {id:'gale-spore',pairing:GALE_SPORE_PAIRING};
    }
  }
  if (cultivation.dragonArtRank < 2) return null;
  const beam = beamMaterial(cultivation, incoming);
  if (beam) return beam;
  const owns = (ids, gear) => ids.some(id => gear.some(weapon => weapon.id === id));
  const old = cultivation.weapons;
  const addsWetField = WET_FIELD_TECHNIQUES.includes(incoming) && !owns(WET_FIELD_TECHNIQUES, old);
  if (cultivation.dragonArt === 'stone' && incoming === 'bankweir') {
    return {id:'quarry', pairing:'泄流撞碎多座石壳时，碎石会合成一道石潮，打向外侧敌群。'};
  }
  if (cultivation.dragonArt === 'rift' && incoming === 'needle' && owns(['fang'], weapons) &&
    cultivation.dragonArtDoctrine !== 'reach') {
    return {id:'rift-seam', pairing:cultivation.dragonArtDoctrine === 'echo' ? RIFT_NEEDLE_PAIRING :
      `三阶选横裁后，${RIFT_NEEDLE_PAIRING}`};
  }
  if (cultivation.dragonArt === 'frost' && incoming === 'icekeel' && owns(WATER_TECHNIQUES, weapons) &&
      frostHasLightning(cultivation, weapons) && cultivation.dragonArtDoctrine !== 'reach') {
    return {id:'frost-prism', pairing:FROST_PRISM_PAIRING};
  }
  if (cultivation.dragonArt === 'frost' && incoming === 'ember' && !frostHasLightning(cultivation,old) &&
      cultivation.cascade !== 'fire' && !owns(FIRE_TECHNIQUES,old) && owns(WATER_TECHNIQUES,weapons)) {
    return {id:'frost-fire',pairing:FROST_FIRE_PAIRING};
  }
  if (cultivation.dragonArt === 'abyss' && owns(['coil'], weapons)) {
    if ((addsWetField && owns(FIRE_TECHNIQUES, weapons)) ||
        (FIRE_TECHNIQUES.includes(incoming) && !owns(FIRE_TECHNIQUES, old) && owns(WET_FIELD_TECHNIQUES, weapons))) {
      return {id:'steamwake', pairing:STEAMWAKE_PAIRING};
    }
    if (incoming === 'windkite' && owns(WET_FIELD_TECHNIQUES, weapons) && owns(FIRE_TECHNIQUES, weapons)) {
      return {id:'kite-steam', pairing:`鸢火落湿成汽。折风鸢升至灵品后，${KITE_RAIN_PAIRING}`};
    }
    if (incoming === 'windkite' && owns(POISON_FIELDS, weapons)) {
      return {id:'kite-undertow', pairing:'折风鸢把一部分毒雾送出，墨眼可借落点把毒流再推过远处敌群。'};
    }
    if (addsWetField && owns(POISON_FIELDS, weapons)) {
      return {id:'wet-undertow', pairing:'风眼卷入染毒敌人后，墨眼可把毒流送过另一片湿区。'};
    }
  }
  return null;
}

function keepsCompoundFoundation(cultivation, weapons) {
  return keepsOtherRoute(cultivation, weapons, 'cascade') && keepsOtherRoute(cultivation, weapons, 'dragonArt');
}

function compoundSupportCard(cultivation, stage, eligible) {
  const {weapons} = cultivation;
  if (weapons.length !== SLOT_COUNT || stage < 2 || stage >= 4 ||
      cultivation.dragonArtRank < 2 && !hasGaleDoctrine(cultivation)) return null;
  const preferredBeam = cultivation.dragonArt === 'beam' && beamMaterialOrder(cultivation)[0];
  let best;
  for (const incoming of eligible) {
    if (weapons.some(weapon => weapon.id === incoming.id)) continue;
    for (const [slot, outgoing] of weapons.entries()) {
      if (outgoing.tier > 2 || outgoing.temper) continue;
      const after = weapons.with(slot, {id:incoming.id, tier:1});
      const compound = compoundSupport(cultivation, incoming.id, after);
      if (!compound || !keepsCompoundFoundation(cultivation, after)) continue;
      const previous = cultivation.getWeapon(outgoing.id);
      const cost = (outgoing.tier - 1) * 5 + Number(previous.family !== incoming.family) * 2 +
        Number(weapons.filter(weapon => weapon.id === outgoing.id).length === 1);
      const priority = compound.id === 'gale-spore' ? 3 :
        ['steamwake','quarry','kite-steam'].includes(compound.id) || incoming.id === preferredBeam ? 2 : 1;
      if (best && (priority < best.priority || priority === best.priority && cost >= best.cost)) continue;
      best = {priority, cost, compound, incoming, outgoing, previous};
    }
  }
  if (!best) return null;
  const {compound, incoming, outgoing, previous} = best;
  const partner = compound.id === 'gale-spore' ? CASCADE_DOCTRINES.wind.gale : DRAGON_ARTS[cultivation.dragonArt];
  const previousGrade = outgoing.tier > 1 ? `旧招${TIER_NAMES[outgoing.tier-1]} · ` : '';
  return {
    kind:'swap', id:incoming.id, uid:outgoing.uid, tier:outgoing.tier, previousId:outgoing.id,
    tone:incoming.family, title:`${previous.name} → ${incoming.name}`,
    description:`给「${partner.name}」换配招，保留当前品阶。`,
    detail:`${previousGrade}新招凡品 · ${choiceDescriptions[incoming.id] ?? incoming.desc}`,
    compound:compound.id, art:cultivation.dragonArt, pairing:compound.pairing,
  };
}

function swapCard(cultivation, stage, eligible) {
  const weapons = cultivation.weapons;
  if (weapons.length !== SLOT_COUNT || stage < 1 || stage >= 4 || cultivation.wave < 2) return null;
  const before = connections(cultivation, weapons);
  const options = [];
  for (const incoming of eligible) {
    if (weapons.some(weapon => weapon.id === incoming.id)) continue;
    for (const [slot, outgoing] of weapons.entries()) {
      const after = connections(cultivation, weapons.with(slot,{id: incoming.id, tier: 1}));
      const added = swapConnections(cultivation,before,after);
      if (!added) continue;
      const previous = cultivation.getWeapon(outgoing.id);
      const changeCost = (outgoing.tier-1)*5 + Number(Boolean(outgoing.temper))*3 +
        Number(previous.family!==incoming.family)*2 +
        Number(weapons.filter(weapon => weapon.id===outgoing.id).length===1);
      options.push({incoming, outgoing, previous, added, changeCost});
    }
  }
  if (!options.length) return null;
  const advances = option => option.added.arts.length*2 + option.added.cascades.length;
  options.sort((left,right) => right.added.arts.length-left.added.arts.length ||
    left.changeCost-right.changeCost || advances(right)-advances(left));
  const best = options[0];
  const peers = options.filter(option => option.added.arts.length===best.added.arts.length &&
    option.changeCost===best.changeCost && advances(option)===advances(best));
  const {incoming, outgoing, previous, added} = peers[(cultivation.wave-2)%peers.length];
  const temper = getTemper(outgoing);
  const art = DRAGON_ARTS[added.arts[0]];
  const cascade = CASCADE_CARDS[added.cascades[0]];
  const previousGrade = outgoing.tier > 1 || temper
    ? `旧招 ${TIER_NAMES[outgoing.tier-1]}${temper ? ` · ${temper.name}` : ''}，新招凡品`
    : '新招凡品';
  return {
    kind: 'swap', id: incoming.id, uid: outgoing.uid, tier: outgoing.tier,
    previousId: outgoing.id, previousForm: outgoing.temper, tone: incoming.family,
    title: `${previous.name} → ${incoming.name}`,
    description: art ? `可领悟「${art.name}」` : cultivation.cascade
      ? `为「${cascade.name}」补上配招` : `可习得「${cascade.name}」`,
    detail: `${previousGrade} · ${choiceDescriptions[incoming.id] ?? incoming.desc}`,
    preparesArts: added.arts, preparesCascades: added.cascades,
  };
}

function canReorient(cultivation, system) {
  const full = cultivation.weapons.length === SLOT_COUNT;
  if (system === 'doctrine') {
    return full && cultivation.dragonArtRank === MAX_ART_RANK && Object.hasOwn(DRAGON_ARTS, cultivation.dragonArt) &&
      Object.hasOwn(DRAGON_ART_DOCTRINES, cultivation.dragonArtDoctrine);
  }
  if (system === 'dragonArt') {
    return full && cultivation.dragonArtRank >= 2 && Object.hasOwn(DRAGON_ARTS, cultivation.dragonArt);
  }
  return system === 'cascade' && cultivation.weapons.length >= SLOT_COUNT - 1 && cultivation.cascadeRank >= 2 &&
    Object.hasOwn(CASCADE_CARDS, cultivation.cascade);
}

function preparedRoute(weapons, system, target) {
  if (system === 'dragonArt') return Boolean(dragonArtPreparation(weapons, DRAGON_ARTS[target]));
  return Boolean(cascadeParts(weapons, CASCADE_CARDS[target]).core);
}

function canSwitchRoute(weapons, system, target) {
  if (system !== 'cascade' || weapons.length === SLOT_COUNT) return preparedRoute(weapons, system, target);
  const {core, supports} = cascadeParts(weapons, CASCADE_CARDS[target]);
  return Boolean(core && supports.length);
}

function keepsOtherRoute(cultivation, weapons, system) {
  if (system === 'cascade') {
    const art = DRAGON_ARTS[cultivation.dragonArt];
    return !art || !dragonArtPreparation(cultivation.weapons, art) || Boolean(dragonArtPreparation(weapons, art));
  }
  const cascade = CASCADE_CARDS[cultivation.cascade];
  if (!cascade) return true;
  const before = cascadeParts(cultivation.weapons, cascade);
  const after = cascadeParts(weapons, cascade);
  return (!before.core || after.core) && before.supports.every(id => after.supports.includes(id));
}

function reorientationCard(cultivation, stage, system, target, swap) {
  const art = system === 'dragonArt';
  const definition = art ? DRAGON_ARTS[target] : CASCADE_CARDS[target];
  const previous = art ? DRAGON_ARTS[cultivation.dragonArt] : CASCADE_CARDS[cultivation.cascade];
  const outgoing = swap && cultivation.getWeapon(swap.previousId);
  const incoming = swap && cultivation.getWeapon(swap.id);
  const techniqueChange = swap ? ` · ${outgoing.name}→${incoming.name}（凡品）` : '';
  const activation = art && dragonArtActivation(definition, stage) !== '自动施放' ? ' · 化蛟后施放' : '';
  const rank = art ? '龙术' : '连携';
  const rankChange = cultivation[`${system}Rank`] === 3 ? `${rank}三阶→二阶` : `保留${rank}二阶`;
  return {
    kind: 'reorient', system, previous: cultivation[system], previousRank: cultivation[`${system}Rank`],
    ...(art ? {art: target} : {route: target}),
    ...(swap ? {swap: Object.freeze(swap)} : {}),
    title: definition.name, tone: definition.tone, description: art ? definition.first : definition.desc,
    detail: `取代${previous.name} · ${rankChange}${techniqueChange}${activation}`,
  };
}

function atomicReorientations(cultivation, stage, eligible) {
  const weapons = cultivation.weapons;
  if (weapons.length !== SLOT_COUNT) return [];
  const targets = Object.entries({dragonArt: DRAGON_ARTS, cascade: CASCADE_CARDS})
    .filter(([system]) => canReorient(cultivation, system)).flatMap(([system, definitions]) =>
      Object.keys(definitions).filter(id => id !== cultivation[system] && !preparedRoute(weapons, system, id))
        .map(id => ({system, id})));
  if (!targets.length) return [];
  const bestByTarget = new Map();
  for (const incoming of eligible) {
    if (weapons.some(weapon => weapon.id === incoming.id)) continue;
    for (const [slot, outgoing] of weapons.entries()) {
      if (outgoing.tier > 2 || outgoing.temper) continue;
      const after = weapons.with(slot, {id: incoming.id, tier: 1});
      for (const {system, id} of targets) {
        if (!preparedRoute(after, system, id) || !keepsOtherRoute(cultivation, after, system)) continue;
        if (system === 'cascade' && !cascadeParts(after, CASCADE_CARDS[id]).supports.length) continue;
        const key = `${system}:${id}`;
        const changeCost = (outgoing.tier - 1) * 5 +
          Number(cultivation.getWeapon(outgoing.id).family !== incoming.family) * 2 +
          Number(weapons.filter(weapon => weapon.id === outgoing.id).length === 1);
        if (bestByTarget.has(key) && bestByTarget.get(key).changeCost <= changeCost) continue;
        const swap = {id: incoming.id, uid: outgoing.uid, previousId: outgoing.id, tier: outgoing.tier};
        bestByTarget.set(key, {changeCost, card: reorientationCard(cultivation, stage, system, id, swap)});
      }
    }
  }
  return [...bestByTarget.values()].sort((a, b) => a.changeCost - b.changeCost).map(option => option.card);
}

function dragonDoctrineChanges(cultivation) {
  const {dragonArt: art, dragonArtDoctrine: previous} = cultivation;
  const current = DRAGON_ART_DOCTRINES[previous];
  const definition = DRAGON_ARTS[art];
  return Object.entries(DRAGON_ART_DOCTRINES)
    .filter(([doctrine]) => doctrine !== previous && canChooseDragonArtDoctrine(cultivation, art, doctrine))
    .map(([doctrine, path]) => ({
      kind: 'reorient', system: 'doctrine', art, doctrine, previous, tone: definition.tone,
      title: `${definition.name} · ${path.names[art]}`, description: path.detail[art],
      detail: `分支 ${current.names[art]}→${path.names[art]} · 保留三阶`,
    }));
}

function lateChoice(cultivation, stage, eligible, compound) {
  if (stage < 1 || stage >= 4 ||
    !['dragonArt', 'cascade'].some(system => canReorient(cultivation, system))) return null;
  const wave = cultivation.wave - 1;
  const cadence = wave % LATE_CHOICES.length;
  const rotation = Math.floor(wave / LATE_CHOICES.length);
  const weapons = cultivation.weapons;
  for (let offset = 0; offset < LATE_CHOICES.length; offset++) {
    const system = LATE_CHOICES[(cadence + offset) % LATE_CHOICES.length];
    if (system === 'doctrine') {
      if (!canReorient(cultivation, system)) continue;
      return dragonDoctrineChanges(cultivation)[0];
    }
    if (system === 'support') {
      if (offset) continue;
      const support = compound ?? swapCard(cultivation, stage, eligible);
      if (support) return support;
      continue;
    }
    if (system === 'swap') {
      if (offset) continue;
      const cards = atomicReorientations(cultivation, stage, eligible);
      if (cards.length) return cards[rotation % cards.length];
      continue;
    }
    if (!canReorient(cultivation, system)) continue;
    const pool = system === 'dragonArt' ? DRAGON_ARTS : CASCADE_CARDS;
    const targets = Object.keys(pool).filter(id => id !== cultivation[system] && canSwitchRoute(weapons, system, id));
    if (targets.length) return reorientationCard(cultivation, stage, system, targets[(rotation + offset) % targets.length]);
  }
  return null;
}

function applyReorientation(cultivation, card) {
  const {system, previous, previousRank, art, route, doctrine, swap} = card;
  if (system === 'cascadeDoctrine') {
    const {cascade, cascadeRank, weapons} = cultivation;
    const doctrines = CASCADE_DOCTRINES[cascade];
    if (swap || !doctrines || route !== cascade || cascadeRank !== MAX_CASCADE_RANK || previousRank !== cascadeRank ||
      (cultivation.cascadeDoctrine ?? null) !== previous || previous === doctrine || !Object.hasOwn(doctrines, doctrine) ||
      weapons.length < SLOT_COUNT - 1 || !cascadeParts(weapons,CASCADE_CARDS[cascade]).core) return false;
    cultivation.cascadeDoctrine = doctrine;
    return true;
  }
  if (!canReorient(cultivation, system)) return false;
  if (system === 'doctrine') {
    if (swap || cultivation.dragonArt !== art || cultivation.dragonArtDoctrine !== previous ||
      previous === doctrine || !canChooseDragonArtDoctrine(cultivation, art, doctrine)) return false;
    cultivation.dragonArtDoctrine = doctrine;
    return true;
  }

  const isArt = system === 'dragonArt';
  if (!isArt && system !== 'cascade') return false;
  const target = isArt ? art : route;
  if (cultivation[system] !== previous || cultivation[`${system}Rank`] !== previousRank || target === previous ||
    !Object.hasOwn(isArt ? DRAGON_ARTS : CASCADE_CARDS, target)) return false;

  const weapons = cultivation.weapons;
  const prepared = canSwitchRoute(weapons, system, target);
  if (swap) {
    if (weapons.length !== SLOT_COUNT) return false;
    const slot = weapons.findIndex(weapon => weapon.uid === swap.uid);
    const outgoing = weapons[slot];
    if (prepared || !outgoing || outgoing.id !== swap.previousId || outgoing.tier !== swap.tier || outgoing.tier > 2 ||
      outgoing.temper || !cultivation.getWeapon(swap.id) || weapons.some(weapon => weapon.id === swap.id)) return false;
    const after = weapons.with(slot, {id: swap.id, tier: 1});
    if (!keepsOtherRoute(cultivation, after, system) || !preparedRoute(after, system, target) ||
      (!isArt && !cascadeParts(after, CASCADE_CARDS[target]).supports.length)) return false;
    weapons[slot] = cultivation.makeWeapon(swap.id, 1);
    cultivation.invalidateModifiers();
  } else if (!prepared) return false;

  cultivation[system] = target;
  if (isArt) {
    cultivation.dragonArtRank = MAX_ART_RANK - 1;
    cultivation.dragonArtDoctrine = null;
  } else {
    cultivation.cascadeRank = MAX_CASCADE_RANK - 1;
    cultivation.cascadeDoctrine = null;
  }
  return true;
}

function prioritizeArtPreparation(learns, cultivation) {
  // Keep an alternative build reachable even when one art is already ready.
  // Prefer a new core move, then rotate the route as new waves open.
  const pending = Object.keys(DRAGON_ARTS).filter(id => learns.some(card => card.preparesArts.includes(id)));
  if (!pending.length) return;
  const offset = (cultivation.wave - 2) % pending.length;
  const chosen = pending[offset];
  const qualifies = card => card.preparesArts.includes(chosen);
  const primary = DRAGON_ARTS[chosen].primary;
  const candidate = learns.find(card => qualifies(card) && techniqueCoverage[cultivation.getWeapon(card.id).kind]) ??
    learns.find(card => qualifies(card) && primary.includes(card.id)) ??
    learns.find(qualifies);
  learns.splice(learns.indexOf(candidate), 1);
  learns.unshift(candidate);
}

export function marketChoices(cultivation, stage) {
  const roll = () => cultivation.roll();
  const eligible = cultivation.eligibleTechniques(stage);
  const learns = shuffle(learnCards(cultivation, eligible, stage), roll);
  const activeRoute = CASCADE_CARDS[cultivation.cascade];
  const unlearnedElement = cultivation.wave % 2 === 0 ? 'fire' : 'poison';
  const needsElement = !activeRoute && stage >= 1 && !cultivation.weapons.some(weapon =>
    CASCADE_CARDS[unlearnedElement].primary.includes(weapon.id));
  const preferred = activeRoute ? [
    ...activeRoute.primary.filter(id => techniqueCoverage[cultivation.getWeapon(id)?.kind]),
    ...activeRoute.complement,
  ] : needsElement ? CASCADE_CARDS[unlearnedElement].primary : [];
  const learnIndex = learns.findIndex(card => preferred.includes(card.id) && !card.copies);
  if (learnIndex > 0) learns.unshift(...learns.splice(learnIndex, 1));
  const artCards = dragonArtCards(cultivation, stage);
  const frostMastery = artCards.some(card => card.doctrine === 'thaw');
  let arts = artCards.slice(0, 2);
  const offersPreparation = stage >= 1 && stage < 4 && !cultivation.dragonArt && cultivation.wave >= 2;
  if (offersPreparation) prioritizeArtPreparation(learns, cultivation);
  const weirPartner = stage >= 1 && stage < 4 && weirPairing(cultivation);
  const weirLearn = weirPartner ? learns.findIndex(card => card.id === 'bankweir' && !card.copies) : -1;
  if (weirLearn > 0 && !offersPreparation) learns.unshift(...learns.splice(weirLearn, 1));
  const frostRelay = prioritizeFrostRelay(learns, cultivation, stage);
  const catalyst = frostRelay || ((!offersPreparation || !learns[0]?.preparesArts.length || cultivation.wave >= 4 && cultivation.wave % 2 === 0) &&
    prioritizeKiteCatalyst(learns, cultivation, stage));
  const {upgrades, tempers, alternateTempers} = improveCards(cultivation, stage);
  const advanced = shuffle(upgrades, roll);
  const needle = riftMaterialChoice(cultivation, stage, learns);
  const beam = beamMaterialChoices(cultivation, stage, learns);
  const materials = frostRelay ? [] : needle ? [needle] : beam.length ? beam : windMaterialChoices(cultivation, stage, learns, advanced);
  if (offersPreparation && !arts.length && !learns.some(card => card.preparesArts.length)) {
    const preparationIndex = advanced.findIndex(card => card.artHint);
    if (preparationIndex > 0) advanced.unshift(...advanced.splice(preparationIndex, 1));
  }
  const pools = [learns, advanced, shuffle(tempers, roll)];
  const spatial = cultivation.wave > 1 ? weirTemper(cultivation, stage, [...tempers, ...alternateTempers]) ??
    advanced.find(card => card.id === 'bankweir' && card.pairing) : null;
  const beamCrestReady = beamHasPreparedCrest(cultivation, stage);
  const reserveOrdinary = (spatial && arts.length === 2) || (catalyst && arts.length > 0) || materials.length > 0 || beamCrestReady;
  const cascadeLearn = reserveOrdinary ? null : cascadeLearnCard(cultivation, stage, learns);
  if (cascadeLearn) learns.splice(learns.findIndex(card => card.id === cascadeLearn.id), 1);
  const cascades = cascadeCards(cultivation, stage, roll);
  if (!cultivation.dragonArt && !cultivation.cascade) {
    const foundedArt = new Set(arts.map(card => card.art));
    const fits = card => card.nextRank === 2 && [...foundedArt].some(art => combinesWithCascade(art, card.route, cultivation.weapons));
    cascades.sort((left, right) => Number(fits(right)) - Number(fits(left)));
  }
  const pendingCascadeUpgrade = cascades.some(card => card.rank > 0);
  const crest = beamCrestReady && cascades.find(card => card.route === 'water');
  const preferCrest = crest && (cultivation.wave % 2 === 0 || cultivation.weapons.some(weapon => weapon.id === 'torrent'));
  const frostFork = frostRelay?.id === 'icekeel' && cultivation.dragonArtRank === 2;
  const catalystCards = frostFork ? [frostRelay] : crest ? (preferCrest ? [crest, ...materials] : [...materials, crest]) : materials;
  const compound = compoundSupportCard(cultivation, stage, eligible);
  const compoundFork = frostFork || cultivation.dragonArtRank === 2 &&
    (cultivation.dragonArt === 'abyss' && materials.length > 0 || cultivation.dragonArt === 'rift' && needle || beam.length > 0);
  const compoundMastery = compound && cultivation.dragonArtRank === 2 &&
    (cultivation.dragonArt !== 'beam' || cultivation.cascade);
  const galeSpore = compound?.compound === 'gale-spore' ? compound : null;
  const late = compoundFork || compoundMastery
    ? compound : lateChoice(cultivation, stage, eligible, compound) ?? compound;
  const choicesBeyondArt = Number(Boolean(cascadeLearn)) + Number(Boolean(late)) +
    Number(pendingCascadeUpgrade && !late?.compound && !compoundFork);
  if (arts.length + choicesBeyondArt > HAND_SIZE) {
    arts = [arts.find(card => card.nextRank === 2 && !card.rank) ?? arts[cultivation.wave % arts.length]];
  }
  const change = late ??
    (arts.length + Number(pendingCascadeUpgrade) + Number(Boolean(cascadeLearn)) < 2 ? swapCard(cultivation, stage, eligible) : null);
  const openingPair = cultivation.wave === 1 && learns.find(card=>card.id===OPENING_PAIR[cultivation.weapons[0]?.id]);
  const preparedCascade = cascadeLearn && cascades.some(card => card.nextRank === 2);
  const routeBudget = preparedCascade || late && pendingCascadeUpgrade ? HAND_SIZE : HAND_SIZE - 1;
  const specialCount = arts.length + Number(Boolean(change)) + Number(Boolean(cascadeLearn));
  // Keep a cascade upgrade unless both doctrines and a compatible technique
  // already give three distinct ways to shape the same dragon art.
  const materialSlots = Math.max(0, HAND_SIZE - specialCount - Number(pendingCascadeUpgrade && !compoundFork));
  const ordinaryMaterials = catalystCards.slice(0, materialSlots);
  const eligibleCascades = cascades.filter(card => !ordinaryMaterials.includes(card))
    .slice(0, Math.max(0, Math.min(routeBudget, HAND_SIZE - ordinaryMaterials.length) - specialCount));
  const remainingSlots = HAND_SIZE - specialCount - eligibleCascades.length;
  const ordinary = pools.filter(pool => !ordinaryMaterials.some(card => pool.includes(card)))
    .map(pool => pool[0]).filter(Boolean);
  const ordinaryCount = remainingSlots - ordinaryMaterials.length;
  const hand = cultivation.wave > 1 ? [
    ...arts,
    ...eligibleCascades,
    ...(cascadeLearn ? [cascadeLearn] : []),
    ...(change ? [change] : []),
    ...ordinaryMaterials,
    ...ordinary.slice(0, eligibleCascades.length ? Math.min(1, ordinaryCount) : ordinaryCount),
  ] : openingPair ? [openingPair] : [];
  const hasOrdinaryPick = card => card.kind === 'learn' && !card.opensCascade || card.kind === 'upgrade' || card.kind === 'temper';
  if (spatial && remainingSlots > 0) {
    const existing = hand.findIndex(card => card.kind === spatial.kind && card.uid === spatial.uid);
    const replace = existing >= 0 ? existing : hand.findLastIndex(card => hasOrdinaryPick(card) && !ordinaryMaterials.includes(card));
    if (existing >= 0 || hand.length === HAND_SIZE && replace >= 0) hand[replace] = spatial;
    else if (hand.length < HAND_SIZE) hand.push(spatial);
  }
  const canFill = card => !hand.includes(card) && (!spatial || card.kind !== spatial.kind || card.uid !== spatial.uid);
  const remaining = cultivation.wave === 1 && learns.length >= HAND_SIZE
    ? learns : shuffle([...cascades, ...pools.flat()].filter(canFill), roll);

  // Use different families before filling gaps with other valid alternatives.
  for (const card of remaining) {
    if (hand.length === HAND_SIZE) break;
    if (!hand.some(choice => choice.tone === card.tone)) hand.push(card);
  }
  hand.push(...remaining.filter(card => !hand.includes(card)).slice(0, HAND_SIZE - hand.length));

  if (hand.length < HAND_SIZE && cultivation.weapons.length >= SLOT_COUNT) {
    hand.push(...shuffle(alternateTempers.filter(canFill), roll).slice(0, HAND_SIZE - hand.length));
  }
  const fork=spatialTemperPair(cultivation,stage,tempers);
  if(fork.length===2){
    const doctrine = cultivation.wave%4===0?'echo':'reach';
    const third=hand.find(card=>card.kind==='dragonArt'&&card.doctrine===doctrine) ??
      hand.find(card=>!hasOrdinaryPick(card)) ??
      hand.find(card=>card.uid!==fork[0].uid);
    if(third)hand.splice(0,hand.length,...fork,third);
  }
  let choices = frostMastery ? artCards : cascadeDoctrineCards(cultivation,stage,hand);
  if (late?.system === 'doctrine' && late.art === 'frost') {
    const changes = dragonDoctrineChanges(cultivation);
    if (changes.length === 2) {
      choices = [...changes, ...choices.filter(card => card !== late).slice(0, HAND_SIZE - changes.length)];
    }
  }
  if (galeSpore && late === galeSpore && !frostMastery && !choices.includes(galeSpore)) {
    choices = [...choices.slice(0, HAND_SIZE - 1), galeSpore];
  }
  if (stage >= 2 && stage < 4 && cultivation.wave >= 5 && cultivation.wave % 2 === 0 && hasGaleDoctrine(cultivation)) {
    const seed = advanced.find(card => card.id === 'sporeseed' && card.tier === 1);
    if (seed && !choices.includes(seed)) {
      const slot = choices.findLastIndex(hasOrdinaryPick);
      if (slot >= 0) choices[slot] = seed;
    }
  }
  return Object.freeze(shuffle(choices, roll).map(card => {
    const pairing = card.pairing ?? choicePairing(cultivation, card, stage);
    return Object.freeze(pairing ? {...card, pairing} : card);
  }));
}

export function applyMarketChoice(cultivation, card) {
  if (!card) return false;
  const {kind, id, tier, uid, form} = card;
  const weapons = cultivation.weapons;

  if (kind === 'reorient') return applyReorientation(cultivation, card);

  if (kind === 'dragonArt') {
    if (!Object.hasOwn(DRAGON_ARTS, card.art)) return false;
    const rank = cultivation.dragonArtRank ?? 0;
    if (rank !== card.rank || rank >= MAX_ART_RANK || (rank && cultivation.dragonArt !== card.art)) return false;
    const nextRank = rank ? rank + 1 : dragonArtFoundation(cultivation, card.art)?.rank;
    if (!nextRank || card.nextRank !== nextRank) return false;
    if (rank === 2 ? !canChooseDragonArtDoctrine(cultivation, card.art, card.doctrine) : card.doctrine != null) return false;
    cultivation.dragonArt = card.art;
    cultivation.dragonArtRank = nextRank;
    cultivation.dragonArtDoctrine = card.doctrine ?? null;
    return true;
  }

  if (kind === 'cascade') {
    const rule = Object.hasOwn(CASCADE_CARDS, card.route) && CASCADE_CARDS[card.route];
    const rank = cultivation.cascadeRank ?? 0;
    if (!rule || rank !== card.rank || rank >= MAX_CASCADE_RANK ||
        (rank && cultivation.cascade !== card.route)) return false;
    const {core, supports} = cascadeParts(weapons, rule);
    const nextRank = rank ? rank + 1 : supports.length ? 2 : 1;
    if (!core || card.nextRank !== nextRank) return false;
    const doctrines = CASCADE_DOCTRINES[card.route];
    if (card.doctrine != null && (nextRank !== MAX_CASCADE_RANK || !doctrines || !Object.hasOwn(doctrines, card.doctrine))) return false;
    if (cultivation.cascade !== card.route || card.doctrine != null) cultivation.cascadeDoctrine = card.doctrine ?? null;
    cultivation.cascade = card.route;
    cultivation.cascadeRank = nextRank;
    return true;
  }

  if (kind === 'learn') {
    const copies = weapons.filter(weapon => weapon.id === id).length;
    if (weapons.length >= SLOT_COUNT || copies !== card.copies || !cultivation.getWeapon(id)) return false;
    const route = card.opensCascade;
    if (route) {
      const rule = Object.hasOwn(CASCADE_CARDS, route) && CASCADE_CARDS[route];
      if (!rule || cultivation.cascadeRank || cultivation.cascade || copies || !rule.primary.includes(id)) return false;
      const {core, supports} = cascadeParts(weapons, rule);
      if (core || !supports.length) return false;
      cultivation.cascade = route;
      cultivation.cascadeRank = 1;
      cultivation.cascadeDoctrine = null;
    }
    weapons.push(cultivation.makeWeapon(id, 1));
    cultivation.invalidateModifiers();
    return true;
  }

  const weapon = weapons.find(item => item.uid === uid);
  if (!weapon) return false;

  if (kind === 'swap') {
    if (weapons.length !== SLOT_COUNT || weapon.id !== card.previousId ||
      weapon.tier !== tier || weapon.temper !== card.previousForm || !cultivation.getWeapon(id) ||
      weapons.some(item => item.id === id)) return false;
    const slot = weapons.indexOf(weapon);
    const after = weapons.with(slot, {id,tier:1});
    if (card.compound) {
      if (card.art !== cultivation.dragonArt || weapon.tier > 2 || weapon.temper ||
        compoundSupport(cultivation, id, after)?.id !== card.compound || !keepsCompoundFoundation(cultivation, after)) return false;
    } else if (!swapConnections(cultivation, connections(cultivation,weapons), connections(cultivation,after))) return false;
    weapons[slot] = cultivation.makeWeapon(id,1);
    cultivation.invalidateModifiers();
    return true;
  }

  if (kind === 'upgrade' && weapon.tier === tier && tier < MAX_TIER) {
    weapon.tier++;
    return true;
  }
  if (kind === 'temper' && weapon.tier === tier && tier >= 2 && weapon.temper === card.previousForm &&
      (!weapon.temper || tier === MAX_TIER) && weapon.temper !== form &&
      temperingForms(weapon.id).some(item => item.id === form)) {
    weapon.temper = form;
    return true;
  }
  return false;
}
