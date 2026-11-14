import './ending-ui.css';
import './wonder-ui.css';
import { Interface, clock, inkGlyph } from './ui.js';
import { LESSONS } from './training.js';
import { STAGES, UPGRADES } from './model.js';
import { FAMILIES, STARTERS, TECHNIQUE_BY_ID, TIER_NAMES, techniqueStats } from './cultivation-data.js';
import { renderMarketChoices } from './market-choice-view.js';
import { CASCADE_CARDS, CASCADE_DOCTRINES, dragonArtFoundation, dragonArtPairing } from './market-choices.js';
import { DRAGON_ARTS, DRAGON_ART_DOCTRINES, dragonArtActivation } from './dragon-art-data.js';
import { atlasSites, drawJourneyAtlas } from './journey-atlas.js';
import { wonderTitle } from './wonders.js';
import { OATHS } from './wonder-oaths.js';
import { WILD_RELICS } from './wonder-wild.js';
import { leaderboardEntry, leaderboardPanel, mountLeaderboard } from './leaderboard-ui.js';

const families=Object.fromEntries(FAMILIES.map(family=>[family.id,family.name]));
const elementMark={water:'bubble',thunder:'lightning',fire:'fire',poison:'poison'};
const techniqueMark=def=>def.element==='water'&&(def.kind==='pulse'||def.field==='rain')
  ? 'rain' : elementMark[def.element];
const powerText=value=>`×${value.toFixed(2)}`;
const intervalText=value=>`${value.toFixed(2)} 秒`;
const distanceText=value=>`${value.toFixed(1)} 丈`;
const reachMetric={id:'range',label:stats=>stats.kind==='pulse'?'范围':'射程',text:distanceText,
  value:stats=>stats.kind==='pulse'?stats.radius:stats.range};
const comparisonMetrics=[
  {id:'power',label:'威力',text:powerText},
  {id:'cooldown',label:'出招',text:intervalText,measure:value=>1/value},
  reachMetric,
];

const ENDINGS = {
  locked: { name: '锁龙', stamp: '囚', line: '天锁未断，鱼群在湖闸前掉了头。' },
  ordained: { name: '受封', stamp: '敕', line: '封神榜写下「司雨应龙」。第一场雨归于苇汀。' },
  'dragon-king': { name: '龙王归来', stamp: '破', line: '天锁坠海，湖口鱼群再度洄游。' },
};

const GATE_CONTROL_PHASES = new Set(['approach', 'trial', 'choice', 'blessing']);
const GATE_DASH_PHASES = new Set(['trial', 'choice']);

const wonderNames={whirlpool:'涡',sword:'剑',pigment:'墨',palm:'掌',gates:'门',crane:'鹤',carp:'鲤',spring:'潮',oath:'契',wild:'阵'};
const directions=['前','右前','右','右后','后','左后','左','左前'];
const directionArrows=['↑','↗','→','↘','↓','↙','←','↖'];
const bearingTo=(player,x,z)=>player.angle-Math.atan2(x-player.x,z-player.z);
const bearingIndex=angle=>(Math.round(angle/(Math.PI/4))%8+8)%8;
const drillGrades={gold:'金印',silver:'银印',bronze:'铜印'};

function wonderStats(game){
  const metrics=game.wonders?.metrics;
  return metrics?.discovered?`<div><dt>渡过奇遇</dt><dd>${metrics.completed}</dd></div>
    <div><dt>寻得宝物</dt><dd>${metrics.relics}</dd></div>`:'';
}

function gateInstruction(finale, touch, height) {
  if (!finale) return [];
  const { phase, warning, hits, trialStep, cracked, roofLine, stompReady, stompArmed } = finale;
  const lift = touch ? '↑ / ↓' : 'W / S';
  const dash = touch ? '点破浪' : '按空格';
  if (phase === 'approach') return ['南天门', touch ? '摇杆左右转向 · ↑ / ↓ 升降' : 'A / D 转向 · W / S 升降'];
  if (phase === 'trial') {
    if (warning?.kind === 'layers') {
      const [lower, upper]=warning.layers??[];
      if(lower&&height<=lower.y+lower.halfHeight) return ['上下两重雷', touch?'按住 ↑，飞到两层之间':'按 W 升高，飞到两层之间', true];
      if(upper&&height>=upper.y-upper.halfHeight) return ['上下两重雷', touch?'按住 ↓，飞到两层之间':'按 S 下降，飞到两层之间', true];
      return ['上下两重雷', '保持在两层之间'];
    }
    if (warning?.kind === 'lock' && !warning.locked) return ['天雷追来', '等雷圈停住，再离开落点', true];
    if (warning?.kind === 'lock') return ['雷圈已定', `侧转，${dash}冲出雷圈`, true];
    if (hits === 1) return ['龙尾已伤', trialStep===0 ? '避开下一道门雷' : '稳住龙身，等天门打开', true];
    if (!trialStep) return ['南天门', `用 ${lift} 调整飞行高度`];
    return [];
  }
  if (phase === 'choice') {
    if (stompArmed) return ['踏碎南天门', touch ? '点破浪落爪' : '按空格落爪', true];
    if (stompReady) return ['对准门闩', touch ? '按 ↓ 俯冲，再点破浪' : '按 S 俯冲，再按空格', true];
    if (roofLine) return ['门楼上方', touch
      ? '飞到裂口上方，按 ↓ 俯冲，再点破浪'
      : '飞到裂口上方，按 S 俯冲，再按空格'];
    if (cracked) return ['正门已开', '对准正门受封，或靠近侧风飞上门楼'];
    if (height>finale.threshold.y+2.4) return ['正门已开', touch?'按 ↓，降到门洞的高度':'按 S，降到门洞的高度'];
    if (height<finale.threshold.y-2.4) return ['正门已开', touch?'按 ↑，升到门洞的高度':'按 W，升到门洞的高度'];
    return ['正门已开', '对准门洞，就会自动飞入内庭'];
  }
  if (phase === 'blessing') return ['司雨应龙', '可继续转向与升降'];
  return [];
}

