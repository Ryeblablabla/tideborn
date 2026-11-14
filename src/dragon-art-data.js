import { FORM_BY_STAGE } from './rules.js';

export const DRAGON_ARTS = Object.freeze({
  stone: {
    name: '定潮石魄', tone: 'body', primary: ['drop', 'tail', 'stonecrest'], partners: ['drop', 'tail', 'fang', 'stonecrest', 'bankweir'],
    first: '以龙躯为中心荡出石波。触波者凝为石像，随后一同崩裂。',
    second: '石波推得更远。沧溟起，相邻石像成批碎裂时，余势可冲向另一队。',
    third: '石像崩裂时，碎石可伤及另一群敌人。',
  },
  rift: {
    name: '双爪裂空', tone: 'body', primary: ['fang'], partners: ['tail', 'coil', 'needle', 'stonecrest'],
    minForm: 2,
    first: '双爪交斩撕开裂口，逐个卷入敌人，合拢时切碎卷入的敌群。',
    second: '裂口拉长，卷入更远的敌人。',
    third: '双阙吞入两翼敌人后合击中线，横裁可借一次命中把裂口续向旁侧。',
  },
  abyss: {
    name: '墨眼吞天', tone: 'body', primary: ['coil'], partners: ['venom', 'mist', 'sporeseed', 'ember', 'tail', 'emberwings', 'windkite'],
    first: '旋风加速收成一口墨渊，卷住附近敌群，再向内吞没。',
    second: '风势加快，能卷起更远的敌人。沧溟起，卷到成群活敌会一起收口。',
    third: '风眼能从上下夹击，也能移往第二处敌群。',
  },
  frost: {
    name: '霜镜碎界', tone: 'element', primary: ['drop', 'torrent', 'bubble', 'hoarfrost'], partners: ['spark', 'thundercloud', 'hoarfrost'],
    first: '一瞬封冻周围敌群，随后震碎冰面。沾水的敌人会先结霜。',
    second: '霜域延向更远的湿敌。沧溟起，成群的冰壳可以连成冰片，一起碎裂。',
    third: '打碎湿敌的冰壳时，冰片会再震伤近旁的敌人。',
  },
  beam: {
    name: '贯日龙息', tone: 'breath', primary: ['breach', 'needle'], partners: ['needle', 'breach', 'ember', 'bubble', 'emberwings'],
    first: '从龙口吐出一道长光，横扫身前敌群。',
    second: '吐息扫过更大的角度，波及两侧更多敌人。',
    third: '焚径留下火痕，遇雨或水浪可化成蒸汽。回锋能在首扫后改向追斩。',
  },
});

export const DRAGON_ART_DOCTRINES = Object.freeze({
  reach: {
    name: '展域',
    names: {stone:'镇潮', rift:'双阙', abyss:'叠渊', frost:'封空', beam:'焚径'},
    detail: {
      stone: '石波压向外圈。成群石像碎裂后，余势可分向两处够得到的敌群。',
      rift: '双阙各卷左右两翼，两口合拢夹击中阵。侧向针锋或卷风命中过近敌，可把余劲引向另一翼。',
      abyss: '飞在千山时，上下两个墨眼分别卷敌，各自聚拢收口。',
      frost: '冰面向高低铺开。够得到的湿敌群可另结一层冰片，在主冰面之后碎裂。雷击湿冰还会向高低两路传导。',
      beam: '贴地扫过后留下火痕，后来踏入者受灼烧。雨或水浪淬火，蒸汽可沿千山缓坡攀向更高处。',
    },
  },
  echo: {
    name: '回响',
    names: {stone:'走石', rift:'横裁', abyss:'移眼', frost:'传霜', beam:'回锋'},
    detail: {
      stone: '碎石在相邻敌群间接力。成群石像碎裂后，石流可沿较长的弯路追击侧翼。',
      rift: '主裂口附近的爪击、针锋或侧扫风势可引出续裂，沿途拖住旁侧敌群。裂口合拢后再追斩残敌。',
      abyss: '墨眼卷向另一群敌人，第二批也能一起收口，并把吞下的毒与余火送过去。',
      frost: '碎冰沿湿敌接力，够得到的侧翼可另结冰片，在主冰面之后碎裂。雷遇冰浮棱时还能向侧翼传导。',
      beam: '首扫之后，转向前方活敌，用细光追斩。另一队正斜穿过来时，回锋提前扫向交会处。',
    },
  },
  thaw: {
    name: '开霁',
    names: {frost:'开霁'},
    detail: {
      frost: '沧溟起，火击碎两处相邻湿冰。若冰面外有一群活敌可达，主冰面先碎，汽浪随后横扫外群。',
    },
  },
});

export function dragonArtPreparation(weapons, art) {
  for (const id of art.primary) {
    if (!weapons.some(weapon => weapon.id === id)) continue;
    const partner = art.partners.find(other => other !== id && weapons.some(weapon => weapon.id === other));
    if (partner) return [id, partner];
  }
  const mastered = art.primary.find(id => weapons.some(weapon => weapon.id === id && weapon.tier >= 3));
  return mastered ? [mastered] : null;
}

export function practicedDragonArtPair(weapons, art) {
  for (const main of weapons) {
    if (!art.primary.includes(main.id)) continue;
    const partner = weapons.find(weapon => weapon.id !== main.id && art.partners.includes(weapon.id) &&
      (main.tier >= 2 || weapon.tier >= 2));
    if (partner) return [main, partner];
  }
  return null;
}

export function dragonArtActivation(art, stage) {
  return FORM_BY_STAGE[stage] < (art.minForm ?? 0) ? '化蛟后自动施放' : '自动施放';
}
