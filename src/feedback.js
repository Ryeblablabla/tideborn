import { drawDrillStrike } from './drill-telegraph.js';

const statusMarks = [
  ['wet','#4e6e78','湿'], ['poison','#63774c','毒'], ['burn','#9a523d','炎'], ['charge','#6b6279','雷'],
];
const overlap = (a,b) => Math.abs(a.x-b.x) < (a.w+b.w)/2 && Math.abs(a.y-b.y) < (a.h+b.h)/2;
const colorForDamage = kind => ['lightning','serpent','thunder'].includes(kind) ?
  '#626479' : kind==='fire' ? '#9f523a' : '#425d45';
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const inkLabelFont = '"Tideborn Calligraphy","Kaiti SC","Songti SC",serif';
const numberFont = '"Songti SC",serif';

function smoothRange(start,end,value) {
  const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
  return t*t*(3-2*t);
}

function readoutStyle(point,player,camera,eyeDistance,important=false) {
  const range=distance(point,player);
  const farFade=smoothRange(12,42,range);
  const lens=camera?.isPerspectiveCamera
    ? Math.pow(Math.min(1,eyeDistance/Math.max(1,distance(point,camera.position))),.38)
    : 1;
  return {
    range,
    scale:Math.max(important ? .86 : .75,lens*(1-.07*farFade)),
    alpha:1-(important ? .24 : .74)*farFade,
    rise:1-.53*farFade,
  };
}

export class FeedbackLayer {
  constructor(canvas,world) {
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d');
    this.world=world;
    this.numbers=[];
  }

  async prepare() {
    if (this.world.isInk) {
      void document.fonts.load(`400 16px ${inkLabelFont}`, '湿毒炎雷云灵性龙躯节').catch(() => {});
    }
  }
  add() {}
  clear() { this.numbers=[]; this.absorption=null; }

  absorb({stage,essence,growth}) {
    if(!essence&&growth<.05)return;
    const current=this.absorption;
    if(current?.stage===stage&&current.t<.42){
      current.essence+=essence;
      current.growth+=growth;
      return;
    }
    this.absorption={stage,essence,growth,t:0};
  }

  number(x,z,value,kind,y=.7) {
    const previous = this.numbers.find(n => n.kind===kind && n.t<.20 &&
      Math.hypot(n.x-x,n.z-z,n.y-y)<1.15);
    if (previous) {
      previous.value+=value;
      previous.t=Math.min(previous.t,.12);
      return;
    }
    if(this.numbers.length>=30)this.numbers.shift();
    this.numbers.push({x,z,y,value,kind,t:0});
  }

