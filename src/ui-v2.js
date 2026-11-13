import { Interface, inkGlyph } from './ui.js';
import { LESSONS } from './training.js';
import { UPGRADES } from './model.js';
import { FAMILIES, STARTERS, TECHNIQUE_BY_ID, TIER_NAMES, techniqueStats } from './cultivation-data.js';

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
const offerMetrics=comparisonMetrics.slice(0,2);

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

function techniqueIdentity(item,withDescription=true){
  const {def,tier}=item;
  const grade=TIER_NAMES[tier-1]??`${tier} 阶`;
  const glyph=`<span class="market-glyph element-${techniqueMark(def)??'ring'}" aria-hidden="true">${inkGlyph(techniqueMark(def),def.icon)}</span>`;
  const text=`<div class="market-item-text">
      <small>${grade} · ${families[def.family]??'法门'}${item.temperName?` · ${item.temperName}`:''}</small>
      <h4>${def.name}</h4>${withDescription?`<p>${def.desc}</p>`:''}
    </div>`;
  return `${glyph}${text}`;
}

function equippedTechnique(slot){
  return `${techniqueIdentity(slot,false)}${equippedMeasures(slot)}`;
}

function equippedMeasures(slot){
  return `<dl class="market-slot-measures" aria-label="随身法门数值">
      ${comparisonMetrics.map(metric=>`<div><dt>${metricLabel(metric,slot.stats)}</dt><dd>${metric.text(metricValue(metric,slot.stats))}</dd></div>`).join('')}
    </dl>`;
}

function offerTrait({def},stats){
  if(def.kind==='arc')return `连锁 ${stats.chain} 敌`;
  if(def.kind==='melee')return '近身破甲';
  if(def.kind==='pulse')return def.element==='water'?'浸湿近敌':'扫开近敌';
  if(def.field==='storm')return '风眼聚敌';
  if(def.field==='rain')return '落雨铺湿';
  if(def.field==='fire')return '留火灼敌';
  if(def.field==='poison')return '毒沼蚀敌';
  if(def.field==='thunder')return '雷云蓄电';
  if(stats.projectiles>1)return `扇射 ${stats.projectiles} 枚`;
  if(stats.pierce>1)return `贯穿 ${stats.pierce} 敌`;
  return def.element==='water'?'水珠浸湿':'';
}

function rangeTag(stats){
  return `${reachMetric.label(stats)} ${distanceText(reachMetric.value(stats))}`;
}

function offerTag(item,index,selected,view,scale){
  if(!item)return '<div class="market-empty">已取</div>';
  const {offer,preview,stats}=item;
  const {def,price,tier}=offer;
  const completes=preview.ok&&preview.view.sets.some(set=>set.id===def.family&&set.count===2)&&
    view.sets.some(set=>set.id===def.family&&set.count===1);
  const active=selected===index;
  const glyph=techniqueMark(def)??'ring';
  return `<button class="market-inspect" data-action="marketInspect:${index}" aria-controls="market-offer-detail"
    aria-pressed="${active}" data-blocked="${!offer.canBuy}" data-lock="${offer.locked}">
    <span class="market-glyph element-${glyph}" aria-hidden="true">${inkGlyph(techniqueMark(def),def.icon)}</span>
    <span class="market-tag-title"><small>${families[def.family]}${tier>1?` · ${TIER_NAMES[tier-1]}`:''}</small><strong>${def.name}</strong></span>
    <span class="market-tag-price" aria-label="${price} 灵材">${price}</span>
    <span class="market-tag-metrics">
      ${offerMetrics.map(metric=>`<span class="market-tag-metric" data-metric="${metric.id}">
        <small>${metric.label}</small><b>${metric.text(stats[metric.id])}</b>${comparisonTrack(metricMeasure(metric,stats[metric.id]),scale[metric.id])}
      </span>`).join('')}
    </span>
    <span class="market-tag-foot"><b class="market-tag-range">${rangeTag(stats)}</b><span class="market-tag-trait">${offerTrait(offer,stats)}</span></span>
    <span class="market-tag-state">${offer.locked?'已保留':completes?`成${families[def.family]}两件`:''}</span>
  </button>`;
}

function offerDetails(item,index,scale,view,canTry,expanded=false){
  if(!item)return '';
  const {offer,preview,stats}=item;
  const outcome=offerOutcome(view,offer,preview);
  return `<article class="market-item market-offer-detail" id="market-offer-detail" aria-label="${offer.def.name}详情">
    ${techniqueIdentity({...offer,tier:preview.weapon?.tier??offer.tier})}
    ${outcome?`<p class="market-outcome" id="market-offer-outcome">${outcome}</p>`:''}
    <details class="market-offer-stats" ${expanded?'open':''}>
      <summary>法门数值</summary>
      ${techniqueComparison(stats,scale,preview.ok?'购入后的法门数值':'法门数值对照')}
    </details>
    <div class="market-offer-action-slot">${offerActions(item,index,canTry,Boolean(outcome))}</div>
  </article>`;
}

