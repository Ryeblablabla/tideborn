import { STAGES, FORM_BY_STAGE, META, metaCost, DEFAULT_AUDIO_MIX } from './model.js';

const journey = STAGES.map(({name,realm},stage) => ({
  form:FORM_BY_STAGE[stage], name:stage===4?'飞升':name, realm,
}));

export const clock = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const INK_GLYPHS={
  heart:'M16 28C12 22 3 17 3 10C3 3 12 1 16 8C20 1 29 3 29 10C29 17 20 23 16 28ZM16 23C20 19 26 14 26 10C26 6 21 4 16 12C11 4 6 6 6 10C6 14 12 19 16 23Z',
  bubble:'M27 14C29 22 24 29 16 29C9 29 3 24 3 17C2 9 8 3 16 3C22 3 25 6 27 10C24 7 21 6 17 6C10 6 6 11 6 17C6 23 10 26 16 26C22 26 26 22 27 14ZM10 15C10 10 14 8 18 9C15 10 12 12 10 15Z',
  poison:'M14 2C13 9 4 13 4 20C4 25 8 28 13 28C19 27 21 24 21 20C21 15 17 12 14 2ZM12 24C8 23 8 19 11 16C9 20 10 23 12 24ZM24 4C24 8 20 11 20 14C20 17 22 18 24 18C28 18 29 16 29 13C29 10 26 7 24 4Z',
  storm:'M2 14C6 4 20 1 26 6C33 11 29 21 21 23C15 24 10 21 11 16C13 12 18 11 21 14C16 13 14 16 15 18C16 21 24 20 26 15C29 7 20 6 14 7C9 8 5 11 2 14ZM2 25C8 23 14 24 20 27C24 29 28 27 30 26C28 31 21 31 17 29C10 26 5 25 2 25Z',
  lightning:'M20 2L7 16L15 17L9 31L28 13L19 12L24 4L20 2ZM3 16L1 24L7 21L5 28L11 19L6 20L7 16Z',
  fire:'M17 2C19 9 28 13 28 22C28 28 22 31 16 30C8 30 3 26 4 19C5 13 10 12 12 6C13 12 10 16 10 19C10 22 12 22 13 20C16 16 17 9 17 2ZM19 14C18 19 14 22 15 25C16 28 22 27 23 24C24 21 21 17 19 14Z',
  ring:'M28 14C28 23 23 28 15 29C8 29 3 24 3 17C3 10 8 5 13 4C20 2 25 5 28 8L24 12C22 8 17 7 13 8C8 10 6 14 7 19C8 23 11 25 16 25C22 25 26 21 28 14ZM25 9L31 7L29 14Z',
  rain:'M3 14C4 9 9 7 12 8C14 2 21 3 24 8C28 8 31 11 29 16L3 16ZM9 18L5 28L9 27L13 18ZM18 18L14 29L18 27L22 18ZM26 18L22 28L26 27L30 18Z'
};
export function inkGlyph(kind,fallback=''){
  const path=INK_GLYPHS[kind==='coil'?'ring':kind];
  return path?`<svg class="ink-glyph" width="1em" height="1em" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${path}"/></svg>`:fallback;
}

