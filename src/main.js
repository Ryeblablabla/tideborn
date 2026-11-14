import './style.css';
import './v2.css';
import { Game, DENSITY, PLAYABLE_FORMS, UPGRADES, META, freshSave, validateSave, metaCost, clamp } from './model.js';
import { LivingWorld } from './world-v2.js';
import { FeedbackLayer } from './feedback.js';
import { AudioGarden } from './audio.js';
import { LivingInterface } from './ui-v2.js';
import { advanceTraining } from './training.js';
import { bindTouchGestures } from './touch-gestures.js';
import { TECHNIQUES } from './cultivation-data.js';
import { CASCADE_CARDS, CASCADE_DOCTRINES } from './market-choices.js';
import { DRAGON_ARTS } from './dragon-art-data.js';
import { HEAVEN_ENDINGS } from './rules.js';
import { atlasSites, recordJourney } from './journey-atlas.js';
import { beginSeaDrill, finishSeaDrill } from './sea-drill.js';
import { ENEMY_TYPES } from './encounters.js';
import { startWildChallenge, wonderHint, wonderTitle } from './wonders.js';
import { leaderboardAvailable, startLeaderboardRun } from './leaderboard-api.js';
import {
  SEA_TO_MOUNTAIN_CUT, SEA_TO_MOUNTAIN_DURATION, SEA_TO_MOUNTAIN_SPLASH,
  SEA_TO_MOUNTAIN_TITLE, SEA_TO_MOUNTAIN_WINGBEAT,
} from './ink/chapter-view.js';

