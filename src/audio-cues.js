// Acoustic recipes use the same three primitive excitations: filtered noise,
// damped resonators and a plucked string buffer. They need no network assets.
import { BLESSING_RAIN_AT, endingElapsedAt, GATE_BIND, LOCK_DOOR, LOCK_LANDING, STOMP_IMPACT, STOMP_LOAD, STOMP_PAW_GAP } from './heaven-finale.js';
import { LAKE_WAVE_HIT } from './ending-route.js';

const waterShot = [
  [2330,920,.135,.15],
  [1940,610,.115,.077],
  [3170,1180,.081,.053],
];

const attacks = {
  'crab-charge': 'shell',
  'claw-stamp': 'shell',
  'lantern-pulse': 'membrane',
  'lantern-fan': 'membrane',
  'shell-breaker': 'stone',
  'shell-fan': 'stone',
  'shell-backwash': 'stone',
  'starfall': 'storm',
  'sky-salvo': 'storm',
  'sky-cross': 'storm',
};

const stageVoices = ['shell','membrane','stone','storm'];

const recoveryVoices = {
  shell: { edge: [2320,910], body: [228,387,580], release: [755,250], level: .19 },
  membrane: { edge: [840,380], body: [163,271,434], release: [620,188], level: .18 },
  stone: { edge: [1920,575], body: [119,243,501], release: [880,171], level: .22 },
  storm: { edge: [3150,770], body: [93,156,358], release: [620,125], level: .23 },
};

const markedRelease = {
  'claw-stamp': { edge: [1240,670], body: [158,290] },
  'shell-breaker': { edge: [2720,950], body: [116,197] },
  starfall: { edge: [4200,1330], body: [104,162] },
};

const reactionMaterials = new Map([
  ['火水相激 · 蒸汽成云','steam'],
  ['火息化云','steam'],
  ['雷云共鸣','charge'],
  ['万毒归流 · 毒风聚煞','toxic'],
  ['风助火势 · 炎舞风暴','firewind'],
  ['合流成涡','undertow'],
]);

export function reactionMaterial(event) {
  return reactionMaterials.get(event?.name);
}

export function bossTexture(stage,attack) {
  return attacks[attack] || stageVoices[stage] || 'storm';
}

export function sceneTexture({noise,resonate},stage,movement) {
  if(stage===0){
    const sweep=.94+Math.random()*.20;
    noise(2110*sweep,1060,.25,.23,{attack:.037,q:2.4,shape:[0,1,.25,.66,.11,0]});
    noise(3690*sweep,1770,.19,.19,{delay:.15,attack:.023,q:2.15,shape:[0,.47,1,.16,0]});
    return;
  }
  if(stage===1){
    const delay=.26+Math.random()*.13;
    noise(850,260,.61,.20,{attack:.086,q:1.18,shape:[0,.45,.78,1,.40,.12,0]});
    resonate([320,567,922],.23,.112,{delay,attack:.014,bend:.67});
    noise(1240,685,.20,.082,{delay:delay+.10,attack:.025,q:1.9});
    return;
  }
  if(stage===2){
    noise(565,138,1.24,.31,{attack:.31,q:.78,shape:[0,.31,.82,1,.75,.26,.09,0]});
    noise(2190,440,.90,.19,{delay:.29,attack:.16,q:.71,shape:[0,.61,1,.59,.18,0]});
    return;
  }
  if(stage===3){
    noise(983,315,1.32,.219,{attack:.27,q:1.56,shape:[0,.36,.86,1,.47,.33,.11,0]});
    noise(355,208,.83,.11,{delay:.34,attack:.24,q:1.15,shape:[0,.27,1,.58,.12,0]});
    return;
  }
  noise(1370,2000,1.21,.16+movement*.03,{
    attack:.34,q:2.7,shape:[0,.22,.74,1,.39,.08,0],
  });
  noise(1520,921,.73,.072,{delay:.42,attack:.20,q:3.4,shape:[0,.31,1,.42,0]});
}

const evolutionPhrases = {
  1: [[0,.08,.20],[5,.33,.16]],
  2: [[0,.12,.19],[7,.28,.17],[12,.66,.14]],
  3: [[7,.09,.16],[2,.59,.17]],
  4: [[0,.06,.18],[7,.12,.14],[12,.42,.20],[14,.80,.13]],
};

export function evolutionCue(stage,root,makeVoice) {
  const {noise,resonate,pluck}=makeVoice(0);
  for(const [note,delay,level] of evolutionPhrases[stage]){
    pluck(root*2**((note+12)/12),level,delay);
  }
  if(stage===1){
    noise(1270,480,.30,.25,{attack:.039,q:1.43,shape:[0,.73,1,.44,.16,0]});
    noise(2380,920,.15,.12,{delay:.245,attack:.021,q:2.1,shape:[0,1,.46,.13,0]});
    resonate([168,286,432],.21,.123,{delay:.083,attack:.031,bend:.72});
  }else if(stage===2){
    noise(374,106,.37,.29,{attack:.041,q:1.37,shape:[0,1,.62,.37,.10,0]});
    noise(1310,4100,.43,.235,{delay:.17,attack:.073,q:1.02,shape:[0,.43,1,.61,.21,0]});
    resonate([110,183,278],.31,.148,{attack:.034,bend:1.29});
  }else if(stage===3){
    noise(740,1550,.49,.235,{attack:.145,q:1.83,shape:[0,.43,1,.52,.18,0]});
    resonate([175,278,473],.37,.123,{delay:.063,attack:.095,bend:.91});
  }else{
    makeVoice(-.43).noise(340,1830,.42,.252,{
      delay:.058,attack:.071,q:1.32,shape:[0,.62,1,.43,.13,0],
    });
    makeVoice(.43).noise(480,2600,.36,.235,{
      delay:.221,attack:.072,q:1.41,shape:[0,.57,1,.47,.11,0],
    });
    resonate([197,314,523],.42,.151,{delay:.39,attack:.057,bend:1.11});
  }
}