  render(dt,game) {
    const {canvas,ctx,world}=this;
    if (canvas.width!==world.width || canvas.height!==world.height) {
      canvas.width=world.width;
      canvas.height=world.height;
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    this.numbers=this.numbers.filter(number=>{number.t+=dt;return number.t<.65;});
    const absorption=this.absorption;
    if(absorption&&(absorption.stage!==game?.stage||(absorption.t+=dt)>.9))this.absorption=null;
    if (!game || game.status==='ascending' || game.status==='won') return;
    this.occupied=[];
    const place = (point, width, height, maxShift=2) => {
      if (point.visible===false) return null;
      for (let i=0;i<=maxShift;i++) {
        const candidate = {x:point.x,y:point.y-i*(height+3),w:width,h:height};
        if(candidate.x<width/2+7 || candidate.x>canvas.width-width/2-7 ||
           candidate.y<height/2+7 || candidate.y>canvas.height-height/2-7)continue;
        if(this.occupied.some(used=>overlap(candidate,used)))continue;
        this.occupied.push(candidate);
        return candidate;
      }
      return null;
    };
    const p=game.p;
    const camera=world.camera;
    const eyeDistance=camera?.position?distance(p,camera.position):1;
    // Keep the head and the two closest body landmarks clear. The warning
    // rings themselves are projected in 3D at the collision height.
    for (const [i,point] of [p,game.bodyPath?.[3],game.bodyPath?.[7]].entries()) {
      if(!point)continue;
      const screen=world.project(point.x,point.z,point.y+.35);
      if(screen.visible!==false)this.occupied.push({...screen,w:i===0?72:45,h:i===0?52:35});
    }
    // Leave the actionable center of nearby strike marks readable before
    // assigning space to anything on the feedback canvas.
    let reserved=0;
    for(const hazard of game.hazards){
      if(reserved>=4)break;
      if(!hazard.warning||hazard.life<=0||distance(hazard,p)>hazard.radius+7)continue;
      const point=world.project(hazard.x,hazard.z,hazard.y+(game.stage===3 ? .8 : .12));
      if(point.visible===false)continue;
      this.occupied.push({...point,w:52,h:37});
      reserved++;
    }
    const activeWonder=game.wonders?.active;
    const wonderMarkers=[activeWonder?.beacon,...(activeWonder?.hazards??[]).filter(hazard=>
      hazard.phase==='warning'&&game.time>=hazard.startsAt)];
    for(const marker of wonderMarkers){
      if(!marker)continue;
      const point=world.project(marker.x,marker.z,marker.safeY??marker.y);
      if(point.visible!==false)this.occupied.push({...point,w:70,h:54});
    }

    ctx.textAlign='center';
    ctx.textBaseline='middle';
    if(this.absorption&&activeWonder?.kind!=='carp'&&activeWonder?.kind!=='spring'){
      const {essence,growth,t}=this.absorption;
      const text=[essence>0&&`灵性 +${essence}`,growth>=.05&&`龙躯 +${growth.toFixed(1)} 节`].filter(Boolean).join('  ·  ');
      const point=world.project(p.x,p.z,p.y+1);
      point.y-=41+t*17;
      ctx.font=`400 16px ${inkLabelFont}`;
      const label=place(point,ctx.measureText(text).width+15,22);
      if(label){
        ctx.globalAlpha=Math.min(1,(.9-t)*3.6);
        this.paperTag(label,'#496650');
        ctx.fillStyle='#3d5d47';
        ctx.fillText(text,label.x,label.y+.5);
        ctx.globalAlpha=1;
      }
    }
    const boss=game.boss;
    const states=boss?statusMarks.filter(([key])=>boss[key]>0):[];
    if(states.length){
      const style=readoutStyle(boss,p,camera,eyeDistance,true);
      const point=world.project(boss.x,boss.z,boss.y+3*style.rise);
      const gap=16*style.scale;
      ctx.font=`400 ${Math.round(15*style.scale)}px ${inkLabelFont}`;
      const label=place(point,states.length*gap+8,19*style.scale);
      if(label){
        ctx.globalAlpha=style.alpha;
        this.paperTag(label,states[0][1]);
        for(let i=0;i<states.length;i++){
          ctx.fillStyle=states[i][1];
          ctx.fillText(states[i][2],label.x+(i-(states.length-1)/2)*gap,label.y+.5);
        }
        ctx.globalAlpha=1;
      }
    }

    // Prefer recent nearby hits and the boss over a burst of distant ticks.
    const hits=this.numbers.map(number=>{
      const bossHit=!!boss&&distance(number,boss)<boss.radius+.6;
      const style=readoutStyle(number,p,camera,eyeDistance,bossHit);
      return {number,bossHit,style,priority:style.range+8*number.t-(bossHit?60:0)};
    }).sort((a,b)=>a.priority-b.priority);
    let drawn=0,farDrawn=0;
    for(const {number,bossHit,style} of hits){
      if(drawn>=8)break;
      const distant=!bossHit&&style.range>21;
      if(distant&&farDrawn>=2)continue;
      const point=world.project(number.x,number.z,number.y+(.72+number.t*1.25)*style.rise);
      const text=number.value>9999?Math.round(number.value/1000)+'k':String(number.value);
      const size=Math.round((bossHit?14:13)*style.scale);
      ctx.font=`600 ${size}px ${numberFont}`;
      const label=place(point,ctx.measureText(text).width+5,size+1,1);
      if(!label)continue;
      ctx.lineWidth=2.6*style.scale;
      ctx.globalAlpha=Math.min(1,(.65-number.t)*4)*style.alpha;
      ctx.strokeStyle='#f3f0e6e0';
      ctx.strokeText(text,label.x,label.y);
      ctx.fillStyle=colorForDamage(number.kind);
      ctx.fillText(text,label.x,label.y);
      drawn++;
      if(distant)farDrawn++;
    }
    ctx.globalAlpha=1;

    const thunder=game.zones.filter(zone=>zone.kind==='thunder' && zone.energy>0)
      .sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(thunder){
      const style=readoutStyle(thunder,p,camera,eyeDistance);
      const point=world.project(thunder.x,thunder.z,thunder.y+1.6*style.rise);
      const charge=thunder.energy.toFixed(1);
      const brush=`400 ${Math.round(15*style.scale)}px ${inkLabelFont}`;
      const numerals=`600 ${Math.round(12*style.scale)}px ${numberFont}`;
      ctx.font=brush;
      const wordWidth=ctx.measureText('雷云').width;
      ctx.font=numerals;
      const numberWidth=ctx.measureText(charge).width;
      const gap=4*style.scale;
      const label=style.range<38?place(point,wordWidth+gap+numberWidth+12,19*style.scale,1):null;
      if(label){
        ctx.globalAlpha=style.alpha;
        this.paperTag(label,'#73697d');
        ctx.fillStyle='#73697d';
        ctx.font=brush;
        ctx.fillText('雷云',label.x-(numberWidth+gap)/2,label.y+.5);
        ctx.font=numerals;
        ctx.fillText(charge,label.x+(wordWidth+gap)/2,label.y+.5);
        ctx.globalAlpha=1;
      }
    }
    drawDrillStrike(ctx,world,game);
  }

  paperTag({x,y,w,h},color) {
    const ctx=this.ctx;
    const left=x-w/2,top=y-h/2,right=x+w/2,bottom=y+h/2;
    ctx.fillStyle='#f3f0e6ed';
    ctx.beginPath();
    ctx.moveTo(left+.7,top+.5);
    ctx.lineTo(right-.8,top);
    ctx.lineTo(right,bottom-1);
    ctx.lineTo(left,bottom);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle=color;
    ctx.fillRect(left+.6,top+.8,Math.min(1.5,h*.075),h-1.6);
  }
}