function purchaseDetails(slot,receipt){
  return `<article class="market-item market-purchase-detail" id="market-offer-detail" aria-label="${slot.def.name}已购入">
    ${equippedTechnique(slot)}
    ${receipt.changes?`<p class="market-outcome">${receipt.changes}</p>`:''}
    <div class="market-item-actions">
      <button class="secondary" data-action="marketPurchased">随身法门 ↘</button>
    </div>
  </article>`;
}

function offerActions(item,index,canTry,hasOutcome){
  const {offer,preview}=item;
  const verb=offer.fusionUid!=null?'合成':'购入';
  const block=offer.affordable?'法门已满':'灵材不足';
  return `<div class="market-item-actions market-offer-actions" role="group" aria-label="${offer.def.name}">
      <span class="market-action-name" aria-hidden="true">${offer.def.name}</span>
      <button class="secondary" data-action="marketLock:${index}" aria-pressed="${offer.locked}">${offer.locked?'已保留':'保留'}</button>
      ${canTry?`<button class="secondary market-try-action" data-action="marketTry:${index}" ${preview.ok?'':'disabled'}>试法</button>`:''}
      <button class="primary" data-action="marketBuy:${index}" ${offer.canBuy?'':'disabled'}
        ${hasOutcome?'aria-describedby="market-offer-outcome"':''}
        ${offer.fusionUid!=null&&offer.canBuy?`aria-label="花费 ${offer.price} 灵材购入并合成${offer.def.name}"`:''}>
        <span class="brush-label">${offer.canBuy?verb:block}</span> <b>${offer.price}</b>
      </button>
    </div>`;
}

const linkRules=[
  {name:'潮雷传导',hint:'雷击湿敌，传得更远',match:defs=>defs.some(def=>def.element==='water')&&defs.some(def=>def.kind==='arc')},
  {name:'合流成涡',hint:'水面雨阵与风眼重叠时，湿敌被拉得更快',match:defs=>defs.some(def=>def.field==='rain')&&defs.some(def=>def.field==='storm')},
  {name:'火水成云',hint:'火碰湿敌可生云汽',match:defs=>defs.some(def=>def.element==='water')&&defs.some(def=>def.element==='fire')},
  {name:'毒风聚煞',hint:'风眼卷入毒雾',match:defs=>defs.some(def=>def.field==='storm')&&defs.some(def=>def.element==='poison')},
  {name:'炎舞风暴',hint:'风眼卷入火场',match:defs=>defs.some(def=>def.field==='storm')&&defs.some(def=>def.field==='fire')},
  {name:'尾扫推敌',hint:'摆尾击退潮湿杂兵更远',match:defs=>defs.some(def=>def.id==='tail')&&defs.some(def=>def.element==='water')},
];

function weaponLinks(view){
  const defs=view.slots.flatMap(slot=>slot?[slot.def]:[]);
  return linkRules.filter(rule=>rule.match(defs));
}

function changedEffects(before,after){
  const gains=[],losses=[];
  const current=weaponLinks(before),next=weaponLinks(after);
  for(const [index,set] of before.sets.entries()){
    set.thresholds.forEach((threshold,i)=>{
      const active=after.sets[index].thresholds[i].active;
      if(active!==threshold.active){
        (active?gains:losses).push({name:`${set.name} ${threshold.at} 件`,hint:threshold.desc,threshold:true});
      }
    });
  }
  gains.push(...next.filter(rule=>!current.includes(rule)));
  losses.push(...current.filter(rule=>!next.includes(rule)));
  return {gains,losses};
}

function changeMarks({gains,losses},detail=false){
  return [
    ...gains.map(effect=>`<span class="market-change" data-direction="gain"><b>${effect.threshold?'启':'可联'} ${effect.name}</b>${detail?` <span>${effect.hint}</span>`:''}</span>`),
    ...losses.map(effect=>`<span class="market-change" data-direction="loss"><b>失 ${effect.name}</b>${detail?` <span>${effect.hint}</span>`:''}</span>`),
  ].join('');
}

function setLedger(sets){
  return `<ul class="market-sets" aria-label="法门套组">
    ${sets.map(set=>`<li>
      <div class="market-set-progress"><b>${set.name}</b>
        <span class="market-set-strokes" aria-hidden="true">${Array.from({length:set.thresholds.at(-1).at},(_,i)=>
          `<i data-lit="${i<set.count}"></i>`).join('')}</span>
        <small>${set.count} 件</small>
      </div>
      <p>${set.thresholds.filter(threshold=>threshold.active||threshold===set.next).map(threshold=>
        `<span class="market-set-effect" data-active="${threshold.active}"><b>${threshold.active?'已成':'下阶'} ${threshold.at} 件</b> ${threshold.desc}</span>`).join('')}</p>
    </li>`).join('')}
  </ul>`;
}

