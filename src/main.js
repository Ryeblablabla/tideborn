import './style.css';
import './v2.css';
import { Game, STAGES, FOOD, UPGRADES, META, freshSave, validateSave, metaCost, clamp } from './model.js';
import { LivingWorld } from './world-v2.js';
import { FeedbackLayer } from './feedback.js';
import { AudioGarden } from './audio.js';
import { LivingInterface } from './ui-v2.js';
import { advanceTraining } from './training.js';
import { createMarketTrial, refreshMarketTargets } from './market-trial.js';
import { bindTouchGestures } from './touch-gestures.js';
import { TECHNIQUES } from './cultivation-data.js';

const SAVE_KEY='tideborn.save.v1';
const artQuery=new URLSearchParams(location.search),inkEnabled=artQuery.get('legacy')!=='1';
let save=freshSave();try{save=validateSave(JSON.parse(localStorage.getItem(SAVE_KEY)));}catch{}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{ui?.toast('浏览器未允许本地存档，本次仍可正常游玩');}}
let game=new Game({seed:3441}),mode='menu',world,effects,audio,ui,last=0,hudTime=0,banked=false,pointer=null,stick={x:0,z:0};
const keys=new Set();let runSeed=Date.now(),touchLift=0,helpPrevious=null,pausedStatus=null;
let audioPosition, seaContactId, reactionNotice, arrivalResult;
let marketRun=null;
function bank(){if(banked||mode==='menu'||game.practice)return 0;banked=true;const reward=game.reward();save.jade+=reward;save.runs++;save.bestStage=Math.max(save.bestStage,game.stage);if(game.status==='won')save.victories++;persist();return reward;}
function start(training=false,starter='bubble'){
  document.body.classList.remove('ink-study');
  if(world.isInk)world.cameraMode='field';
  const audioReady=audio.init();
  const unlocked=TECHNIQUES.filter(def=>def.unlock&&save.bestStage>def.minStage).map(def=>def.unlock);
  game=new Game({seed:runSeed++,meta:save.meta,chapterArrivals:world.chapterArrivals,flightRoute:world.environment?.mountainRiver,starter,unlocked});
  world.reset();
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
  banked=false;
  mode='game';
  clearControls();
  effects.clear();
  ui.hud(game,save);
  bindJoystick();
  const run=game;
  audioReady.then(ready=>{if(ready&&game===run&&game.status==='playing')cue('start');});
}
function home(){bank();mode='menu';keys.clear();pointer=null;stick={x:0,z:0};game=new Game({seed:3441});world.reset();effects.clear();ui.menu(save);}
function clearControls() {
  keys.clear();
  pointer=null;
  stick={x:0,z:0};
  touchLift=0;
  const knob=document.querySelector('#knob');
  if(knob)knob.style.transform='';
}
function pause() {
  if(mode!=='game')return;
  if(marketRun){endMarketTrial();return;}
  if(game.status==='playing'||game.status==='ascending'){
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
  if(['playing','ascending'].includes(status))game.status=status;
  if(status==='paused'&&mode==='game')ui.pause(game,save);
  else ui.overlay('','');
}
function dash() {
  audio.init();
  game.dash();
}
function choose(index){if(game.choose(Number(index)))ui.market(game);}
function tradeMarket(operation,value) {
  if(mode!=='game'||game.status!=='market')return;
  const market=game.cultivation;
  const before=market.view();
  const result=market.trade(operation,value);
  if(result.ok&&(operation==='merge'||operation==='buy'||operation==='temper'))cue('chosen');
  game.syncBody();
  ui.market(game,{operation,value,result,before});
}
function leaveMarket() {
  if(game.leaveMarket()){
    clearControls();
    ui.overlay('','');
    ui.update(game,true);
  }
}
function temperSelection(value) {
  const [uid,form]=String(value).split(',');
  return {uid:Number(uid),form};
}
function beginMarketTrial(operation,value) {
  if(mode!=='game'||game.status!=='market'||marketRun)return;
  const preview=game.cultivation.previewTrade(operation,value);
  if(!preview.ok)return;
  const offer=game.cultivation.getWeapon(preview.weapon.id);
  const temper=operation==='temper'?preview.view.slots.find(slot=>slot?.uid===preview.weapon.uid)?.temperName:null;
  const practice=createMarketTrial(game,preview,temper?`${offer.name} · ${temper}`:offer.name);
  marketRun=game;
  game=practice;
  clearControls();
  world.reset();
  effects.clear();
  ui.hud(game,save);
  bindJoystick();
}
function endMarketTrial() {
  if(!marketRun)return;
  game=marketRun;
  marketRun=null;
  clearControls();
  world.reset();
  effects.clear();
  ui.hud(game,save);
  bindJoystick();
  ui.market(game);
}
function buy(id){const item=META.find(i=>i.id===id);if(!item)return;const lv=save.meta[id],cost=metaCost(item,lv);if(lv>=10||save.jade<cost)return;save.jade-=cost;save.meta[id]++;persist();audio.init().then(ready=>{if(ready)cue('chosen');});ui.shop(save);}
function bindJoystick(){
  const el=document.querySelector('#joystick'),knob=document.querySelector('#knob');let active=null;
  const move=e=>{if(active!==e.pointerId)return;const r=el.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,z=e.clientY-r.top-r.height/2,n=Math.hypot(x,z),scale=Math.min(1,30/Math.max(1,n));stick={x:x*scale/30,z:z*scale/30};knob.style.transform=`translate(${x*scale}px,${z*scale}px)`;};
  el.addEventListener('pointerdown',e=>{if(active!==null)return;active=e.pointerId;el.setPointerCapture(e.pointerId);move(e);});
  el.addEventListener('pointermove',move);
  const up=e=>{if(active!==e.pointerId)return;active=null;stick={x:0,z:0};knob.style.transform='';};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,up);
  for(const [id,lift]of [['rise-button',1],['fall-button',-1]]){const button=document.getElementById(id);button.addEventListener('pointerdown',e=>{touchLift=lift;button.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touchLift=0);}
}
function cue(kind,event,rank=0) {
  audio.play(kind,{stage:game.stage,listener:game.p,cameraMatrix:world.camera?.matrixWorld.elements,event,rank});
}
function handleEvents(){
  let impact;
  const phaseSound=game.events.some(event=>event.type==='bossPhase');
  for(const e of game.events){
    world.event(e);
    if(e.type==='eat')cue('eat',e,e.rank);
    if(e.type==='kill')cue('kill',e);
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
    if(e.type==='market'){clearControls();cue('upgrade');ui.market(game);}
    if(e.type==='chosen')cue('chosen');
    if(e.type==='mutation'){const item=UPGRADES.find(u=>u.id===e.id);ui.toast(`觉醒「${item.name}」`,true);cue('evolve');}
    if(e.type==='boss')cue('boss',e);
    if(e.type==='horde')ui.toast('兽群逼近');
    if(e.type==='evolve'){cue('evolve',e);world.shake=.4;ui.evolution(e.stage);ui.update(game,true);}
    if(e.type==='lightning'){effects.add('lightning',e.x,e.z);world.ripple(e.x,e.z,'#e2d9fd',1.2);cue('lightning',e);}
    if(e.type==='fire'||e.type==='storm')effects.add(e.type,e.x,e.z,e.life);
    if(e.type==='field'&&['storm','fire','ring'].includes(e.kind))cue(e.kind,e);
    if(e.type==='pose'){if(e.kind==='s')cue('lightning',e);ui.toast(e.name,true);}
    if(e.type==='ringBurst'){cue('ring',e);ui.toast('盘龙收阵',true);}
    if(e.type==='reaction')cue('reaction',e);
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
    if(e.type==='hazardImpact'&&(!impact||distanceToPlayer(e)<distanceToPlayer(impact)))impact=e;
    if(e.type==='takeoff')ui.flightTip?.();
    if(e.type==='end'){
      if(e.win)cue('arrival');
      const reward=bank();
      clearControls();
      if(e.win&&world.isInk)arrivalResult={game,reward,elapsed:0};
      else ui.result(game,reward);
    }
  }
  if(impact)cue(impact.attack?'bossImpact':impact.stage===3?'thunder':impact.stage<2?'entry':'ring',impact);
  game.events=[];
}
function distanceToPlayer(event) {
  return Math.hypot(event.x-game.p.x,event.y-game.p.y,event.z-game.p.z);
}
function updateSound(dt) {
  const stage=game.stage,p=game.p;
  const active=mode==='game'&&['playing','ascending'].includes(game.status);
  const previous=audioPosition?.game===game&&audioPosition.stage===stage?audioPosition:null;
  const speed=active&&previous?Math.hypot(p.x-previous.x,p.z-previous.z)/Math.max(.001,dt):0;
  const yaw=previous?p.angle-previous.angle:0;
  const turning=clamp(Math.abs(Math.atan2(Math.sin(yaw),Math.cos(yaw)))/Math.max(.006,dt*6),0,1);
  let vortex=0;
  for(const zone of game.zones)if(zone.kind==='storm'&&zone.life>0)
    vortex=Math.max(vortex,clamp((1-Math.hypot(zone.x-p.x,zone.y-p.y,zone.z-p.z)/(zone.radius+4))*zone.power/4,0,1));
  audioPosition={game,stage,x:p.x,z:p.z,angle:p.angle};
  audio.update(dt,{stage,active,time:game.time,movement:clamp(speed/8,0,1),height:p.y,
    vortex,turning,threatened:active&&game.hazards.some(h=>h.warning)});
  const contact=active&&stage===2?world.water?.userData.latestContact?.():null;
  if(contact&&contact.id!==seaContactId){
    seaContactId=contact.id;
    cue(contact.kind,contact);
  }
}
function getInput(){
  let x=0,z=0;if(keys.has('w')||keys.has('arrowup'))z--;if(keys.has('s')||keys.has('arrowdown'))z++;if(keys.has('a')||keys.has('arrowleft'))x--;if(keys.has('d')||keys.has('arrowright'))x++;
  if(stick.x||stick.z){x=stick.x;z=stick.z;}
  else if(pointer&&!x&&!z){const at=world.pointer(pointer.x,pointer.y);if(at){const dx=at.x-game.p.x,dz=at.z-game.p.z,d=Math.hypot(dx,dz);if(d>.6){x=dx/Math.max(1,d);z=dz/Math.max(1,d);}}}
  if(world.inputDirection&&!pointer)({x,z}=world.inputDirection(x,z));
  return {x,z,lift:touchLift+(keys.has('q')?1:0)-(keys.has('e')?1:0)};
}
function loop(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;
  if(mode==='game'){const simDt=world.hitStop>0?dt*.2:dt;world.hitStop=Math.max(0,world.hitStop-dt);game.step(simDt,getInput());if(marketRun)refreshMarketTargets(game);else advanceTraining(game);handleEvents();hudTime+=dt;if(hudTime>.1){ui.update(game);hudTime=0;}}
  const frozen=mode==='game'&&['paused','upgrade','market'].includes(game.status),visualDt=frozen?0:dt;
  world.render(game,visualDt,{menu:mode==='menu',study:mode==='art'});if(mode!=='art')effects.render(visualDt,game);updateSound(dt);
  if(arrivalResult){
    if(arrivalResult.game!==game||mode!=='game')arrivalResult=null;
    else{
      arrivalResult.elapsed+=visualDt;
      if(world.inkDragon.motion.arrival>=.96||arrivalResult.elapsed>=1.7){
        ui.result(game,arrivalResult.reward);
        arrivalResult=null;
      }
    }
  }
  requestAnimationFrame(loop);
}
async function boot(){
  if(inkEnabled)document.body.classList.add('ink-art');
  const World=inkEnabled?(await import('./ink/world.js')).InkWorld:LivingWorld;
  world=new World(document.querySelector('#world'));if(world.ready)await world.ready;effects=new FeedbackLayer(document.querySelector('#vfx'),world);audio=new AudioGarden(save.sound);
  ui=new LivingInterface(document.querySelector('#ui'),{start,restart:()=>{bank();start();},home,pause,choose,buy,
    startWith:id=>start(false,id),
    marketBuy:index=>tradeMarket('buy',Number(index)),
    marketLock:index=>tradeMarket('lock',Number(index)),
    marketReroll:()=>tradeMarket('reroll'),
    marketSell:uid=>tradeMarket('sell',Number(uid)),
    marketMerge:uid=>tradeMarket('merge',Number(uid)),
    marketTemper:value=>tradeMarket('temper',temperSelection(value)),
    marketLeave:leaveMarket,
    marketTry:index=>beginMarketTrial('buy',Number(index)),
    marketTemperTry:value=>beginMarketTrial('temper',temperSelection(value)),
    marketTrialExit:endMarketTrial,
    practice:()=>{helpPrevious=null;start(true);},
    build:()=>{helpPrevious=game.status;if(['playing','ascending'].includes(game.status))game.status='paused';clearControls();ui.build(game);},
    help:()=>{helpPrevious=mode==='game'?game.status:null;if(mode==='game'&&['playing','ascending'].includes(game.status))game.status='paused';clearControls();ui.help();},
    closeHelp,
    dash,shop:()=>ui.shop(save),credits:()=>ui.credits(),close:()=>ui.overlay('',''),
    sound:()=>{audio.init();save.sound=audio.toggle();persist();ui.sound(save.sound);},
    fullscreen:()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>ui.toast('当前窗口不支持全屏'));else document.exitFullscreen?.();}
  });
  ui.menu(save);
  if(inkEnabled&&(artQuery.has('preview')||artQuery.has('test'))){
    world.installControls({study:()=>{mode='art';keys.clear();pointer=null;stick={x:0,z:0};},play:()=>start()});
    if(artQuery.has('preview')){world.studyStage=clamp(Number(artQuery.get('preview'))||0,0,4);mode='art';document.body.classList.add('ink-study');world.cameraMode='follow';document.querySelector('[aria-label=观形形态]').value=String(world.studyStage);document.querySelector('[aria-label=水墨镜头]').value='follow';}
  }
  world.render(game,.016,{menu:mode==='menu',study:mode==='art'});await effects.prepare();document.querySelector('#loading').remove();
  window.addEventListener('keydown',e=>{
    if(e.key===' '&&ui.overlayType&&e.target?.closest?.('button,input,select,textarea'))return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
    const k=e.key.toLowerCase();keys.add(k);if(e.repeat)return;
    if(mode==='menu'&&ui.overlayType===''&&k==='enter')start();
    else if(game.status==='market'&&ui.marketRecord?.blessings&&['1','2','3'].includes(k))choose(Number(k)-1);
    else if(k==='escape'||k==='p'){if(ui.overlayType==='help'||ui.overlayType==='build')closeHelp();else if(mode==='menu')ui.overlay('','');else pause();}
    else if(k===' '&&mode==='game')dash();
    else if(k==='m'){audio.init();save.sound=audio.toggle();persist();ui.sound(save.sound);}
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  bindTouchGestures(world.canvas,{active:()=>mode==='game'&&['playing','ascending'].includes(game.status),dash,pause});
  world.canvas.addEventListener('pointerdown',e=>{if(mode!=='game'||e.pointerType==='touch')return;world.canvas.setPointerCapture(e.pointerId);pointer={x:e.clientX,y:e.clientY};});
  world.canvas.addEventListener('pointermove',e=>{if(pointer)pointer={x:e.clientX,y:e.clientY};});
  window.addEventListener('pointerup',()=>pointer=null);window.addEventListener('pointercancel',()=>pointer=null);
  window.addEventListener('blur',()=>{keys.clear();pointer=null;stick={x:0,z:0};touchLift=0;if(mode==='game'&&['playing','ascending'].includes(game.status))pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='game'&&['playing','ascending'].includes(game.status))pause();});
  if(new URLSearchParams(location.search).has('test'))window.__tide={get game(){return game;},get world(){return world;},get save(){return save;},start,home,choose,step:(dt,input)=>{game.step(dt,input);handleEvents();ui.update(game);},setSave:(s)=>{save=validateSave(s);persist();},setStage:(stage)=>{game.stage=stage;game.p.mass=(12+stage*4)*[1,1.65,2.72,4.49,7.4][stage];game.p.peakMass=game.p.mass;game.syncBody();world.setStage(stage);ui.update(game,true);},get effects(){return effects;}};
  window.__tideReady=true;requestAnimationFrame(loop);
}
boot().catch(error=>{
  console.error(error);document.querySelector('#loading')?.remove();const el=document.createElement('div');el.className='error-screen';el.innerHTML='<h2>水墨画面加载失败</h2><button onclick="location.reload()">重新加载</button>';document.body.append(el);
});