export function waterStroke({noise,resonate},strength,stage) {
  if(stage===1){
    noise(947,445,.27,strength*.112,{
      attack:.063,q:1.16,shape:[0,.37,.82,1,.41,.08,0],
    });
    resonate([214,417],.19,strength*.047,{delay:.060,attack:.023,bend:.69});
    return;
  }
  const sea=stage===2;
  noise(sea?1280:1680,sea?310:720,sea?.25:.18,strength*.105,{
    attack:.039,q:sea?.83:1.44,shape:[0,.25,1,.68,.26,.07,0],
  });
  noise(sea?4860:2910,sea?1190:1460,.097,strength*.059,{
    delay:.035,q:.95,shape:[0,.83,.36,.55,.08,0],
  });
  if(sea)resonate([109,176],.22,strength*.029,{attack:.026});
}

function wetSnap({noise,resonate},strength=1) {
  noise(2720,1340,.081,.155*strength,{q:2.9,shape:[0,1,.46,.09,0]});
  noise(1850,740,.094,.099*strength,{delay:.038,q:1.28,shape:[0,1,.34,.11,0]});
  noise(1190,540,.18,.066*strength,{delay:.068,attack:.027,q:.67});
  resonate([171,277,513],.105,.057*strength);
}

function eatCue({noise,resonate,pluck},stage,rank,event,variation) {
  const pitch=.96+variation*.036;
  const weight=.85+variation*.064;
  if(event?.battleLoot&&rank<2&&stage>=2){
    noise(2280*pitch,830,.092,.142*weight,{
      attack:.010,q:3.22,shape:[0,1,.38,.09,0],
    });
    resonate([218,421,773],.109,.091*weight,{delay:.018,attack:.013,bend:.79});
    return;
  }
  if(stage>=3){
    resonate(rank>=2?[477*pitch,737,1193]:[366*pitch,591*pitch,962],.164,.157*weight,{
      attack:.026,bend:1.21,
    });
    noise(2520,1110,.10,.102*weight,{delay:.051,attack:.027,q:1.86});
  }else if(stage===2){
    const shell=rank>0;
    noise(shell?2760*pitch:962*pitch,shell?905:310,.11,.171*weight,{
      attack:.016,q:shell?3.8:1.46,shape:[0,1,.61,.20,0],
    });
    if(shell)resonate([246,421,673*pitch],.16,.14*weight,{
      delay:.043,attack:.011,bend:.64,
    });
    else noise(1730,651,.115,.076*weight,{delay:.045,attack:.030,q:1.43});
  }else if(stage===1){
    noise(1640*pitch,504,.16,.195*weight,{
      attack:.037,q:1.42,shape:[0,.42,1,.49,.13,0],
    });
    resonate([257*pitch,479],.155,.142*weight,{delay:.033,attack:.020,bend:.62});
    if(rank===1)noise(2350,820,.079,.093*weight,{delay:.064,attack:.009,q:3.1});
  }else{
    const shrimp=rank===1;
    noise((shrimp?2480:2880)*pitch,shrimp?1100:1390,.069,.183*weight,{
      attack:.010,q:2.8,shape:[0,1,.49,.10,0],
    });
    if(shrimp)noise(3460*pitch,1480,.062,.146*weight,{
      delay:.047,attack:.009,q:3.1,shape:[0,1,.36,.08,0],
    });
    resonate([482*pitch,715],.078,.088*weight,{attack:.012,bend:.73});
  }
  if(rank>=2)pluck(307+rank*43,.062,.12);
}

function scrape({noise,resonate},strength=1) {
  noise(2350,910,.15,.142*strength,{q:2.21,shape:[0,1,.33,.72,.22,0]});
  noise(3940,1540,.081,.12*strength,{delay:.028,q:2.6,shape:[0,1,.33,.05,0]});
  resonate([184,317,723],.16,.071*strength,{delay:.032});
}

function onWater(stage,event) {
  return stage<2||stage===2&&(event?.y??1.2)<1.8;
}

function seaSurface(kind,{noise,resonate},weight,event) {
  const speed=Math.min(1,(event?.speed??4)/6.67);
  const vertical=Math.min(1,(event?.vertical??0)/4);
  if(kind==='dash'){
    noise(1970,4680,.157,.27*weight,{
      attack:.018,q:1.32,shape:[0,.71,1,.52,.18,0],
    });
    noise(4260,1150,.24,.205*weight,{
      delay:.054,attack:.025,q:1.07,shape:[0,.54,1,.61,.19,0],
    });
    noise(748,366,.17,.104*weight,{attack:.040,q:1.07});
    return;
  }
  if(kind==='launch'){
    noise(620,2620+vertical*1020,.29,.37*weight,{
      attack:.046,q:1.73,shape:[0,.36,.73,1,.38,.08,0],
    });
    noise(4150,2290,.17,.23*weight,{
      delay:.069,attack:.034,q:1.83,shape:[0,.52,1,.32,0],
    });
    resonate([183,327],.23,.161*weight,{attack:.034,bend:1.43});
    return;
  }
  const waterWeight=weight*(.85+vertical*.37);
  noise(343,82,.51+vertical*.10,.36*waterWeight,{
    type:'lowpass',attack:.038,shape:[0,1,.75,.54,.24,.08,0],
  });
  resonate([81,133,174],.35,.19*waterWeight,{attack:.029,bend:.62});
  noise(5430,2040,.29,.267*weight*(.80+speed*.20),{
    delay:.115,attack:.034,q:1.07,shape:[0,.54,1,.63,.25,.06,0],
  });
  noise(2520,690,.42,.15*weight,{
    delay:.27,attack:.053,q:1.39,shape:[0,.68,.36,.57,.25,.07,0],
  });
}