function offerOutcome(view,offer,preview){
  const before=view.sets.find(set=>set.id===offer.def.family);
  const after=preview.ok?preview.view.sets.find(set=>set.id===before?.id):before;
  const advances=after?.count>before?.count;
  const completes=advances&&before.next&&after.count>=before.next.at;
  const next=!completes&&after?.next
    ?`<span class="market-set-next"><b>${after.name}</b> ${after.count} / ${after.next.at} 件</span>`:'';
  const changed=preview.ok?changeMarks(changedEffects(view,preview.view),true):'';
  const fusion=preview.fused?`<span class="market-change"><b>升 ${TIER_NAMES[preview.weapon.tier-1]}</b></span>`:'';
  return [next,fusion,changed].filter(Boolean).join(' ');
}

function fusionLine(old,upgraded){
  return `${TIER_NAMES[old.tier-1]} → ${TIER_NAMES[upgraded.tier-1]} · 威力 ×${old.stats.power.toFixed(2)} → ×${upgraded.stats.power.toFixed(2)}`;
}

const temperMetrics=[comparisonMetrics[0],{...comparisonMetrics[1],label:'间隔'},
  {id:'range',label:'射程',text:distanceText},
  {id:'radius',label:'范围',text:value=>`${value.toFixed(1)} 丈`},
  {id:'life',label:'持续',text:value=>`${value.toFixed(1)} 秒`},
  {id:'pierce',label:'贯穿',text:value=>String(value)},
  {id:'projectiles',label:'每息枚数',text:value=>String(value)},
  {id:'chain',label:'连锁目标',text:value=>String(value)},
  {id:'energy',label:'雷云蓄电',text:value=>value.toFixed(1)},
];

function temperPanel(slot){
  return `<div class="market-ledger market-temper" aria-label="${slot.def.name}的淬炼分支">
    <h3>${slot.def.name} <small>${TIER_NAMES[slot.tier-1]} · 每件限选一次</small></h3>
    <div class="market-temper-grid">
      ${slot.tempering.map(form=>{
        const changes=temperMetrics.filter(metric=>Math.abs(slot.stats[metric.id]-form.stats[metric.id])>.001);
        return `<article class="market-temper-card">
          <h4>${form.name}</h4>
          ${form.stats.wetBranch?'<p class="market-temper-note">湿敌分出一道半威力支雷</p>':
            form.stats.sideBreak?'<p class="market-temper-note">侧后击中蟹王、龙龟可短暂破甲</p>':
            form.stats.wetSweep?'<p class="market-temper-note">推开外半圈已经潮湿的敌人</p>':
            form.stats.tailVortex?'<p class="market-temper-note">风眼落在尾段，将近敌卷入尾扫范围</p>':''}
          <dl>${changes.map(metric=>`<div><dt>${metric.label}</dt><dd>${metric.text(slot.stats[metric.id])} → ${metric.text(form.stats[metric.id])}</dd></div>`).join('')}</dl>
          <div class="market-item-actions">
            <button class="secondary" data-action="marketTemperTry:${slot.uid},${form.id}" ${form.affordable?'':'disabled'}>试法</button>
            <button class="primary" data-action="marketTemper:${slot.uid},${form.id}" ${form.affordable?'':'disabled'}><span class="brush-label">淬炼</span> <b>${form.price}</b></button>
          </div>
        </article>`;
      }).join('')}
    </div>
  </div>`;
}

function tradeReceipt(before,after,operation,result){
  if(!result.ok)return {title:result.message??'交易未成',text:'',changes:'',error:true};
  if(operation==='reroll')return {title:'已换一批',text:`−${result.price} 灵材`,changes:''};
  if(operation==='temper'&&result.weapon){
    const slot=after.slots.find(item=>item?.uid===result.weapon.uid);
    return {title:`淬炼 · ${slot?.temperName??slot?.def.name??'法门'}`,text:`−${result.price} 灵材`,changes:''};
  }
  if(!result.weapon||!['buy','merge','sell'].includes(operation))return null;
  const name=TECHNIQUE_BY_ID[result.weapon.id].name;
  const label=operation==='sell'?'售出':operation==='merge'||result.fused?'合成':'购入';
  const old=before.slots.find(slot=>slot?.uid===result.weapon.uid);
  const upgraded=after.slots.find(slot=>slot?.uid===result.weapon.uid);
  const text=label==='合成'&&old&&upgraded?`${fusionLine(old,upgraded)}${result.fused?` · −${result.price} 灵材`:''}`
    :`${operation==='sell'?'+':'−'}${result.price} 灵材`;
  return {title:`${label} · ${name}`,text,changes:changeMarks(changedEffects(before,after),true),
    weaponUid:operation==='sell'?null:result.weapon.uid};
}