export function creatureIcon(stage=0,ink='#273a33',paper='#f3f0e6'){
  return `<svg viewBox="0 0 48 40" fill="none" aria-hidden="true"><path d="M10 33C1 31 5 21 15 23S36 33 35 22S14 18 23 9" stroke="${ink}" stroke-width="${stage===0?5:7}" stroke-linecap="round"/><path d="M8 31C5 26 13 24 19 27S32 32 34 25" stroke="${paper}" stroke-width="2" stroke-linecap="round" opacity=".8"/><path d="M20 11Q21 5 30 5L41 10L38 14L30 12Q25 16 20 11Z" fill="${ink}"/><path d="M29 12L39 11" stroke="${paper}" stroke-width=".8"/><circle cx="30" cy="8" r=".6" fill="${paper}"/>${stage>=2?`<path d="M23 15L17 12L12 10M17 12L12 15M33 22L39 24L42 22M39 24L40 28M14 24L11 29L7 30M25 29L29 35L35 36" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/><path d="M38 12Q47 17 40 20M21 6Q16 7 13 3L17 13" stroke="${ink}" stroke-width=".8"/>`:''}${stage>=3?`<path d="M24 6L23 1L26 3L28 0M30 5L32 1L35 2" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`:''}${stage>=4?`<path d="M18 19Q2 16 1 3L8 9L7 3L13 10L15 6L22 18M28 25L45 18L42 26L46 25L39 32L33 31Z" fill="${ink}"/><path d="M18 18L5 7M30 26L42 23" stroke="${paper}" stroke-width=".8"/>`:''}</svg>`;
}
const soundSvg = enabled => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9h4l5-4v14l-5-4H4z"/>${enabled?'<path d="M17 8q6 4 0 8M16 11q2 1 0 2"/>':'<path d="m17 9 5 6m0-6-5 6"/>'}</svg>`;
const fullSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg>';
const mixSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10M9 4v4m9 2v4M6 16v4"/></svg>';
const mixChannels = [['music','音乐'],['ambience','环境'],['effects','音效']];
const soundButton = sound => `<button class="icon-button sound-button" data-action="sound" title="声音开关" aria-label="${sound?'关闭':'打开'}声音">${soundSvg(sound)}</button>`;