export function surfaceCue(kind,voice,{stage=0,weight=1,event}={}) {
  const {noise,resonate}=voice;
  const water=onWater(stage,event);
  if(kind==='dashReady'){
    if(water){
      resonate([632,951],.103,.152*weight,{bend:.69,attack:.010});
      noise(1780,530,.096,.144*weight,{q:3.1,shape:[0,1,.46,.10,0]});
      noise(3200,1270,.075,.103*weight,{delay:.046,q:1.6,shape:[0,.63,1,.22,0]});
    }else{
      resonate([419,668],.104,.095*weight,{bend:1.12,attack:.012});
      noise(2740,1140,.119,.13*weight,{q:1.39,shape:[0,.48,1,.32,0]});
    }
    return;
  }
  const seaContact=(kind==='launch'||kind==='entry')&&Number.isFinite(event?.vertical);
  if(stage===2&&(seaContact||kind==='dash'&&water)){
    seaSurface(kind,voice,weight,event);
    return;
  }
  if(kind==='entry'){
    if(event?.strike==='water'){
      noise(1620,470,.32,.24*weight,{attack:.047,q:1.37,shape:[0,.47,1,.49,.12,0]});
      resonate([143,257,386],.23,.15*weight,{delay:.026,bend:.68});
      return;
    }
    noise(535,101,.45,.39*weight,{type:'lowpass',attack:.025,shape:[0,.67,1,.51,.18,.06,0]});
    resonate([86,132,211],.27,.19*weight,{bend:.59});
    noise(3590,650,.63,.38*weight,{shape:[0,.86,.58,1,.42,.25,.08,0],q:.87});
    noise(4210,1190,.40,.16*weight,{delay:.19,shape:[0,.72,.34,.46,.21,0]});
    noise(2480,570,.37,.07*weight,{delay:.42,attack:.052,q:1.22});
    return;
  }
  const air=!water;
  noise(air?395:582,air?1430:2450,.33,.24*weight,{attack:.074,q:.68,shape:[0,.22,.6,1,.38,0]});
  noise(air?2030:4680,air?810:1340,.21,.16*weight,{
    delay:.083,attack:.033,q:.87,shape:[0,.3,1,.65,.26,0],
  });
  if(!air) {
    resonate([122,207],.19,.075*weight,{bend:.73});
    noise(2890,810,.19,.086*weight,{delay:.15,attack:.02,q:1.54});
  }
}

function shedTail(voice,stage,event) {
  const lost=event?.lost??0;
  if(!(lost>0))return;
  const {noise,resonate}=voice;
  const weight=Math.min(1.24,.44+Math.sqrt(lost)*.27);
  const time=Math.min(.46,.23+lost*.037);
  const water=onWater(stage,event);
  noise(water?2260:1570,water?560:330,time,.26*weight,{
    delay:.13,attack:.027,q:water?1.6:1.15,shape:[0,.63,1,.31,.58,.19,0],
  });
  resonate(water?[138,267,542]:[109,181,317],time*.83,.21*weight,{
    delay:.17,attack:.031,bend:.57,
  });
  if(water)noise(2730,940,.10,.12*weight,{
    delay:.19+time*.37,q:2.5,shape:[0,1,.53,.10,0],
  });
}

function headHurt({noise,resonate},event,sections) {
  const size=Math.max(.68,Math.min(1.48,Math.sqrt(sections/21)));
  const pressure=Math.min(1.18,.67+Math.sqrt(event?.amount??24)*.058);
  noise(1760/size,1030/size,.097,.196*pressure,{
    attack:.008,q:2.33,shape:[0,1,.43,.14,0],
  });
  resonate([365/size,587/size,912/size],.139+size*.03,.27*pressure,{
    attack:.011,bend:.71,
  });
  noise(875/size,430/size,.18,.146*pressure,{
    delay:.041,attack:.029,q:1.94,shape:[0,.51,1,.39,.09,0],
  });
}

function projectileCue({noise,resonate},stage,event,accent) {
  const id=event?.kind||event?.weapon;
  const pitch=.94+Math.random()*.12;
  const mass=Math.min(1.24,1+Math.max(0,(event?.count??1)-1)*.045);
  if(accent){
    // A second weapon gets only its identifying edge, with its full
    // pressure and tail reserved for the next normal volley.
    const edges={
      bubble:[2330,920,.095,2.3],mist:[2810,1130,.143,1.15],
      needle:[5900,2070,.082,5.1],breach:[1560,560,.168,.88],
    };
    const edge=edges[id];
    if(edge){
      const [start,finish,duration,q]=edge;
      noise(start*pitch,finish,duration,.22,{
        delay:.04,attack:.018,q,shape:[0,1,.54,.17,0],
      });
    }
    return;
  }
  if(id==='bubble'||!id&&stage===0){
    for(const [index,[start,finish,duration,level]] of waterShot.entries()){
      noise(start*pitch,finish*pitch,duration,level*mass,{
        delay:index*.036,q:2.3,shape:[0,.37,1,.30,.07,0],
      });
    }
    resonate([394*pitch,578*pitch],.15,.084*mass,{bend:.57});
  }else if(id==='mist'||!id&&stage===1){
    noise(2550*pitch,750,.26,.17*mass,{attack:.026,q:.74,shape:[0,.43,1,.39,.66,.22,.27,0]});
    noise(3890,1450*pitch,.26,.086*mass,{delay:.035,q:1.17,attack:.041,shape:[0,.62,.35,.92,.17,0]});
    resonate([123,197],.20,.072,{bend:.78});
  }else if(id==='needle'){
    noise(5900*pitch,2070,.11,.216,{attack:.010,q:5.1,shape:[0,1,.46,.11,0]});
    resonate([705*pitch,1320*pitch],.092,.068,{bend:.81});
  }else if(id==='breach'){
    noise(460,165,.40,.29*mass,{type:'lowpass',attack:.057,shape:[0,.57,1,.69,.37,.10,0]});
    noise(2670*pitch,760,.30,.234,{delay:.038,q:.82,attack:.041,shape:[0,1,.53,.63,.24,0]});
    noise(4430,1570,.17,.12,{delay:.14,q:1.8,shape:[0,.64,.31,.82,.13,0]});
    resonate([97,160,263],.26,.115,{bend:.74});
  }else{
    const high=stage>=3;
    noise(high?1760:1120,high?630:350,.32,.22,{attack:.043,q:.71,shape:[0,.27,1,.71,.43,.14,0]});
    noise(high?5010:3180,high?1460:920,.23,.16,{delay:.031,q:.80,shape:[0,.32,.81,1,.31,.12,0]});
    resonate(high?[122,185,293]:[91,146,221],.29,.084,{bend:.72});
  }
}