function trialSummary(result){
  if(!(result?.targets>0))return '';
  return [
    `命中 ${result.targets} 靶`, `最重 ${Math.round(result.strongest)}`,
    result.pushed>0?`推开 ${result.pushed} 靶`:'',
    result.branch>0?`支雷 ${Math.round(result.branch)}`:'',
  ].filter(Boolean).join(' · ');
}

function trialMatches(action,game,practice){
  const trial=practice?.marketTrial;
  if(!trial)return false;
  const [route,value]=action?.split(':')??[];
  if(route==='marketTry')return game.cultivation.offers[Number(value)]?.id===trial.weapon;
  if(route!=='marketTemperTry')return false;
  const [uid,form]=value.split(',');
  return Number(uid)===trial.weaponUid&&practice.cultivation.weapons.some(weapon=>weapon.uid===trial.weaponUid&&weapon.temper===form);
}

export class LivingInterface extends Interface {
  constructor(root,actions){
    const routes={...actions};
    super(root,routes);
    routes.starterChoice=()=>this.starters();
    routes.marketInspect=index=>this.inspectOffer(Number(index));
    routes.marketPurchased=()=>{
      const uid=this.marketRecord?.purchaseUid;
      const summary=uid!=null?this.root.querySelector(`.market-slot-card[data-uid="${uid}"] summary`):null;
      if(!summary)return;
      summary.scrollIntoView({block:'nearest'});
      summary.focus({preventScroll:true});
    };
    root.addEventListener('keydown',event=>this.offerKeyboard(event));
    this.shortMarket=matchMedia('(min-width: 651px) and (max-height: 660px)');
    this.narrowMarket=matchMedia('(max-width: 650px)');
    this.shortMarket.addEventListener('change',()=>this.placeOfferActions());
    this.narrowMarket.addEventListener('change',()=>{
      if(this.overlayType==='market'&&this.marketRecord)this.market(this.marketRecord.game);
    });
    for(const action of ['marketTry','marketTemperTry']){
      if(!actions[action])continue;
      routes[action]=value=>{
        const record=this.marketRecord;
        const modal=this.root.querySelector('.market-modal');
        if(record&&modal){
          if(record.receipt?.kind==='trial')record.receipt=null;
          record.trialAction=`${action}:${value}`;
          record.scrolls[modal.dataset.page]=modal.querySelector('.market-ledger').scrollTop;
          if(modal.dataset.page==='offers')record.statsOpen=Boolean(modal.querySelector('.market-offer-stats[open]'));
        }
        actions[action](value);
      };
    }
    routes.marketBlessings=()=>{
      const record=this.marketRecord;
      if(!record?.game.choices.length)return;
      if(record.receipt?.kind==='trial')record.receipt=null;
      record.blessings=!record.blessings;
      record.temperUid=null;
      this.market(record.game);
    };
    routes.marketTemperOptions=value=>{
      const record=this.marketRecord;
      if(this.overlayType!=='market'||!record)return;
      if(record.receipt?.kind==='trial')record.receipt=null;
      const uid=Number(value);
      record.temperUid=record.temperUid===uid?null:uid;
      record.blessings=false;
      this.market(record.game);
    };
  }
  menu(save){
    super.menu(save);
    const buttons=this.root.querySelector('.title-buttons');
    buttons.insertAdjacentHTML('beforeend','<button class="secondary" data-action="starterChoice">择法</button><button class="secondary help-entry" data-action="help">招式图鉴</button>');
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
  hud(g,save){
    const record=this.marketRecord;
    if(g.status==='market'&&record?.game===g&&trialMatches(record.trialAction,g,this.activeRun)){
      const finished=this.activeRun.marketTrial;
      const text=trialSummary(finished.result);
      if(text)record.receipt={title:`试法 · ${finished.name}`,text,kind:'trial'};
    }
    this.introControls=!g.practice && !g.marketTrial && save.runs===0 && !this.controlsSeen;
    this.controlsSeen ||= this.introControls;
    this.introOrigin=this.introControls?{x:g.p.x,z:g.p.z}:null;
    this.trialReadout=null;
    super.hud(g,save);
    if(g.marketTrial){
      this.root.querySelector('.hud').insertAdjacentHTML('beforeend',`
        <aside class="market-trial-hud" aria-label="试法">
          <span class="market-trial-name">试法 · ${g.marketTrial.name}</span>
          <button class="secondary" data-action="marketTrialExit">返回集市 ↗</button>
          <p class="market-trial-result" role="status" aria-live="polite" aria-atomic="true" hidden></p>
        </aside>`);
      this.trialReadout=this.root.querySelector('.market-trial-result');
    }else if(g.practice){
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
  update(g){
    super.update(g);
    if(this.isMenu||!this.nodes)return;
    const el=id=>this.root.querySelector('#'+id);
    if(this.introOrigin&&Math.hypot(g.p.x-this.introOrigin.x,g.p.z-this.introOrigin.z)>.85)this.introControls=false;
    this.nodes.controls.hidden=!this.introControls||g.time>=6.5||g.stage!==0||g.status!=='playing';
    this.bossThreat(g);
    if(this.trialReadout)this.updateTrialReadout(g);
    if(g.practice&&el('lesson-title')){const step=g.practiceStep||0,lesson=LESSONS[step];el('lesson-title').textContent=`${step<3?'0'+(step+1)+' / 03 · ':''}${lesson.name}`;el('lesson-text').textContent=lesson.text;let hint=lesson.hint;if(step===0&&g.pose.wind>.2)hint=`同向蓄势 ${Math.floor(g.pose.wind*100)}% · 保持当前回旋方向。`;if(step===1&&g.pose.s>.2)hint=`已识别交替转向 ${Math.floor(g.pose.s*100)}% · 再做一个幅度清楚的反向弯道。`;if(step===2&&g.ring)hint='闭环已成立！现在向圆圈外游离，或把围合面积收紧，释放收阵爆发。';const distance=Math.hypot(g.p.x,g.p.z);if(step<3&&distance>8){const arrows=['↑','↗','→','↘','↓','↙','←','↖'],index=(Math.round(Math.atan2(-g.p.x,g.p.z)/(Math.PI/4))+8)%8;hint=`赭色路线在 ${arrows[index]} 方向约 ${Math.round(distance)} 丈，先返回练习区。`;}el('lesson-hint').textContent=hint;el('lesson-steps').textContent=['盘旋','S 形','收阵'].map((n,i)=>(step>i?'✓ ':'○ ')+n).join('   ·   ');}
  }
  updateTrialReadout(game){
    const node=this.trialReadout;
    const result=game.marketTrial?.result;
    const text=result?.until>game.time?trialSummary(result):'';
    if(node.textContent!==text)node.textContent=text;
    if(node.hidden===Boolean(text))node.hidden=!text;
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
    const mark=charging?['冲','冲锋将至']:backwash?['潮',backwash.warning?'返潮将至':'返潮']:strike
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
    const keys=matchMedia('(pointer:coarse)').matches?'按住 ↑ / ↓':'Q / E';
    this.toast(`${keys} 升降`);
  }
  inspectOffer(index){
    const record=this.marketRecord;
    const book=this.root.querySelector('.market-offer-book');
    const selected=book?.querySelector(`[data-action="marketInspect:${index}"]`);
    if(!record||!selected||(index===record.index&&record.purchaseUid==null))return;
    record.index=index;
    record.statsOpen=false;
    const trialReceipt=record.receipt?.kind==='trial';
    if(trialReceipt)record.receipt=null;
    if(record.purchaseUid!=null||trialReceipt){
      record.purchaseUid=null;
      this.market(record.game);
      this.root.querySelector(`[data-action="marketInspect:${index}"]`)?.focus({preventScroll:true});
      return;
    }
    for(const button of book.querySelectorAll('.market-inspect'))button.setAttribute('aria-pressed',String(button===selected));
    const {items,scale,view,canTry}=record.offers;
    this.root.querySelector('.market-offer-dock').replaceChildren();
    book.querySelector('.market-offer-details').innerHTML=offerDetails(items[index],index,scale,view,canTry);
    this.placeOfferActions();
  }
  placeOfferActions(){
    const modal=this.root.querySelector('.market-modal[data-page="offers"]');
    if(!modal)return;
    const actions=modal.querySelector('.market-offer-actions');
    if(!actions)return;
    const target=modal.querySelector(this.shortMarket.matches?'.market-offer-dock':'.market-offer-action-slot');
    if(!target||actions.parentElement===target)return;
    const focus=actions.contains(document.activeElement)?document.activeElement:null;
    target.append(actions);
    focus?.focus({preventScroll:true});
  }
  offerKeyboard(event){
    const current=event.target.closest('.market-inspect');
    const direction={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2}[event.key];
    if(!current||direction===undefined||event.altKey||event.ctrlKey||event.metaKey)return;
    const tags=[...current.closest('.market-offer-grid').querySelectorAll('.market-inspect')];
    const index=Number(current.dataset.action.split(':')[1]);
    const next=tags.find(button=>Number(button.dataset.action.split(':')[1])===index+direction)
      ??tags[(tags.indexOf(current)+Math.sign(direction)+tags.length)%tags.length];
    event.preventDefault();
    this.inspectOffer(Number(next.dataset.action.split(':')[1]));
    if(next.isConnected)next.focus();
  }
  market(game,feedback){
    const cultivation=game.cultivation;
    const view=cultivation.view();
    if(!view.shopOpen){
      if(this.overlayType==='market')this.overlay('','');
      return;
    }
    const previous=this.root.querySelector('.market-modal');
    const focusAction=previous?.contains(document.activeElement)?document.activeElement.dataset.action:null;
    const slotsUsed=view.slots.filter(Boolean).length;
    const sameMarket=this.marketRecord?.game===game&&this.marketRecord.wave===view.wave;
    const learned=Object.fromEntries(view.learned.map(({id,stacks})=>[id,stacks]));
    const blessing=sameMarket&&previous?.dataset.page==='blessings'
      ?view.learned.find(item=>item.stacks>(this.marketRecord.learned[item.id]??0)):null;
    const updated=feedback?tradeReceipt(feedback.before,view,feedback.operation,feedback.result):
      blessing?{title:`祝福 · ${blessing.name}`,kind:'blessing'}:null;
    const receipt=updated??(sameMarket?this.marketRecord.receipt:null);
    const narrow=this.narrowMarket.matches;
    const bought=Boolean(feedback?.operation==='buy'&&feedback.result.ok&&updated?.weaponUid!=null);
    const purchaseUid=narrow?(bought?updated.weaponUid:!updated&&sameMarket?this.marketRecord.purchaseUid:null):null;
    const purchase=narrow&&purchaseUid!=null?view.slots.find(slot=>slot?.uid===purchaseUid):null;
    const temperSlot=sameMarket?view.slots.find(slot=>slot?.tempering?.length&&slot.uid===this.marketRecord.temperUid):null;
    const blessings=Boolean(!temperSlot&&game.choices.length&&sameMarket&&this.marketRecord.blessings);
    const page=temperSlot?'temper':blessings?'blessings':'offers';
    const scrolls=sameMarket?this.marketRecord.scrolls:{};
    if(previous)scrolls[previous.dataset.page]=previous.querySelector('.market-ledger').scrollTop;
    const offers=view.offers.map((offer,index)=>{
      if(!offer)return null;
      const preview=cultivation.previewTrade('buy',index);
      const slot=preview.ok?preview.view.slots.find(slot=>slot?.uid===preview.weapon.uid):null;
      return {offer,preview,stats:slot?.stats??offer.stats};
    });
    const canTry=Boolean(this.actions.marketTry);
    const lastIndex=sameMarket?this.marketRecord.index:-1;
    const preferred=offers[lastIndex]?lastIndex:offers.findIndex(item=>item?.preview.ok);
    const index=purchase?-1:preferred>=0?preferred:offers.findIndex(Boolean);
    const statsOpen=sameMarket&&index===lastIndex&&(previous?.dataset.page==='offers'
      ?Boolean(previous.querySelector('.market-offer-stats[open]')):this.marketRecord.statsOpen);
    const trialAction=sameMarket?this.marketRecord.trialAction:null;
    const scale=comparisonScale([...offers,...view.slots].map(item=>item?.stats).filter(Boolean));
    const tagScale=comparisonScale(offers.flatMap(item=>item?[item.stats]:[]));
    if(bought&&narrow)scrolls.offers=0;
    this.marketRecord={game,wave:view.wave,receipt,index,blessings,temperUid:temperSlot?.uid??null,scrolls,trialAction,statsOpen,purchaseUid,learned,
      offers:{items:offers,scale,view,canTry}};
    const links=weaponLinks(view);
    this.overlay(`
      <div class="modal market-modal${previous?' market-refresh':''}" data-page="${page}">
        <header class="market-heading">
          <h2>${temperSlot?'淬炼':blessings?'祝福':'交易'}</h2>
          <p><b>${view.materials}</b> <span class="brush-label">灵材</span></p>
          ${receipt&&!blessings&&(!temperSlot||receipt.error||receipt.kind==='trial')?`<div class="market-receipt${receipt.kind?` market-${receipt.kind}-receipt`:''}" role="status" tabindex="-1" data-error="${!!receipt.error}">
            <b>${receipt.title}</b> ${receipt.text?`<span>${receipt.text}</span> `:''}${receipt.changes??''}
          </div>`:''}
        </header>
        ${temperSlot?temperPanel(temperSlot):blessings?`<div class="market-ledger market-blessings" aria-label="待领祝福">
          ${game.choices.map((choice,index)=>`<button class="market-blessing-card" data-action="choose:${index}" aria-keyshortcuts="${index+1}">
            <small>${choice.tag}</small><kbd>${index+1}</kbd><b>${choice.name}</b><span>${choice.desc}</span>
          </button>`).join('')}
        </div>`:`<div class="market-ledger">
          <section class="market-offer-book" aria-labelledby="market-offers">
            <h3 id="market-offers">可取法门</h3>
            <div class="market-items market-offer-grid" role="group" aria-labelledby="market-offers">
              ${offers.map((item,i)=>offerTag(item,i,index,view,tagScale)).join('')}
            </div>
            <div class="market-offer-details">${purchase?purchaseDetails(purchase,receipt):offerDetails(offers[index],index,scale,view,canTry,statsOpen)}</div>
          </section>
          <section aria-labelledby="market-slots">
            <h3 id="market-slots">随身法门 <small>${slotsUsed} / ${view.slots.length}</small></h3>
            ${setLedger(view.sets)}
            ${links.length?`<ul class="market-links" aria-label="随身法门连携">${links.map(link=>
              `<li><b>${link.name}</b> ${link.hint}</li>`).join('')}</ul>`:''}
            <div class="market-items market-slot-list">
              ${view.slots.map(slot=>{
                if(!slot)return '';
                const sell=cultivation.previewTrade('sell',slot.uid);
                const sold=sell.ok?changeMarks(changedEffects(view,sell.view),true):'';
                const merge=slot.mergeUid==null?null:cultivation.previewTrade('merge',slot.uid);
                const merged=merge?.ok?merge.view.slots.find(item=>item?.uid===slot.uid):null;
                const mergedChanges=merged?changeMarks(changedEffects(view,merge.view),true):'';
                const sharedLoss=Boolean(sold&&mergedChanges===sold);
                const incompatible=slot.mergeUid==null&&slot.temper&&view.slots.some(other=>other&&other.uid!==slot.uid&&
                  other.id===slot.id&&other.tier===slot.tier&&other.temper&&other.temper!==slot.temper);
                return `
                <article class="market-item market-slot-card" data-uid="${slot.uid}" data-recent="${receipt?.weaponUid===slot.uid}">
                  ${equippedTechnique(slot)}
                  ${merged?`<div class="market-outcome" id="merge-outcome-${slot.uid}">
                    <b>两件合一 · ${fusionLine(slot,merged)}</b> ${sharedLoss?'':mergedChanges}
                  </div>`:''}
                  ${sold?`<div class="market-outcome" id="sell-outcome-${slot.uid}"><b>${sharedLoss?'合成或售出':'售出'}</b> ${sold}</div>`:''}
                  ${incompatible?'<p class="market-outcome">同路淬炼才能合成</p>':''}
                  <div class="market-slot-tools">
                    <details class="market-slot-description"><summary>招式</summary><p>${slot.def.desc}</p></details>
                    <div class="market-item-actions">
                      ${slot.tempering?.length?`<button class="secondary" data-action="marketTemperOptions:${slot.uid}">淬炼</button>`:''}
                      ${merged?`<button class="secondary" data-action="marketMerge:${slot.uid}" aria-describedby="merge-outcome-${slot.uid}${sharedLoss?` sell-outcome-${slot.uid}`:''}">合成</button>`:''}
                      <button class="secondary" data-action="marketSell:${slot.uid}" ${sold?`aria-describedby="sell-outcome-${slot.uid}"`:''}>售出 <b>+${slot.sellPrice}</b></button>
                    </div>
                  </div>
                </article>`;
              }).join('') || '<p class="market-empty">尚无法门</p>'}
            </div>
          </section>
        </div>`}
        <footer class="market-footer">
          ${page==='offers'?'<div class="market-offer-dock"></div>':''}
          ${!blessings&&!temperSlot?`<button class="secondary" data-action="marketReroll" ${view.materials<view.rerollCost?'disabled':''}>换一批 <b>${view.rerollCost}</b></button>`:''}
          ${temperSlot?`<button class="secondary" data-action="marketTemperOptions:${temperSlot.uid}">回交易</button>`:''}
          ${!temperSlot&&game.choices.length?`<button class="secondary" data-action="marketBlessings">${blessings?'回交易':'择祝福'}</button>`:''}
          <button class="primary" data-action="marketLeave"><span class="brush-label">继续游历</span> <span aria-hidden="true">↗</span></button>
        </footer>
      </div>`,'market');
    const modal=this.root.querySelector('.market-modal');
    this.placeOfferActions();
    modal.querySelector('.market-ledger').scrollTop=scrolls[page]??0;
    if(blessing&&!blessings){
      (modal.querySelector(`[data-action="marketInspect:${index}"]`)??modal.querySelector('.market-blessing-receipt'))?.focus({preventScroll:true});
    }else if(updated){
      modal.querySelector('.market-receipt')?.focus({preventScroll:true});
    }else if(focusAction){
      const button=[...modal.querySelectorAll('button')].find(item=>item.dataset.action===focusAction&&!item.disabled);
      (button??(focusAction.startsWith('choose:')?modal.querySelector('[data-action=marketLeave]'):null))?.focus({preventScroll:true});
    }else if(!previous&&sameMarket&&trialAction){
      const button=[...modal.querySelectorAll('button')].find(item=>item.dataset.action===trialAction&&!item.disabled);
      button?.focus({preventScroll:true});
      this.marketRecord.trialAction=null;
    }
  }
  overlay(html,type){super.overlay(html,type);if(type==='help'){const button=this.root.querySelector('.help-modal>.primary');button.dataset.action=this.isMenu?'practice':'closeHelp';button.textContent=this.isMenu?'进入练招水庭 ↗':'返回当前游历 ↗';}}
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
    const blessings=[
      ...(cultivation?.learned??[]),
      ...UPGRADES.filter(upgrade=>g.buffs[upgrade.id]>0).map(upgrade=>({...upgrade,stacks:g.buffs[upgrade.id]})),
    ];
    const techniques=cultivation?.slots.filter(Boolean)??[];
    const research=[['coil','收阵回响'],['conduit','导电残云'],['alchemy','云汽回生']];
    this.overlay(`
      <div class="modal build-modal">
        <h2>血脉构筑</h2>
        <dl class="build-measures">
          <div><dt>龙躯</dt><dd>${g.p.body.toFixed(1)} 节</dd></div>
          <div><dt>密度</dt><dd>×${g.p.density.toFixed(2)}</dd></div>
          <div><dt>吐息伤害</dt><dd>${Math.round(g.stats().damage)}</dd></div>
          <div><dt>修炼储备</dt><dd>${Math.floor(g.reserve)}</dd></div>
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
            <h3>祝福</h3>
            <div class="build-buffs">${blessings.length
              ? blessings.map(upgrade=>`<span>${inkGlyph(upgrade.id,upgrade.icon)} ${upgrade.name} · ${upgrade.stacks} 级</span>`).join('')
              : '吞食灵物，提升灵性以选择祝福。'
            }</div>
            ${techniques.length?`<h3>随身法门</h3><div class="build-buffs">
              ${techniques.map(slot=>`<span>${inkGlyph(techniqueMark(slot.def),slot.def.icon)} ${slot.def.name} · ${TIER_NAMES[slot.tier-1]}</span>`).join('')}
            </div>`:''}
          </section>
          <section>
            <h3>可用连携</h3>
            ${circuits.length
              ? circuits.map(effect=>`<div class="circuit">
                  <div class="circuit-glyphs" aria-hidden="true">${effect.needs.map(kind=>`<span class="element-${kind}">${inkGlyph(kind)}</span>`).join('')}</div>
                  <div><b>${effect.name}</b><p>${effect.text}</p></div>
                </div>`).join('')
              : '<p>觉醒元素后，可在这里查看对应的连携。</p>'
            }
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
          <div><dt>游动</dt><dd><span class="desktop-hint">WASD 或按住鼠标</span><span class="touch-hint">拖动摇杆</span></dd></div>
          <div><dt>破浪</dt><dd><span class="desktop-hint">空格</span><span class="touch-hint">双击水面</span> · 短暂无敌</dd></div>
          <div><dt>升降</dt><dd><span class="desktop-hint">Q / E</span><span class="touch-hint">按住 ↑ / ↓</span> · 蛟龙后</dd></div>
        </dl>
        <div class="help-moves">
          <article><strong class="element-storm">${inkGlyph('storm')}</strong><h3>盘旋成风</h3><p>持续同向回旋，聚起风眼。</p></article>
          <article><strong class="element-lightning">${inkGlyph('lightning')}</strong><h3>游龙引雷</h3><p>连续 S 形转向，引雷优先击向湿敌。</p></article>
          <article><strong class="element-ring">${inkGlyph('ring')}</strong><h3>盘龙结阵</h3><p>头部贴近龙身围合，收紧或离阵引爆。</p></article>
        </div>
        <p class="help-reactions"><span class="touch-hint">双指轻点水面暂停。 </span>吐息自动释放，断尾可回收，雷击与龙阵能穿透玄甲。</p>
        <button class="primary" data-action="closeHelp">进入练招水庭 ↗</button>
        <button class="text-button" data-action="closeHelp">返回</button>
      </div>`,'help');
  }
  credits(){this.overlay(`<div class="modal credits-modal"><div class="eyebrow">笔墨山海</div><h2>潜鳞 · 致谢</h2><p>由苇汀浅水，游向烟波大湖、沧海、青绿千山与九重天阙。五种形态、场景与战斗均以三维网格实时呈现。</p><p>三维引擎：<a href="https://threejs.org/" target="_blank" rel="noopener">Three.js</a>（MIT）；曲面分析：three-mesh-bvh（MIT）。通用笔触蒙版来自 David Revoy 的 Krita 笔刷资源（CC0），完整来源与许可随工程保留。</p><p>开源版的五种角色由代码生成，游动、伸缩与实时笔墨在本地运行。早期 pixelfx 研究源码及其许可保留在工程中。</p><button class="text-button" data-action="close">返回苇汀 ↗</button></div>`,'credits');}
}
