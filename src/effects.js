import { createFrame, clearFrame, createFx, composite } from '../vendor/pixelfx/src/core/index.js';
import * as lightning from '../vendor/pixelfx/src/fx/lightning/lightning-strike.js';
import * as fire from '../vendor/pixelfx/src/fx/fire/fire-tornado.js';
import * as storm from '../vendor/pixelfx/src/fx/nature/tornado.js';
import * as collect from '../vendor/pixelfx/src/fx/pickups/collect-burst.js';
import * as heal from '../vendor/pixelfx/src/fx/holy/heal.js';

// Real pixelfx effects, baked once into transparent frames. The 3D camera projects
// their world anchors; nearest-neighbour compositing preserves each authored pixel.
const modules={lightning,fire,storm,collect,heal};
export class PixelEffects {
  constructor(canvas,world){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.world=world;this.cache={};this.active=[];this.numbers=[];this.time=0;}
  async prepare(){
    for(const [name,mod]of Object.entries(modules)){
      const [w,h]=mod.meta.size,frame=createFrame(w,h),img=new ImageData(w,h),fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],seed:42,light:.7,
        ...(name==='storm'?{palette:['#276d77','#4b9f9e','#73bab0','#a3d7c7','#d7eed2','#f9f6dc'],dust:['#317e79','#5da496','#9bc8a6','#d5dfb1']}:{})});
      const frames=[],fps=15,duration=mod.meta.duration;
      for(let i=0;i<Math.ceil(duration*fps);i++){
        fx.update(1/fps);clearFrame(frame);fx.draw(frame);composite(frame,img.data);
        const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(img,0,0);frames.push(c);
      }
      this.cache[name]={frames,meta:mod.meta,fps};await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  add(name,x,z,life){
    if(!this.cache[name])return;
    const lightningCount=this.active.filter(a=>a.name==='lightning').length;
    if(name==='lightning'&&lightningCount>=6){const oldest=this.active.findIndex(a=>a.name==='lightning');this.active.splice(oldest,1);}
    if(this.active.length>=18){const index=this.active.findIndex(a=>a.name==='collect');this.active.splice(index>=0?index:0,1);}
    const cache=this.cache[name];this.active.push({name,x,z,t:0,life:life||cache.meta.duration});
  }
  number(x,z,value,kind){if(this.numbers.length>45)this.numbers.shift();this.numbers.push({x,z,value,kind,t:0});}
  clear(){this.active=[];this.numbers=[];}
  render(dt,game){
    const canvas=this.canvas,ctx=this.ctx,world=this.world;
    if(canvas.width!==world.width||canvas.height!==world.height){canvas.width=world.width;canvas.height=world.height;}
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    for(let i=this.active.length-1;i>=0;i--){
      const a=this.active[i];a.t+=dt;
      if(a.t>=a.life){this.active.splice(i,1);continue;}
      const cache=this.cache[a.name],p=world.project(a.x,a.z,.2),frame=cache.frames[Math.floor(a.t*cache.fps)%cache.frames.length];
      const scale=a.name==='lightning'?.52:a.name==='collect'?.33:a.name==='heal'?.5:.56;
      const [ox,oy]=cache.meta.origin;
      ctx.globalAlpha=Math.min(1,(a.life-a.t)*3);ctx.drawImage(frame,Math.round(p.x-ox*scale),Math.round(p.y-oy*scale),Math.round(frame.width*scale),Math.round(frame.height*scale));
    }
    ctx.globalAlpha=1;
    for(let i=this.numbers.length-1;i>=0;i--){const n=this.numbers[i];n.t+=dt;if(n.t>.75){this.numbers.splice(i,1);continue;}const p=world.project(n.x,n.z,1+n.t*1.4);ctx.globalAlpha=1-Math.max(0,n.t-.4)/.35;
      ctx.font='bold 7px monospace';ctx.textAlign='center';ctx.lineWidth=2;ctx.strokeStyle='#244d50';ctx.strokeText(n.value,Math.round(p.x),Math.round(p.y));ctx.fillStyle=n.kind==='lightning'?'#f4dc9f':n.kind==='fire'?'#ffd0a3':'#f7f7d6';ctx.fillText(n.value,Math.round(p.x),Math.round(p.y));}
    ctx.globalAlpha=1;
    if(game.stage>=2){
      this.time+=dt;ctx.fillStyle='#bee1e2';ctx.globalAlpha=game.stage===2?.18:.1;
      for(let i=0;i<26;i++){const x=(i*57+this.time*25)%canvas.width,y=(i*31+this.time*125)%canvas.height;ctx.fillRect(x|0,y|0,1,5);}ctx.globalAlpha=1;
    }
  }
}

export class AudioGarden {
  constructor(enabled=true){this.enabled=enabled;this.ctx=null;this.musicTime=0;this.step=0;this.last=0;}
  init(){if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.gain=this.ctx.createGain();this.gain.gain.value=.23;this.gain.connect(this.ctx.destination);}if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}
  toggle(){this.enabled=!this.enabled;if(this.gain)this.gain.gain.setTargetAtTime(this.enabled?.23:0,this.ctx.currentTime,.1);return this.enabled;}
  note(freq,duration=.18,type='sine',volume=.2,delay=0){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const t=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),g=this.ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(g);g.connect(this.gain);osc.start(t);osc.stop(t+duration+.01);
  }
  play(kind,rank=0){
    if(kind==='eat'){const now=performance.now();if(now-this.last<65)return;this.last=now;this.note(440*2**(rank/5),.14,'sine',.18);}
    if(kind==='shoot')this.note(220,.055,'sine',.055);
    if(kind==='kill')this.note(130,.075,'triangle',.065);
    if(kind==='hurt'){this.note(92,.2,'sawtooth',.12);this.note(70,.23,'triangle',.1,.06);}
    if(kind==='dash'){this.note(310,.2,'triangle',.12);this.note(620,.13,'sine',.1,.05);}
    if(kind==='upgrade'||kind==='evolve'||kind==='chosen'){[0,4,7,12].forEach((v,i)=>this.note(330*2**(v/12),.6,'sine',.17,i*.1));}
    if(kind==='lightning')this.note(80,.12,'sawtooth',.07);
    if(kind==='boss')this.note(110,.8,'triangle',.2);
  }
  update(dt,active){if(!active||!this.enabled||!this.ctx)return;this.musicTime-=dt;if(this.musicTime>0)return;this.musicTime=.65;const melody=[0,7,12,14,12,7,4,7,0,7,12,19,16,14,12,7];const root=146.83;this.note(root*2**(melody[this.step%melody.length]/12),1.8,'sine',.055);if(this.step%4===0)this.note(root/2,2.5,'sine',.055);this.step++;}
}