export function attackCue(kind,voice,{stage,rank,event,tailVoice=voice,headSize=0,contactVoice=voice,variation=1,accent=false}) {
  const {noise,resonate}=voice;
  if(kind==='eat'){
    eatCue(voice,stage,rank,event,variation);
    return;
  }
  if(kind==='recover'){
    const wet=onWater(stage,event);
    const weight=Math.min(1,.68+(event?.mass??0)*.095);
    noise(wet?460:720,wet?1940:1710,.17,.22*weight,{
      attack:.047,q:2.1,shape:[0,.43,1,.54,.16,0],
    });
    resonate(wet?[277,473,721]:[327,566,773],.24,.128*weight,{
      delay:.054,attack:.033,bend:1.27,
    });
    return;
  }
  if(kind==='bite'){
    if(event?.hit===false){
      noise(1460,590,.16,.092,{attack:.025,q:1.1});
      return;
    }
    wetSnap(voice,1.1);
    return;
  }
  if(kind==='tail'){
    noise(565,1460,.20,.22,{attack:.036,q:1.09,shape:[0,.36,1,.59,.15,0]});
    if(event?.hit){
      contactVoice.resonate([88,151,249],.24,.195,{delay:.045,attack:.018,bend:.61});
      contactVoice.noise(430,172,.21,.155,{delay:.033,attack:.018,q:1.18});
    }
    return;
  }
  if(kind==='claw'){
    if(event?.hit===undefined){
      scrape(voice,1);
      return;
    }
    noise(2990,1370,.103,.151,{attack:.014,q:1.25,shape:[0,.74,1,.26,.07,0]});
    if(event.hit){
      contactVoice.noise(4370,1840,.092,.199,{
        delay:.018,q:2.96,shape:[0,1,.43,.12,0],
      });
      contactVoice.resonate([284,481,742],.13,.126,{delay:.022,attack:.011,bend:.82});
    }
    return;
  }
  if(kind==='hit'){
    if(event?.guarded){
      noise(2110,650,.087,.123,{q:3.18,shape:[0,1,.33,.08,0]});
      resonate([253,509,793],.11,.065,{bend:.81});
    }else if(event?.source==='bubble'){
      noise(2180,710,.103,.12,{q:2.6,shape:[0,.38,1,.23,0]});
      resonate([421,611],.082,.061,{bend:.59});
    }else{
      noise(3680,880,.152,.095,{q:.9,shape:[0,.73,.33,.67,.26,0]});
      resonate([130,221],.137,.033);
    }
    return;
  }
  if(kind==='kill'){
    noise(940,290,.25,.13,{attack:.025,shape:[0,.91,.72,.30,.12,0]});
    resonate([101,168,299],.23,.11,{bend:.69});
    return;
  }
  if(kind==='hurt'){
    if(headSize>0)headHurt(voice,event,headSize);
    else{
      scrape(voice,.7);
      noise(752,174,.32,.29,{type:'lowpass',shape:[0,1,.69,.43,.18,0]});
      resonate([89,124,217],.22,.18,{bend:.72});
    }
    shedTail(tailVoice,stage,event);
    return;
  }
  projectileCue(voice,stage,event,accent);
}

export function reactionCue(material,{noise,resonate}) {
  if(material==='steam'){
    noise(5120,1610,.247,.293,{attack:.047,q:1.24,shape:[0,.37,1,.63,.29,.07,0]});
    noise(1560,520,.33,.138,{delay:.078,attack:.055,q:1.62,shape:[0,.43,1,.37,.09,0]});
  }else if(material==='charge'){
    for(const [delay,start] of [[.027,2680],[.083,4050],[.135,2210]]){
      noise(start,1120,.072,.169,{delay,attack:.011,q:3.52,shape:[0,1,.29,.07,0]});
    }
    resonate([184,357,574],.242,.153,{delay:.072,attack:.040,bend:1.12});
  }else if(material==='toxic'){
    resonate([296,517,711],.234,.204,{attack:.035,bend:.56});
    noise(1420,316,.246,.16,{delay:.032,attack:.023,q:2.16,shape:[0,1,.47,.65,.12,0]});
  }else if(material==='undertow'){
    noise(1530,274,.33,.19,{attack:.032,q:1.42,shape:[0,.55,1,.56,.14,0]});
    resonate([119,193],.37,.10,{delay:.064,attack:.047,bend:.57});
  }else{
    noise(503,2450,.265,.247,{delay:.06,attack:.058,q:1.38,shape:[0,.29,.81,1,.32,.07,0]});
    noise(3870,1410,.126,.145,{delay:.166,attack:.018,q:1.82,shape:[0,.66,1,.25,0]});
  }
}

function bossWarning(texture,voice,duration) {
  const {noise,resonate}=voice;
  const lead=Math.max(.28,Math.min(1.9,duration||.96));
  if(texture==='shell'){
    for(const [i,offset] of [0,.32,.69].entries()){
      noise(1670+i*410,820+i*140,.112,.112+i*.025,{
        delay:lead*offset,q:3.45,shape:[0,1,.27,.09,0],
      });
      resonate([198+i*19,403],.115,.058,{delay:lead*offset});
    }
    noise(680,1250,lead*.77,.106,{attack:lead*.17,delay:lead*.10,q:1.64});
  }else if(texture==='membrane'){
    noise(251,780,lead*.94,.218,{attack:lead*.31,q:2.6,shape:[0,.17,.45,.8,.51,1,.22,0]});
    resonate([114,223,342],lead*.86,.099,{attack:lead*.29,bend:1.36});
    noise(1430,2230,.13,.088,{delay:lead*.68,q:2.2,shape:[0,.56,1,.09,0]});
  }else if(texture==='stone'){
    noise(197,1120,lead*.9,.23,{attack:lead*.16,q:1.45,shape:[0,.31,.23,.57,.35,1,.42,0]});
    resonate([78,151,312],lead*.92,.115,{attack:lead*.23,bend:1.17});
    noise(2190,610,.14,.137,{delay:lead*.74,q:3.6,shape:[0,1,.23,.06,0]});
  }else{
    noise(302,2510,lead,.24,{attack:lead*.23,q:1.38,shape:[0,.14,.25,.41,.61,.48,.95,.12,0]});
    resonate([83,131,287],lead*.86,.128,{attack:lead*.21,bend:1.46});
    for(const [i,delay] of [lead*.36,lead*.63,lead*.85].entries()){
      noise(1920+i*760,970,.082,.066+i*.027,{delay,q:2.5,shape:[0,1,.16,0]});
    }
  }
}