export class Interface {
  constructor(root,actions){
    this.root=root;
    this.actions=actions;
    this.overlayType='';
    this.toasts=[];
    root.addEventListener('click',e=>{
      const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
      const [action,arg]=b.dataset.action.split(':');actions[action]?.(arg);
    });
    root.addEventListener('input',e=>{
      const input=e.target;
      const channel=input.dataset.mix;
      if(!channel)return;
      const percent=`${input.valueAsNumber}%`;
      input.setAttribute('aria-valuetext',percent);
      input.nextElementSibling.value=percent;
      actions.mix?.(channel,input.valueAsNumber/100);
    });
  }
  actionsHtml(sound){
    return `${soundButton(sound)}
      <button class="icon-button" data-action="audioSettings" title="声音设置" aria-label="声音设置" aria-haspopup="dialog">${mixSvg}</button>
      <button class="icon-button" data-action="fullscreen" title="全屏" aria-label="全屏">${fullSvg}</button>`;
  }
  menu(save){
    this.isMenu=true;this.overlayType='';
    this.root.innerHTML=`
      <div class="title-shade"></div>
      <header class="topbar">
        <div class="brand"><div class="brand-icon" aria-hidden="true"><span>潜</span></div><div class="wordmark">潜鳞<small>TIDEBORN</small></div></div>
        <div class="top-actions">${this.actionsHtml(save.sound)}</div>
      </header>
      <main class="title-content enter">
        <h1>潜鳞</h1><div class="title-en mono">TIDEBORN</div>
        <p class="title-description">从苇汀游向九重天阙。</p>
        <div class="title-buttons">
          <button class="primary" data-action="start"><span class="brush-label">潜入水中</span> <span class="arrow" aria-hidden="true">↗</span></button>
          <button class="secondary" data-action="shop"><span class="brush-label">龙玉</span> <b class="ink-number">${save.jade}</b></button>
        </div>
      </main>
      <footer class="evolution-strip">
        <div class="stage-road">${journey.map((step,i)=>`${i?'<i class="stage-connector"></i>':''}<div class="stage-step">${creatureIcon(step.form)}<span><b class="brush-label">${step.name}</b><small>${step.realm}</small></span></div>`).join('')}</div>
        <button class="text-button credits-entry" data-action="credits">致谢</button>
      </footer>
      <div id="overlay"></div><div class="toast-stack" id="toasts"></div>`;
  }
  hud(game,save){
    this.isMenu=false;
    this.overlayType='';
    this.activeRun=game;
    this.soundEnabled=save.sound;
    this.root.innerHTML=`
      <div class="hud quiet-hud">
        <div class="trial-sign" id="boss" hidden>
          <span class="trial-mark" id="boss-threat" role="status"></span>
        </div>
        <div class="first-controls" id="controls" hidden>
          <span class="desktop-hint">自动游动 · A / D 转向 · 空格破浪</span>
          <span class="touch-hint">自动游动 · 摇杆转向 · 双击破浪</span>
        </div>
        <div class="touch-stick interactive" id="joystick" aria-label="转向摇杆"><div class="touch-knob" id="knob"></div></div>
        <div class="flight-controls quiet-flight" id="flight-controls" aria-label="升降" hidden>
          <button class="icon-button interactive" id="rise-button" aria-label="升高">↑</button>
          <button class="icon-button interactive" id="fall-button" aria-label="降低">↓</button>
        </div>
        <button id="dash" data-action="dash" hidden tabindex="-1" aria-hidden="true"></button>
        <aside class="ink-notices" aria-live="polite"><div id="evolution"></div><div class="toast-stack" id="toasts"></div></aside>
        <div id="cascade-notice" class="cascade-notice" aria-live="polite" hidden></div>
      </div>
      <div id="overlay"></div>`;
    this.hudElement=this.root.querySelector('.quiet-hud');
    this.nodes=Object.fromEntries([...this.hudElement.querySelectorAll('[id]')].map(node=>[node.id,node]));
  }
  update(game){
    if(this.isMenu||!this.nodes)return;
    this.hudElement.dataset.status=game.status;
    this.nodes['flight-controls'].hidden=game.stage<1||(game.stage===4&&!game.yinglongCruising);
    this.nodes.dash.disabled=game.p.dashCD>.1;
  }
  overlay(html,type){
    const host=this.root.querySelector('#overlay');
    const isOpen=Boolean(html);
    if(isOpen&&!this.overlayType)this.overlayTrigger=document.activeElement;
    this.overlayType=type;
    host.innerHTML=isOpen?`<div class="modal-shade">${html}</div>`:'';
    for(const sibling of this.root.children){
      if(sibling!==host)sibling.inert=isOpen;
    }
    if(isOpen){
      const dialog=host.querySelector('.modal');
      const title=dialog.querySelector('h2');
      if(title)title.id='dialog-title';
      dialog.setAttribute('role','dialog');
      dialog.setAttribute('aria-modal','true');
      if(title)dialog.setAttribute('aria-labelledby',title.id);
      dialog.tabIndex=-1;
      dialog.focus({preventScroll:true});
    }else{
      if(this.overlayTrigger?.isConnected)this.overlayTrigger.focus({preventScroll:true});
      this.overlayTrigger=null;
    }
  }
  audioSettings(save){
    const controls=mixChannels.map(([channel,label])=>{
      const percent=Math.round(100*(save.mix?.[channel]??DEFAULT_AUDIO_MIX[channel]));
      return `<div class="audio-mix-row">
        <label for="mix-${channel}">${label}</label>
        <input id="mix-${channel}" type="range" min="0" max="100" value="${percent}" data-mix="${channel}" aria-valuetext="${percent}%">
        <output for="mix-${channel}" aria-hidden="true">${percent}%</output>
      </div>`;
    }).join('');
    this.overlay(`<section class="modal audio-settings-modal">
      <h2>声音设置</h2>
      <div class="audio-master-row"><span>全部声音</span>${soundButton(save.sound)}</div>
      ${controls}
      <button class="text-button" data-action="closeAudioSettings">返回</button>
    </section>`,'audio-settings');
  }
  restoreAudioSettingsFocus(){
    this.root.querySelector('[data-action="audioSettings"]')?.focus({preventScroll:true});
  }
  pause(game=this.activeRun,save=null){
    const stage=STAGES[game.stage];
    const hp=Math.ceil(game.p.hp);
    const maxHp=game.stats().hp;
    const maximum=Math.ceil(maxHp);
    const health=Math.max(0,Math.min(1,game.p.hp/Math.max(1,maxHp)));
    const inkLength=(health*100).toFixed(2);
    const bodyLength=game.p.body.toFixed(1);
    const trail='M18 24C42 12 58 13 79 26S118 43 143 29 181 11 202 23 238 37 273 19';
    this.overlay(`
      <div class="modal pause-modal pause-sheet">
        <h2>游历暂停</h2>
        <p class="pause-realm"><span class="brush-label">${stage.name}</span> <span>${stage.realm}</span></p>
        <figure class="pause-body-state" data-low="${health<.33}">
          <figcaption><span>龙躯</span><b>${bodyLength} 节</b></figcaption>
          <div class="pause-body-ink" role="meter" aria-label="剩余生命" aria-valuemin="0"
            aria-valuenow="${hp}" aria-valuemax="${maximum}" aria-valuetext="${hp} / ${maximum}，龙躯 ${bodyLength} 节">
            <svg viewBox="0 0 287 49" fill="none" aria-hidden="true">
              <path class="pause-trail" d="${trail}" stroke-width="10" stroke-linecap="round"/>
              <path class="pause-trail-dry" d="${trail}" stroke-width="1.1" stroke-dasharray="14 5 6 8" stroke-linecap="round"/>
              <path class="pause-ink-line" d="${trail}" pathLength="100" stroke-width="9" stroke-dasharray="${inkLength} 100"/>
              <path class="pause-ink-dry" d="${trail}" pathLength="100" stroke-width="1.5" stroke-dasharray="${inkLength} 100" transform="translate(0 -1.6)"/>
              ${health>0?'<path class="pause-ink-head" d="M7 24L15 17L23 20L24 25L19 29L8 29L12 26Z"/>':''}
            </svg>
          </div>
        </figure>
        <dl class="pause-record">
          <div><dt>游历</dt><dd>${clock(game.time)}</dd></div>
        </dl>
        <button class="primary" data-action="pause"><span class="brush-label">继续游历</span> <span aria-hidden="true">↗</span></button>
        <nav class="pause-tools" aria-label="招式与构筑">
          <button class="secondary" data-action="help">招式图鉴</button>
          <button class="secondary" data-action="build">血脉构筑</button>
        </nav>
        <nav class="pause-tools pause-settings" aria-label="游戏设置">
          ${this.actionsHtml(save?.sound??this.soundEnabled)}
        </nav>
        <nav class="pause-exits" aria-label="结束或重开">
          <button class="text-button" data-action="restart">重新开始</button>
          <button class="text-button" data-action="home">返回苇汀</button>
        </nav>
      </div>`,'pause');
  }
  result(game,reward){
    const win=game.status==='won';
    const form=STAGES[game.stage].name;
    const icon=document.body.classList.contains('ink-art')
      ? creatureIcon(game.form,'#f8efe0','#823d2f') : creatureIcon(game.form);
    this.overlay(`
      <div class="modal result-modal${win?' victory-modal':''}">
        <header class="result-heading">
          <div class="result-icon result-seal">${icon}</div>
          <div>
            <h2>${win?'飞升天阙':'游历结束'}</h2>
            <p class="result-form"><span class="result-form-label">最高形态</span> <b class="brush-label">${form}</b></p>
          </div>
        </header>
        <dl class="result-stats">
          <div><dt>游历</dt><dd>${clock(game.time)}</dd></div>
          <div><dt>击退</dt><dd>${game.kills}</dd></div>
          <div><dt>吸收</dt><dd>${game.eaten}</dd></div>
        </dl>
        <div class="reward-line"><span aria-hidden="true">◈</span> ${reward} 龙玉</div>
        <div class="result-buttons">
          <button class="primary" data-action="restart"><span class="brush-label">再潜一次</span> <span aria-hidden="true">↗</span></button>
          <button class="secondary" data-action="home">返回苇汀</button>
        </div>
      </div>`,'result');
  }
  shop(save){this.overlay(`<div class="modal shop-modal"><h2>龙玉祝福</h2><p class="modal-sub">永久祝福从下一次游历起生效。</p><div class="jade-count">◈ ${save.jade} <span>龙玉</span></div><div class="shop-grid">${META.map(m=>{const lv=save.meta[m.id],cost=metaCost(m,lv);return `<article class="shop-card"><span class="card-symbol">${inkGlyph(m.id,m.icon)}</span><div class="shop-level">等级 ${lv} / 10</div><h3>${m.name}</h3><p>${m.desc}</p><button class="shop-buy" data-action="buy:${m.id}" ${save.jade<cost||lv>=10?'disabled':''}><span>${lv>=10?'祝福已满':save.jade<cost?'龙玉不足':'种下祝福'}</span><b>${lv>=10?'✓':cost+' ◈'}</b></button></article>`;}).join('')}</div><button class="text-button" data-action="close">返回苇汀 ↗</button></div>`,'shop');}
  credits(){this.overlay(`<div class="modal credits-modal"><div class="eyebrow">SMALL PIXELS, SHARED IDEAS</div><h2>这片水域的微光</h2><p>《潜鳞 TIDEBORN》使用 Three.js 构建真正的 3D 水域、角色和生物，以低分辨率、最近邻缩放与有限色阶呈现像素质感。</p><p>雷电、龙卷、火焰、拾取与恢复特效实际集成自 <a href="https://github.com/patch-gg/pixelfx" target="_blank" rel="noopener">Patch · pixelfx</a>（MIT），相关来源及许可证随源码附带。</p><p>美术方向参考 <a href="https://github.com/0x0funky/agent-sprite-forge" target="_blank" rel="noopener">Agent Sprite Forge · hibit</a> 的有限调色板与清晰像素簇思路。角色采用原创 3D 程序模型，未使用其生成式图片或视频管线。</p><button class="text-button" data-action="close">返回苇汀 ↗</button></div>`,'credits');}
  sound(enabled){this.soundEnabled=enabled;this.root.querySelectorAll('.sound-button').forEach(b=>{b.innerHTML=soundSvg(enabled);b.setAttribute('aria-label',`${enabled?'关闭':'打开'}声音`);});}
  toast(text,gold=false){
    const host=this.root.querySelector('#toasts');
    if(!host)return;
    const toast=document.createElement('div');
    toast.className=gold?'toast gold':'toast';
    toast.textContent=text;
    host.append(toast);
    setTimeout(()=>toast.remove(),3200);
    const maxToasts=document.body.classList.contains('ink-art')?1:3;
    while(host.children.length>maxToasts)host.firstChild.remove();
  }
  cascadeNotice(name, count=0, absorbed=0){
    const notice=this.nodes?.['cascade-notice'];
    if(!notice)return;
    notice.hidden=false;
    notice.replaceChildren();
    const title=document.createElement('strong');
    title.textContent=name;
    notice.append(title);
    if(count){
      const label=document.createElement('span');
      const value=document.createElement('b');
      value.textContent=String(count);
      label.append('连破 ',value);
      if(absorbed>=3)label.append(` · 卷入 ${absorbed}`);
      notice.append(label);
    }
    clearTimeout(this.cascadeNoticeTimer);
    this.cascadeNoticeTimer=setTimeout(()=>{notice.hidden=true;},count?1900:2400);
  }
  evolution(stage,changed=true,{chapterTitle=false}={}){
    const host=this.root.querySelector('#evolution');
    if(!host)return;
    const {name,realm,subtitle}=STAGES[stage];
    host.innerHTML=chapterTitle?`<div class="chapter-title"><span aria-hidden="true">章</span><h2>${realm}</h2></div>`:`<div class="evolve-banner">
      ${changed&&document.body.classList.contains('ink-art')?`<div class="evolve-seal" aria-hidden="true">${creatureIcon(FORM_BY_STAGE[stage],'#f8efe0','#823d2f')}</div>`:''}
      <div><h2>${changed?name:realm}</h2><p>${changed?realm:subtitle}</p></div>
    </div>`;
    const banner=host.firstElementChild;
    if(!chapterTitle)setTimeout(()=>banner.remove(),4200);
  }
  updateChapterTitle(age){
    const title=this.root.querySelector('.chapter-title');
    if(!title)return;
    if(age>=1.85){title.remove();return;}
    const opacity=Math.max(0,Math.min(1,age/.38,(1.85-age)/.28));
    title.style.opacity=String(opacity);
  }
}