const SAVE_KEY='tideborn.save.v1';
const CHAPTER_MORPH_CUE_TIME=4.18;
const publicGame=import.meta.env?.VITE_PUBLIC_GAME==='1';
const artQuery=new URLSearchParams(location.search);
const testMode=!publicGame&&artQuery.has('test');
const previewMode=artQuery.has('preview');
const inkEnabled=publicGame||artQuery.get('legacy')!=='1';
let save=freshSave();try{save=validateSave(JSON.parse(localStorage.getItem(SAVE_KEY)));}catch{}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{ui?.toast('浏览器未允许本地存档，本次仍可正常游玩');}}
let game=new Game({seed:3441}),mode='menu',world,effects,audio,ui,last=0,hudTime=0,banked=false,pointer=null,stickTurn=0;
const requestedSeed=artQuery.get('seed');
function readJourneySeed(raw) {
  const value=String(raw??'').trim();
  return /^\d{1,10}$/.test(value)&&Number(value)<=0xffffffff?Number(value):null;
}
const fixedSeed=readJourneySeed(requestedSeed);
const keys=new Set();let runSeed=Date.now(),touchLift=0,helpPrevious=null,pausedStatus=null;
let audioPosition, seaContactId, reactionNotice, arrivalResult, leaderboardRun;
let chapterTransition=null, chapterPreparation=null, stickPointer=null;
const pausable=()=>['playing','ascending','transition'].includes(game.status);
const controlsLive=()=>mode==='game'&&['playing','ascending'].includes(game.status);
function toggleSound() {
  save.sound=audio.toggle();
  if(save.sound)audio.init();
  persist();
  ui.sound(save.sound);
}
function closeAudioSettings() {
  if(mode==='game')ui.pause(game,save);
  else ui.overlay('','');
  ui.restoreAudioSettingsFocus();
}
function bank(){if(banked||mode==='menu'||game.practice||game.drill)return 0;banked=true;const reward=game.reward();save.jade+=reward;save.runs++;save.bestStage=Math.max(save.bestStage,game.stage);if(game.status==='won')save.victories++;persist();return reward;}
function start(training=false,starter='bubble',seed){
  const seaDrill=training==='sea-drill';
  const eligible=leaderboardAvailable&&!training&&seed===undefined&&fixedSeed===null
    &&!artQuery.has('test')&&!previewMode&&artQuery.get('legacy')!=='1';
  cancelChapterTransition();
  document.body.classList.remove('ink-study');
  if(world.isInk)world.cameraMode='field';
  audio.resetRun();
  const audioReady=audio.init();
  const unlocked=TECHNIQUES.filter(def=>def.unlock&&save.bestStage>def.minStage).map(def=>def.unlock);
  game=new Game({seed:seed??fixedSeed??runSeed++,meta:save.meta,chapterArrivals:world.chapterArrivals,flightRoute:world.environment?.mountainRiver,starter,unlocked,
    openWorld:world.isInk&&!training,interactiveFinale:world.isInk&&!seaDrill,
    seaToMountainTransition:!training&&typeof world.prepareChapterTransition==='function'});
  world.reset();
  game.startingTechnique=starter;
  game.setObstacles(world.obstacles);
  if(training===true){
    game.practice=true;
    game.gainMass(18);
    game.food=[];
    game.foodCD=game.spawnCD=game.hordeCD=10000;
    game.p.x=2.6;
    for(const point of game.trail)point.x=2.6;
    game.p.invul=game.p.qi=100;
  }
  if(seaDrill){
    beginSeaDrill(game,ENEMY_TYPES);
    const run=game;
    const ready=world.inkDragon.select(run.form);
    run.drill.loading=true;
    ready.then(()=>{if(game===run)run.drill.loading=false;}).catch(error=>{
      console.error('沧溟兽潮加载失败',error);
      if(game===run){home();ui.toast('沧溟暂未加载，请再试一次');}
    });
  }
  banked=false;
  mode='game';
  clearControls();
  effects.clear();
  ui.hud(game,save);
  bindJoystick();
  const run=game;
  leaderboardRun=eligible?startLeaderboardRun().catch(error=>({error:error.message})):null;
  audioReady.then(ready=>{if(ready&&game===run&&game.status==='playing')cue('start');});
}
function home(){bank();cancelChapterTransition();audio.resetRun();mode='menu';clearControls();leaderboardRun=null;game=new Game({seed:3441});world.reset();effects.clear();ui.menu(save);}
function clearControls() {
  keys.clear();
  pointer=null;
  stickTurn=0;
  stickPointer=null;
  touchLift=0;
  const knob=document.querySelector('#knob');
  if(knob)knob.style.transform='';
}
function cancelChapterTransition() {
  chapterTransition=null;
  chapterPreparation=null;
  document.body.classList.remove('chapter-transition-active');
}
function prepareChapterTransition() {
  if(chapterPreparation)return;
  const preparation=chapterPreparation={ready:false};
  const body=game.p.body;
  // Start during the boss fight so the normal cut can happen inside the mist.
  Promise.resolve().then(()=>world.prepareChapterTransition(body)).catch(error=>{
    console.warn('千山预载未完成，切章时重新加载',error);
  }).finally(()=>{preparation.ready=true;});
}
function advanceChapterTransition(dt) {
  const transition=chapterTransition;
  if(!transition||game.status!=='transition')return;
  const previousAge=transition.age;
  transition.age=Math.min(transition.age+dt,SEA_TO_MOUNTAIN_DURATION);
  if(previousAge<SEA_TO_MOUNTAIN_SPLASH&&transition.age>=SEA_TO_MOUNTAIN_SPLASH)cue('launch',game.p);
  if(!transition.switched&&transition.age>=SEA_TO_MOUNTAIN_CUT){
    if(!chapterPreparation?.ready){
      transition.age=SEA_TO_MOUNTAIN_CUT;
      return;
    }
    transition.age=SEA_TO_MOUNTAIN_CUT;
    transition.switched=true;
    game.evolve();
    handleEvents();
  }
  const previewWing=world.inkDragon?.stage===4;
  if(!transition.morphSound&&transition.age>=CHAPTER_MORPH_CUE_TIME&&(transition.evolution||previewWing)){
    const point=world.inkDragon?.motion?.last??game.p;
    const visualEvolution={type:'evolve',stage:3,form:4,previousForm:3,x:point.x,y:point.y,z:point.z};
    transition.morphSound=true;
    cue('evolve',transition.evolution??visualEvolution);
  }
  if(!transition.wingSound&&transition.age>=SEA_TO_MOUNTAIN_WINGBEAT
      &&transition.age<SEA_TO_MOUNTAIN_WINGBEAT+.27&&(previewWing||game.form===4)){
    const point=world.inkDragon?.motion?.last??game.p;
    transition.wingSound=true;
    cue('launch',{x:point.x,y:point.y,z:point.z,strength:.78});
  }
  if(!transition.titleShown&&transition.age>=SEA_TO_MOUNTAIN_TITLE){
    transition.titleShown=true;
    ui.evolution(game.stage,true,{chapterTitle:true});
  }
  if(transition.titleShown)ui.updateChapterTitle(transition.age-SEA_TO_MOUNTAIN_TITLE);
}
function pause() {
  if(mode!=='game')return;
  if(pausable()){
    pausedStatus=game.status;
    game.status='paused';
    clearControls();
    ui.pause(game,save);
  }else if(game.status==='paused'&&ui.overlayType==='pause'){
    game.status=pausedStatus||'playing';
    pausedStatus=null;
    ui.overlay('','');
    audio.init();
  }
}
function closeHelp() {
  const status=helpPrevious;
  helpPrevious=null;
  if(['playing','ascending','transition'].includes(status))game.status=status;
  if(status==='paused'&&mode==='game')ui.pause(game,save);
  else ui.overlay('','');
}
function openAtlas() {
  if(mode!=='game'||!game.exploring||!(controlsLive()||ui.overlayType==='pause'))return;
  if(pausable())pause();
  if(game.status==='paused')ui.atlas(game);
}
function dash() {
  if(!controlsLive()||world.holdsEndingReveal?.(game))return;
  audio.init();
  game.dash(getInput());
}
function startWild() {
  if(!controlsLive()||world.holdsEndingReveal?.(game))return;
  if(startWildChallenge(game))handleEvents();
}
function retryGate() {
  if(!game.retryGate())return;
  audio.resetRun();
  clearControls();
  world.retryGate?.();
  ui.overlay('','');
  ui.update(game,true);
  audio.init();
}
function choose(index) {
  if(mode!=='game'||ui.overlayType!=='market-choice'||!game.choose(Number(index)))return;
  clearControls();
  ui.overlay('','');
  ui.update(game);
  handleEvents();
}
function buy(id){const item=META.find(i=>i.id===id);if(!item)return;const lv=save.meta[id],cost=metaCost(item,lv);if(lv>=10||save.jade<cost)return;save.jade-=cost;save.meta[id]++;persist();audio.init().then(ready=>{if(ready)cue('chosen');});ui.shop(save);}
function bindJoystick(){
  const el=document.querySelector('#joystick'),knob=document.querySelector('#knob');
  const move=e=>{if(stickPointer!==e.pointerId||!controlsLive())return;const r=el.getBoundingClientRect(),x=clamp(e.clientX-r.left-r.width/2,-30,30);stickTurn=x/30;knob.style.transform=`translateX(${x}px)`;};
  el.addEventListener('pointerdown',e=>{if(stickPointer!==null||!controlsLive())return;stickPointer=e.pointerId;el.setPointerCapture(e.pointerId);move(e);});
  el.addEventListener('pointermove',move);
  const up=e=>{if(stickPointer!==e.pointerId)return;stickPointer=null;stickTurn=0;knob.style.transform='';};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,up);
  for(const [id,lift]of [['rise-button',1],['fall-button',-1]]){const button=document.getElementById(id);button.addEventListener('pointerdown',e=>{if(!controlsLive())return;touchLift=lift;button.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touchLift=0);}
}
function cue(kind,event,rank=0) {
  audio.play(kind,{stage:game.stage,listener:game.p,cameraMatrix:world.camera?.matrixWorld.elements,event,rank});
}
function handleEvents(){
  let impact;
  let artAccent;
  let clearNotice;
  const phaseSound=game.events.some(event=>event.type==='bossPhase');
  for(const e of game.events){
    world.event(e);
    if(e.type==='eat')cue('eat',e,e.rank);
    if(e.type==='absorb')effects.absorb(e);
    if(e.type==='kill'&&!e.cascade)cue('kill',e);
    if(e.type==='hit'){
      if(!world.isInk||artQuery.has('numbers'))effects.number(e.x,e.z,e.amount,e.source,e.y);
      if(['bubble','poison','mist','needle','breach'].includes(e.source))cue('hit',e);
    }
    if(e.type==='shoot')cue('shoot',e);
    if(e.type==='clawRelease'&&!e.cancelled)cue(e.strike==='bite'?'bite':'claw',e);
    if(e.type==='armorBreak')cue('armorBreak',e);
    if(e.type==='weaponStrike'&&!e.cancelled)cue(e.strike==='water'?'entry':'tail',e);
    if(e.type==='hurt'){cue('hurt',e);world.shake=.45;document.querySelector('#vignette').style.boxShadow='inset 0 0 100px #d7686855';setTimeout(()=>document.querySelector('#vignette').style.boxShadow='',250);}
    if(e.type==='dash')cue('dash',e);
    if(e.type==='dashReady')cue('dashReady',e);
    if(e.type==='upgrade'){clearControls();cue('upgrade');ui.openMarket(game,e.source);}
    if(e.type==='wonder'){
      if(e.action==='start')cue(e.kind==='whirlpool'?'storm':'warning',e);
      if(e.action==='trail')cue('eat',e,2);
      if(e.action==='impact'){
        cue(e.kind==='spring'?'ring':e.kind==='palm'?'bossImpact':'bossWave',e);
        world.shake=Math.max(world.shake,e.kind==='palm'?.46:.29);
      }
      if(e.action==='relic'){
        cue('chosen',e);
        ui.toast(`得宝「${e.title}」${e.effect?` · ${e.effect}`:''}`,true);
      }
      if(e.action==='failed')ui.toast(e.kind==='whirlpool'?'漩涡散去':`${e.title} · 可再试`);
    }
    if(e.type==='wonderSword')cue('tail',e);
    if(e.type==='frontierCrossing'){
      cue('recover',e);
      ui.toast(`穿过${e.title} · 恢复龙躯与灵气`,true);
    }
    if(e.type==='wonderArtifact'){
      const sound=e.action==='warning'?'warning':e.action==='catch'?'chosen':
        e.action==='counter'?'arc':e.action==='intercept'?'tail':e.action==='undertow'?'storm':'ring';
      cue(sound,e);
    }
    if(e.type==='chosen'){cue('chosen');ui.toast(e.changed?`改修 · ${e.name}`:e.name,true);}
    if(e.type==='mutation'){const item=UPGRADES.find(u=>u.id===e.id);ui.toast(`觉醒「${item.name}」`,true);cue('evolve');}
    if(e.type==='boss'){
      cue('boss',e);
      if(game.seaToMountainTransition&&game.stage===2)prepareChapterTransition();
    }
    if(e.type==='bossReentry'){
      cue('warning',e);
      ui.toast(`${e.name}追了上来`);
    }
    if(e.type==='drillSurge'){
      cue('bossWave',e);
      if(e.shoal||game.time>=(game.drill.nextSurgeNotice??0)){
        game.drill.surgeNotice={x:e.x,z:e.z,until:game.time+1.9};
        game.drill.nextSurgeNotice=game.time+5;
      }
    }
    if(e.type==='horde'&&!e.reinforcement)ui.toast('兽群逼近');
    if(e.type==='chapterTransition'){
      prepareChapterTransition();
      chapterTransition={age:0,switched:false,titleShown:false};
      document.body.classList.add('chapter-transition-active');
      clearControls();
    }
    if(e.type==='evolve'){
      const changed=e.form!==e.previousForm;
      if(chapterTransition)chapterTransition.evolution=e;
      else{
        if(changed){cue('evolve',e);world.shake=.4;}
        ui.evolution(e.stage,changed);
      }
      ui.update(game,true);
    }
    if(e.type==='ascend'){cue('ascend',e);ui.toast('飞升天阙',true);ui.update(game,true);}
    if(e.type==='endingRoute'||e.type.startsWith('finale'))cue(e.type,e);
    if(e.type==='lightning'){effects.add('lightning',e.x,e.z);world.ripple(e.x,e.z,'#e2d9fd',1.2);cue('lightning',e);}
    if(e.type==='fire'||e.type==='storm')effects.add(e.type,e.x,e.z,e.life);
    if(e.type==='field'&&['storm','fire','ring'].includes(e.kind))cue(e.kind,e);
    if(e.type==='pose'){if(e.kind==='s')cue('lightning',e);ui.toast(e.name,true);}
    if(e.type==='ringBurst'){cue('ring',e);ui.toast('盘龙收阵',true);}
    if(e.type==='reaction')cue('reaction',e);
    if(e.type==='cascadeReserve'||e.type==='cascadeHandoffAim'&&!e.retargeted)cue(e.type,e);
    if(e.type==='cascadeStart'){
      cue(e.type,e);
      const route=CASCADE_CARDS[e.kind]?.name??'元素连携';
      ui.cascadeNotice(CASCADE_DOCTRINES[e.kind]?.[e.doctrine]?.name??route);
    }
    if(e.type==='cascadePulse'&&e.detail==='gale-spore-front'){
      if(!e.cancelled)cue(e.type,e);
      if(e.burstKills)world.shake=Math.max(world.shake,.17+Math.min(.14,e.burstKills*.024));
    }else if(e.type==='cascadePulse'&&e.detail!=='gale-spore-hold'&&(e.depth??0)<5&&(!e.preparing||e.detail==='fan-crest'||e.detail==='basin-flow'||e.detail==='cinder-path'||e.detail==='gyre-core'||e.detail==='gale-run'))cue(e.type,e);
    if(e.type==='cascadeBreak'){
      cue(e.type,e);
      world.shake=Math.max(world.shake,.19);
    }
    if(e.type==='cascadeEnd'){
      cue(e.type,e);
      if(e.killCount>=3&&(!clearNotice||e.killCount>clearNotice.count)){
        clearNotice={name:CASCADE_DOCTRINES[e.kind]?.[e.doctrine]?.name??CASCADE_CARDS[e.kind]?.name??'元素连携',count:e.killCount};
      }
      if(e.killCount>=8)world.shake=Math.max(world.shake,.22);
    }
    if(e.type==='dragonArtStart'){
      cue(e.type,e);
      ui.cascadeNotice(DRAGON_ARTS[e.kind].name);
    }
    if(e.type==='dragonArtPhase'){
      cue(e.type,e);
      if(['shatter','collapse','sweep','echo'].includes(e.phase)){
        const impact=e.phase==='echo'?.14:e.kind==='beam'?.14:.21;
        world.shake=Math.max(world.shake,impact);
      }
    }
    if(e.type==='dragonArtEnd'&&e.killCount>=3){
      if(!clearNotice||e.killCount>=clearNotice.count){
        clearNotice={name:DRAGON_ARTS[e.kind].name,count:e.killCount,absorbed:e.absorbed};
      }
    }
    if(e.type==='dragonArtReaction'&&(e.reaction==='thaw-thunder-store'||e.reaction==='thaw-thunder-release'))cue(e.type,e);
    if(e.type==='dragonArtReaction'&&!['abyss-transfer-bind','frost-temper-rush-cancel','thaw-thunder-store',
      'thaw-thunder-release','thaw-thunder-cancel'].includes(e.reaction)){
      if(e.reaction!=='rift-seam-bind'&&e.reaction!=='rift-wind-seam-bind'&&e.reaction!=='rift-wind-seam-cancel'&&e.reaction!=='abyss-mouth-cancel')cue(e.type,e);
      if(e.reaction==='rift-seam-close'||e.reaction==='rift-wind-seam-close'||e.reaction==='frost-sheet-shatter'){
        const steam=e.reaction==='frost-sheet-shatter'&&world.dragonArts?.hero.frostTemperFocus(e.id,world.t);
        world.shake=Math.max(world.shake,.27*(1-(steam?.gain??0)*.65));
      }else if(e.reaction!=='rift-seam-bind'&&e.reaction!=='rift-wind-seam-bind'&&e.reaction!=='rift-wind-seam-cancel'&&e.reaction!=='abyss-mouth-gather'&&e.reaction!=='abyss-mouth-cancel'&&e.reaction!=='abyss-transfer'&&e.reaction!=='frost-prism-fork'&&e.reaction!=='frost-temper-rush'&&e.reaction!=='frost-temper-rush-hit'&&(e.depth??0)<2){
        world.shake=Math.max(world.shake,e.reaction==='abyss-condense'?.18:.16);
      }
    }
    if(e.type==='cascadeHit'&&e.detail==='thaw-thunder-hit'&&e.killed){
      cue('thawThunderImpact',e);
      world.shake=Math.max(world.shake,.28);
    }
    if(e.type==='dragonArtBreak'){
      cue(e.type,e);
      const steam=e.kind==='frost'&&world.dragonArts?.hero.frostTemperFocus(e.id,world.t);
      world.shake=Math.max(world.shake,(e.absorbed?.26:.35)*(1-(steam?.gain??0)*.65));
    }
    if(e.type==='dragonArtMajorClear'){
      cue(e.type,e);
      world.shake=Math.max(world.shake,.24);
    }
    if(e.type==='dragonArtImpact'&&(e.absorbed||[
      'resonance','stone-chain','frost-chain','stone-surge','shell-shatter',
      'rift-crosscut','rift-seam','rift-clash','rift-recoil','abyss-transfer','beam-crosscut','beam-conduit','beam-scorch','beam-quench',
      'stone-quarry','stone-march','stone-contour','abyss-undertow','abyss-steamwake','frost-thunder-fork','frost-sheet-shatter','frost-temper-rush',
    ].includes(e.impact))){
      const secondary=['stone-quarry','stone-march','stone-contour','abyss-undertow','abyss-steamwake','frost-thunder-fork','stone-surge','beam-crosscut',
        'abyss-transfer','beam-conduit','beam-quench','rift-seam','rift-clash','rift-recoil','rift-wind-seam'].includes(e.impact);
      const priority=e.impact==='frost-temper-rush'?(e.killed?6:5):(e.killed?2:0)+(secondary?2:1);
      if(!artAccent||priority>artAccent.priority)artAccent={event:e,priority};
    }
    if(e.type==='techniqueArtStart')cue(e.kind==='icekeel'?'prismSet':e.kind==='windkite'?'kiteSet':e.kind==='bankweir'?'weirSet':e.kind==='sporeseed'?'seedSet':e.kind==='stonecrest'?'tail':e.kind==='emberwings'?'fire':'hit',e);
    if(e.type==='techniqueArtRelease'&&e.kind==='icekeel')cue('prismRelease',e);
    if(e.type==='techniqueArtImpact'&&e.kind==='icekeel'&&e.carrier==='frost-fork')cue('prismContact',e);
    if(e.type==='techniqueArtRelease'&&e.kind==='bankweir')cue('weirRelease',e);
    if(e.type==='techniqueArtRelease'&&e.kind==='windkite'){
      if(e.secondary==='kite-downpour')cue('kiteDownpour',e);
      else if(e.vessel)cue('kiteRelease',e);
    }
    if(e.type==='techniqueArtBloom'&&e.secondary==='kite-downpour')cue('kiteRainFall',e);
    if(e.type==='techniqueArtBloom'&&e.kind==='sporeseed')cue('seedBloom',e);
    if(e.type==='reaction'&&(reactionNotice?.game!==game||game.time>=reactionNotice.until)){
      ui.toast(e.name,true);
      reactionNotice={game,until:game.time+2.5};
    }
    if(e.type==='recover')cue('eat',e,2);
    if(e.type==='arc')cue('arc',e.to);
    if(e.type==='bossPhase')cue('bossPhase',e);
    if(e.type==='bossWave'&&(e.attack==='shell-backwash'||!phaseSound))cue('bossWave',e);
    if(e.type==='bossCharge'&&e.attack==='kite-dive')cue('airDive',e);
    else if(e.type==='bossCharge'&&!phaseSound)cue('bossCharge',e);
    if(e.type==='cloudPassPhase'&&e.phase==='windup')cue('airPass',e);
    if(e.type==='pincerPhase'&&e.phase==='windup')cue('bankPincer',e);
    if(e.type==='dartRushPhase'&&(e.phase==='windup'||e.phase==='active'))cue('dartRush',e);
    if(e.type==='warning'&&!phaseSound)cue('warning',e);
    if(e.type==='hazardImpact'&&!e.conducted&&(!impact||distanceToPlayer(e)<distanceToPlayer(impact)))impact=e;
    if(e.type==='takeoff'&&!chapterTransition)ui.flightTip?.();
    if(e.type==='end'){
      if(!e.win&&!e.ending)cue('loss',e);
      if(game.drill){
        const personalBest=e.win&&game.kills>save.seaDrillBest;
        if(personalBest){save.seaDrillBest=game.kills;persist();}
        clearControls();ui.drillResult(game,save.seaDrillBest,personalBest);continue;
      }
      if(e.ending&&HEAVEN_ENDINGS.includes(e.ending)&&!save.endings.includes(e.ending)){
        save.endings.push(e.ending);
        persist();
      }
      if(e.win&&!e.ending)cue('arrival');
      let rankedResult=null;
      if(leaderboardRun&&e.win&&game.status==='won'&&game.stage===4&&game.bossKills===4){
        rankedResult=Object.freeze({
          run:leaderboardRun,
          durationMs:Math.round(game.time*1000),
          lengthTenths:Math.round(game.p.body*10),
        });
        leaderboardRun=null;
      }
      const reward=e.ending==='locked'?game.reward():bank();
      clearControls();
      if(e.win&&!e.ending&&world.isInk)arrivalResult={game,reward,rankedResult,elapsed:0};
      else ui.result(game,reward,rankedResult);
    }
  }
  if(clearNotice)ui.cascadeNotice(clearNotice.name,clearNotice.count,clearNotice.absorbed);
  if(impact)cue(impact.attack==='tide-lightning'?'thunder':impact.attack?'bossImpact':impact.stage===3?'thunder':impact.stage<2?'entry':'ring',impact);
  if(artAccent){
    const {event}=artAccent;
    cue('dragonArtDetail',event);
    if(event.impact==='frost-temper-rush')world.shake=Math.max(world.shake,event.killed?.27:.11);
    else if(event.killed&&event.impact!=='stone-march')world.shake=Math.max(world.shake,event.phase==='echo'?.28:.20);
  }
  game.events=[];
}
function distanceToPlayer(event) {
  return Math.hypot(event.x-game.p.x,event.y-game.p.y,event.z-game.p.z);
}
function projectWonder(point) {
  const projected=world.project(point.x,point.z,point.y);
  const view=world.camera.matrixWorldInverse.elements;
  const behind=view[2]*point.x+view[6]*point.y+view[10]*point.z+view[14]>0;
  const side=view[0]*point.x+view[4]*point.y+view[8]*point.z+view[12];
  const x=projected.x/world.width, y=projected.y/world.height;
  return {bearing:behind?Math.atan2(side, -4):Math.atan2((x-.5)*innerWidth,(.5-y)*innerHeight),
    inView:projected.visible&&!behind&&x>.07&&x<.93&&y>.08&&y<.92};
}
function updateSound(dt) {
  const stage=game.stage,p=game.p;
  const active=mode==='game'&&pausable();
  const previous=audioPosition?.game===game&&audioPosition.stage===stage?audioPosition:null;
  const speed=active&&previous?Math.hypot(p.x-previous.x,p.z-previous.z)/Math.max(.001,dt):0;
  const yaw=previous?p.angle-previous.angle:0;
  const turning=clamp(Math.abs(Math.atan2(Math.sin(yaw),Math.cos(yaw)))/Math.max(.006,dt*6),0,1);
  let vortex=0;
  for(const zone of game.zones)if(zone.kind==='storm'&&zone.life>0)
    vortex=Math.max(vortex,clamp((1-Math.hypot(zone.x-p.x,zone.y-p.y,zone.z-p.z)/(zone.radius+4))*zone.power/4,0,1));
  audioPosition={game,stage,x:p.x,z:p.z,angle:p.angle};
  const sceneStage=world.epilogueStage??stage;
  const wonder=game.wonders?.active;
  if(wonder?.kind==='whirlpool')vortex=Math.max(vortex,.65);
  const threatened=active&&(Boolean(game.finale?.warning)||game.hazards.some(h=>h.warning)||
    wonder?.kind==='palm'||wonder?.kind==='gates');
  const boss=game.boss;
  const bossPressure=boss?clamp(1-(Math.hypot(boss.x-p.x,boss.z-p.z)-15)/30,.25,1):0;
  const finalePressure=game.finale?.phase==='trial'?.68:0;
  const transitionPressure=chapterTransition?clamp(1-chapterTransition.age/2.6,0,1):1;
  const drillPressure=game.drill&&!game.drill.loading?.72:0;
  const pressure=active?Math.max(bossPressure*transitionPressure,finalePressure,drillPressure):0;
  const soundMode=active?'play':mode!=='game'?mode:
    ['won','dead'].includes(game.status)?'result':'pause';
  audio.update(dt,{stage:sceneStage,active,mode:soundMode,time:game.time,movement:clamp(speed/8,0,1),height:p.y,
    vortex,turning,finale:game.finale,threatened,pressure});
  const contact=active&&stage===2?world.water?.userData.latestContact?.():null;
  if(contact&&contact.id!==seaContactId){
    seaContactId=contact.id;
    cue(contact.kind,contact);
  }
}
function getInput(){
  const right=keys.has('d')||keys.has('arrowright');
  const left=keys.has('a')||keys.has('arrowleft');
  const mouseTurn=pointer===null?0:clamp((pointer/innerWidth-.5)*3,-1,1);
  const turn=stickPointer!==null?stickTurn:right||left?Number(right)-Number(left):mouseTurn;
  if(game.stage<1)return {turn,lift:0};
  const rise=keys.has('w')||keys.has('arrowup');
  const fall=keys.has('s')||keys.has('arrowdown');
  return {turn,lift:clamp(touchLift+Number(rise)-Number(fall),-1,1)};
}
function loop(now){
  const elapsed=(now-last)/1000||.016;
  const dt=Math.min(.05,elapsed);last=now;
  const chapterDt=chapterTransition?Math.min(.09,elapsed):dt;
  const showingEndingRoute=mode==='game'&&Boolean(world.holdsEndingReveal?.(game));
  document.body.classList.toggle('ending-route-shot',showingEndingRoute);
  if(mode==='game'){
    const simDt=world.hitStop>0?dt*.2:dt;
    world.hitStop=Math.max(0,world.hitStop-dt);
    if(!chapterTransition&&!showingEndingRoute&&!game.drill?.loading){
      const input=getInput();
      game.step(simDt,input);
      if(game.drill&&elapsed>dt&&game.status==='playing')game.step(Math.min(.05,elapsed-dt),input);
      advanceTraining(game);
      if(game.drill&&game.status==='playing')finishSeaDrill(game);
      handleEvents();
      if(game.status==='playing')recordJourney(game);
    }else if(!chapterTransition&&showingEndingRoute)world.advanceEndingReveal?.(game,dt);
    advanceChapterTransition(chapterDt);
    hudTime+=dt;if(hudTime>.1){ui.update(game,false,world.endingRevealCaption?.(game));hudTime=0;}
  }
  const frozen=mode==='game'&&['paused','upgrade'].includes(game.status),visualDt=frozen?0:chapterDt;
  world.render(game,visualDt,{menu:mode==='menu',study:mode==='art',chapterTransition});
  if(chapterTransition?.age>=SEA_TO_MOUNTAIN_DURATION&&game.status==='transition'){
    world.finishChapterTransition(game,chapterTransition);
    ui.updateChapterTitle(Infinity);
    cancelChapterTransition();
    clearControls();
    game.status='playing';
    ui.update(game,true);
    ui.flightTip?.();
  }
  if(mode!=='art')effects.render(visualDt,game);updateSound(dt);
  if(arrivalResult){
    if(arrivalResult.game!==game||mode!=='game')arrivalResult=null;
    else{
      arrivalResult.elapsed+=visualDt;
      if(world.inkDragon.motion.arrival>=.96||arrivalResult.elapsed>=1.7){
        ui.result(game,arrivalResult.reward,arrivalResult.rankedResult);
        arrivalResult=null;
      }
    }
  }
  requestAnimationFrame(loop);
}
async function boot(){
  if(inkEnabled)document.body.classList.add('ink-art');
  const World=inkEnabled?(await import('./ink/world.js')).InkWorld:LivingWorld;
  world=new World(document.querySelector('#world'));if(world.ready)await world.ready;effects=new FeedbackLayer(document.querySelector('#vfx'),world);audio=new AudioGarden(save.sound,save.mix);
  ui=new LivingInterface(document.querySelector('#ui'),{start,restart:()=>{bank();start();},home,pause,buy,retryGate,
    projectWonder,startWild,seaDrill:()=>start('sea-drill'),
    journeySeed:()=>ui.journeySeed(fixedSeed),
    startSeed:()=>{
      const field=document.querySelector('#journey-seed');
      if(!field)return;
      const seed=readJourneySeed(field.value);
      field.setCustomValidity(seed===null?'请输入 0 到 4294967295 之间的整数。':'');
      if(!field.reportValidity())return;
      start(false,'bubble',seed);
    },
    replayJourney:()=>{const {worldSeed,startingTechnique}=game;bank();start(false,startingTechnique,worldSeed);},
    startWith:id=>start(false,id),
    marketChoose:choose,
    practice:()=>{helpPrevious=null;start(true);},
    build:()=>{helpPrevious=game.status;if(pausable())game.status='paused';clearControls();ui.build(game);},
    help:()=>{helpPrevious=mode==='game'?game.status:null;if(mode==='game'&&pausable())game.status='paused';clearControls();ui.help();},
    closeHelp,atlas:openAtlas,closeAtlas:()=>ui.pause(game,save),
    markWonder:index=>{
      if(ui.overlayType!=='atlas')return;
      const site=atlasSites(game)[Number(index)]?.site;
      if(!site)return;
      const {id,stage,kind,x,y,z}=site;
      game.wonders.waypoint=game.wonders.waypoint?.id===id?null:
        {id,stage,kind,x,y,z,relic:site.relic,title:site.title??wonderTitle(site),hint:site.hint??wonderHint(game,site),
          landmark:site.landmark,passageLandmark:site.passageLandmark};
      ui.atlas(game);
      document.querySelector(`[data-action="markWonder:${Number(index)}"]`)?.focus({preventScroll:true});
    },
    dash,shop:()=>ui.shop(save),credits:()=>ui.credits(),close:()=>ui.overlay('',''),
    sound:toggleSound,
    audioSettings:()=>{audio.init();ui.audioSettings(save);},
    closeAudioSettings,
    mix:(channel,value)=>{save.mix[channel]=value;audio.setMix(channel,value);persist();},
    fullscreen:()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>ui.toast('当前窗口不支持全屏'));else document.exitFullscreen?.();}
  });
  ui.menu(save);
  if(inkEnabled&&(previewMode||testMode)){
    world.installControls({study:()=>{cancelChapterTransition();mode='art';clearControls();},play:()=>start()});
    if(previewMode){
      const form=Number(artQuery.get('preview'));
      world.studyStage=PLAYABLE_FORMS.includes(form)?form:0;
      mode='art';document.body.classList.add('ink-study');
      world.cameraMode=world.studyStage===4?'orbit':'follow';
      document.querySelector('[aria-label=观形形态]').value=String(world.studyStage);
      document.querySelector('[aria-label=水墨镜头]').value=world.cameraMode;
    }
  }
  world.render(game,.016,{menu:mode==='menu',study:mode==='art'});
  await Promise.all([effects.prepare(),world.dragonArts?.warm(world.camera)]);
  document.querySelector('#loading').remove();
  const unlockSound=()=>{
    if(audio.enabled)audio.init().then(ready=>{
      if(ready){
        document.removeEventListener('pointerup',unlockSound);
        document.removeEventListener('keydown',unlockSound);
      }
    });
  };
  document.addEventListener('pointerup',unlockSound);
  document.addEventListener('keydown',unlockSound);
  window.addEventListener('keydown',e=>{
    if(e.isComposing||(e.key!=='Escape'&&e.target?.closest?.('input, textarea, select, [contenteditable="true"]')))return;
    if((e.key===' '||e.key==='Enter')&&e.target?.closest?.('button,input,select,textarea'))return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
    const k=e.key.toLowerCase();if(controlsLive())keys.add(k);if(e.repeat)return;
    if(mode==='menu'&&ui.overlayType===''&&k==='enter')start();
    else if(game.status==='upgrade'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&['1','2','3'].includes(k))choose(Number(k)-1);
    else if(k==='escape'||k==='p'){
      if(ui.overlayType==='leaderboard')ui.closeLeaderboard();
      else if(ui.overlayType==='audio-settings')closeAudioSettings();
      else if(ui.overlayType==='help'||ui.overlayType==='build')closeHelp();
      else if(ui.overlayType==='atlas')ui.pause(game,save);
      else if(mode==='menu')ui.overlay('','');else pause();
    }
    else if(k==='tab'&&mode==='game'&&game.exploring&&(pausable()||ui.overlayType==='atlas')){
      if(ui.overlayType==='atlas')return;
      e.preventDefault();openAtlas();
    }
    else if(k===' '&&mode==='game')dash();
    else if(k==='e'&&mode==='game')startWild();
    else if(k==='m')toggleSound();
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  bindTouchGestures(world.canvas,{active:()=>mode==='game'&&pausable(),dash,pause});
  world.canvas.addEventListener('pointerdown',e=>{if(!controlsLive()||e.pointerType==='touch'||e.button!==0)return;world.canvas.setPointerCapture(e.pointerId);pointer=e.clientX;});
  world.canvas.addEventListener('pointermove',e=>{if(pointer!==null)pointer=e.clientX;});
  window.addEventListener('pointerup',()=>pointer=null);window.addEventListener('pointercancel',()=>pointer=null);
  window.addEventListener('blur',()=>{clearControls();if(mode==='game'&&pausable())pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='game'&&pausable())pause();});
  if(testMode)window.__tide={get game(){return game;},get world(){return world;},get save(){return save;},start,home,choose,step:(dt,input)=>{game.step(dt,input);handleEvents();if(game.status==='playing')recordJourney(game);ui.update(game);},setSave:(s)=>{save=validateSave(s);persist();},setStage:(stage)=>{game.stage=stage;game.p.mass=(12+stage*4)*DENSITY[game.form];game.p.peakMass=game.p.mass;game.syncBody();world.setStage(stage);ui.update(game,true);},get effects(){return effects;}};
  window.__tideReady=true;requestAnimationFrame(loop);
}
boot().catch(error=>{
  console.error(error);document.querySelector('#loading')?.remove();const el=document.createElement('div');el.className='error-screen';el.innerHTML='<h2>水墨画面加载失败</h2><button onclick="location.reload()">重新加载</button>';document.body.append(el);
});