function bossMove(texture,voice,attack) {
  const {noise,resonate}=voice;
  const marked=markedRelease[attack];
  if(marked){
    // The stronger contact comes from the resolved hazard's position.
    noise(...marked.edge,.13,.18,{attack:.023,q:1.7,shape:[0,.78,1,.35,.08,0]});
    resonate(marked.body,.15,.086,{attack:.021,bend:.68});
    return;
  }
  if(texture==='shell'){
    const stamp=attack==='claw-stamp';
    noise(680,2150,stamp?.21:.42,.285,{attack:.038,q:.72,shape:[0,.27,1,.69,.29,.15,0]});
    scrape(voice,stamp?1.18:.86);
    resonate([93,156,309],.24,.16,{bend:.71});
  }else if(texture==='membrane'){
    noise(1190,243,.40,.282,{q:2.62,shape:[0,.41,1,.77,.16,.51,.12,0]});
    resonate([126,243,375],.44,.24,{bend:.72});
    noise(2840,680,.30,.097,{delay:.15,attack:.041,q:.90});
  }else if(texture==='stone'){
    noise(2950,530,.37,.32,{q:1.44,shape:[0,1,.37,.66,.21,0]});
    resonate([79,136,237,437],.47,.24,{bend:.69});
    noise(1340,330,.41,.137,{delay:.14,attack:.045,q:.79});
  }else{
    noise(4860,610,.29,.36,{q:.81,shape:[0,1,.26,.62,.27,0]});
    noise(6950,2200,.093,.17,{delay:.051,q:1.6,shape:[0,1,.37,0]});
    resonate([68,108,192],.46,.21,{bend:.62});
  }
}

function bossAfter(texture,voice,duration=0) {
  const {noise,resonate}=voice;
  const length=Math.max(.33,Math.min(1.52,duration||.81));
  if(texture==='shell'){
    noise(1170,300,length*.75,.114,{q:1.16,attack:.025,shape:[0,.72,.41,.55,.18,.08,0]});
    resonate([125,239],length*.65,.074,{bend:.76});
  } else if(texture==='membrane'){
    noise(527,200,length,.142,{q:2.51,attack:.077,shape:[0,.37,.81,.39,.52,.16,0]});
    resonate([99,184],length,.104,{attack:.086,bend:.82});
  } else if(texture==='stone'){
    noise(510,124,length,.20,{type:'lowpass',attack:.056,shape:[0,.77,.61,.39,.20,.06,0]});
    resonate([76,149,254],length*.89,.106,{bend:.69});
  }else{
    noise(371,61,length,.46,{type:'lowpass',attack:.094,shape:[0,.44,1,.55,.67,.25,.11,0]});
    resonate([61,97,147],length*.95,.178,{attack:.055,bend:.60});
  }
}

function bossContact(texture,voice,event) {
  const {noise,resonate}=voice;
  const hit=event?.hit!==false;
  const weight=hit?1:.65;
  if(texture==='storm'){
    noise(6270,1120,.27,.36*weight,{q:.93,shape:[0,1,.49,.24,.35,.09,0]});
    resonate([77,128,214],.38,.23*weight,{bend:.59});
  }else if(texture==='stone'){
    noise(1750,220,.31,.31*weight,{q:1.51,shape:[0,1,.34,.59,.16,0]});
    resonate([87,158,271],.35,.21*weight,{bend:.71});
  }else if(texture==='membrane'){
    noise(876,211,.25,.27*weight,{q:2.12,shape:[0,.65,1,.42,.19,0]});
    resonate([140,246,319],.28,.163*weight,{bend:.72});
  }else{
    scrape(voice,.95*weight);
    resonate([105,173,291],.19,.135*weight,{bend:.71});
  }
}

function bossRecovery(texture,{noise,resonate},duration) {
  const {edge,body,release,level}=recoveryVoices[texture];
  const length=Math.max(.28,Math.min(1.03,duration||.72));
  noise(...edge,.13,level,{
    attack:.015,q:2.6,shape:[0,1,.51,.18,0],
  });
  resonate(body,.22,level*.86,{delay:.023,attack:.015,bend:.65});
  noise(...release,length*.83,level*.88,{
    delay:.071,type:'lowpass',q:.83,attack:.037,shape:[0,1,.71,.43,.18,.06,0],
  });
}

function shellBackwashCue(kind,voice,event) {
  const {noise,resonate}=voice;
  if(event.phase==='windup'||kind==='warning'){
    const lead=event.duration||1.38;
    noise(1660,650,.16,.224,{attack:.014,q:3.6,shape:[0,1,.43,.12,0]});
    resonate([284,475,687],.24,.142,{attack:.019,bend:.67});
    noise(420,1320,lead*.66,.247,{
      delay:lead*.20,attack:lead*.22,q:1.86,shape:[0,.35,.61,.91,.57,.13,0],
    });
    noise(2700,1100,.119,.133,{
      delay:lead*.74,attack:.017,q:3.23,shape:[0,.87,1,.31,0],
    });
  }else if(kind==='bossWave'){
    const travel=Math.max(.35,Math.min(1.2,event.life||.94));
    noise(636,179,travel*.62,.302,{
      attack:.052,q:1.12,shape:[0,.59,1,.68,.42,.12,0],
    });
    resonate([103,174,268],.32,.175,{attack:.035,bend:.68});
    noise(3520,810,travel*.47,.256,{
      delay:.091,attack:.079,q:1.06,shape:[0,.46,1,.52,.22,0],
    });
  }else if(kind==='bossImpact'){
    noise(530,152,.27,.207,{type:'lowpass',attack:.022,shape:[0,1,.64,.28,.08,0]});
    noise(3510,810,.206,.265,{delay:.045,attack:.018,q:1.44,shape:[0,1,.49,.23,.07,0]});
    resonate([101,163,246],.25,.147,{attack:.018,bend:.62});
  }else if(event.phase==='recovery'){
    bossRecovery('stone',voice,event.duration);
  }
}

function skyCrossStrike({noise,resonate},event) {
  const low=event.layer==='low',force=event.hit?1:.66;
  if(low){
    noise(1160,280,.234,.29*force,{
      attack:.020,q:1.22,shape:[0,1,.53,.32,.12,0],
    });
    resonate([107,184,319],.25,.29*force,{delay:.014,attack:.024,bend:.68});
    return;
  }
  noise(5270,1580,.128,.39*force,{
    attack:.013,q:2.12,shape:[0,1,.56,.18,.07,0],
  });
  resonate([410,698,1120],.174,.205*force,{delay:.026,attack:.014,bend:.81});
}