function metricMeasure(metric,value){return metric.measure?metric.measure(value):value;}
function metricValue(metric,stats){return metric.value?metric.value(stats):stats[metric.id];}
function metricLabel(metric,stats){return typeof metric.label==='function'?metric.label(stats):metric.label;}

function comparisonScale(stats){
  return Object.fromEntries(comparisonMetrics.map(metric=>[
    metric.id,Math.max(.001,...stats.map(stats=>metricMeasure(metric,metricValue(metric,stats)))),
  ]));
}

function comparisonTrack(value,limit){
  const extent=Math.min(100,Math.max(0,value/limit*100));
  return `<span class="technique-track" aria-hidden="true"><i style="--extent:${extent.toFixed(2)}%"></i></span>`;
}

function techniqueComparison(stats,scale,label='法门数值对照'){
  return `<dl class="technique-comparison" aria-label="${label}">
    ${comparisonMetrics.map(metric=>{
      const value=metricValue(metric,stats);
      return `<div class="technique-metric">
        <dt>${metricLabel(metric,stats)}</dt>
        <dd>
          ${comparisonTrack(metricMeasure(metric,value),scale[metric.id])}
          <span class="technique-value">${metric.text(value)}</span>
        </dd>
      </div>`;
    }).join('')}
  </dl>`;
}