function lanternPulseCue(kind,{noise,resonate},event) {
  if(kind==='warning'||event.phase==='windup'){
    noise(428,1000,.284,.234,{
      attack:.060,q:2.38,shape:[0,.33,1,.65,.25,.07,0],
    });
    resonate([233,397,691],.232,.196,{delay:.034,attack:.034,bend:1.28});
    return;
  }
  if(kind==='bossImpact'&&event.hit){
    noise(812,254,.187,.247,{
      attack:.019,q:2.02,shape:[0,1,.58,.34,.09,0],
    });
    noise(3120,810,.165,.17,{
      delay:.052,attack:.015,q:1.29,shape:[0,1,.48,.17,0],
    });
    resonate([156,274,408],.19,.137,{attack:.027,bend:.74});
  }
}

export function bossCue(kind,voice,{stage,event}) {
  if(event?.attack==='lantern-pulse'){
    lanternPulseCue(kind,voice,event);
    return;
  }
  if(event?.attack==='shell-backwash'){
    shellBackwashCue(kind,voice,event);
    return;
  }
  if(event?.attack==='sky-cross'&&kind==='bossImpact'){
    skyCrossStrike(voice,event);
    return;
  }
  const texture=bossTexture(stage,event?.attack);
  if(kind==='boss'){
    bossAfter(texture,voice,1.24);
    bossWarning(texture,voice,.64);
  }else if(kind==='warning'||event?.phase==='windup'){
    bossWarning(texture,voice,event?.duration);
  }else if(event?.phase==='recovery'){
    bossRecovery(texture,voice,event?.duration);
  }else if(kind==='bossImpact'||kind==='thunder'){
    const hit=event?.hit!==false;
    bossContact(texture,voice,event);
    if(kind==='thunder')bossAfter(texture,voice,1.35);
    if(event?.surface===true||event?.surface==='water'||stage<2)surfaceCue('entry',voice,{stage,weight:hit?.55:.33});
  }else{
    bossMove(texture,voice,event?.attack);
  }
}

export function airThreatCue(kind,{noise,resonate},{rear}) {
  if(kind==='airDive'){
    noise(rear?1750:2630,1060,.13,.26,{attack:.014,q:1.7,shape:[0,1,.47,.21,0]});
    resonate(rear?[221,354]:[314,479],.24,.18,{delay:.045,attack:.022,bend:.55});
  }else{
    noise(rear?560:820,1940,.22,.22,{attack:.024,q:.93,shape:[0,.58,1,.38,.15,0]});
    resonate([126,207,316],.19,.14,{delay:.077,attack:.026,bend:.71});
  }
}

export function bankPincerCue({noise,resonate},side) {
  if(side){
    for(const [delay,start,finish] of [[0,2110,1180],[.095,2870,1490]]){
      noise(start,finish,.069,.23,{
        delay,attack:.010,q:3.4,shape:[0,1,.53,.10,0],
      });
    }
    resonate([438,747],.119,.092,{delay:.094,attack:.009,bend:.69});
    return;
  }
  noise(2360,1160,.123,.251,{
    attack:.018,q:2.85,shape:[0,.69,1,.39,.10,0],
  });
  resonate([345,607],.142,.125,{delay:.022,attack:.013,bend:.71});
}

export function dartRushCue(phase,{noise,resonate}) {
  if(phase==='windup'){
    noise(810,2960,.185,.218,{
      attack:.032,q:3.65,shape:[0,.58,1,.66,.22,0],
    });
    resonate([536,917],.139,.103,{delay:.035,attack:.025,bend:1.42});
    return;
  }
  noise(4120,760,.148,.241,{
    attack:.010,q:1.55,shape:[0,1,.54,.21,.08,0],
  });
  resonate([167,296],.129,.107,{attack:.014,bend:.68});
}

export function fieldCue(kind,voice) {
  const {noise,resonate}=voice;
  if(kind==='storm'){
    noise(382,1550,.66,.219,{attack:.12,q:.78,shape:[0,.23,.53,1,.55,.66,.26,0]});
    noise(2480,420,.46,.114,{delay:.20,attack:.076,q:.81});
    resonate([88,147],.56,.074,{attack:.082,bend:.86});
  }else if(kind==='fire'){
    noise(3400,630,.53,.24,{q:1.03,shape:[0,1,.56,.79,.41,.49,.13,0]});
    noise(4150,1710,.22,.119,{delay:.071,q:2.37,shape:[0,.34,.79,.23,.67,.14,0]});
    resonate([108,179],.33,.076,{bend:.64});
  }else if(kind==='ring'){
    resonate([144,227,367],.54,.175,{attack:.032,bend:.66});
    noise(2270,430,.49,.204,{q:.97,shape:[0,.47,1,.63,.29,.46,.15,0]});
    noise(800,245,.30,.106,{delay:.24,q:1.1,attack:.038});
  }else{
    noise(kind==='arc'?3760:4840,870,kind==='arc'?.19:.34,.23,{
      q:.90,shape:[0,.87,.35,.75,.23,.43,.09,0],
    });
    resonate([132,222,373],.24,.108,{bend:.63});
  }
}

function ironLink({noise,resonate},delay,weight,pitch=1) {
  noise(3020*pitch,1040,.098,.24*weight,{
    delay,attack:.011,q:3.2,shape:[0,1,.34,.06,0],
  });
  resonate([258*pitch,619*pitch,977*pitch],.30,.21*weight,{
    delay:delay+.013,attack:.022,bend:.93,
  });
}

function relayWarning({noise,resonate},duration,light=false) {
  const length=Math.max(.45,Math.min(2.4,duration??1.55));
  const weight=light?.67:1;
  noise(420,2760,length*.88,.21*weight,{
    delay:length*.08,attack:length*.30,q:1.3,shape:[0,.15,.45,.36,.77,1,.17,0],
  });
  resonate([131,186,315],length*.74,.125*weight,{
    delay:length*.19,attack:length*.26,bend:1.19,
  });
  ironLink({noise,resonate},length*.66,.38*weight,1.45);
}

function gateThunder({noise,resonate},force=1,low=95) {
  noise(5960,1280,.24,.35*force,{
    attack:.012,q:1.33,shape:[0,1,.50,.65,.23,.05,0],
  });
  resonate([low,low*1.79,low*3.47],.56,.26*force,{
    delay:.022,attack:.023,bend:.56,
  });
  noise(510,97,.76,.26*force,{
    delay:.064,type:'lowpass',attack:.061,q:.82,shape:[0,.55,1,.69,.38,.08,0],
  });
}

export function endingCue(kind,voice,event={}) {
  const {noise,resonate,pluck}=voice;
  switch (kind==='endingRoute'?event?.kind:kind) {
    case 'chain-seen':
      ironLink(voice,0,.34);
      break;
    case 'chain-rattle':
      noise(326,820,LAKE_WAVE_HIT,.17,{attack:.24,q:.87,shape:[0,.27,.55,.76,1,.58,.08,0]});
      ironLink(voice,LAKE_WAVE_HIT,.69);
      ironLink(voice,LAKE_WAVE_HIT+.115,.49,.78);
      noise(1080,250,.31,.11,{delay:LAKE_WAVE_HIT,attack:.04,q:1.1});
      break;
    case 'sea-coil':
      noise(570,1470,.44,.14,{
        attack:.083,q:1.2,shape:[0,.40,.68,1,.33,0],
      });
      ironLink(voice,.24,.45,.91);
      break;
    case 'gate-open':
      noise(444,93,.93,.32,{
        type:'lowpass',attack:.062,q:1.1,shape:[0,.65,1,.81,.51,.20,.06,0],
      });
      noise(3050,770,.71,.29,{
        delay:.083,attack:.046,q:1.36,shape:[0,.76,1,.62,.41,.10,0],
      });
      noise(960,235,.24,.21,{delay:.38,attack:.012,q:1.68,shape:[0,1,.48,.21,.09,0]});
      for(const [delay,weight,pitch] of [[.32,.51,.80],[.40,1,.94],[.54,.62,1.11],[.81,.33,1.36]]){
        ironLink(voice,delay,weight,pitch);
      }
      break;
    case 'relay-lock':
      relayWarning(voice,event.duration,true);
      break;
    case 'relay-escape':
      noise(520,1660,.30,.13,{attack:.028,q:1.06,shape:[0,.44,1,.51,.16,0]});
      break;
    case 'relay-strike':
      gateThunder(voice,event.hit===false?.59:1,102);
      if(event.hit!==false){
        for(const [delay,weight,pitch] of [[.14,.75,.83],[.29,.63,1.04],[.46,.58,1.26],[.64,.51,1.56],[.82,.44,1.82],[.94,.39,2.05]]){
          ironLink(voice,delay,weight,pitch);
        }
        noise(2080,650,.19,.22,{delay:1.035,attack:.008,q:2.1,shape:[0,1,.51,.15,0]});
        resonate([68,124,196],.62,.14,{delay:1.09,attack:.062,bend:.69});
      }
      break;
    case 'finaleWarning':
      if(event.kind==='layers'){
        ironLink(voice,.015,.64,.75);
        ironLink(voice,.25,.57,1.45);
      }
      relayWarning(voice,event.duration);
      break;
    case 'finaleStrike':
      gateThunder(voice,event.hit?1.16:.82,event.kind==='layers'?94:70);
      if(event.hit)noise(1840,440,.35,.19,{
        delay:.095,attack:.035,q:1.39,shape:[0,.67,1,.46,.22,0],
      });
      break;
    case 'finaleGate':
      noise(242,575,.86,.19,{
        type:'lowpass',attack:.115,q:1.24,shape:[0,.31,.8,1,.55,.12,0],
      });
      ironLink(voice,.61,.39,.82);
      break;
    case 'finaleBind': {
      const {ankle,wing,latch}=GATE_BIND;
      const at = age => endingElapsedAt('lock', age, 'locked');
      for(const [delay,weight,pitch] of [[at(.25),.42,.75],[at(ankle-.29),.39,.93],
        [at(ankle+.28),.53,.87],[at(wing-.29),.44,.79],[at(latch+.70),.25,.74]]){
        ironLink(voice,delay,weight,pitch);
      }
      noise(330,880,.86,.17,{
        delay:at(.30),attack:.127,q:1.05,shape:[0,.28,.68,1,.63,.15,0],
      });
      noise(295,1400,.82,.24,{
        delay:at(wing-.59),attack:.159,q:.94,shape:[0,.18,.66,1,.50,.19,0],
      });
      noise(517,151,.96,.16,{
        delay:at(latch+.30),type:'lowpass',attack:.158,shape:[0,.24,.76,1,.52,.17,0],
      });
      for(const [delay,weight] of [[15.13,.18],[18.22,.16]]){
        noise(225,850,.54,weight,{delay,attack:.154,q:1.12,shape:[0,.29,.87,1,.59,.16,0]});
      }
      noise(1070,420,.33,.064,{delay:17.83,attack:.13,q:1.23,shape:[0,.34,1,.71,.19,0]});
      noise(810,254,.46,.17,{delay:5.65,attack:.034,q:1.34,shape:[0,.43,1,.69,.26,0]});
      noise(435,122,.53,.25,{delay:6.94,type:'lowpass',attack:.025,q:1.08,shape:[0,1,.72,.37,.09,0]});
      resonate([73,136,221],.55,.16,{delay:6.97,attack:.016,bend:.69});
      ironLink(voice,9.99,.59,.67);
      noise(391,116,.75,.14,{delay:10.04,type:'lowpass',attack:.044,q:1.18,shape:[0,.64,1,.72,.33,.04,0]});
      ironLink(voice,LOCK_DOOR.grip,.48,1.14);
      noise(482,152,LOCK_DOOR.close-LOCK_DOOR.pull,.22,{
        delay:LOCK_DOOR.pull,type:'lowpass',attack:.14,q:1.52,shape:[0,.22,.63,.86,1,.32,0],
      });
      noise(428,158,.44,.13,{delay:LOCK_LANDING.catch,type:'lowpass',attack:.028,q:1.06,shape:[0,.83,1,.45,.15,0]});
      break;
    }
    case 'finaleCuff': {
      const wing=event.joint==='wing';
      ironLink(voice,.008,wing?1:.85,wing?.81:1.10);
      noise(1840,wing?295:490,.24,wing?.25:.19,{delay:.047,attack:.011,q:1.47});
      resonate(wing?[73,138,297]:[128,237],.31,.21,{delay:.044,attack:.018,bend:.79});
      break;
    }
    case 'finaleLatch':
      ironLink(voice,0,1,.71);
      resonate([51,87,168],.92,.28,{delay:.033,attack:.032,bend:.51});
      noise(336,91,.74,.25,{delay:.065,type:'lowpass',attack:.049,shape:[0,.62,1,.58,.19,0]});
      break;
    case 'finaleCourtStep':
      noise(event.side?674:526,172,.23,.23,{attack:.012,q:1.16,shape:[0,1,.68,.28,.08,0]});
      noise(2100,570,.13,.09,{delay:.025,attack:.019,q:1.71,shape:[0,.62,1,.37,0]});
      break;
    case 'finaleInscription':
      resonate([148,310,526,860],1.46,.29,{attack:.048,bend:.993});
      for(const [index,pitch] of [294,392,440,587].entries())pluck(pitch,.16-index*.014,.34+index*.20);
      noise(1290,410,.124,.073,{delay:1.51,attack:.018,q:1.32});
      break;
    case 'finaleSeal':
      noise(670,120,.22,.19,{type:'lowpass',attack:.009,q:1.13,shape:[0,1,.58,.24,.07,0]});
      resonate([118,259],.34,.13,{delay:.021,attack:.017,bend:.85});
      noise(2300,950,.18,.07,{delay:.077,attack:.025,q:.86,shape:[0,.34,.81,1,.23,0]});
      break;
    case 'finaleRain': {
      const press=endingElapsedAt('blessing',BLESSING_RAIN_AT);
      const delayAt=age=>endingElapsedAt('blessing',age)-press;
      const riverAt=endingElapsedAt('blessing',3.25)-press+endingElapsedAt('epilogue',.92,'ordained');
      noise(480,1700,.38,.27,{
        attack:.065,q:1.05,shape:[0,.28,1,.75,.31,.08,0],
      });
      noise(2280,1240,riverAt+.65,.19,{
        delay:delayAt(1.35),attack:.16,q:.67,shape:[0,.30,.76,1,.90,.71,.38,.08,0],
      });
      noise(716,385,2.09,.12,{
        delay:delayAt(1.79),attack:.31,q:.75,shape:[0,.12,.55,.81,1,.73,.26,0],
      });
      // Stone taps are dry. The river receives the broad brush as one wet accent.
      for(const [age,frequency,level] of [[1.75,2250,.091],[1.84,3090,.089],[1.96,1970,.075],
        [2.10,2720,.057],[2.93,2420,.054],[3.07,2460,.048]]){
        noise(frequency,760,.071,level,{delay:delayAt(age),attack:.003,q:1.72,shape:[0,1,.46,.10,0]});
      }
      noise(1923,640,.47,.15,{delay:riverAt,attack:.017,q:.88,shape:[0,.87,1,.62,.19,0]});
      break;
    }
    case 'finaleLakeBlocked':
      ironLink(voice, .08, .20, .74);
      noise(970,420,.66,.12,{delay:.11,attack:.13,q:1.05,shape:[0,.39,.81,1,.51,.14,0]});
      break;
    case 'finaleLakeChain': {
      for (const [delay, weight, pitch] of [[0,.34,.91],[.24,.53,.79],[.57,.31,.68]]) {
        ironLink(voice, delay, weight, pitch);
      }
      noise(460,168,.86,.20,{delay:.31,type:'lowpass',attack:.066,q:1.3,shape:[0,.26,.77,1,.61,.17,0]});
      noise(1980,650,.44,.19,{delay:.79,attack:.012,q:.94,shape:[0,.95,.73,.42,.17,0]});
      break;
    }
    case 'finaleStomp': {
      const start=endingElapsedAt('stomp',.19);
      const brake=endingElapsedAt('stomp',STOMP_IMPACT-.16);
      noise(384,1870,brake-start,.29,{
        delay:start,attack:.19,q:.88,shape:[0,.26,.65,1,.83,.39,.05,0],
      });
      resonate([94,159],.39,.12,{delay:endingElapsedAt('stomp',.65),attack:.063,bend:.65});
      break;
    }
    case 'finalePawsLand': {
      const secondPaw=endingElapsedAt('stomp',STOMP_IMPACT+STOMP_PAW_GAP)-endingElapsedAt('stomp',STOMP_IMPACT);
      noise(492,84,.29,.42,{type:'lowpass',attack:.007,q:1.30,shape:[0,1,.46,.31,.13,0]});
      noise(1690,575,.18,.24,{delay:.016,attack:.006,q:1.4,shape:[0,1,.42,.13,0]});
      resonate([63,111,209],.26,.28,{attack:.012,bend:.77});
      noise(785,380,.31,.23,{delay:secondPaw,attack:.014,q:1.61,shape:[0,.52,1,.32,.19,0]});
      noise(2410,890,.091,.11,{delay:secondPaw+.009,attack:.006,q:1.76,shape:[0,1,.42,.06,0]});
      resonate([105,243,386],.34,.16,{delay:secondPaw+.02,attack:.04,bend:.63});
      noise(243,105,.49,.13,{delay:secondPaw+.12,type:'lowpass',attack:.034,q:2.2});
      break;
    }
    case 'finaleBreak': {
      const release=STOMP_IMPACT+STOMP_LOAD;
      const fractureDelay=age=>endingElapsedAt('stomp',release+age)-endingElapsedAt('stomp',release);
      noise(4870,820,.17,.34,{attack:.009,q:1.41,shape:[0,1,.53,.67,.23,0]});
      resonate([84,147,311],.29,.26,{attack:.015,bend:.76});
      for(const [after,pitch] of [[.12,.98],[.62,.74]]) {
        const delay=fractureDelay(after);
        noise(1390*pitch,450*pitch,.16,.23,{delay,attack:.022,q:1.8,shape:[0,.31,.82,1,.26,0]});
        resonate([107*pitch,194*pitch],.20,.15,{delay:delay+.024,attack:.018,bend:.72});
      }
      for(const [after,start,finish,weight] of [[.32,3250,1180,.21],[.47,2350,670,.24],[.81,1880,530,.18],[1.21,1300,285,.20]]) {
        const delay=fractureDelay(after);
        noise(start,finish,.15,weight,{delay,attack:.013,q:1.6,shape:[0,1,.56,.19,0]});
      }
      resonate([46,74,113],.78,.24,{delay:fractureDelay(.64),attack:.051,bend:.45});
      noise(580,105,.90,.29,{
        type:'lowpass',delay:fractureDelay(1.12),attack:.061,q:.98,shape:[0,.64,.89,1,.50,.12,0],
      });
      ironLink(voice,fractureDelay(.71),.58,.75);
      break;
    }
    case 'finaleChainRelease':
      ironLink(voice, 0, .72, .79);
      noise(980, 290, .30, .095, {
        delay: .24, attack: .046, q: .94, shape: [0, .52, 1, .57, .23, 0],
      });
      break;
  }
}