export class LivingInterface extends Interface {
  constructor(root,actions){
    const routes={...actions};
    super(root,routes);
    routes.starterChoice=()=>this.starters();
    routes.leaderboard=()=>this.openLeaderboard();
    routes.closeLeaderboard=()=>this.closeLeaderboard();
  }
  menu(save){
    this.leaderboardResult=null;
    this.seaDrillBest=save.seaDrillBest;
    super.menu(save);
    const buttons=this.root.querySelector('.title-buttons');
    buttons.insertAdjacentHTML('beforeend','<button class="secondary" data-action="starterChoice">择法</button><button class="secondary help-entry" data-action="help">招式图鉴</button>'+leaderboardEntry());
  }
  openLeaderboard(){
    const result=this.overlayType==='result'?this.leaderboardResult:null;
    this.leaderboardReturn=result;
    this.overlay(leaderboardPanel(result?.score),'leaderboard');
    mountLeaderboard(this.root.querySelector('.leaderboard-modal'),result?.score,result?.submission);
  }
  closeLeaderboard(){
    if(this.overlayType!=='leaderboard')return;
    const result=this.leaderboardReturn;
    this.leaderboardReturn=null;
    if(!result){
      this.overlay('','');
      return;
    }
    this.result(result.game,result.reward,result.score);
    this.root.querySelector('.result-modal [data-action="leaderboard"]')?.focus({preventScroll:true});
  }
  starters(){
    const choices=STARTERS.map(id=>({id,def:TECHNIQUE_BY_ID[id],stats:techniqueStats({id,tier:1})}));
    const scale=comparisonScale(choices.map(choice=>choice.stats));
    this.overlay(`
      <div class="modal upgrade-modal starter-modal">
        <h2>择法</h2>
        <div class="upgrade-grid">
          ${choices.map(({id,def,stats})=>{
            const color=def.element==='water'?'blue':'mint';
            return `<button class="upgrade-card ${color}" data-action="startWith:${id}">
              <span class="card-symbol" aria-hidden="true">${inkGlyph(techniqueMark(def),def.icon)}</span>
              <span class="card-tag">${families[def.family]}</span>
              <h3>${def.name}</h3>
              <p>${def.desc}</p>
              ${techniqueComparison(stats,scale)}
            </button>`;
          }).join('')}
        </div>
        <button class="text-button" data-action="close">返回苇汀</button>
      </div>`,'starter');
  }
  journeySeed(seed){
    this.overlay(`<section class="modal journey-seed">
      <h2>指定山海</h2>
      <label for="journey-seed">地图种子</label>
      <input id="journey-seed" type="text" inputmode="numeric" maxlength="10" value="${seed??''}" placeholder="例如 321">
      <button class="primary" data-action="startSeed">按种子出发</button>
      <button class="text-button" data-action="close">返回苇汀</button>
    </section>`,'journey-seed');
    const input=this.root.querySelector('#journey-seed');
    input.focus();
    input.addEventListener('input',()=>input.setCustomValidity(''));
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();this.actions.startSeed();}
    });
  }
  hud(g,save){
    this.leaderboardResult=null;
    this.introControls=!g.practice && !this.controlsSeen;
    this.controlsSeen ||= this.introControls;
    super.hud(g,save);
    this.hudElement.insertAdjacentHTML('beforeend', `
      <p class="ending-clue" id="ending-clue" aria-live="polite" hidden></p>
      <progress class="ending-tide" id="ending-tide" max="1" aria-label="海闸蓄潮" hidden></progress>
      <div class="gate-instruction" id="gate-instruction" aria-live="polite" hidden>
        <strong class="brush-label"></strong><span></span>
      </div>
      <aside class="wonder-guide" id="wonder-guide" hidden>
        <i class="wonder-stamp" aria-hidden="true"></i>
        <div>
          <div class="wonder-heading"><strong class="brush-label"></strong><span class="wonder-bearing" hidden><i aria-hidden="true">↑</i><span></span></span></div>
          <p></p>
          <progress max="1" aria-label="奇遇进度" hidden></progress>
          <small class="wonder-alternate" hidden></small>
          <button class="interactive wonder-enter" type="button" data-action="startWild" hidden>开启镇潮阵 <kbd>E</kbd></button>
        </div>
      </aside>
      <aside class="passage-guide" id="passage-guide" hidden>
        <strong class="brush-label"></strong><span></span>
      </aside>
      <p class="wonder-charge" id="wonder-charge" hidden>玄镜蓄满 · 下次破浪返射</p>
      <p class="investiture-announcement" id="investiture-announcement" role="status"></p>`);
    this.endingClue=this.root.querySelector('#ending-clue');
    this.gateNotice=this.root.querySelector('#gate-instruction');
    const wonder=this.root.querySelector('#wonder-guide');
    this.wonderNotice={root:wonder,stamp:wonder.querySelector('.wonder-stamp'),title:wonder.querySelector('strong'),
      detail:wonder.querySelector('p'),progress:wonder.querySelector('progress'),bearing:wonder.querySelector('.wonder-bearing'),
      alternate:wonder.querySelector('.wonder-alternate'),enter:wonder.querySelector('.wonder-enter')};
    this.investitureAnnouncement=this.root.querySelector('#investiture-announcement');
    this.touchGate=matchMedia('(pointer:coarse)');
    if(g.drill)this.hudElement.insertAdjacentHTML('beforeend',`
      <aside class="drill-status">
        <strong class="brush-label">沧溟兽潮</strong><span id="drill-time"></span><span id="drill-kills"></span>
        <div class="drill-body"><span>龙躯</span><meter min="0" max="1" aria-label="剩余龙躯"></meter></div>
        <span id="drill-surge" hidden></span>
      </aside>`);
    const dash=this.nodes.dash;
    dash.className='gate-dash interactive';
    dash.textContent='破浪';
    dash.removeAttribute('tabindex');
    dash.removeAttribute('aria-hidden');
    if(g.practice){
      this.root.querySelector('.hud').classList.add('training-active');
      this.root.querySelector('.hud').insertAdjacentHTML('beforeend',`
        <section class="lesson-panel">
          <small>练招水庭</small>
          <h3 id="lesson-title"></h3>
          <p id="lesson-text"></p>
          <p class="lesson-hint" id="lesson-hint"></p>
          <div id="lesson-steps"></div>
          <button class="primary" data-action="start">正式游历 <span aria-hidden="true">↗</span></button>
        </section>`);
    }
    this.update(g,true);
  }
  update(g, _chapterChanged, endingReveal){
    super.update(g);
    if(this.isMenu||!this.nodes)return;
    const el=id=>this.root.querySelector('#'+id);
    const introFinished=g.time>=6.5||(g.hasSteered&&g.time>=2.5);
    this.nodes.controls.hidden=!this.introControls||introFinished||g.stage!==0||g.status!=='playing';
    this.bossThreat(g);
    this.updateEndings(g, endingReveal);
    this.updateWonders(g);
    this.updatePassage(g);
    if(g.drill){
      el('drill-time').textContent=g.drill.loading?'兽潮集结中':`尚余 ${clock(Math.max(0,Math.ceil(g.drill.duration-g.time)))}`;
      el('drill-kills').textContent=g.drill.goal?`击退 ${g.kills} · 目标 ${g.drill.goal}`:`已击退 ${g.kills} / ${g.drill.count}`;
      const body=this.hudElement.querySelector('.drill-body');
      const remaining=Math.max(0,g.p.mass/Math.max(g.p.peakMass,1));
      body.querySelector('meter').value=remaining;
      body.dataset.low=String(remaining<.34);
      const surge=g.drill.surgeNotice;
      const warning=el('drill-surge');
      const storm=g.drill.storm;
      const inward=storm?directions[bearingIndex(bearingTo(g.p,storm.x,storm.z))]:'';
      warning.hidden=g.status!=='playing'||!g.drill.strike&&!storm?.warning&&!storm?.outside&&(!surge||g.time>=surge.until);
      if(!warning.hidden)warning.textContent=g.drill.strike?'潮雷锁定 · 变向或破浪':
        storm?.outside?`逆浪伤身 · 朝${inward}方回游`:storm?.warning?`外潮逼近 · 朝${inward}方回游`:
          `兽潮从${directions[bearingIndex(bearingTo(g.p,surge.x,surge.z))]}方追来`;
    }
    if(!this.endingClue.hidden)this.nodes.controls.hidden=true;
    if(g.practice&&el('lesson-title')){const step=g.practiceStep||0,lesson=LESSONS[step];el('lesson-title').textContent=`${step<3?'0'+(step+1)+' / 03 · ':''}${lesson.name}`;el('lesson-text').textContent=lesson.text;let hint=lesson.hint;if(step===0&&g.pose.wind>.2)hint=`同向蓄势 ${Math.floor(g.pose.wind*100)}% · 保持当前回旋方向。`;if(step===1&&g.pose.s>.2)hint=`已识别交替转向 ${Math.floor(g.pose.s*100)}% · 再做一个幅度清楚的反向弯道。`;if(step===2&&g.ring)hint='已成阵。松开转向，直游出阵。';const distance=Math.hypot(g.p.x,g.p.z);if(step<3&&distance>8&&!(step===2&&g.ring)){const arrow=directionArrows[bearingIndex(bearingTo(g.p,0,0))];hint=`赭色路线在 ${arrow} 方向约 ${Math.round(distance)} 丈，先返回练习区。`;}el('lesson-hint').textContent=hint;el('lesson-steps').textContent=['盘旋','S 形','收阵'].map((n,i)=>(step>i?'✓ ':'○ ')+n).join('   ·   ');}
  }
  updatePassage(game){
    const root=this.root.querySelector('#passage-guide');
    const route=game.crossing?.stage===game.stage?game.crossing.notice:null;
    root.hidden=game.status!=='playing'||!route||Boolean(game.boss);
    if(root.hidden)return;
    const {name,stage,aligned,height,x,z,distance}=route;
    const compass=directions[bearingIndex(bearingTo(game.p,x,z))];
    const near=stage==='through'&&aligned;
    const heightText=height==='down'?(game.stage===2?'下降贴水':'下降到墨线'):
      height==='up'?'抬升到墨线':'';
    const approach=near?'保持航向，穿过通道':stage==='approach'?`${compass}方 ${Math.round(distance)} 丈绕到谷口`:
      `${compass}方 ${Math.round(distance)} 丈 · 沿墨线入峡`;
    const details=[approach,heightText,near?'回灵、续躯':'穿过可恢复龙躯'].filter(Boolean).join(' · ');
    if(root.firstElementChild.textContent!==name)root.firstElementChild.textContent=name;
    if(root.lastElementChild.textContent!==details)root.lastElementChild.textContent=details;
  }
  updateWonders(game){
    const {root,stamp,title,detail,progress,bearing,alternate,enter}=this.wonderNotice;
    const guide=game.wonders?.guide;
    const relay=game.endingRoute?.mountainStrike;
    const charge=this.root.querySelector('#wonder-charge');
    charge.hidden=game.status!=='playing'||!game.wonders?.artifact?.charge;
    root.hidden=game.status!=='playing'||!guide||guide.phase!=='active'&&(Boolean(game.boss)||Boolean(relay?.relay));
    if(root.hidden)return;
    enter.hidden=!guide.canStart;
    const active=guide.phase==='active';
    const danger=active&&(guide.kind==='palm'||guide.kind==='gates');
    root.dataset.danger=String(danger);
    root.dataset.active=String(active);
    const mark=wonderNames[guide.kind]??'异';
    if(stamp.textContent!==mark)stamp.textContent=mark;
    if(title.textContent!==guide.title)title.textContent=guide.title;
    const passage=guide.passage;
    let instruction=guide.hint??'';
    if(passage&&!passage.inside){
      const height=game.p.y>passage.maxHeight?(game.stage===2?' · 下降贴水':' · 降到墨线'):
        game.p.y<passage.minHeight?' · 抬升到墨线':'';
      const approach=passage.stage==='approach'?'先绕到峡口外':'沿峡口两道墨线进入';
      instruction=`${passage.name} · ${approach}${height}`;
    }
    if(detail.textContent!==instruction)detail.textContent=instruction;
    const track=active&&Number.isFinite(guide.progress);
    progress.hidden=!track;
    if(track)progress.value=guide.progress;
    const sideTrail=guide.alternate;
    alternate.hidden=!sideTrail||active&&guide.kind!=='whirlpool';
    if(!alternate.hidden){
      const direction=directions[bearingIndex(bearingTo(game.p,sideTrail.x,sideTrail.z))];
      const distance=Math.round(Math.hypot(sideTrail.x-game.p.x,sideTrail.z-game.p.z));
      const text=`${direction}方 ${distance} 丈 · ${sideTrail.title}`;
      if(alternate.textContent!==text)alternate.textContent=text;
    }
    bearing.hidden=active&&guide.kind!=='carp'&&guide.kind!=='oath';
    if(!bearing.hidden){
      const view=this.actions.projectWonder?.(guide);
      const relative=bearingTo(game.p,guide.x,guide.z);
      const direction=directions[bearingIndex(relative)];
      const altitude=game.stage>0&&Math.abs(guide.heightDelta)>2?(guide.heightDelta>0?' · 上升':' · 下降'):'';
      const label=`${view?.inView?'':`${direction} · `}${Math.max(1,Math.round(guide.distance))} 丈${altitude}`;
      bearing.firstElementChild.hidden=Boolean(view?.inView);
      bearing.firstElementChild.style.transform=`rotate(${view?.bearing??relative}rad)`;
      if(bearing.lastElementChild.textContent!==label)bearing.lastElementChild.textContent=label;
    }
  }
  updateEndings(game, endingReveal) {
    const finale=game.stage===4 ? game.finale : null;
    const active=game.status==='ascending'||game.status==='playing';
    const phase=finale?.phase;
    const gateControls=Boolean(active&&GATE_CONTROL_PHASES.has(phase));
    const cinematic=Boolean(phase&&!GATE_CONTROL_PHASES.has(phase));
    this.hudElement.dataset.gateControls=String(gateControls);
    this.hudElement.dataset.gateCinematic=String(cinematic);
    if(gateControls)this.nodes['flight-controls'].hidden=false;
    const seaGateDash=game.stage===2&&game.status==='playing'&&game.endingRoute?.seaReady;
    const gateDash=gateControls&&GATE_DASH_PHASES.has(phase);
    const wonderDash=game.status==='playing'&&['spring','oath'].includes(game.wonders?.active?.kind);
    const drillDash=game.status==='playing'&&game.drill;
    this.nodes.dash.hidden=!(this.touchGate.matches&&(gateDash||seaGateDash&&Boolean(game.endingRoute.hint)||wonderDash||drillDash));
    if(gateDash&&phase==='choice'&&finale.stompReady)this.nodes.dash.disabled=false;

    const clue=game.status==='playing'&&!game.practice&&game.stage<4
      ? endingReveal??game.endingRoute?.hint?.replace('按破浪',this.touchGate.matches?'点破浪':'按空格破浪') : '';
    const relay=game.endingRoute?.mountainStrike;
    const routeTitle=endingReveal==null&&clue
      ? game.stage===2&&game.endingRoute?.seaReady?'潮头已聚'
        : game.stage===3&&relay?.lockedAt!=null&&relay.relay?'雷锁铁环'
        : game.stage===3&&relay&&relay.lockedAt==null?'引雷入环':''
      : '';
    this.endingClue.hidden=!clue||Boolean(routeTitle);
    if(clue&&this.endingClue.textContent!==clue)this.endingClue.textContent=clue;
    const tide=this.root.querySelector('#ending-tide');
    const charge=game.endingRoute?.seaCoil??0;
    tide.hidden=game.stage!==2||!clue||endingReveal!=null||charge<.025||Boolean(routeTitle);
    if(!tide.hidden)tide.value=charge;

    const [title, detail, danger]=routeTitle?[routeTitle,clue,routeTitle==='雷锁铁环']
      : active?gateInstruction(finale,this.touchGate.matches,game.p.y):[];
    this.gateNotice.hidden=!title;
    if(title){
      if(this.gateNotice.firstElementChild.textContent!==title)this.gateNotice.firstElementChild.textContent=title;
      if(this.gateNotice.lastElementChild.textContent!==detail)this.gateNotice.lastElementChild.textContent=detail;
      this.gateNotice.dataset.danger=String(Boolean(danger));
    }
    const investiture=phase==='audience'&&finale.age>=finale.inscriptionAt ? '封神榜，司雨应龙。' : '';
    if(this.investitureAnnouncement.textContent!==investiture)this.investitureAnnouncement.textContent=investiture;
  }
  pause(game=this.activeRun,save=null){
    super.pause(game,save);
    const ledger=this.root.querySelector('.pause-record');
    ledger.insertAdjacentHTML('beforeend',wonderStats(game));
    if(game.exploring)this.root.querySelector('.pause-exits').insertAdjacentHTML('beforebegin',
      '<button class="secondary" data-action="atlas">游历图</button>');
  }
  atlas(game){
    const sites=atlasSites(game);
    const waypoint=game.wonders.waypoint;
    this.overlay(`<section class="modal journey-atlas">
      <h2>游历图</h2>
      <p>${STAGES[game.stage].realm} · 已绘 ${game.atlas?.chapters[game.stage]?.chart??0} 方水土</p>
      <canvas width="300" height="300" role="img" aria-label="已绘地势、近途和奇遇的位置"></canvas>
      <div class="journey-legend"><span>△ 龙首</span><span>┄ 近途</span></div>
      ${sites.length?`<div class="atlas-sites" aria-label="附近奇遇">${sites.map(({site,distance},index)=>`
        <button class="secondary" data-action="markWonder:${index}" aria-pressed="${waypoint?.id===site.id}">
          <span class="atlas-pin">${index+1}</span><span>${site.title??wonderTitle(site)}</span>
          <small>${waypoint?.id===site.id?'追踪中':`${Math.max(1,Math.round(distance))} 丈`}${site.landmark?` · ${site.landmark}`:''}</small>
        </button>`).join('')}</div>`:''}
      <button class="text-button" data-action="closeAtlas">返回游历暂停</button>
    </section>`,'atlas');
    drawJourneyAtlas(this.root.querySelector('.journey-atlas canvas'),game,sites);
  }
  result(game,reward,rankedResult=null) {
    if(this.leaderboardResult?.game!==game||this.leaderboardResult.score!==rankedResult){
      this.leaderboardResult={game,reward,score:rankedResult,submission:{nickname:''}};
    }
    const boardButton=leaderboardEntry(Boolean(rankedResult&&!this.leaderboardResult.submission.entry));
    const key=game.ending??game.finale?.end;
    const ending=ENDINGS[key];
    if(!ending){
      super.result(game,reward);
      this.root.querySelector('.result-stats')?.insertAdjacentHTML('beforeend',wonderStats(game));
      this.root.querySelector('.result-buttons').insertAdjacentHTML('beforeend',boardButton);
      this.offerReplay(game);
      return;
    }
    const retry=key==='locked';
    this.overlay(`
      <div class="modal result-modal finale-result" data-ending="${key}">
        <header class="finale-result-heading">
          <span class="finale-result-seal brush-label" aria-hidden="true">${ending.stamp}</span>
          <h2>${ending.name}</h2>
        </header>
        <p class="finale-result-line">${ending.line}</p>
        <dl class="result-stats">
          <div><dt>游历</dt><dd>${clock(game.time)}</dd></div>
          <div><dt>击退</dt><dd>${game.kills}</dd></div>
          <div><dt>吸收</dt><dd>${game.eaten}</dd></div>
          ${wonderStats(game)}
        </dl>
        <div class="reward-line"><span aria-hidden="true">◈</span> ${retry?'结算可得 ':''}${reward} 龙玉</div>
        <div class="result-buttons">
          ${retry?'<button class="primary" data-action="retryGate"><span class="brush-label">再闯天门</span> <span aria-hidden="true">↗</span></button>'
            :'<button class="primary" data-action="restart"><span class="brush-label">再潜一次</span> <span aria-hidden="true">↗</span></button>'}
          <button class="secondary" data-action="home">返回苇汀</button>
          ${boardButton}
        </div>
      </div>`,'result');
    if(!retry)this.offerReplay(game);
  }
  offerReplay(game){
    if(!game.openWorld||game.practice)return;
    this.root.querySelector('.result-buttons').insertAdjacentHTML('afterend',
      `<p class="journey-seed-result">地图种子 ${game.worldSeed}</p><button class="text-button replay-journey" data-action="replayJourney">重走本局山海</button>`);
  }
  drillResult(game,best=0,personalBest=false){
    const grade=drillGrades[game.drill.grade];
    this.overlay(`<section class="modal result-modal">
      <h2>${game.status==='won'?'兽潮已过':'沉入沧溟'}</h2>
      ${grade?`<p class="drill-grade"><b class="brush-label">${grade}</b> ${game.kills>=game.drill.goal?'达成击退目标':`再击退 ${Math.max(0,game.drill.goal-game.kills)} 可得银印`}</p>`:''}
      ${best>0?`<p class="drill-best">${personalBest?'刷新最高击退':'通关最高击退'} ${best}</p>`:''}
      <dl class="result-stats"><div><dt>支撑</dt><dd>${clock(game.time)}</dd></div>
        <div><dt>击退</dt><dd>${game.kills}</dd></div><div><dt>余敌</dt><dd>${game.enemies.length}</dd></div></dl>
      <div class="result-buttons"><button class="primary" data-action="seaDrill">再闯兽潮</button>
        <button class="secondary" data-action="home">返回苇汀</button></div>
    </section>`,'result');
  }
  bossThreat(game){
    const tag=this.nodes['boss-threat'];
    const charging=game.boss?.lungeWindup>0;
    const backwash=game.hazards.find(hazard=>{
      if(hazard.attack!=='shell-backwash'||hazard.life<=0||hazard.hit||Math.abs(hazard.y-game.p.y)>=1.10)return false;
      const radius=Math.hypot(hazard.x-game.p.x,hazard.z-game.p.z);
      const front=hazard.wave?hazard.startRadius+(hazard.radius-hazard.startRadius)*hazard.age/hazard.maxLife:hazard.startRadius;
      const margin=hazard.halfWidth+.75;
      return radius>=front-margin&&radius<=hazard.radius+margin;
    });
    const strike=game.hazards.some(hazard=>hazard.warning&&!hazard.previewOnly&&hazard.life>0&&
      Math.hypot(hazard.x-game.p.x,hazard.y-game.p.y,hazard.z-game.p.z)<hazard.radius+1.15);
    const mark=game.boss?.frontierArrival?['追','首领追上来了']:charging?['冲','冲锋将至']:backwash?['潮',backwash.warning?'返潮将至':'返潮']:strike
      ? game.stage===3?['劫','雷劫将落']:['落','落击将至']
      : game.boss?.shield&&(game.boss.brokenArmorUntil??0)<=game.time?['甲','玄甲护盾']:null;
    this.nodes.boss.hidden=!mark||game.status!=='playing';
    if(!mark)return;
    if(tag.textContent!==mark[0])tag.textContent=mark[0];
    if(tag.getAttribute('aria-label')!==mark[1])tag.setAttribute('aria-label',mark[1]);
    tag.dataset.danger=String(Boolean(charging||backwash||strike));
  }
  flightTip(){
    if(this.flightTipSeen)return;
    this.flightTipSeen=true;
    const keys=matchMedia('(pointer:coarse)').matches?'按住 ↑ / ↓ 升降':'W 上升 · S 下降';
    this.toast(keys);
  }
  openMarket(game,source){
    this.overlay(renderMarketChoices(game.choices,source),'market-choice');
  }
  overlay(html,type){
    super.overlay(html,type);
    if(type==='help'){
      const button=this.root.querySelector('.help-modal>.primary');
      button.dataset.action=this.isMenu?'practice':'closeHelp';
      button.textContent=this.isMenu?'进入练招水庭 ↗':'返回当前游历 ↗';
      if(this.isMenu&&document.body.classList.contains('ink-art'))button.insertAdjacentHTML('afterend',
        `<button class="secondary drill-entry" data-action="seaDrill">沧溟兽潮 <small>2500 敌 · 45 秒${this.seaDrillBest?` · 纪录 ${this.seaDrillBest}`:''}</small></button>
        <button class="secondary drill-entry" data-action="journeySeed">指定山海</button>`);
    }
  }
  build(g){
    const organs=g.organs();
    const cultivation=g.cultivation?.view();
    const organsByType={rain:'潮囊',storm:'风窍',lightning:'雷鳞',fire:'炎腺',poison:'毒囊'};
    const effects=[
      {name:'炎舞风暴',needs:['storm','fire'],text:'旋风卷火，持续灼烧风眼内的敌群。'},
      {name:'万毒归流',needs:['storm','poison'],text:'旋风携毒，聚怪时传播毒蚀。'},
      {name:'潮雷传导',needs:['lightning'],text:'泡泡或雨浸湿敌群，增强雷击及传导距离。'},
      {name:'云炁相变',needs:['fire'],text:'火遇水生蒸汽，凝云后可用雷电充能。'},
    ];
    const circuits=effects.filter(effect=>effect.needs.every(kind=>g.strength(kind)>0));
    const awakenings=UPGRADES.filter(upgrade=>g.buffs[upgrade.id]>0);
    const techniques=cultivation?.slots.filter(Boolean)??[];
    const cascade=CASCADE_CARDS[g.cultivation?.cascade];
    const cascadeDoctrine=CASCADE_DOCTRINES[g.cultivation?.cascade]?.[g.cultivation?.cascadeDoctrine];
    const artId=g.cultivation?.dragonArt;
    const art=DRAGON_ARTS[artId];
    const artRank=g.cultivation?.dragonArtRank;
    const doctrine=DRAGON_ART_DOCTRINES[g.cultivation?.dragonArtDoctrine];
    const artPairing=art && dragonArtPairing(g.cultivation,artId,artRank);
    const readyArts=art?[]:Object.entries(DRAGON_ARTS).flatMap(([id,spec])=>{
      const foundation=dragonArtFoundation(g.cultivation,id);
      return foundation?[`${spec.name}（${foundation.rank===2?'二':'一'}阶）`]:[];
    });
    const artNames=ids=>ids.map(id=>TECHNIQUE_BY_ID[id].name).join('、');
    const relics=g.wonders?.relics,pigment=g.wonders?.pigment;
    const oath=OATHS[relics?.oath];
    const wild=WILD_RELICS[relics?.wild];
    const research=[['coil','收阵回响'],['conduit','导电残云'],['alchemy','云汽回生']];
    this.overlay(`
      <div class="modal build-modal">
        <h2>血脉构筑</h2>
        <dl class="build-measures">
          <div><dt>龙躯</dt><dd>${g.p.body.toFixed(1)} 节</dd></div>
          <div><dt>密度</dt><dd>×${g.p.density.toFixed(2)}</dd></div>
          <div><dt>吐息伤害</dt><dd>${Math.round(g.stats().damage)}</dd></div>
        </dl>
        <div class="build-sections">
          <section>
            <h3>器官 <span>${organs.length}</span></h3>
            <div class="organ-list">
              ${organs.map(organ=>`<span class="organ element-${organ.type}">
                ${inkGlyph(organ.type)}<b>${organsByType[organ.type]}</b>
                <small>第 ${organ.index+1} 节 · ×${organ.power.toFixed(2)}</small>
              </span>`).join('')}
            </div>
            <details class="organ-notes">
              <summary>器官如何生效</summary>
              <p>每四节激活一处器官，用于姿态传导，并强化已觉醒的对应元素。断尾会减少器官，龙躯长回后恢复。蜕变保留血脉并增强器官潜力。</p>
            </details>
            ${awakenings.length?`<h3>觉醒</h3>
              <div class="build-buffs">
                ${awakenings.map(upgrade=>`<span>${inkGlyph(upgrade.id,upgrade.icon)} ${upgrade.name} · ${g.buffs[upgrade.id]} 级</span>`).join('')}
              </div>`:''}
            ${techniques.length?`<h3>随身法门</h3><div class="build-buffs">
              ${techniques.map(slot=>`<span>${inkGlyph(techniqueMark(slot.def),slot.def.icon)} ${slot.def.name} · ${TIER_NAMES[slot.tier-1]}${slot.temperName?` · ${slot.temperName}`:''}</span>`).join('')}
            </div>`:''}
          </section>
          <section>
            <h3>可用连携</h3>
            ${cascade?`<div class="circuit"><div><b>${cascade.name} · ${cascadeDoctrine?.name??`${g.cultivation.cascadeRank} 阶`}</b><p>${cascadeDoctrine?.description??cascade.desc}</p></div></div>`:''}
            ${circuits.length
              ? circuits.map(effect=>`<div class="circuit">
                  <div class="circuit-glyphs" aria-hidden="true">${effect.needs.map(kind=>`<span class="element-${kind}">${inkGlyph(kind)}</span>`).join('')}</div>
                  <div><b>${effect.name}</b><p>${effect.text}</p></div>
                </div>`).join('')
              : '<p>觉醒元素后，可在这里查看对应的连携。</p>'
            }
            <h3>龙术</h3>
            ${art? `<div class="circuit"><div><b>${art.name} · ${artRank} 阶${doctrine?` · ${doctrine.names?.[artId]??doctrine.name}`:''}</b>
              <p>${art.first} 交战蓄势，满势${dragonArtActivation(art,g.stage)}。</p>
              ${artRank>1?`<p>${artRank===2?art.second:art.third}</p>`:''}
              ${artPairing?`<p>${artPairing}</p>`:''}
              ${doctrine?`<p>${doctrine.detail[g.cultivation.dragonArt]}</p>`:''}
            </div></div>` : `${readyArts.length
              ? `<p>波末可悟得${readyArts.join('、')}。</p>`
              : '<p>搭配两门相合的招式，或将一门主招升至玄品。大湖起可在波末悟得龙术。</p>'}
              <details class="organ-notes">
                <summary>查看各路龙术的配招</summary>
                <p>两门配招齐备，其中一门升至灵品，或已有相合的二阶连携，即可从二阶悟起。</p>
                ${Object.values(DRAGON_ARTS).map(spec=>`<div class="circuit"><div>
                  <b>${spec.name}</b><p>主招 ${artNames(spec.primary)}<br>搭配 ${artNames(spec.partners)}中的另一门</p>
                </div></div>`).join('')}
              </details>`}
            ${relics?.sword||relics?.feather||relics?.tideStone||pigment||oath||wild?`<h3>随身宝物</h3>
              ${relics.sword?`<div class="circuit"><div><b>分水古剑 · ${relics.sword} 阶</b><p>自动挥出剑气。破浪时向前斩出更宽的剑气。</p></div></div>`:''}
              ${pigment?`<div class="circuit"><div><b>${pigment.name}</b><p>${pigment.effect}</p></div></div>`:''}
              ${relics.feather?`<div class="circuit"><div><b>云鹤金羽</b><p>破浪蓄势加快。</p></div></div>`:''}
              ${relics.tideStone?`<div class="circuit"><div><b>潮纹石</b><p>每次破浪回复 10 点灵气。</p></div></div>`:''}
              ${oath?`<div class="circuit"><div><b>${oath.name}</b><p>${oath.description}</p></div></div>`:''}
              ${wild?`<div class="circuit"><div><b>${wild.title}</b><p>${wild.description}</p></div></div>`:''}`:''}
            <h3>局外研究</h3>
            <ul class="build-research">${research.map(([key,name])=>`<li>
              <span>${name}</span><small class="${g.meta[key]?'unlocked':''}">${g.meta[key]?'已解锁':'未解锁'}</small>
            </li>`).join('')}</ul>
          </section>
        </div>
        <button class="primary" data-action="closeHelp">返回游历 ↗</button>
      </div>`,'build');
  }
  help(){
    this.overlay(`
      <div class="modal help-modal">
        <h2>招式图鉴</h2>
        <dl class="control-guide">
          <div><dt>前进</dt><dd>自动游动 · <span class="desktop-hint">A / D 转向</span><span class="touch-hint">左右拖摇杆转向</span></dd></div>
          <div><dt>破浪</dt><dd><span class="desktop-hint">空格</span><span class="touch-hint">双击水面</span> · 短暂无敌</dd></div>
          <div><dt>升降</dt><dd><span class="desktop-hint">W 上升 / S 下降</span><span class="touch-hint">按住 ↑ / ↓</span> · 化蛟后</dd></div>
        </dl>
        <div class="help-moves">
          <article><strong class="element-storm">${inkGlyph('storm')}</strong><h3>盘旋成风</h3><p>持续同向回旋，聚起风眼。</p></article>
          <article><strong class="element-lightning">${inkGlyph('lightning')}</strong><h3>游龙引雷</h3><p>连续 S 形转向，引雷优先击向湿敌。</p></article>
          <article><strong class="element-ring">${inkGlyph('ring')}</strong><h3>盘龙结阵</h3><p>头部贴近龙身围合，收紧或离阵引爆。</p></article>
        </div>
        <p class="help-reactions"><span class="touch-hint">双指轻点水面暂停。 </span>自动出招，击败敌人即吸收灵性、增长龙躯。断尾可回收，雷击与龙阵能穿透玄甲。</p>
        <button class="primary" data-action="closeHelp">进入练招水庭 ↗</button>
        <button class="text-button" data-action="closeHelp">返回</button>
      </div>`,'help');
  }
  credits(){this.overlay(`<div class="modal credits-modal"><div class="eyebrow">笔墨山海</div><h2>潜鳞 · 致谢</h2><p>由苇汀浅水，游向烟波大湖、沧海、青绿千山与九重天阙。四种形态、场景与战斗均以三维网格实时呈现。</p><p>三维引擎：<a href="https://threejs.org/" target="_blank" rel="noopener">Three.js</a>（MIT）；曲面分析：three-mesh-bvh（MIT）。通用笔触蒙版来自 David Revoy 的 Krita 笔刷资源（CC0），完整来源与许可随工程保留。</p><p>开源版使用程序化龙形，龙躯随游动续长，鬃羽与笔墨实时绘制。音乐、环境实录、音效和 pixelfx 的署名与许可随工程保留。</p><button class="text-button" data-action="close">返回苇汀 ↗</button></div>`,'credits');}
}
